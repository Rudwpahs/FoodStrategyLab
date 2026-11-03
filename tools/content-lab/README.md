# content-lab 도구

연구·파일럿용 스크립트. 저장소 루트에서 실행한다. 결과물은 `out/`(Git 제외)에 생긴다.

| 파일 | 하는 일 |
| --- | --- |
| `pilot.ts` | 호두정과 A(문제 해결)·B(코미디)·C(실험) 영상 제작. VoiceStudio 필요. `npx tsx tools/content-lab/pilot.ts B-comedy` 처럼 하나만도 가능 |
| `hooktable.ts` | 호두정과 15가지 훅 비교표 (hook-library.md 3절) |
| `blogpilot.ts` | 블로그 A(자동)·B(전문가 노트형) 샘플 |
| `synccheck.ts` | 기준 영상 타임라인 JSON 내보내기 |
| `sync_whisper.py` | 영상 소리를 Whisper로 받아쓰고 타임라인과 비교 (faster-whisper 필요: VoiceStudio 가상환경의 python으로 `-I` 실행) |
