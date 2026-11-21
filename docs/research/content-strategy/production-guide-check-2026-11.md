# 외부 제작 가이드 2종 점검 (2026-11-21)

사용자가 보낸 두 자료를 우리 파이프라인과 비교하고, 가이드의 주장을 웹 조사로 검증했다.
- "How It's Built" 시작 스킬 (Blender로 3D 조립 숏폼을 만드는 MIT 코드). 코드는 가져오지 않았다.
- "How I make stickman story videos" 제작 안내 PDF (HyperFrames·Kokoro TTS로 만드는 이야기 연재물).

조사 한계: 페이지 직접 열기가 막혀 Meta 공식 문서도 검색 본문·2차 출처로 확인했다. [공식] [연구] [업계 조사] [블로그]로 출처 종류를 적는다.

## 1. 가이드 주장 검증과 우리 값

| 항목 | 판정 | 가이드 | 우리 (2026-11-21) | 근거 |
| --- | --- | --- | --- | --- |
| 화면 안전 영역 | 부분적으로 맞음 | 아래 20%·오른쪽 12% 비움, 자막 y 1140~1360 | 자막 아랫변 1480 (아래 440px 비움) | 일반 릴스 공식 수치 없음, 업체 측정 아래 400~430px·오른쪽 약 130px [블로그]. 광고는 위 14%·아래 35%·좌우 6% [공식, 2차 확인] |
| 음량 | 부분적으로 맞음 | −14 LUFS, −2 dBTP, AAC 192k | −14 LUFS, −1.5 dBTP, AAC 192k(128k에서 올림) | Meta는 목표 LUFS를 공개하지 않고 재생 기기에서 맞춘다 (Engineering at Meta 2023-04-11) [공식]. EBU R128: −1 dBTP 이하 [표준]. Meta 영상 규격 AAC-LC 48kHz 128kbps 이상 [공식] |
| 목소리 대 음악 | 부분적으로 맞음 | 말소리 대역에서 10dB 이상 | 대사 중 음악 약 −31 LUFS, 목소리보다 약 17dB 작게 (`music.ts`) | Torcoli 외 AES 2019: 해설·음악 차이 최소 10 LU 권장, 일반인은 더 큰 차이 선호 [연구]. WCAG 1.4.7(AAA): 20dB [표준] |
| 첫 1~2초 | 부분적으로 맞음 | 가장 강한 장면을 먼저 1.5~2초 | 첫 대사가 정보 하나를 약속, 첫 장면 visual 형식별 | 요리 영상 '완성 먼저 대 과정 먼저' 직접 비교 자료 없음. Instagram이 2025-08 처음 3초 건너뛰기율을 공식 지표로 [공식, 2차 보도] → 시험 릴스로 직접 비교할 것 |
| 자막 | 부분적으로 맞음 | 2~4단어, 강조 단어 1개 | 1~3어절, 13자 묶음 | 덩어리 길이 연구 없음 [블로그]. Netflix 한국어 지침: 한 줄 16자, 초당 12자 [업계 지침] → 우리 값 안에 있음 |
| 목소리 속도·쉼 | 배속 주장은 근거 없음 / 쉼은 부분적으로 맞음 | 0.8~0.85배가 긴장감, 핵심 앞 0.4초 쉼 | 쉼 포함 초당 약 4.4~5.0음절 (견본 4편 실측), 장면 끝 쉼 0.45초 | 합성 음성을 느리게 하면 덜 자연스럽다는 연구 [연구 2026]. 한국어 뉴스 초당 약 5.9음절, 일상 대화 4.5~4.8음절 [연구]. 단어 앞 조용한 쉼이 기억을 높임 (MacGregor·Corley·Donaldson 2010) [연구] |

## 2. 반영한 것

