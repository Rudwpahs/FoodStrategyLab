"""이희재의 맛 연구소 스튜디오 — Modal 클라우드 배포.

구성
- web   : 스튜디오 전체(화면·API·영상 렌더). 쉴 때는 CPU 0.125개·메모리 1GB만 잡고,
          영상을 만들 때 CPU 8개·메모리 16GB까지 늘어난다 (쓴 만큼만 요금).
          요청이 20분 없으면 잠들고, 다음 접속 때 깨어난다.
- Voice : 맛조수 목소리 엔진(VoiceStudio + VoxCPM2)을 GPU에서 돌린다. 목소리를 만들 때만 깨어난다.
- 저장소 : matlab-data(레시피·영상·DB 복사본), matlab-voice(목소리 프로필·모델 파일)

배포: GitHub Actions(.github/workflows/modal-deploy.yml)가 `modal deploy deploy/modal/app.py`를 실행한다.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import modal

APP_NAME = "matlab-studio"
# 저장소 위치는 배포하는 컴퓨터(GitHub Actions)에서만 계산한다.
# 컨테이너 안에서는 이 파일이 /root/app.py 같은 얕은 위치에 있어 "두 단계 위"가 없다.
_HERE = Path(__file__).resolve()
REPO_ROOT = _HERE.parents[2] if modal.is_local() and len(_HERE.parents) > 2 else Path("/app")

# VoiceStudio: 오라클 설치와 같은 고정 버전 (deploy/oracle/install.sh 와 맞춘다)
VS_REPO = "https://github.com/debpalash/voicestudio.git"
VS_COMMIT = "429f1e5bb2703ac5b928ab8ba6f60159167e9c44"
VS_DIR = "/opt/voicestudio"
# 목소리 GPU: L4(24GB, bf16 지원). 바꾸려면 배포 전에 MATLAB_GPU 환경 변수로 지정
GPU = os.environ.get("MATLAB_GPU", "L4")

app = modal.App(APP_NAME)
data_volume = modal.Volume.from_name("matlab-data", create_if_missing=True, version=2)
voice_volume = modal.Volume.from_name("matlab-voice", create_if_missing=True, version=2)

# ───────────── 웹(스튜디오) 이미지: Node 22 + 렌더용 크롬 라이브러리 + 한글 글꼴 ─────────────
CHROME_LIBS = (
    "libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libasound2 libgbm1 libxrandr2 "
    "libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2"
)
# 데비안 버전에 따라 일부 라이브러리 이름 끝에 t64가 붙는다
APT_CHROME = (
    "apt-get update -q && apt-get install -y -q $(for p in " + CHROME_LIBS + "; do "
    'if apt-cache show "${p}t64" >/dev/null 2>&1; then echo "${p}t64"; else echo "$p"; fi; done)'
)
IGNORE = [
    "node_modules", "**/node_modules", ".git", "data", "out", "tmp", "apps/android",
    "apps/studio/dist", "**/__pycache__", "**/*.log",
    # 비밀값이 이미지에 들어가지 않게
    ".env", "**/.env", "**/.env.*", "**/*.pem", "**/*.key", "**/local.properties",
]

web_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl", "ca-certificates", "gnupg", "git", "fonts-noto-cjk", "fonts-noto-color-emoji")
    .run_commands(
        APT_CHROME,
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y -q nodejs",
    )
    .add_local_dir(REPO_ROOT, "/app", copy=True, ignore=IGNORE)
    .run_commands(
        "cd /app && npm ci --no-audit --no-fund --loglevel=error",
        "cd /app/apps/studio && npx vite build --config vite.config.ts --logLevel error",
        # 렌더용 크롬(Headless Shell)을 이미지에 미리 넣는다
        "cd /app && node -e \"require('@remotion/renderer').ensureBrowser().then(() => console.log('chrome ok'))\"",
    )
    .env({"TZ": "Asia/Seoul"})
)

# ───────────── 목소리(GPU) 이미지: VoiceStudio + VoxCPM2 (상업 이용 가능한 엔진만) ─────────────
voice_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "curl", "ca-certificates", "build-essential", "ffmpeg")
    .pip_install("uv")
    .run_commands(
        f"git clone -q {VS_REPO} {VS_DIR} && git -C {VS_DIR} checkout -q {VS_COMMIT}",
        # GPU(cuda) 묶음만 설치 (개발용 묶음 제외)
        f"cd {VS_DIR} && uv sync --frozen --no-default-groups --group cuda --managed-python --python 3.11",
        f"cd {VS_DIR} && uv pip install --python .venv/bin/python 'voxcpm>=2.0.3'",
        f"cd {VS_DIR} && .venv/bin/python -c \"import torch, voxcpm; print('torch', torch.__version__)\"",
    )
    .add_local_file(Path(__file__).parent / "voice_proxy.py", "/root/voice_proxy.py", copy=True)
    # 목소리 기준 녹음들과 목록(tools/setup/voices.json): GPU마다 이 녹음으로 같은 목소리를 만든다
    .add_local_dir(REPO_ROOT / "tools/setup", "/root/setup", copy=True, ignore=["*.ts"])
    .env(
        {
            "OMNIVOICE_DEVICE": "cuda",
            "OMNIVOICE_TTS_BACKEND": "voxcpm2",
            # 목소리 프로필 DB는 서버 안 디스크에서 쓰고 저장소로 복사한다 (SQLite 잠금 문제 방지)
            "OMNIVOICE_DATA_DIR": "/root/vsdata",
            # 모델 파일은 저장소에 두어 다음에 다시 내려받지 않는다
            "OMNIVOICE_CACHE_DIR": "/voice/cache",
            "TZ": "Asia/Seoul",
        }
    )
)

def _voice_manifest(root: str = "/root/setup") -> list:
    """고를 수 있는 목소리 목록 (apps/studio/server/voicePresets.ts 와 같은 파일)"""
    with open(f"{root}/voices.json", encoding="utf-8") as f:
        return json.load(f)


VS_LOCAL_DATA = "/root/vsdata"
VS_SAVED_DATA = "/voice/data"
VS_PORT = 3900


@app.cls(
    image=voice_image,
    gpu=GPU,
    volumes={"/voice": voice_volume},
    # 후보 영상 목소리를 동시에 만들 수 있게 GPU 최대 3대 (초 단위 요금이라 총비용은 거의 같고 빨라진다).
    # 목소리 프로필은 처음 준비 때 한 번 만들고, 새 GPU는 켜질 때 저장소의 프로필을 복사해 쓴다.
    max_containers=int(os.environ.get("MATLAB_VOICE_GPUS", "3")),
    scaledown_window=240,  # 마지막 요청 4분 뒤 GPU를 끈다
    timeout=1800,
    startup_timeout=1800,  # 처음에는 모델(수 GB) 내려받기로 오래 걸린다
)
class Voice:
    @modal.enter()
    def start(self) -> None:
        import shutil

        if os.path.isdir(VS_SAVED_DATA):
            shutil.copytree(VS_SAVED_DATA, VS_LOCAL_DATA, dirs_exist_ok=True)
        os.makedirs(VS_LOCAL_DATA, exist_ok=True)
        self.proc = subprocess.Popen(
            [f"{VS_DIR}/.venv/bin/python", "-m", "uvicorn", "main:app", "--app-dir", "backend",
             "--host", "127.0.0.1", "--port", str(VS_PORT)],
            cwd=VS_DIR,
        )
        deadline = time.time() + 1700
        while True:
            if self.proc.poll() is not None:
                raise RuntimeError(f"VoiceStudio가 시작하지 못했어요 (종료 코드 {self.proc.returncode})")
            if _health(f"http://127.0.0.1:{VS_PORT}") == "ok":
                break
            if time.time() > deadline:
                raise RuntimeError("VoiceStudio가 준비되지 않았어요 (모델 불러오기 시간 초과)")
            time.sleep(3)
        # 기준 녹음으로 고를 수 있는 목소리를 모두 준비 (이미 있으면 그대로)
        import sys

        sys.path.insert(0, "/root")
        from voice_proxy import ensure_reference_profile

        for entry in _voice_manifest():
            try:
                with open(f"/root/setup/{entry['file']}", "rb") as f:
                    name = ensure_reference_profile(f"http://127.0.0.1:{VS_PORT}", f.read(), entry["refText"], prefix=entry["name"])
                print(f"목소리 '{name}' 준비됨")
            except Exception as e:  # 한 목소리가 실패해도 나머지는 쓸 수 있게
                print(f"목소리 '{entry.get('name')}' 준비 실패: {e}")

    def _save(self) -> None:
        """목소리 프로필 등을 저장소로 복사한다. SQLite 파일은 쓰는 중이어도 일관되게 복사(백업 API)."""
        import shutil
        import sqlite3

        db_like = (".db", ".sqlite", ".sqlite3")
        shutil.copytree(
            VS_LOCAL_DATA,
            VS_SAVED_DATA,
            dirs_exist_ok=True,
            ignore=lambda _d, names: [n for n in names if n.endswith(db_like) or n.endswith(("-wal", "-shm", "-journal"))],
        )
        for root, _dirs, files in os.walk(VS_LOCAL_DATA):
            for name in files:
                if not name.endswith(db_like):
                    continue
                src = os.path.join(root, name)
                dst = os.path.join(VS_SAVED_DATA, os.path.relpath(src, VS_LOCAL_DATA))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                with sqlite3.connect(src) as a, sqlite3.connect(dst) as b:
                    a.backup(b)
        voice_volume.commit()

    @modal.method()
    def request(self, method: str, path: str, headers: dict, body: bytes) -> tuple:
        import sys

        sys.path.insert(0, "/root")
        from voice_proxy import forward

        result = forward(method, path, headers, body, f"http://127.0.0.1:{VS_PORT}")
        # 목소리를 만들거나 지우면 바로 저장소에 남긴다
        if method != "GET" and path.startswith("/profiles"):
            self._save()
        return result

    @modal.exit()
    def stop(self) -> None:
        try:
            self._save()
        finally:
            self.proc.terminate()


def _health(base: str) -> str:
    """VoiceStudio /health 상태: ok · starting · down (불러오는 동안은 503 starting)"""
    try:
        with urllib.request.urlopen(f"{base}/health", timeout=5) as r:
            return json.loads(r.read()).get("status", "down")
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read()).get("status", "down")
        except ValueError:
            return "down"
    except (OSError, ValueError):
        return "down"


# ───────────── 웹(스튜디오) ─────────────
STUDIO_PORT = 5178
VOICE_PROXY_PORT = 3901
LOCAL_DB = "/root/matlab-db/studio.db"
DB_LEASE = "/data/studio.db.lease"
TSX = "/app/node_modules/.bin/tsx"


def _studio_env(public_url: str | None, instance: str) -> dict:
    env = dict(os.environ)
    env.update(
        {
            "MATLAB_INSTANCE": instance,
            "MATLAB_DATA_DIR": "/data",
            "MATLAB_DB_FILE": LOCAL_DB,
            "PORT": str(STUDIO_PORT),
            "HOST": "0.0.0.0",
            "COOKIE_SECURE": "1",
            "TRUST_PROXY": "1",
            "KEEPALIVE": "1",
            "REMOTION_GL": "swangle",
            "REMOTION_CONCURRENCY": "6",
            "VOICESTUDIO_URL": f"http://127.0.0.1:{VOICE_PROXY_PORT}",
            "VOICESTUDIO_TIMEOUT_MS": "1800000",
            "VOICESTUDIO_INFO_TIMEOUT_MS": "1800000",
            # 목소리가 없으면 자막만으로 조용히 만들지 않고 알린다
            "TTS_PROVIDER": "voicestudio",
            # 후보 목소리를 GPU 여러 대에서 동시에 (MATLAB_VOICE_GPUS와 맞춘다)
            "VOICE_PARALLEL": os.environ.get("MATLAB_VOICE_GPUS", "3"),
            "NODE_OPTIONS": "--max-old-space-size=4096",
            "NODE_NO_WARNINGS": "1",
        }
    )
    if public_url:
        env["PUBLIC_URL"] = public_url
    return env


def _wait_previous_owner(instance: str, max_seconds: int = 120) -> None:
    """다시 배포할 때: 이전 서버가 DB를 다 쓰고 손을 뗄 때까지(또는 표시가 20초 넘게 멈출 때까지) 기다린다."""
    deadline = time.time() + max_seconds
    while time.time() < deadline:
        try:
            data_volume.reload()
        except Exception as e:  # 처음에는 열린 파일이 없어 보통 성공한다
            print(f"저장소 새로고침 실패: {e}")
        try:
            with open(DB_LEASE, encoding="utf-8") as f:
                lease = json.load(f)
        except (OSError, ValueError):
            return
        age = time.time() * 1000 - float(lease.get("ts", 0))
        if lease.get("released") or lease.get("owner") == instance or age > 20_000:
            return
        print("이전 서버가 DB를 정리하는 중이라 기다려요…")
        time.sleep(3)
    print("이전 서버를 기다리다 시간이 지나 그대로 시작해요.")


def _wait_http(url: str, seconds: int) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3):
                return True
        except OSError:
            time.sleep(1)
    return False


def _setup_voice(env: dict, public_url: str | None) -> None:
    """처음 한 번: '맛조수' 목소리를 만든다 (tools/setup/voice.ts). 그동안 서버가 잠들지 않게 스스로 부른다."""
    # 서버가 켜질 때마다 실행한다 (이미 준비됐으면 몇 초 만에 끝남): 기준 녹음 목소리로 맞춘다
    if not _wait_http(f"http://127.0.0.1:{STUDIO_PORT}/api/health", 180):
        return
    proc = subprocess.Popen([TSX, "tools/setup/voice.ts"], cwd="/app", env=env)
    while proc.poll() is None:
        if public_url:
            try:
                urllib.request.urlopen(f"{public_url}/api/health", timeout=30).read()
            except OSError:
                pass
        time.sleep(60)
    print(f"목소리 준비 {'끝' if proc.returncode == 0 else f'실패 (코드 {proc.returncode}) — 다음에 서버가 켜질 때 다시 시도해요'}")


@app.function(
    image=web_image,
    volumes={"/data": data_volume},
    secrets=[modal.Secret.from_name("matlab-studio")],
    cpu=(0.125, 8.0),
    memory=(1024, 16384),
    max_containers=1,  # DB를 한 곳에서만 쓴다
    scaledown_window=1200,  # 20분 동안 요청이 없으면 잠든다 (제작 중에는 스스로 깨워 둠)
    timeout=600,
)
@modal.concurrent(max_inputs=100)
@modal.web_server(STUDIO_PORT, startup_timeout=300)
def web() -> None:
    import atexit
    import sys
    import uuid

    sys.path.insert(0, "/app/deploy/modal")
    from voice_proxy import serve

    instance = uuid.uuid4().hex
    public_url = os.environ.get("PUBLIC_URL") or None
    if not public_url:
        try:
            public_url = web.get_web_url()
        except Exception as e:
            print(f"⚠️ 공개 주소를 알아내지 못했어요 ({e}). 요청 헤더로 짐작합니다. Modal 비밀값 PUBLIC_URL로 정할 수 있어요.")
    _wait_previous_owner(instance)

    def call_voice(method: str, path: str, headers: dict, body: bytes) -> tuple:
        return Voice().request.remote(method, path, headers, body)

    # 목소리 목록·기준 녹음이 바뀌면 엔진·목소리 목록 기억도 새로 (파일 이름에 지문)
    import hashlib

    h = hashlib.sha1()
    with open("/app/tools/setup/voices.json", "rb") as f:
        h.update(f.read())
    for entry in _voice_manifest("/app/tools/setup"):
        with open(f"/app/tools/setup/{entry['file']}", "rb") as f:
            h.update(f.read())
    ref_tag = h.hexdigest()[:6]
    serve(VOICE_PROXY_PORT, call_voice, f"/data/voice-meta-{VS_COMMIT[:8]}-{ref_tag}.json")
    env = _studio_env(public_url, instance)
    # npx를 거치지 않고 tsx를 바로 실행한다 (끌 때 신호가 스튜디오까지 전달되게)
    node = subprocess.Popen([TSX, "server/index.ts", "--production"], cwd="/app/apps/studio", env=env)

    def _shutdown() -> None:
        # 서버가 꺼질 때: 스튜디오에 마지막 DB 복사를 맡기고 저장소에 확정한다
        try:
            node.terminate()
            node.wait(timeout=20)
        except Exception:
            pass
        try:
            data_volume.commit()
        except Exception as e:
            print(f"저장소 확정 실패: {e}")

    atexit.register(_shutdown)
    threading.Thread(target=_setup_voice, args=(env, public_url), daemon=True).start()
