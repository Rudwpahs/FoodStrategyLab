# 효과음 출처·라이선스

영상 효과음 4개는 실제 녹음이다 (예전에는 코드로 합성했다). 모두 **CC0**(저작권 포기, 상업 이용 가능, 출처 표기 의무 없음)만 쓴다.
CC BY·BY-SA·NC·ND는 쓰지 않는다 (설명 글에 출처를 달아야 하거나 상업 이용이 막힘).

| 파일 | 쓰는 곳 | 원본 | 만든 사람 | 라이선스 |
| --- | --- | --- | --- | --- |
| `whoosh.wav` | 첫 장면(훅) | [Whoosh #1](https://freesound.org/people/Kinoton/sounds/427823) | Kinoton | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `ding.wav` | 결과·비교 공개 | [bell ding 1.wav](https://freesound.org/people/5ro4/sounds/611113) (탁상 종) | 5ro4 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `boing.wav` | 실패 장면 | [Boing Spring Mouth harp downward 1.wav](https://freesound.org/people/pan14/sounds/334031) (구금, 내려가는 소리) | pan14 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `pop.wav` | 마지막 서명 장면 | [Cork pop 2](https://freesound.org/people/Andre_Desartistes/sounds/335358) (코르크) | Andre_Desartistes | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

- 찾은 곳: [Openverse](https://openverse.org) (라이선스 CC0로 걸러 검색). 라이선스는 각 Freesound 원본 페이지에서 다시 확인했다 (2026-11-17).
- 다듬은 방법: 앞의 무음을 자르고 1초 안으로 줄인 뒤 끝을 서서히 줄임, 모노 22050Hz 16비트 WAV. 소리 크기는 예전 합성음과 비슷하게(넘치지 않게 최대 -1dBFS).
- 영상에 넣는 방법: `npx tsx tools/content-lab/embed-sfx.ts`가 이 폴더의 WAV를 `packages/video/src/sfxData.ts`로 넣는다 (화면 미리보기와 렌더가 같은 소리를 쓰게).
- 새 효과음을 더할 때도 CC0만, 이 표에 한 줄을 남긴다.
