# 배경 음악 출처·라이선스

영상 배경 음악 4곡은 실제 연주 녹음이다. 효과음과 같이 **CC0**(저작권 포기, 상업 이용 가능, 출처 표기 의무 없음)만 쓴다.
곡은 이야기 분위기에 맞춰 고른다 (`packages/video/src/music.ts`의 `musicFor`).

| 파일 | 분위기 · 쓰는 곳 | 원본 | 만든 사람 | 라이선스 |
| --- | --- | --- | --- | --- |
| `ukulele.mp3` | 밝음 · 기본 | [short ukulele loop by rea](https://freesound.org/people/reasanka/sounds/383023) | reasanka | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `upbeat.mp3` | 신남 · 시간 싸움·내기·구출·실험 | [happy loop](https://freesound.org/people/wi-photos/sounds/506791) | wi-photos | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `pizzicato.mp3` | 궁금함 · 추리·오해 깨기·코미디·문제 해결 | [Short Pizzicato Song](https://freesound.org/people/DanJFilms/sounds/529008) (앞 40초) | DanJFilms | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `musicbox.mp3` | 따뜻함 · 선물·추억·이야기, 부엌 다큐(가진 곡 중 가장 차분) | [sweet music box loop](https://freesound.org/people/ZHR%C3%98/sounds/676722) | ZHRØ | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

- 찾은 곳: [Openverse](https://openverse.org) (라이선스 CC0로 걸러 검색, 2026-11-18). Freesound 파일 서버가 개발 컨테이너를 막아 `.github/workflows/fetch-sfx.yml`(사용자 승인)로 GitHub 서버에서 받았다.
- 다듬은 방법: 모노 44.1kHz, 96kbps MP3, 소리 크기 -20 LUFS로 맞춤. 피치카토 곡은 앞 40초만 쓰고 끝 2.5초를 서서히 줄였다.
- 섞는 방법: 서버는 대사·효과음으로 영상을 만들고 자동 품질 검사를 마친 뒤 ffmpeg로 섞는다. 대사 중에는 약 -31 LUFS(목소리보다 17dB쯤 작게), 쉬는 틈에는 약 -24 LUFS. 브라우저 미리보기도 같은 규칙(`musicGain`).
- 새 곡을 더할 때도 CC0만, 이 표에 한 줄을 남긴다.
