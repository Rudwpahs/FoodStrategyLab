# AGENTS.md — 이희재의 맛 연구소 스튜디오

코딩 에이전트(Codex, Claude Code 등)가 이 저장소에서 일할 때 지킬 규칙이다. 현재 인계 작업은 [docs/handoff/CODEX_LOCAL_HANDOFF.md](docs/handoff/CODEX_LOCAL_HANDOFF.md)에 있다.

## 프로젝트 한 줄

요리 연구자(조리기능장 이희재)의 레시피로 AI 캐릭터 '맛조수'가 진행하는 세로 숏폼(MP4)과 네이버 블로그 원고를 만들고, 연구자 검수·승인 뒤 게시를 기록하는 웹 스튜디오. 최종 사용자는 웹(휴대폰)만 쓴다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `packages/recipe-core` | 규칙·순수 함수: 레시피 모델, 원본 대조(`fidelity.ts`), 훅 15종(`hooks.ts`), 연출 6종(`styles.ts`), 후보 3개(`candidates.ts`) |
| `packages/video` | Remotion + Three.js 렌더: 3D 주방·맛조수, 자막, 효과음(`sfx.ts`), 렌더러(`render.ts`) |
| `packages/publishing` | 블로그(자동·전문가 답변형), SNS 문구, 일관성 검사, 문체 점검, ZIP |
| `apps/studio/server` | Express 5 + node:sqlite: API, 로그인(`auth.ts`), 제작 파이프라인(`pipeline.ts`), VoiceStudio 연동(`voicestudio.ts`, `tts.ts`) |
| `apps/studio/web` | React 19 화면 (Vite) |
| `apps/android` | 스튜디오를 여는 안드로이드 WebView 앱 |
| `deploy/modal/` | 기본 배포: Modal 클라우드(`app.py` 웹+GPU 목소리, `voice_proxy.py`), `.github/workflows/modal-deploy.yml`, 안내 `docs/MODAL_SETUP.md` |
| `deploy/oracle/install.sh` | 대안: 오라클(Ubuntu) 한 번에 설치 |
| `tools/content-lab`, `tools/setup` | 파일럿 렌더·검증 도구, 서버 목소리 자동 준비 |

## 명령

```
npm ci            # 설치 (Node 22.13 이상)
npm test          # Vitest 전체 (현재 136개 통과)
npm run typecheck # tsc
npm run dev       # 개발 서버 http://localhost:5178
npm run start     # 화면 묶음을 만든 뒤 빠른 실행 모드
npm run user:add -- 아이디 이름   # 로그인 계정 (비밀번호는 입력창에서)
```

변경 후에는 `npm test`와 `npm run typecheck`가 통과해야 한다.

## 반드시 지킬 원칙 (코드와 테스트로 강제됨 — 약하게 만들지 말 것)

1. **원본 레시피의 재료·분량·순서는 AI·엔진이 바꾸지 않는다.** 재료·순서 카드는 원본에서만 만든다. 원본에 없는 분량이 대본에 있으면 승인할 수 없다.
2. **승인은 대본 버전에 묶인다.** 대본·원본·훅을 바꾸면 새 버전이 되고 승인이 풀린다. 내보내기(ZIP)·게시 기록은 승인된 최신 버전의 영상만 가능하다.
3. **"검토/검증" 문구는 이희재가 승인한 결과물에만.** 승인 전 영상은 상태 문구 없이(`cleanDraft`) 만든다.
4. **연구자의 실제 경험은 연구자 답변 원문만 쓴다.** 블로그에 경험을 지어 넣지 않는다. 답이 없으면 "답변 대기"로 남긴다.
5. **비상업 라이선스 음성 모델(OmniVoice 등)은 쓰지 않는다.** VoxCPM2·MOSS-TTS-Nano 등 상업 이용 가능한 엔진만.
6. **비밀값(비밀번호·토큰·API 키)을 저장소·로그·채팅에 남기지 않는다.**

## 사용자 승인이 필요한 일 (먼저 묻기)

- 유료 API 사용, 실제 인스타그램 등 외부 계정 연결·게시, 인터넷 공개(터널 공개 주소 등), main 병합
- 작업은 브랜치에서 하고, main에는 사용자가 허락할 때만 합친다.

## 커밋

- 짧은 영어 제목 + 필요하면 본문. 모델 이름을 커밋·코드·문서에 넣지 않는다.
- 사용자에게 보고할 때는 한국어로, 쉬운 말로.
