# 로컬·실기기 작업 인계서 (코딩 에이전트용)

갱신일: 2026-11-11 · 기준 브랜치: `content-research`. 저장소 규칙은 루트의 [AGENTS.md](../../AGENTS.md)를 먼저 읽을 것.

클라우드 작업 환경에서는 할 수 없는 **"실제 기기·실제 계정에서 해야 하는 일"**을 넘긴다. 코드는 거의 끝났고, 남은 것은 실기기 확인·측정이다.

> **최종 사용 형태: 컴퓨터 없음.** 이희재 연구자는 **아이폰 사파리**(홈 화면에 추가) 또는 안드로이드 앱으로 **Modal 클라우드** 스튜디오만 쓴다.
> 주소: **https://rudwpahs--matlab-studio-web.us-east.modal.run** (안드로이드 앱 `MainActivity.java`의 `DEFAULT_URL`과 같음. 다른 주소를 쓰면 이 둘과 `docs/MODAL_SETUP.md`를 함께 고칠 것)
> 영상은 Modal CPU, 목소리는 Modal GPU(L4, 최대 3대)에서 만든다. 할 일 순서는 **작업 M(Modal 실사용 확인)** → C(휴대폰) → D(네이버). 작업 A(PC)·B(오라클)는 Modal이 안 될 때만 쓰는 대안이다.

---

