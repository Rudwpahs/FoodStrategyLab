#!/usr/bin/env bash
# 이희재의 맛 연구소 스튜디오 — 오라클 클라우드(Ubuntu) 한 번에 설치
#
# 사용법 (서버에 접속한 뒤):
#   curl -fsSL https://raw.githubusercontent.com/Rudwpahs/FoodStrategyLab/main/deploy/oracle/install.sh -o install.sh
#   bash install.sh
#
# 여러 번 실행해도 됩니다 (이미 된 단계는 건너뜀). 중간에 멈추면 같은 명령을 다시 실행하세요.
# 바꾸고 싶으면 실행 전에: STUDIO_USER=heejae STUDIO_NAME=이희재 BRANCH=main bash install.sh

set -euo pipefail

APP_ROOT=/opt/matlab
APP_DIR=$APP_ROOT/app
VS_DIR=$APP_ROOT/voicestudio
DATA_DIR=$APP_ROOT/data
BACKUP_DIR=$APP_ROOT/backups
ENV_FILE=/etc/matlab/studio.env
REPO_URL=${REPO_URL:-https://github.com/Rudwpahs/FoodStrategyLab.git}
BRANCH=${BRANCH:-main}
VS_REPO=https://github.com/debpalash/voicestudio.git
# 검증한 VoiceStudio 버전 (0.5.7). 바꾸면 동작을 다시 확인해야 함
VS_COMMIT=429f1e5bb2703ac5b928ab8ba6f60159167e9c44
STUDIO_USER=${STUDIO_USER:-heejae}
STUDIO_NAME=${STUDIO_NAME:-이희재}
TS_HOSTNAME=${TS_HOSTNAME:-matlab-studio}
RUN_USER=$(id -un)
UV=$HOME/.local/bin/uv

step() { printf '\n\033[1;31m▶ %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '  \033[33m! %s\033[0m\n' "$*"; }

exec > >(tee -a "$HOME/matlab-install.log") 2>&1

# ───────────────────────── 0. 점검 ─────────────────────────
step "0. 서버 점검"
[ "$RUN_USER" != root ] || { echo "root가 아닌 기본 사용자(ubuntu)로 실행해 주세요."; exit 1; }
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = ubuntu ] || { echo "Ubuntu 서버에서 실행해 주세요 (지금: ${PRETTY_NAME:-알 수 없음})."; exit 1; }
ARCH=$(uname -m)
MEM_GB=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo)
DISK_GB=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
ok "$PRETTY_NAME · $ARCH · 메모리 ${MEM_GB}GB · 남은 디스크 ${DISK_GB}GB"
[ "$MEM_GB" -ge 7 ] || warn "메모리가 8GB보다 적어요. 목소리와 영상 만들기가 실패할 수 있어요 (권장 12GB)."
[ "$DISK_GB" -ge 30 ] || { echo "디스크가 30GB 이상 남아 있어야 해요 (지금 ${DISK_GB}GB)."; exit 1; }

# ───────────────────────── 1. 스왑 (메모리 부족 대비) ─────────────────────────
step "1. 스왑 파일 (메모리 부족으로 멈추지 않게)"
if ! swapon --show | grep -q .; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  ok "4GB 스왑을 만들었어요"
else
  ok "스왑이 이미 있어요"
fi

# ───────────────────────── 2. 시스템 패키지 ─────────────────────────
step "2. 시스템 패키지 (글꼴, 영상 렌더용 크롬 라이브러리)"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y -q
# Ubuntu 24.04는 일부 라이브러리 이름 끝에 t64가 붙는다
pkg() { if apt-cache show "${1}t64" >/dev/null 2>&1; then echo "${1}t64"; else echo "$1"; fi; }
PKGS="git curl ca-certificates build-essential sqlite3 python3 cron fonts-noto-cjk fonts-noto-color-emoji \
  libnss3 libdbus-1-3 $(pkg libatk1.0-0) $(pkg libatk-bridge2.0-0) $(pkg libcups2) $(pkg libasound2) \
  libgbm1 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2"
# shellcheck disable=SC2086
sudo apt-get install -y -q $PKGS
ok "시스템 패키지 설치 완료"

# ───────────────────────── 3. Node.js 22, uv ─────────────────────────
step "3. Node.js 22 · uv(파이썬 도구)"
if ! command -v node >/dev/null || ! node -v | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -q nodejs
fi
ok "Node $(node -v)"
if [ ! -x "$UV" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null
fi
ok "uv $("$UV" --version | awk '{print $2}')"

# ───────────────────────── 4. 스튜디오 ─────────────────────────
step "4. 스튜디오 설치 ($BRANCH)"
sudo mkdir -p "$APP_ROOT" /etc/matlab
sudo chown "$RUN_USER":"$RUN_USER" "$APP_ROOT"
mkdir -p "$DATA_DIR" "$BACKUP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH" && git -C "$APP_DIR" checkout -q "$BRANCH" && git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
npm ci --no-audit --no-fund --loglevel=error
(cd apps/studio && npx vite build --config vite.config.ts --logLevel error)
# 영상 렌더용 크롬(Headless Shell)을 미리 받아 둔다 (ARM 서버 포함)
for try in 1 2 3; do
  if node -e "require('@remotion/renderer').ensureBrowser().then(() => console.log('  렌더용 크롬 준비 완료'))"; then break; fi
  [ "$try" = 3 ] && { echo "렌더용 크롬을 내려받지 못했어요. 인터넷 연결을 확인하고 다시 실행해 주세요."; exit 1; }
  sleep 10
done
ok "스튜디오 $(git -C "$APP_DIR" rev-parse --short HEAD)"

# ───────────────────────── 5. VoiceStudio + VoxCPM2 (맛조수 목소리) ─────────────────────────
step "5. 목소리 엔진 VoiceStudio + VoxCPM2 (상업 이용 가능한 엔진만 사용)"
VOICE_OK=1
{
  if [ ! -d "$VS_DIR/.git" ]; then git clone -q "$VS_REPO" "$VS_DIR"; fi
  git -C "$VS_DIR" fetch -q origin && git -C "$VS_DIR" checkout -q "$VS_COMMIT"
  cd "$VS_DIR"
  # 기본 묶음(GPU용 cuda)은 끄고 CPU용 묶음만 설치 (그래픽카드 없는 서버, ARM 포함)
  "$UV" sync --frozen --no-default-groups --group cpu --managed-python --python 3.11
  "$UV" pip install --python .venv/bin/python -q "voxcpm>=2.0.3"
  .venv/bin/python -c "import torch, voxcpm; print('  torch', torch.__version__)"
} || VOICE_OK=0
cd "$APP_DIR"
if [ "$VOICE_OK" = 1 ]; then ok "목소리 엔진 설치 완료"; else warn "목소리 엔진 설치에 실패했어요. 스튜디오는 자막만으로 영상을 만들어요. 로그: ~/matlab-install.log"; fi

# ───────────────────────── 6. 설정 파일 ─────────────────────────
step "6. 설정"
sudo tee "$ENV_FILE" >/dev/null <<EOF
MATLAB_DATA_DIR=$DATA_DIR
PORT=5178
HOST=127.0.0.1
TZ=Asia/Seoul
COOKIE_SECURE=1
REMOTION_GL=swangle
VOICESTUDIO_URL=http://127.0.0.1:3900
VOICESTUDIO_TIMEOUT_MS=3600000
NODE_OPTIONS=--max-old-space-size=4096
# node:sqlite '실험 기능' 안내 문구가 화면·로그를 어지럽히지 않게
NODE_NO_WARNINGS=1
EOF
sudo chmod 644 "$ENV_FILE"
ok "$ENV_FILE"

# ───────────────────────── 7. 로그인 계정 ─────────────────────────
step "7. 로그인 계정"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
USERS=$(sqlite3 "$DATA_DIR/studio.db" "SELECT COUNT(*) FROM users" 2>/dev/null || echo 0)
if [ "${USERS:-0}" -gt 0 ]; then
  ok "계정이 이미 있어요 (${USERS}개). 비밀번호를 바꾸려면: matlab-user $STUDIO_USER --reset"
else
  echo "  '$STUDIO_NAME'($STUDIO_USER) 계정을 만들어요. 비밀번호를 10자 이상으로 두 번 입력하세요 (화면에 안 보여요)."
  (cd apps/studio && NODE_NO_WARNINGS=1 npx tsx server/addUser.ts "$STUDIO_USER" "$STUDIO_NAME" </dev/tty)
fi

# ───────────────────────── 8. 자동 실행 서비스 ─────────────────────────
step "8. 자동 실행 (서버가 켜지면 스튜디오·목소리 엔진이 저절로 켜짐)"
sudo tee /etc/systemd/system/matlab-voicestudio.service >/dev/null <<EOF
[Unit]
Description=Matlab VoiceStudio (VoxCPM2, CPU)
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$VS_DIR
Environment=OMNIVOICE_DEVICE=cpu
Environment=OMNIVOICE_TTS_BACKEND=voxcpm2
Environment=OMNIVOICE_CPU_GENERATE_TIMEOUT_S=3600
ExecStart=$UV run --no-sync uvicorn main:app --app-dir backend --host 127.0.0.1 --port 3900
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
sudo tee /etc/systemd/system/matlab-studio.service >/dev/null <<EOF
[Unit]
Description=Matlab Studio
After=network-online.target matlab-voicestudio.service
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP_DIR/apps/studio
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/npx tsx server/index.ts --production
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo tee /etc/systemd/system/matlab-voice-setup.service >/dev/null <<EOF
[Unit]
Description=Matlab voice setup (create 맛조수 voice once)
After=matlab-voicestudio.service matlab-studio.service
Wants=matlab-voicestudio.service

[Service]
Type=oneshot
User=$RUN_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/npx tsx tools/setup/voice.ts
# 처음에는 모델 내려받기와 목소리 만들기로 1시간 넘게 걸릴 수 있다
TimeoutStartSec=infinity
Restart=on-failure
RestartSec=120

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
if [ "$VOICE_OK" = 1 ]; then
  sudo systemctl enable -q --now matlab-voicestudio.service
else
  sudo systemctl disable -q --now matlab-voicestudio.service 2>/dev/null || true
fi
sudo systemctl enable -q matlab-studio.service
sudo systemctl restart matlab-studio.service
for _ in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:5178/api/auth/me && break; sleep 2; done
if curl -s -o /dev/null http://127.0.0.1:5178/api/auth/me; then ok "스튜디오가 켜졌어요"; else warn "스튜디오가 아직 안 켜졌어요: journalctl -u matlab-studio -n 50"; fi
if [ "$VOICE_OK" = 1 ]; then
  sudo systemctl enable -q matlab-voice-setup.service
  sudo systemctl start --no-block matlab-voice-setup.service
  ok "맛조수 목소리 준비를 시작했어요 (처음에는 모델 내려받기로 20~60분). 진행 상황: journalctl -u matlab-voice-setup -f"
fi

# ───────────────────────── 9. 백업·업데이트 도구 ─────────────────────────
step "9. 매일 자동 백업 · 업데이트 명령"
sudo tee /usr/local/bin/matlab-backup >/dev/null <<EOF
#!/usr/bin/env bash
# 매일 새벽: 데이터베이스(안전한 복사) + 업로드 사진·클립 + 만든 영상. 최근 7개만 남김
set -euo pipefail
stamp=\$(date +%F)
tmp=\$(mktemp -d)
sqlite3 "$DATA_DIR/studio.db" ".backup '\$tmp/studio.db'"
tar -czf "$BACKUP_DIR/matlab-\$stamp.tgz" -C "\$tmp" studio.db -C "$DATA_DIR" --exclude=studio.db --exclude=studio.db-wal --exclude=studio.db-shm --exclude=audio .
rm -rf "\$tmp"
ls -1t "$BACKUP_DIR"/matlab-*.tgz | tail -n +8 | xargs -r rm -f
EOF
sudo tee /usr/local/bin/matlab-update >/dev/null <<EOF
#!/usr/bin/env bash
# 최신 버전으로 업데이트 (데이터는 그대로)
set -euo pipefail
cd "$APP_DIR"
git fetch -q origin "$BRANCH" && git reset -q --hard "origin/$BRANCH"
npm ci --no-audit --no-fund --loglevel=error
(cd apps/studio && npx vite build --config vite.config.ts --logLevel error)
sudo systemctl restart matlab-studio.service
echo "업데이트 완료: \$(git rev-parse --short HEAD)"
EOF
sudo tee /usr/local/bin/matlab-user >/dev/null <<EOF
#!/usr/bin/env bash
# 계정 만들기·비밀번호 바꾸기:  matlab-user 아이디 이름   /   matlab-user 아이디 --reset
set -a; . "$ENV_FILE"; set +a
cd "$APP_DIR/apps/studio" && npx tsx server/addUser.ts "\$@"
EOF
sudo chmod 755 /usr/local/bin/matlab-backup /usr/local/bin/matlab-update /usr/local/bin/matlab-user
echo "30 4 * * * $RUN_USER /usr/local/bin/matlab-backup >> $BACKUP_DIR/backup.log 2>&1" | sudo tee /etc/cron.d/matlab >/dev/null
ok "백업: 매일 04:30 → $BACKUP_DIR (7일 보관)"
ok "업데이트: matlab-update  ·  계정: matlab-user"

# ───────────────────────── 10. Tailscale (휴대폰에서 안전하게 접속) ─────────────────────────
step "10. Tailscale 연결 (인터넷에 공개하지 않고 내 기기에서만 접속)"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh >/dev/null
fi
if ! tailscale status >/dev/null 2>&1; then
  echo "  아래에 나오는 주소를 휴대폰이나 PC 브라우저로 열어 Tailscale에 로그인하면 이 서버가 연결돼요."
  sudo tailscale up --hostname="$TS_HOSTNAME"
fi
ok "Tailscale 연결됨"
if sudo tailscale serve --bg 5178; then
  ok "HTTPS 주소를 열었어요"
else
  warn "Tailscale 관리 화면에서 HTTPS 인증서를 켜야 해요: https://login.tailscale.com/admin/dns → 'Enable HTTPS'. 켠 뒤 'sudo tailscale serve --bg 5178'을 실행하세요."
fi
DNS=$(tailscale status --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null || echo "")

# ───────────────────────── 끝 ─────────────────────────
step "설치 끝"
echo "  스튜디오 주소 : https://${DNS:-<Tailscale에 보이는 서버 이름>}"
echo "  로그인        : $STUDIO_USER (방금 정한 비밀번호)"
echo "  휴대폰        : Tailscale 앱에 같은 계정으로 로그인 → '맛 연구소' 앱에 위 주소 입력"
echo "  목소리 준비   : journalctl -u matlab-voice-setup -f   ('목소리 준비 끝'이 나오면 완료)"
echo "  꼭 할 일      : https://login.tailscale.com/admin/machines → $TS_HOSTNAME → Disable key expiry (6개월 뒤 끊김 방지)"
echo "  업데이트      : matlab-update"
echo "  설치 기록     : ~/matlab-install.log"
