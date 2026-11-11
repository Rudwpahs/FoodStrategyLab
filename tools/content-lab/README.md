# content-lab 도구

연구·파일럿용 스크립트. 저장소 루트에서 실행한다. 결과물은 `out/`(Git 제외)에 생긴다.
타입 검사: `npx tsc -p tools/tsconfig.json --noEmit` (CI에서도 돈다).

| 파일 | 하는 일 |
| --- | --- |
| `pilot.ts` | 호두정과 A(문제 해결)·B(코미디)·C(실험) 영상 제작. VoiceStudio 필요. `npx tsx tools/content-lab/pilot.ts B-comedy` 처럼 하나만도 가능. 렌더가 검게 나오면 앞에 `REMOTION_GL=swangle` |
| `pilotlib.ts` | `pilot.ts`가 쓰는 공용 함수 (받아쓰기 비교용 타임라인 내보내기) |
| `preview-video.ts` | 목소리 없이(예상 길이·자막만) 후보 영상 한 편을 MP4로. `npx tsx tools/content-lab/preview-video.ts <recipe.json> <출력.mp4> [후보번호]` |
| `frames.ts` | 후보 대본의 프레임을 일정 간격으로 뽑아 한 장으로 붙임 (화면 구성 확인). `npx tsx tools/content-lab/frames.ts <recipe.json> <출력폴더> [후보번호] [간격초]` |
| `seed-pilot-render.ts` | 이미 만든 파일럿 영상을 프로젝트의 검수용 영상으로 붙임 (e2e 점검에서 30분 렌더 대신). `MATLAB_DATA_DIR=… npx tsx tools/content-lab/seed-pilot-render.ts <projectId> <영상.mp4> [첫화면.png]` |
| `hooktable.ts` | 호두정과 15가지 훅 비교표 (hook-library.md 3절) |
| `blogpilot.ts` | 블로그 A(자동)·B(전문가 노트형) 샘플 |
| `synccheck.ts` | 기준 영상 타임라인 JSON 내보내기 |
| `sync_whisper.py` | 영상 소리를 Whisper로 받아쓰고 타임라인과 비교 (faster-whisper 필요: VoiceStudio 가상환경의 python으로 `-I` 실행) |

`tools/setup/voice.ts`는 연구용이 아니라 운영 코드다: 클라우드 서버가 켜질 때마다 맛조수 목소리를 준비한다(`deploy/modal/app.py`).