1. **재료 소품이 그 이름을 말할 때 나온다** (가이드의 "모든 것을 이름으로 배치"). 실제 목소리 어절 시간으로, 이름 + 조사인 어절이 시작하기 조금 전에 나타난다 (`stage.ts` `propCueFrames`). 대사에 없는 재료·목소리 없는 미리보기는 예전처럼 차례로.
2. **핵심 원리 앞 쉼**: 첫 원리 장면 바로 앞에만 0.35초 더 (장면 끝 기본 0.45초와 합쳐 약 0.8초). 영상당 한 번 (`timeline.ts` `KEY_PAUSE_SECONDS`).
3. **음성 192kbps**: Meta 최소 128kbps보다 여유.

## 3. 반영하지 않은 것과 이유

- **자막을 더 위로(아랫변 1400)**: 시험해 보니 지금 카메라 구도에서 일부 장면의 얼굴을 가렸다. 지금 1480도 업체 측정 안전선(약 1490~1520) 안이라 유지.
- **길이 70~80초**: 연재 드라마용. 레시피 릴스는 30~40초가 우리 조사 결론이고, 바꿀 근거 없음 (Buffer 분석은 인과 분석이 아님).
- **0.8배 느린 목소리**: 근거 없음. 우리 속도는 이미 권장 범위.
- **투표로 다음 편 정하기**: 이야기 연재 형식이라 레시피 채널에 맞지 않음.

## 4. 사용자 결정이 필요한 것

- **완성 요리 먼저(콜드 오픈) 시험**: 0~1.5초에 완성 요리를 보여 주고 과정으로. 근거가 엇갈리므로 시험 릴스(팔로워 아닌 사람에게만 먼저 보이는 기능)로 두 가지 시작을 올려 건너뛰기율을 비교하는 것이 확실하다.
- **게시 날 할 일**: 같은 날 스토리에 투표 스티커(예: "데쳐서 vs 바로"), 댓글 답은 짧게. 공식 근거는 순위 신호(시청 시간, 도달 대비 좋아요·보내기)뿐이고 스토리 투표 효과 자료는 없다.
- **AI 캐릭터 채널의 위험**: Mosseri 2025-12-31 글은 AI 콘텐츠 표시를 강화하고 실제 사람 콘텐츠를 드러내는 방향. 연구자 실제 촬영 모드·연구자 답변을 앞세우는 편이 유리하다는 추론 (공식 지침 아님).

## 출처
- Meta 광고 안전 영역 정리: https://terrads.com/blog/meta-safe-zones-are-percentages , https://clear-cortex.com/insights/instagram-safe-zones
- 일반 릴스 안전 영역 측정: https://adsap.ai/blog/instagram-reels-stories-safe-zones , https://www.lilachbullock.com/instagram-reels-safe-zone/
- Meta xHE-AAC 음량: https://engineering.fb.com/2023/04/11/video-engineering/high-quality-audio-xhe-aac-codec-meta/
- EBU R128: https://tech.ebu.ch/docs/r/r128v4_0.pdf
- Torcoli 외 2019: https://aes.org/publications/elibrary/elibrary-page/?id=20308
- WCAG 1.4.7: https://www.w3.org/WAI/WCAG20/Understanding/low-or-no-background-audio
- 건너뛰기율: https://metricool.com/instagram-reel-analytics/
- Netflix 한국어 자막 지침: https://backlothelp.netflix.com/hc/en-us/articles/216001127
- 한국어 말 속도: https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002743897 , https://www.eksss.org/archive/view_article?pid=pss-10-4-19
- 쉼과 기억: https://pmc.ncbi.nlm.nih.gov/articles/PMC3097182
- 합성 음성 속도: https://sites.uw.edu/gcler/files/2026/02/Vojtech-perceived-naturalness-of-synthetic-speech.pdf
- 원본 우대: https://techcrunch.com/2024/04/30/instagram-is-updating-its-ranking-systems-to-surface-more-content-from-smaller-original-creators , https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/
- 시험 릴스: https://creators.instagram.com/blog/instagram-trial-reels
- Mosseri 2025-12-31: https://www.engadget.com/social-media/instagram-chief-ai-is-so-ubiquitous-it-will-be-more-practical-to-fingerprint-real-media-than-fake-media-202620080.html