## 0. 지금 상태 한눈에

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 테스트 · 타입 검사 · 화면 빌드 | 통과 (2026-11-11, 이 브랜치에서 `npm test` 269개) | `npm test`, `npm run typecheck`, `npx tsc -p tools/tsconfig.json --noEmit`, `npx vite build -c apps/studio/vite.config.ts`. 숫자는 브랜치마다 다르니 직접 돌려 볼 것 |
| 화면(웹) 단위 테스트 | 있음 | `apps/studio/web/src/*.test.ts`: 진행 확인 재시도(`poll.ts`), 서버 오류 읽기·중복 판별(`api.ts`), 단계 진행(`steps/progress.ts`) |
| 화면 흐름 점검(e2e) | 휴대폰 폭 390px로 갱신·로컬 실행 확인, CI 밖 | `apps/studio/e2e/user-flow.e2e.cjs`, `content-lab.e2e.cjs` (실행법은 파일 맨 위). 가로 넘침도 검사 |
| Modal 배포 코드 | 작성·로컬 검증 | `deploy/modal/app.py`, `voice_proxy.py`, `.github/workflows/modal-deploy.yml`(테스트 통과 후에만 배포), 안내 `docs/MODAL_SETUP.md` |
| Modal 비밀값 | 두 묶음 | `matlab-studio`(GitHub 비밀값을 배포 때마다 다시 씀) + `matlab-settings`(사용자가 Modal 화면에서 고치는 설정, 배포가 덮어쓰지 않음). 자세한 표는 `docs/MODAL_SETUP.md` '설정 바꾸기' |
| Modal 실제 배포 | ✅ 배포·응답 확인 (2026-11-05, Actions #4), 첫 계정 화면까지 | **첫 계정·GPU 목소리·영상 1편 시간·비용·제작 중 깨워 두기는 미확인** |
| 로그인·세션·잠금·출처 검사 | 구현·테스트됨 | `apps/studio/server/auth.ts`, `auth.test.ts`, `app.test.ts` |
| 흐름: 사진 → 주제 고르기 → 후보 영상 5개 → 검수용 렌더 → 블로그 2안 → 승인 → 게시 기록 | 구현·화면 확인 | 화면 단계 이름: 레시피 / 주제·영상 고르기 / 영상·블로그 / 검수·승인 / 게시·기록 (`apps/studio/web/src/steps/progress.ts`) |
| 레시피 사진 읽기 · 주제 후보 (Claude API) | 구현·테스트됨 | `recipeReader.ts`: 첫 주제 후보 3개(근거 인용), '다른 주제 더 보기' 5개씩, 월 한도 공유. 화면 `TopicPicker.tsx` |
| 후보 영상 5개 | 구현 | `CandidatePicker.tsx`: 브라우저가 미리보기(0원). 목소리는 **[목소리 넣기] 버튼을 눌렀을 때만** GPU로. 렌더 중에는 다른 후보로 또 만들 수 없음 |
| 영상 자동 품질 검사 (QA) | 구현·테스트됨 | `packages/video/src/qa.ts`: 받아쓰기 대조·대사 잘림·무음·검은 화면. 화면 `QaPanel.tsx` |
| AI 티 다듬기 (im-not-ai) | 구현·테스트됨 | `packages/publishing/src/imNotAi/`, `server/humanize.ts`, 화면 `HumanizePanel.tsx` |
| 인스타그램 공식 게시 (API) | **구현·모의 검증** | `server/instagram.ts`, 화면 `InstagramPublish.tsx`, 설정 `docs/INSTAGRAM_SETUP.md`. 실제 계정 연결·게시는 사용자 승인 후에만 |
| 휴대폰 폭 화면 | e2e(390px)로 가로 넘침 없음 확인 | 입력칸 16px(아이폰 확대 방지), 미리보기 영상 폭 반응형 |
| 안드로이드 APK | 1.2(코드 3): 바로 클라우드 주소를 엶, 사진 찍기(카메라) 선택지, http 허용 제거 | `apps/android/`. `gradle assembleDebug` 빌드 확인. **실기기 미확인** |
| **아이폰 사파리 실기기** | ❌ 미확인 | 홈 화면에 추가, 사진 찍기·HEIC, 복사 버튼, 내려받기 |
| **Modal에서 영상 1편 시간·비용** | ❌ 미측정 (추정: 한 편 약 $0.5~1, 후보 목소리 포함) | `docs/MODAL_SETUP.md` 맨 위 계산 근거 |
| **클라우드에서 계정 추가·비밀번호 재설정** | ❌ 기능 없음 | 아래 '알려진 빈칸' |
| **네이버 글쓰기 링크** `https://blog.naver.com/GoBlogWrite.naver` | ❌ 미확인 | 로그인 상태 휴대폰·PC에서 확인 필요 |
| 오라클 설치 스크립트 | 작성·shellcheck 통과, 부분만 확인 (대안) | `deploy/oracle/install.sh` |

### 알려진 빈칸 (코드로 해야 함)

- **클라우드 계정 추가·비밀번호 재설정**: 지금은 `npm run user:add`(PC 명령)뿐이라 Modal에서는 방법이 없다. DB는 컨테이너 디스크에서 쓰고 5초마다 볼륨에 복사하므로, 볼륨의 `studio.db`를 밖에서 고치면 덮어써진다. 서버 안에서 처리하는 기능(예: 로그인한 사람이 화면에서 가족 계정 추가, 설정 코드로 비밀번호 재설정)이 필요하다. 만들기 전까지 사용자 안내는 "개발자에게 부탁".
- **게시 중복 오류 구분**: 서버는 '이미 게시됨'과 '승인 전'·'영상 없음'에 모두 409를 쓴다. 화면은 문장으로 구분한다(`api.ts`의 `isDuplicateError`). 서버가 `{ code: 'duplicate' }`를 함께 보내면 화면은 그대로 그것을 쓴다.
- **클라우드 목소리 준비 상태**: 중계기 `/health`는 GPU를 깨우지 않으려고 늘 '켜짐'으로 답한다. GPU 쪽 실패는 영상을 만들 때 드러난다. 마지막 목소리 생성 성공/실패 시각을 서버가 알려 주면 화면에 보일 수 있다.

---

## 1. 구조 지도 (빠르게 찾기)

- 제작 흐름: `apps/studio/server/pipeline.ts` (`startRender` → `runRender` → `generateVoice` → Remotion `render.ts` → `qa.ts`)
- 목소리: `apps/studio/server/voicestudio.ts`, `tts.ts`, 고를 수 있는 목소리 `voicePresets.ts` + `tools/setup/voices.json`
- 서버 시작: `apps/studio/server/index.ts` (`--production`이면 `apps/studio/dist` 제공)
- 계정 CLI (PC·오라클 전용): `apps/studio/server/addUser.ts` (`npm run user:add -- 아이디 이름`, `--reset`)
- 화면: `apps/studio/web/src` — 단계 `steps/`, 진행 확인 `poll.ts`, 서버 호출 `api.ts`
- 클라우드: `deploy/modal/app.py`(web·Voice), `voice_proxy.py`, `.github/workflows/modal-deploy.yml`, `modal-logs.yml`(시스템 기록만)
- 대안 서버: `deploy/oracle/install.sh` → systemd `matlab-studio`, `matlab-voicestudio`, `matlab-voice-setup`, 도구 `matlab-update`·`matlab-user`·`matlab-backup`, 안내 `docs/ORACLE_SETUP.md`, `docs/REMOTE_ACCESS.md`

---

## 2. 할 일 (M → C → D, A·B는 대안)

각 작업은 **완료 기준**을 모두 만족해야 "완료"로 보고한다. 못 한 것은 못 했다고 쓴다.

### 작업 M — Modal 실사용 확인 (가장 중요)

사용자가 직접 하는 일: Modal 가입·카드 등록·**지출 한도 $0**, API 토큰, GitHub 비밀값(`MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `STUDIO_SETUP_CODE`, 선택 `ANTHROPIC_API_KEY`) 넣기, Actions에서 **Deploy to Modal** 실행. 순서는 `docs/MODAL_SETUP.md`. 비밀값을 대신 받거나 기록하지 말 것.

에이전트가 할 일:
1. Actions 실행 확인: `test` 작업 → `deploy` 작업. 실패하면 원인을 고쳐 작업 브랜치에 커밋 → 사용자에게 다시 실행 부탁. 서버 오류 기록은 Actions에 찍히지 않으니 사용자에게 Modal → Apps → matlab-studio → Logs 화면을 보여 달라고 한다.
2. 배포 뒤 확인 (사용자 아이폰 또는 로컬 브라우저):
   - 주소 접속 → "처음 계정 만들기" → 설정 코드로 계정 생성 → 로그인 유지
   - 계정을 만든 뒤 POST 요청(프로젝트 만들기)이 403("다른 사이트")으로 막히지 않는지 → 막히면 Modal이 넘기는 Host/X-Forwarded-Host를 로그로 확인해 `auth.ts`의 `ownHosts`를 고친다
   - Modal → Apps → matlab-studio → web 로그에 "목소리 준비 끝"
   - 사진 1장으로 새 콘텐츠 → 주제 고르기 → 후보 5개 → [목소리 넣기] → 하나로 검수용 영상 1편: **걸린 시간과 Modal 사용량(달러)을 단계별로 기록**(후보 목소리 / 영상 완성). 제작 중 앱을 닫아도 끝까지 가는지, 다시 열면 진행 막대가 이어지는지
   - `matlab-settings`에 `CLAUDE_EFFORT=medium` 같은 값을 넣고 다시 배포해도 값이 남는지
   - 20분 넘게 쓰지 않은 뒤 다시 열 때 데이터(계정·프로젝트·영상)가 남아 있는지
3. 완료 기준: 위 항목 모두 성공, 시간·비용 기록 → `docs/MODAL_SETUP.md`의 추정치를 실측으로 바꾼다(화면 `VideoStep.tsx`·`CandidatePicker.tsx`의 금액 문구도 같이).

### 작업 C — 휴대폰 실기기 확인

**아이폰(주 사용 기기)**
1. 사파리로 주소 열기 → 공유 → **홈 화면에 추가** → 아이콘으로 열기 → 로그인 유지(앱을 껐다 켜도)
2. 새 콘텐츠에서 **사진 찍기**와 **사진 보관함**(HEIC) 둘 다 → 미리보기·읽기 성공
3. 입력칸을 눌러도 화면이 확대되지 않는지, 어떤 화면도 옆으로 밀리지 않는지
4. [게시·기록]의 '본문 복사'·'제목 복사', [주제·영상 고르기] → '다른 방법' → 'AI 대본 붙여넣기'의 '프롬프트 복사'가 되는지
5. 승인된 영상의 ZIP·MP4 내려받기 → '파일' 앱에 저장되는지
6. 영상 만드는 중에 다른 앱으로 갔다가 돌아와도 진행 막대가 이어지는지

**안드로이드 APK (있으면)**
- `cd apps/android && gradle assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk` 설치 (USB면 `adb install -r`, 아니면 파일 전송 후 "출처를 알 수 없는 앱 허용")
1. 설치하면 바로 스튜디오가 열리는지(주소 입력 없음) → 로그인 유지
2. 사진 올리기에서 **카메라**와 갤러리 둘 다 나오는지, 찍은 사진이 올라가는지
3. ZIP·MP4 내려받기 → '다운로드' 폴더
4. 인스타그램·네이버 링크가 외부 브라우저/앱으로 열림
5. 메뉴(⋮) 새로고침·주소 바꾸기

완료 기준: 항목별 결과 기록(성공/실패/스크린샷).

### 작업 D — 네이버 글쓰기 연결 확인

- 휴대폰과 PC에서 네이버 로그인 상태로 `https://blog.naver.com/GoBlogWrite.naver`가 글쓰기 화면을 여는지 확인. 스튜디오 [게시·기록]의 "네이버 글쓰기 창 열기" 버튼(`PublicationsPanel.tsx`)이 같은 주소를 연다.
- 안 열리면 실제로 열리는 주소를 찾아 기록만 하고(예: 모바일 앱 글쓰기 경로), 코드 수정은 브랜치에서 한다.
- **자동 발행을 구현하지 말 것.** 네이버 공식 글쓰기 API는 종료됐다. 복사 → 붙여넣기 반자동이 정해진 방식이다.

### 작업 A — (선택) Windows PC 확인 — 최종 사용에는 필요 없음

```
git fetch origin
git checkout content-research
npm ci
npm test
npm run typecheck
npm run user:add -- heejae 이희재   # 비밀번호는 사용자가 직접 입력
npm run start
```

- 브라우저에서 `http://localhost:5178` → 로그인 → 후보 5개 보임 → 검수용 렌더 1편(걸린 시간, 음성 유무, 승인 전 "검토" 문구 없음) 기록
- VoiceStudio 엔진이 **VoxCPM2**(상업 이용 가능)인지 확인. OmniVoice면 쓰지 말고 사용자에게 알린다.
- 렌더가 GPU 문제로 실패하면 `$env:REMOTION_GL="angle"; npm run start`로 재시도.

### 작업 B — (대안) 오라클 무료 서버 — Modal이 안 될 때만

순서는 `docs/ORACLE_SETUP.md` 그대로. 사용자가 해야 하는 부분(가입·카드·콘솔·비밀번호·Tailscale 로그인)은 안내만 한다. 설치는 `deploy/oracle/install.sh`, 로그 `~/matlab-install.log`, 확인은 `systemctl status matlab-studio matlab-voicestudio`, `journalctl -u matlab-voice-setup -f`("목소리 준비 끝"까지). ARM에서 막히면 `/opt/matlab/voicestudio`에서 수동 재현 후 **install.sh를 고쳐 브랜치에 커밋**(VoiceStudio 고정 커밋은 함부로 바꾸지 말 것).

---

## 3. 결과 보고 방식

1. 작업 브랜치(예: `local-verification`)에서 `docs/research/content-strategy/implementation-status.md` 끝에 **실기 확인 (날짜)** 절을 추가: 작업별 성공/실패, 측정값(목소리 시간, 렌더 시간, 비용), 고친 내용, 남은 문제.
2. 코드를 고쳤다면 `npm test` · `npm run typecheck` 통과 후 같은 브랜치에 커밋·push. **main 병합은 사용자 허락 후에만.**
3. 사용자에게는 한국어 쉬운 말로 3~5줄 요약 + 사용자가 직접 할 일만 따로 정리.

---

## 4. 하지 말 것

- 비밀번호·SSH 키·API 키·카드 정보를 대신 입력하거나 파일·로그·커밋·채팅에 남기기
- Modal 지출 한도(Spend limit)를 올리거나, GPU를 더 비싼 것으로 바꾸기 (사용자 확인 없이)
- 유료 API·유료 리소스를 사용자 확인 없이 쓰기
- 인터넷 공개 범위 넓히기(공개 터널, 포트 열기) — 사용자 승인 없이 금지
- 인스타그램·네이버에 **실제 게시**, 실제 인스타그램 계정 연결 (사용자 승인 없이)
- OmniVoice 등 비상업 음성 모델 사용, 실존 인물 목소리 복제
- AGENTS.md의 원칙(원본 보존, 버전별 승인, 승인 전 "검토" 문구 금지, 연구자 경험 날조 금지)을 약하게 만드는 수정
- main에 직접 push
