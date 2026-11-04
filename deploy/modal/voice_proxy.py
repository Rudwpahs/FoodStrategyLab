"""맛조수 목소리 엔진(VoiceStudio)을 클라우드 GPU에 두고, 스튜디오에는 평소처럼 HTTP로 보이게 하는 중계기.

- 스튜디오(Node)는 http://127.0.0.1:3901 을 VoiceStudio로 알고 요청한다.
- 이 중계기는 요청을 받아 GPU 컨테이너의 VoiceStudio로 넘기고(Modal 함수 호출), 응답을 그대로 돌려준다.
- GPU를 쓸데없이 깨우지 않도록:
  * /health 는 GPU에 묻지 않고 바로 "ok"라고 답한다 (실제 요청 때 GPU가 깨어남)
  * 엔진 목록·목소리 목록(GET)은 저장소 파일에 기억해 두고 다시 묻지 않는다 (목소리를 새로 만들면 지움)
- 표준 라이브러리만 쓴다 (웹 컨테이너·GPU 컨테이너·로컬 시험 모두에서 그대로 동작).
"""

from __future__ import annotations

import json
import os
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable

# (method, path, headers, body) -> (status, headers, body)
Call = Callable[[str, str, dict, bytes], tuple]

CACHEABLE = ("/engines/tts", "/profiles")
# 상업 이용 가능한 엔진 (apps/studio/server/voicestudio.ts 의 COMMERCIAL_ENGINES 와 같게)
COMMERCIAL_ENGINES = ("voxcpm2", "moss-tts-nano", "confucius4-tts", "gpt-sovits")


def _worth_caching(path: str, body: bytes) -> bool:
    """엔진 목록은 상업 엔진이 준비됐을 때만 기억한다 (아직 준비 전 답을 영원히 기억하지 않게)."""
    if path != "/engines/tts":
        return True
    try:
        data = json.loads(body)
        return any(b.get("id") in COMMERCIAL_ENGINES and b.get("available") for b in data.get("backends", []))
    except (ValueError, AttributeError, TypeError):
        return False
PASS_HEADERS = ("content-type", "authorization", "accept")
RETURN_HEADERS = ("content-type", "content-disposition")


def forward(method: str, path: str, headers: dict, body: bytes, base: str, timeout: float = 1800) -> tuple:
    """VoiceStudio에 요청을 그대로 보내고 (상태, 헤더, 본문)을 돌려준다. GPU 컨테이너 안에서 쓴다."""
    data = body if (body or method not in ("GET", "HEAD", "DELETE")) else None
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, rh, out = r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        status, rh, out = e.code, e.headers, e.read()
    keep = {k.lower(): v for k, v in rh.items() if k.lower() in RETURN_HEADERS}
    return status, keep, out


class _MetaCache:
    """엔진·목소리 목록 응답을 파일에 기억한다."""

    def __init__(self, file: str):
        self.file = file
        self.lock = threading.Lock()

    def _load(self) -> dict:
        try:
            with open(self.file, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def _save(self, data: dict) -> None:
        os.makedirs(os.path.dirname(self.file) or ".", exist_ok=True)
        tmp = f"{self.file}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, self.file)

    def get(self, key: str):
        with self.lock:
            return self._load().get(key)

    def put(self, key: str, content_type: str, body: bytes) -> None:
        with self.lock:
            data = self._load()
            data[key] = {"type": content_type, "body": body.decode("utf-8")}
            self._save(data)

    def drop(self, key: str) -> None:
        with self.lock:
            data = self._load()
            if data.pop(key, None) is not None:
                self._save(data)


def make_handler(call: Call, cache_file: str):
    cache = _MetaCache(cache_file)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_args):  # 요청마다 로그를 남기지 않는다
            pass

        def _read_body(self) -> bytes:
            if self.headers.get("transfer-encoding", "").lower() == "chunked":
                chunks = []
                while True:
                    size = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                    if size == 0:
                        self.rfile.readline()
                        break
                    chunks.append(self.rfile.read(size))
                    self.rfile.readline()
                return b"".join(chunks)
            length = int(self.headers.get("content-length") or 0)
            return self.rfile.read(length) if length else b""

        def _send(self, status: int, headers: dict, body: bytes) -> None:
            self.send_response(status)
            for k, v in headers.items():
                self.send_header(k, v)
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status: int, data: dict) -> None:
            self._send(status, {"content-type": "application/json"}, json.dumps(data, ensure_ascii=False).encode())

        def _handle(self) -> None:
            body = self._read_body()
            method, path = self.command, self.path
            if path == "/health":
                return self._json(200, {"status": "ok", "version": "modal"})
            key = path if method == "GET" and path in CACHEABLE else None
            if key:
                hit = cache.get(key)
                if hit:
                    return self._send(200, {"content-type": hit["type"]}, hit["body"].encode("utf-8"))
            headers = {k: v for k, v in self.headers.items() if k.lower() in PASS_HEADERS}
            try:
                status, rh, out = call(method, path, headers, body)
            except Exception as e:  # GPU 컨테이너 오류: 스튜디오가 쉬운 문장으로 보여 준다
                return self._json(502, {"detail": f"VoiceStudio(클라우드 GPU) 오류: {e}"})
            if key and status == 200 and _worth_caching(key, out):
                cache.put(key, rh.get("content-type", "application/json"), out)
            if method != "GET" and path.startswith("/profiles") and 200 <= status < 300:
                cache.drop("/profiles")
            self._send(status, rh, out)

        do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = _handle

    return Handler


def serve(port: int, call: Call, cache_file: str, host: str = "127.0.0.1") -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), make_handler(call, cache_file))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
