# 목소리 기준 녹음

고를 수 있는 목소리 6개(`voices.json`)는 모두 VoxCPM2이고, 이 폴더의 기준 녹음 한 개로 복제해서 쓴다(AGENTS.md 원칙 5).
VoiceStudio 프로필 이름은 `이름-녹음 sha1 앞 6자`(예: `맛조수-1a2b3c`)라서, 녹음을 바꾸면 이름이 바뀌고 서버가 새 녹음으로 프로필과 음성 캐시를 다시 만든다.
예전 이름으로 저장된 선택은 이름 앞부분으로 같은 목소리를 찾아 이어 쓴다(`apps/studio/server/voicePresets.ts`).

| 파일 | 만든 방법 |
| --- | --- |
| `matjosu-reference.wav`, `voices/calm-female.wav`·`low-female.wav`·`bright-male.wav`·`calm-male.wav` | 2026-11-20 다시 만듦. 예전 녹음(문장 "이희재의 맛 연구소에서 오늘도 실험! 오늘의 질문, 호두정과는 왜 데쳤다가 튀길까요?", 질문으로 끝남)을 기준으로 VoxCPM2(openbmb/VoxCPM2, voxcpm 2.0.3, Apache-2.0)가 새 문장 "맛 연구소에 오신 걸 환영해요. 오늘도 맛있는 요리 비밀을 차근차근 알려 드릴게요."를 읽게 해서, 목소리마다 여러 번 만든 것 중 두 문장 끝 음높이가 내려가고 예전 녹음과 화자 유사도가 높은 것을 골랐다. 앞뒤 무음을 0.03초·0.04초만 남기고 잘랐고, 최고 음량 -2dBFS, 모노 16비트(맛조수 48kHz, 나머지 24kHz) |
| `voices/matjosu-low.wav` ('맛조수 낮게') | 예전과 같은 방법: 새 맛조수 녹음을 4반음 내림(librosa `pitch_shift`, 길이 그대로), 24kHz, 최고 음량 -1.8dBFS |
| 예전 녹음의 출처 | 모두 VoxCPM2로 만든 녹음 (맛조수: 2026-11-05 커밋 ef94262, 나머지: 2026-11-06 커밋 91dbc99·6e3bc3f) |

고른 근거·측정값: `docs/research/content-strategy/prosody-sync-2026-11.md` 9장.
