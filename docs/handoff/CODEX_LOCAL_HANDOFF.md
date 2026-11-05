# 로컬 작업 인계서 (Codex용)

작성일: 2026-11-04 · 기준 브랜치: `content-research` (= `main` 코드 + 이 인계 문서와 `AGENTS.md`). 코드는 main과 같다.

클라우드 작업 환경에서는 할 수 없던 **"실제 기기에서 해야 하는 일"**을 넘긴다. 코드는 거의 끝났고, 남은 것은 설치·실기기 확인·측정이다.

> **최종 사용 형태: 컴퓨터 없음.** 어머니는 휴대폰(앱 또는 크롬) → **Modal 클라우드**(`https://…modal.run`)만 쓴다. 영상은 Modal CPU, 목소리는 Modal GPU에서 만든다. 사용자는 2026-11-04에 오라클 대신 Modal을 골랐다. 본 작업은 **작업 M(Modal 첫 배포 확인)** → C(휴대폰) → D(네이버)이고, 작업 A(PC)와 작업 B(오라클)는 Modal이 안 될 때만 쓰는 대안이다. 저장소 규칙은 루트의 [AGENTS.md](../../AGENTS.md)를 먼저 읽을 것.

---

## 0. 지금 상태 한눈에

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 테스트 158개 · 타입 검사 | 통과 | `npm test`, `npm run typecheck` |
| Modal 배포 코드 | 작성·로컬 검증 | `deploy/modal/app.py`, `voice_proxy.py`, `.github/workflows/modal-deploy.yml`, 안내 `docs/MODAL_SETUP.md`. 실제 VoiceStudio(CPU) ↔ 중계기 ↔ 클라우드 설정 스튜디오로 첫 계정·목소리 준비·영상 제작 확인 |
| Modal 실제 배포 | ✅ 배포·응답 확인 (2026-11-05, Actions #4) | `https://rudwpahs--matlab-studio-web.modal.run`, 첫 계정 화면까지. **첫 계정·GPU 목소리·영상 1편·제작 중 깨워 두기는 미확인** |
| 인스타그램 공식 게시 | 구현·모의 검증 | `docs/INSTAGRAM_SETUP.md`. 실제 연결·게시는 Meta 앱과 사용자 확인이 필요 |
| 로그인·세션·잠금·출처 검사 | 구현·테스트됨 | `apps/studio/server/auth.ts`, `auth.test.ts`, `app.test.ts` |
| 후보 3개 → 선택 → 검토용 렌더 → 블로그 2안 → 승인 → 게시 기록 | 구현·화면 확인 | `docs/studio-2.0/USER_FLOW.md` |
| 로그인 상태 실제 렌더 (목소리 포함) | 클라우드 x64에서 확인 | 39.4초 MP4, 8장면 모두 음성, 승인 전 문구 없음 (`docs/research/content-strategy/implementation-status.md` §7) |
| 휴대폰 폭 화면 | 에뮬레이션(Pixel 7)으로 확인 | 가로 넘침 없음 |
| 안드로이드 APK | 빌드됨 (디버그 서명, 26KB) | `out/android/matlab-studio.apk` (ZIP에 동봉) |
| 오라클 설치 스크립트 | 작성·shellcheck 통과, **부분만 확인** | `deploy/oracle/install.sh` — VoiceStudio CPU 설치는 x64에서 확인, ARM 실기 미확인 |
| 오라클 ARM 서버 실제 설치 | ❌ 미확인 (대안이라 급하지 않음) | |
| **실제 휴대폰에서 APK** | ❌ 미확인 | |
| **Modal에서 영상 1편 시간·비용** | ❌ 미측정 (추정: 목소리 1~3분, 렌더 10~30분, $0.2~0.4) | |
| **네이버 글쓰기 링크** `https://blog.naver.com/GoBlogWrite.naver` | ❌ 미확인 | 로그인 상태 휴대폰·PC에서 확인 필요 |
| 인스타그램 공식 API 연동 | ⏸ 사용자 지시로 보류 | 건드리지 말 것 |

---

## 1. 구조 지도 (빠르게 찾기)

- 제작 흐름: `apps/studio/server/pipeline.ts` (`startRender` → `runRender` → `generateVoice` → Remotion `render.ts`)
- 목소리: `apps/studio/server/voicestudio.ts` (주소 `VOICESTUDIO_URL`이 없으면 VoiceStudio 데스크톱 앱 포트를 차례로 탐색), `tts.ts`
- 서버 시작: `apps/studio/server/index.ts` (`--production`이면 `apps/studio/web/dist` 제공, `HOST`는 계정이 있어야 0.0.0.0 허용)
- 계정 CLI: `apps/studio/server/addUser.ts` (`npm run user:add -- 아이디 이름`, `--reset`)
- 서버 설치: `deploy/oracle/install.sh` → systemd `matlab-studio`, `matlab-voicestudio`, `matlab-voice-setup`(목소리 자동 준비, `tools/setup/voice.ts`)
- 서버 설정 파일: `/etc/matlab/studio.env` (데이터 `/opt/matlab/data`, 앱 `/opt/matlab/app`, 백업 `/opt/matlab/backups`)
- 서버 도구: `matlab-update`, `matlab-user`, `matlab-backup`
- 사용자 안내서: `docs/ORACLE_SETUP.md`, `docs/REMOTE_ACCESS.md`

---

## 2. 할 일 (M → C → D, A·B는 대안)

각 작업은 **완료 기준**을 모두 만족해야 "완료"로 보고한다. 못 한 것은 못 했다고 쓴다.

### 작업 M — Modal 첫 배포 확인 (가장 중요)

사용자가 직접 하는 일: Modal 가입·카드 등록·**지출 한도 $0**, API 토큰 만들기, GitHub 비밀값 3개(`MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `STUDIO_SETUP_CODE`) 넣기, Actions에서 **Deploy to Modal** 실행. 순서는 `docs/MODAL_SETUP.md`. 비밀값을 대신 받거나 기록하지 말 것.

Codex가 할 일:
1. Actions 실행 로그 확인. 실패하면 원인을 고쳐 작업 브랜치에 커밋 → 사용자에게 다시 실행 부탁.
   - 이미지 빌드에서 흔할 수 있는 실패: 크롬 라이브러리 이름(데비안 버전, `t64`), `uv sync --group cuda`, `voxcpm` 설치, `ensureBrowser` 다운로드.
2. 배포 뒤 확인 (사용자 휴대폰 또는 로컬 브라우저):
   - 주소 접속 → "처음 계정 만들기" 화면 → 설정 코드로 계정 생성 → 로그인 유지
   - 계정을 만든 뒤 POST 요청(프로젝트 만들기)이 403("다른 사이트")으로 막히지 않는지 → 막히면 Modal이 넘기는 Host/X-Forwarded-Host를 로그로 확인해 `auth.ts`의 `ownHosts`를 고친다
   - Modal 대시보드 → Apps → matlab-studio → web 로그에 "목소리 준비 끝"
   - 검토용 영상 1편: 목소리 포함 MP4, 걸린 시간, Modal 사용량(달러) 기록. 제작 중 앱을 닫아도 끝까지 가는지(깨워 두기)
   - 20분 넘게 쓰지 않은 뒤 다시 열 때 데이터(계정·프로젝트·영상)가 남아 있는지 (DB 복사본)
3. 완료 기준: 위 항목 모두 성공, 시간·비용 기록.

### 작업 A — (선택) Windows PC 확인 — 최종 사용에는 필요 없음, 건너뛰어도 됨

```
cd C:\dev\FoodStrategyLab
git fetch origin
git checkout content-research
git pull origin content-research
npm ci
npm test
npm run typecheck
```

계정이 없으면 사용자에게 직접 입력하게 한다 (비밀번호를 대신 정하거나 기록하지 말 것):

```
npm run user:add -- heejae 이희재
npm run start
```

- 브라우저에서 `http://localhost:5178` → 로그인 → 기존 프로젝트 열기 → 후보 3개 보임
- VoiceStudio 데스크톱 앱이 켜져 있으면 설정의 목소리 상태가 "연결됨"이고 엔진이 **VoxCPM2**(또는 다른 상업 가능 엔진)인지 확인. OmniVoice면 사용하지 말고 사용자에게 알린다.
- 검토용 렌더 1편을 끝까지 돌려 **걸린 시간**과 결과(음성 유무, 자막, 승인 전 "검토" 문구 없음)를 기록.
  - 렌더가 GPU 문제로 실패하면 `$env:REMOTION_GL="angle"; npm run start` 로 재시도하고 결과를 기록.

완료 기준: 테스트·타입 통과, 로그인 성공, 렌더 1편 MP4 확인(시간 기록).

### 작업 B — (대안) 오라클 무료 서버 설치 — Modal이 안 될 때만

사용자가 직접 해야 하는 부분(가입·카드·콘솔 클릭·비밀번호·Tailscale 로그인)은 **안내만** 한다. 순서는 `docs/ORACLE_SETUP.md` 그대로.

1. 사용자: 오라클 가입 (홈 지역 **Seoul**), 인스턴스 생성 — Ubuntu 24.04, `VM.Standard.A1.Flex` OCPU 2 / 메모리 12GB, 부트 볼륨 150GB, SSH 키 저장.
   - "Out of host capacity" → 정상. 시간을 두고 다시 Create.
2. PC PowerShell에서 접속 (키 파일 권한 오류가 나면 `icacls 키파일 /inheritance:r /grant:r "$($env:USERNAME):R"`):
   ```
   ssh -i 키파일경로 ubuntu@공용IP
   ```
3. 서버에서:
   ```
   curl -fsSL https://raw.githubusercontent.com/Rudwpahs/FoodStrategyLab/main/deploy/oracle/install.sh -o install.sh
   bash install.sh
   ```
   - 비밀번호 입력 단계와 Tailscale 로그인 주소 단계에서 사용자에게 넘긴다.
   - 전체 로그: `~/matlab-install.log`
4. 설치 후 확인:
   ```
   systemctl status matlab-studio matlab-voicestudio --no-pager
   journalctl -u matlab-voice-setup -f        # "목소리 준비 끝"까지 (20~60분)
   curl -s http://127.0.0.1:5178/api/auth/me   # 401 또는 JSON이면 서버 응답 정상
   tailscale serve status
   ls /opt/matlab/backups                      # 다음 날 04:30 이후 백업 파일
   ```
5. 사용자: https://login.tailscale.com/admin/machines → `matlab-studio` → **Disable key expiry**.
6. 휴대폰(Tailscale 켠 상태)에서 `https://matlab-studio.<tailnet>.ts.net` 로그인 → 검토용 렌더 1편 → **목소리 시간 + 렌더 시간 측정**. 렌더 중 `htop`으로 메모리(12GB 중) 최대치도 적는다.
7. `matlab-update` 한 번 실행해서 업데이트 경로가 동작하는지 확인 (서비스 재시작 후 로그인 유지 여부 포함).

완료 기준: 두 서비스 active, 목소리 준비 끝, Tailscale HTTPS로 휴대폰 로그인, 렌더 1편 완료(시간·메모리 기록), `matlab-update` 성공.

**ARM에서 막힐 가능성이 있는 곳과 대처**

| 증상 | 원인 추정 | 대처 |
| --- | --- | --- |
| 5단계 `uv sync` 실패 | ARM용 torch CPU 휠·의존성 | 로그 확인. 스크립트는 실패해도 스튜디오는 켜짐(`VOICE_OK=0`, 자막만 영상). 고칠 때는 `/opt/matlab/voicestudio`에서 수동 재현 후 **install.sh를 고쳐서 브랜치에 커밋**. VoiceStudio 고정 커밋 `429f1e5bb2703ac5b928ab8ba6f60159167e9c44`는 함부로 바꾸지 말 것 |
| `voxcpm` 설치/모델 내려받기 실패 | Hugging Face 접속·용량 | `journalctl -u matlab-voice-setup`, 디스크 `df -h`. 서비스가 자동 재시도함 |
| 4단계 "렌더용 크롬을 내려받지 못했어요" | remotion.media 다운로드 | 3번 재시도 후 설치가 멈춤. 잠시 뒤 `bash install.sh`를 다시 실행(이미 된 단계는 건너뜀/덮어씀) 또는 `cd /opt/matlab/app && npx remotion browser ensure` |
| 렌더 중 서버가 죽음 | 메모리 부족 | `/etc/matlab/studio.env`의 `NODE_OPTIONS` 확인, `free -h`, swap 4GB 존재 여부 |
| 렌더 화면이 검게 나옴 | GL | `REMOTION_GL=swangle`(기본) 유지, 안 되면 `angle`로 바꿔 재시도 후 기록 |
| 휴대폰에서 접속 안 됨 | Tailscale HTTPS 미활성 | admin/dns에서 **Enable HTTPS** 후 `sudo tailscale serve --bg 5178` |
| 로그인 직후 다시 로그인 화면 | 쿠키 Secure | https 주소로 접속했는지 확인(`COOKIE_SECURE=1`이라 http로는 쿠키가 안 붙음) |

### 작업 C — 휴대폰 APK 실기 확인

- ZIP 안의 `matlab-studio.apk`를 휴대폰에 설치 (USB 연결이면 `adb install -r matlab-studio.apk`, 아니면 파일 전송 후 "출처를 알 수 없는 앱 허용").
- 확인 목록:
  1. 첫 화면에 스튜디오 주소 입력 → 로그인 유지(앱을 껐다 켜도)
  2. 레시피 사진 올리기(갤러리·카메라)
  3. 승인된 영상의 ZIP·MP4 내려받기 → 휴대폰 '다운로드' 폴더
  4. 인스타그램·네이버 링크가 외부 브라우저/앱으로 열림
  5. 메뉴(⋮) 새로고침·주소 바꾸기
- 앱을 고쳐야 하면 `apps/android/` 수정 → `cd apps/android && gradle assembleDebug` (SDK 경로는 `local.properties`의 `sdk.dir`, Git에 올리지 않음).

완료 기준: 1~5 결과를 각각 기록(성공/실패/스크린샷).

### 작업 D — 네이버 글쓰기 연결 확인

- 휴대폰과 PC에서 네이버 로그인 상태로 `https://blog.naver.com/GoBlogWrite.naver`가 글쓰기 화면을 여는지 확인. 스튜디오 게시 단계의 "네이버 글쓰기 창 열기" 버튼(`PublicationsPanel.tsx`)이 같은 주소를 연다.
- 안 열리면 실제로 열리는 주소를 찾아 기록만 하고(예: 모바일 앱 글쓰기 경로), 코드 수정은 브랜치에서 한다.
- **자동 발행을 구현하지 말 것.** 네이버 공식 글쓰기 API는 종료됐다. 복사 → 붙여넣기 반자동이 정해진 방식이다.

---

## 3. 결과 보고 방식

1. 작업 브랜치 `local-verification`(없으면 만들기)에서 `docs/research/content-strategy/implementation-status.md` 끝에 **§8 실기 확인 (날짜)** 절을 추가: 작업별 성공/실패, 측정값(목소리 시간, 렌더 시간, 메모리 최대), 고친 내용, 남은 문제.
2. 코드를 고쳤다면 `npm test` · `npm run typecheck` 통과 후 같은 브랜치에 커밋·push. **main 병합은 사용자 허락 후에만.**
3. 사용자에게는 한국어 쉬운 말로 3~5줄 요약 + 사용자가 직접 할 일만 따로 정리.

---

## 4. 하지 말 것

- 비밀번호·SSH 키·Tailscale 키·카드 정보를 대신 입력하거나 파일·로그·커밋·채팅에 남기기
- Modal 지출 한도(Spend limit)를 올리거나, GPU를 더 비싼 것으로 바꾸기 (사용자 확인 없이)
- 오라클 **유료** 리소스 만들기(Always Free 표시 없는 shape, 추가 볼륨 등), 유료 API 사용
- 인터넷 공개(공개 IP 포트 열기, Cloudflare 공개 터널, `tailscale funnel`) — 사용자 승인 없이 금지. 오라클 보안 목록에 5178 포트를 열지 말 것(Tailscale로만 접속)
- 인스타그램·네이버에 실제 게시, 인스타 API 연동 시작
- OmniVoice 등 비상업 음성 모델 사용, 실존 인물 목소리 복제
- AGENTS.md의 원칙(원본 보존, 버전별 승인, 승인 전 "검토" 문구 금지, 연구자 경험 날조 금지)을 약하게 만드는 수정
- main에 직접 push
