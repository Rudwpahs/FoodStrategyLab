# 콘텐츠 전략 근거 자료 목록 (공식·연구 출처)

- **프로젝트**: 이희재의 맛 연구소 — AI 마스코트 "맛조수"가 시청자 질문을 대신 묻고, 실제 전문가 이희재(조리기능장, 외식·급식경영 연구자)가 답하는 세로형 숏폼(Instagram Reels, YouTube Shorts)과 네이버 블로그
- **작성일**: 2026-11-03 (모든 자료 확인일 동일)
- **작성 방법**
  - WebSearch로 후보를 찾은 뒤, 본문은 `curl`로 내려받아 Python HTML 파서와 `pdftotext`로 텍스트를 뽑아 직접 읽었다. 네이버 공식 블로그(`naver_search`)는 공개 글목록을 받아 2023~2026년 공지 제목을 훑은 뒤 관련 글을 열었다.
  - **확인 방식 표기**: `본문 확인` = 페이지(또는 PDF·초록)를 직접 열어 읽음 / `검색 결과 요약만 확인` = 검색 결과의 요약·스니펫만 봤고 원문은 열지 못함(인용 수치는 원문으로 다시 확인할 것).
  - URL, 제목, 수치, 인용문은 위 두 경로에서 확인된 것만 적었다. 추정한 내용은 "가설"로 따로 표시했다.
- **접근 제한(실제로 겪은 것)**
  - WebFetch 도구는 `creators.instagram.com`에서 DNS 오류가 나서, 모든 페이지를 curl로 대신 받았다.
  - creators.instagram.com 2026-04-30 블로그 글(`/blog/rewarding-original-creators-on-instagram`)은 클라이언트 렌더링이라 본문 텍스트를 추출하지 못했다. 검색 결과와 TechCrunch 보도로 교차 확인했다.
  - 다음 사이트는 403·429·캡차로 막혔다: Google Scholar(429), MDPI·SAGE·ScienceDirect·Emerald(403), PMC(캡차), HBS Working Knowledge(403), i-boss(403). 해당 논문은 출판사 대신 저자·기관 리포지토리(Tilburg, LSU, Würzburg, MIT, NSF PAR, arXiv, PubMed)에서 초록이나 원고를 확인했다.
  - Adam Mosseri의 원본 영상(Instagram)은 직접 보지 못했다. 발언 인용은 Social Media Today 보도를 기준으로 했다.

## 근거 수준 범례

| 표기 | 의미 |
|---|---|
| **[공식]** | 플랫폼(Instagram/Meta, YouTube/Google, 네이버)이 직접 공개한 문서, 도움말, 공식 블로그. 플랫폼 임원이 공개적으로 한 발언 포함 |
| **[공식·2차]** | 공식 발언·발표를 언론이 인용 보도한 것. 원문은 미확인 |
| **[연구]** | 동료심사 논문, 학술대회 논문, 학술 원고(arXiv 등 프리프린트는 별도 표시) |
| **[업계]** | 데이터를 공개한 업계 조사(Google/Kantar 등), 법률 해설 |
| **[경험]** | 크리에이터·실무자 주장(근거 데이터 없음) |
| **[가설]** | 우리 팀이 실험으로 검증할 가설 |

> 주의: [공식] 자료는 "플랫폼이 이렇게 말했다"는 사실의 근거이지, 그 권고가 실제 성과를 낸다는 인과 증거는 아니다. 플랫폼 권고에는 플랫폼 자신의 이해관계(체류시간, 광고)도 반영되어 있다.

---

## 1. Instagram / Meta 공식 자료

| 번호 | 자료명 | 발행처 | URL | 발행/갱신일 | 확인일 | 확인 방식 | 근거 수준 | 핵심 내용 | FoodStrategyLab 시사점 |
|---|---|---|---|---|---|---|---|---|---|
| S01 | Instagram Ranking Explained | Instagram (Adam Mosseri) | https://about.instagram.com/blog/announcements/instagram-ranking-explained | 2023-05-31 | 2026-11-03 | 본문 확인 | [공식] | 단일 알고리즘은 없고 Feed·Stories·Explore·Reels마다 랭킹이 다르다. Reels에서 가장 중요한 예측은 ①리셰어 ②끝까지 시청 ③좋아요 ④오디오 페이지 이동 가능성이다. 사용자에게 "시간 들일 가치가 있었나/재밌었나"를 설문해 학습한다. 저해상도·워터마크·무음·테두리·**화면 대부분이 텍스트**·이미 올라온 릴스는 덜 노출한다. 추천 가이드라인을 반복 위반하면 계정 전체가 일정 기간 추천에서 빠진다. | 핵심 KPI는 공유(보내기)와 완주다. 자막은 필요하지만 "텍스트 위주 화면"은 감점 요인이 될 수 있다. 무음 업로드는 피한다(배경음·보이스 필수). |
| S02 | How to Grow (Grow with Reels / What helps·hurts your reach) | Instagram for Creators | https://creators.instagram.com/how-to-grow | 미표기 (2026-11-03 현재 게시) | 2026-11-03 | 본문 확인 (페이지 내장 텍스트) | [공식] | 원문: "hook your audience within the first 3 seconds of a reel, then find creative ways to keep their attention until the end", "Optimize for sound off. Use text and closed captioning". 추천 신호로 시청시간·리텐션·공유·좋아요·댓글을 들고, 비팔로워에게는 먼저 소규모로 보여준 뒤 성과가 좋으면 점점 넓게 확산한다. 품질 기준은 720p 이상·30fps 이상이고, 첫 이틀 안에 댓글에 답하라고 권한다. 3분이 넘는 릴스는 새 시청자에게 추천되지 않는다. 릴스가 Instagram 전체 이용시간의 50% 이상이라고 밝힌다. | "첫 3초 훅"은 업계 속설이 아니라 Instagram이 공식 권고하는 사항이다(다만 인과 근거는 공개되지 않았다). 3분 이하, 720p/30fps 이상, 무음으로도 이해되게 만들기를 제작 기본값으로 둔다. |
| S03 | Create Engaging Content (Reels best practices, Trial reels, Accessibility, Engagement bait) | Instagram for Creators | https://creators.instagram.com/create-engaging-content | 미표기 | 2026-11-03 | 본문 확인 (페이지 내장 텍스트) | [공식] | 체크리스트: 공유하고 싶은 콘텐츠 / 첫 3초 훅 / 최고 해상도 / 트렌딩 오디오 / 무음 최적화(텍스트·자막) / 첫 며칠 댓글 응대 / 3분 미만. 하루 45억 건의 릴스가 리셰어된다고 밝힌다. **음식 리뷰어 예시**: 새 식당 리뷰는 함께 가고 싶은 친구에게 공유될 수 있다. 트라이얼 릴스는 비팔로워에게만 먼저 노출되고 24시간 뒤 지표를 볼 수 있으며 "concepts, characters, and content styles"를 실험하는 용도라고 설명한다. 공유를 억지로 유도하는 참여 유도(engagement bait)는 노출을 줄인다. | 캐릭터(맛조수) 포맷 실험은 트라이얼 릴스로 하는 것이 공식 권장 경로다. "친구에게 보내고 싶은" 실용 팁(예: '이거 몰랐지?')을 설계한다. "공유 안 하면 ~" 같은 문구는 금지한다. |
| S04 | Original Content Guidelines | Instagram for Creators | https://creators.instagram.com/original-content-guidelines/ | 미표기 (2026 기준 게시) | 2026-11-03 | 본문 확인 | [공식] | 원본 콘텐츠는 직접 찍었거나 직접 디자인했거나 **실질적으로 편집한** 콘텐츠다. 테두리·워터마크·속도 변경·출처 표기만으로는 원본으로 인정되지 않는다. 계정이 주로 비원본 릴스·사진·캐러셀을 올리면 새 시청자 추천에서 빠질 수 있고, 최근 30일 기준으로 상당 비율이 원본이면 다시 자격을 얻는다(롤링 계산, Account Status에서 확인). | 이희재의 실제 조리·실험 장면을 직접 촬영하는 것이 가장 강한 원본성이다. 타 채널 클립이나 뉴스 화면을 재사용할 때는 해설·내레이션으로 "실질적 편집"을 해야 한다. |
| S05 | Helping Creators Find New Audiences | Instagram for Creators | https://creators.instagram.com/recommendations-and-Originality | 2024-04-30 | 2026-11-03 | 본문 확인 | [공식] | 모든 적격 콘텐츠를 팔로워 여부와 상관없이 소규모 시청자에게 먼저 보여주고, 상위 성과 릴스를 점점 더 넓게 확산하는 방식으로 바꾼다고 발표했다. 동일 콘텐츠가 여럿이면 원본만 추천한다. 추천 부적격 범주에는 과장된 건강 주장("miracle cures"), 클릭베이트·참여 유도 글, 재활용 저품질 콘텐츠가 포함된다. | 소규모 채널도 콘텐츠 단위로 기회를 얻는다. 음식·건강 효능을 과장하는 문구("○○ 먹으면 혈당 뚝")는 추천 부적격 위험이 있으므로 이희재의 근거 기반 표현 원칙과 맞춘다. |
| S06 | What Creators Need To Know About Instagram Recommendations | Instagram for Creators | https://creators.instagram.com/blog/instagram-recommendations-eligibility-tips-creators | 2022-08-30 (2023-04-25 업데이트) | 2026-11-03 | 본문 확인 | [공식] | 9:16 고해상도, 테두리 없이, 텍스트가 화면 대부분을 덮지 않게 만들라고 권한다. 원문: "Pull the viewer in within the first 3 seconds, and keep them interested the whole time." 검색은 텍스트로 매칭되므로 핸들·이름·소개·캡션에 키워드를 넣고, 해시태그는 댓글이 아니라 캡션에 넣으라고 한다. 공개 계정만 추천된다. | 프로필명·소개에 "조리기능장/요리 과학/맛 연구" 같은 키워드를 넣는다. 캡션 첫 줄에 검색어(요리명·질문)를 넣는다. |
| S07 | Rewarding original creators on Instagram (2026 확대 발표) | Instagram for Creators | https://creators.instagram.com/blog/rewarding-original-creators-on-instagram | 2026-04-30 | 2026-11-03 | 검색 결과 요약만 확인 (페이지는 열었으나 클라이언트 렌더링이라 본문 추출 실패) | [공식] | (검색 요약 및 S08 기준) 2024년 릴스에 적용한 원본성 보호를 사진·캐러셀로 확대했다. 남의 작품을 주로 재업로드하는 애그리게이터는 추천 부적격이 되며, 30일간 원본 위주로 올리면 다시 자격을 얻는다. | 블로그용 이미지를 캐러셀로 재활용할 때도 직접 촬영한 사진을 쓴다. |
| S08 | Instagram cracks down on content aggregators | TechCrunch | https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/ | 2026-04-30 | 2026-11-03 | 본문 확인 | [공식·2차] | S07 발표를 보도했다. Instagram 블로그를 인용해 "unique text, creative edits, and voiceover"로 관점을 더한 밈은 원본이라고 전한다. 팔로워에게 보이는 방식은 바뀌지 않는다. | 마스코트의 보이스오버와 해설은 "실질적 편집"의 예시와 같은 성격이다. 다만 원본 영상 자체를 직접 찍는 것이 우선이다. |
| S09 | Instagram Shares Algorithm Insights (Mosseri 영상 시리즈 1편) | Social Media Today | https://www.socialmediatoday.com/news/instagram-shares-algorithm-insights-2025/738034/ | 2025-01-22 | 2026-11-03 | 본문 확인 (Mosseri 원본 영상은 미확인) | [공식·2차] | Mosseri 인용: "The top three signals that matter most for ranking are watch time, likes and sends... pay close attention to average watch time, likes per reach, and sends per reach." / "Likes are slightly more important for connected content, and sends are slightly more important for unconnected content." 기사 필자는 댓글이 언급되지 않았다고 지적한다. | 비팔로워 확장에는 "보내기(DM 공유)/도달"이 상대적으로 중요하다. 주간 리포트에 평균 시청시간, 좋아요/도달, 보내기/도달을 고정 지표로 둔다. "보내기가 좋아요보다 3~5배 중요" 같은 수치는 출처가 확인되지 않은 속설이다(검색 과정에서 출처 없는 주장으로 확인). |
| S10 | Instagram Adds Retention Metrics for Reels | Social Media Today | https://www.socialmediatoday.com/news/instagram-adds-retention-insights-reels/758464/ | 2025-08-24 | 2026-11-03 | 본문 확인 | [공식·2차] | 릴스별 Retention 차트를 추가했다(Instagram 인용: "the flatter the line, the more engaged your audience is"). view rate(3초 이후까지 본 비율)를 skip rate로 대체했다. skip rate = "the percentage of views from people who decided to skip your reel during those first 3 seconds". | "3초"는 Instagram의 공식 **측정 정의**다. 편별 skip rate와 리텐션 그래프의 꺾이는 지점을 기록해 오프닝 A/B를 판단한다. |
| S11 | Edits (Instagram 동영상 편집 앱) | Instagram for Creators | https://creators.instagram.com/edits | 미표기 | 2026-11-03 | 본문 확인 (페이지 내장 텍스트) | [공식] | 최대 10분 촬영, 자동 자막(여러 언어), 텔레프롬프터, 템플릿, 그린스크린, AI 이미지 애니메이션을 제공한다. Insights에서 "factors that can affect distribution like skip rate"를 보여준다. Restyle(AI 배경·의상 변경)은 일부 국가만 지원하며, 목록에 한국은 없다. | 자동 자막과 텔레프롬프터(이희재 촬영용)는 제작 시간을 줄일 수 있다. 앱 안의 skip rate로 오프닝을 진단한다. |
| S12 | Understanding Instagram Insights | Instagram for Creators | https://creators.instagram.com/grow/insights | 미표기 | 2026-11-03 | 본문 확인 (페이지 내장 텍스트) | [공식] | 팔로워/비팔로워별 도달을 분해해 보여준다. 공유는 콘텐츠가 얼마나 가치 있고 공감되는지 보여 주고 새 시청자 도달을 키우며, 댓글은 공감, 팔로우는 신규 도달의 성과를 나타낸다고 설명한다. | 실험 판정 지표를 "비팔로워 도달 비율 + 공유 + 게시물발 팔로우"로 정의한다. |
| S13 | Our Approach to Labeling AI-Generated Content and Manipulated Media | Meta (about.fb.com) | https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/ | 2024-04-05 (2024-05-10, 2024-07-01, 2024-09-12 업데이트) | 2026-11-03 | 본문 확인 | [공식] | 업계 표준 AI 지표를 감지하거나 업로더가 자진 공개하면 "AI info" 라벨을 붙인다. AI로 수정·편집만 한 콘텐츠는 라벨을 게시물 메뉴로 옮겼고, AI로 생성한 콘텐츠에는 계속 표시한다. 공중을 크게 오도할 위험이 높으면 더 눈에 띄는 라벨을 붙일 수 있다. | 맛조수 캐릭터를 생성형 AI로 만들면 "AI info" 라벨이 붙을 수 있다. 라벨이 붙어도 오해가 없도록 프로필과 캡션에 "AI 캐릭터 + 실제 전문가" 구조를 미리 밝혀 둔다. |

## 2. YouTube / Google 공식 자료

| 번호 | 자료명 | 발행처 | URL | 발행/갱신일 | 확인일 | 확인 방식 | 근거 수준 | 핵심 내용 | FoodStrategyLab 시사점 |
|---|---|---|---|---|---|---|---|---|---|
| S14 | How engagement metrics are counted | YouTube Help | https://support.google.com/youtube/answer/2991785?hl=en | 2026-11-03 열람 시점 내용 (2026-08-24 변경 반영) | 2026-11-03 | 본문 확인 | [공식] | "Beginning August 24, 2026, views are counted the moment a video starts to play across all formats, including Shorts, long-form videos (VOD), and live streams." YPP 수익은 계속 "engaged views"와 "engaged watch hours" 기준이다. 저품질 재생은 집계에서 제외될 수 있다. (참고: Shorts만 먼저 2025-03-31에 재생 시작 기준으로 바뀌었다는 내용은 TechCrunch 2025-03-26 보도 https://techcrunch.com/2025/03/26/youtube-is-changing-how-youtube-shorts-views-are-counted 의 검색 결과 요약으로만 확인했다.) | 조회수는 재생 시작만으로 올라가므로 성과 판단에 쓰지 않는다. Engaged views, 평균 시청 비율, viewed vs swiped away를 주 지표로 쓴다. |
| S15 | Understand your YouTube content performance | YouTube Help | https://support.google.com/youtube/answer/12220281?hl=en | 2026-11-03 열람 시점 | 2026-11-03 | 본문 확인 | [공식] | Content 탭(Videos/Shorts/Live 등)에서 Shorts 유입 경로(Shorts 피드·검색·채널 페이지 등)와 형식별 구독 전환을 보여준다. 2026-08-24 조회 집계 변경을 다시 안내하며, YPP 기준은 "engaged Shorts views"/"qualified Shorts views"다. (viewed vs swiped away 지표가 이 페이지에 정의되어 있다는 내용은 검색 결과 요약으로 확인) | 형식별 구독 전환 리포트로 "Shorts → 구독 → 롱폼/블로그" 동선이 작동하는지 검증한다. |
| S16 | Understand three-minute YouTube Shorts (+ Create Shorts) | YouTube Help | https://support.google.com/youtube/answer/15424877?hl=en / https://support.google.com/youtube/answer/10059070?hl=en | 2024-10-15 시행 (공식 아티스트 채널은 2025-12-08) | 2026-11-03 | 본문 확인 | [공식] | 2024-10-15 이후 업로드한 정사각형·세로 영상 중 3분 이하는 Shorts로 분류된다. **1분을 넘는 Short에 저작권 클레임이 걸리면 전 세계에서 차단되고 추천·수익화도 되지 않는다.** Shorts 오디오 라이브러리의 대부분 곡은 3분 Short에서 최대 90초까지 쓸 수 있다. | 1분 초과 Shorts에는 상업 음원을 쓰지 않는다. YouTube 오디오 라이브러리(로열티 프리)나 자체 음원을 쓴다. |
| S17 | YouTube channel monetization policies (inauthentic content 포함) | YouTube Help | https://support.google.com/youtube/answer/1311392?hl=en | 2025-07-15 업데이트 | 2026-11-03 | 본문 확인 | [공식] | "repetitious content"를 "inauthentic content"로 이름을 바꿨다. 수익화 불가 예시: 템플릿으로 만든 듯한 콘텐츠, **"Videos where characters are put in the same situation over and over again with the same outcome"**, 해설이 거의 없는 슬라이드쇼·스크롤 텍스트, "AI-generated content made with generic or unoriginal templates ... without adding the creator's original, authentic insights". 자동화 도구나 템플릿을 써도 최종 결과물에 창작 비전과 교육·오락 가치가 있어야 한다. | **고정 마스코트 포맷의 최대 리스크다.** 매 편마다 질문, 실험, 결과, 전문가 해설이 실질적으로 달라야 한다. "맛조수가 묻고 → 같은 리액션 → 같은 결말" 템플릿을 반복하면 정책 위반 소지가 있다. |
| S18 | Disclosing use of GenAI content | YouTube Help | https://support.google.com/youtube/answer/14328491?hl=en | 2026-11-03 열람 시점 | 2026-11-03 | 본문 확인 | [공식] | 사실적으로 보이는 AI 생성·변형 콘텐츠는 공개해야 한다("AI use" 설정). 공개하지 않아도 되는 것: 비사실적 콘텐츠(완전 애니메이션 속 AI 애니메이션 등), 뷰티·색보정 필터, 배경 흐림, **대본·개요·썸네일·제목·인포그래픽 제작 보조**. | 비사실적 캐릭터인 맛조수는 공개 의무 대상이 아닐 가능성이 높다(정책 문구 기준 해석). 다만 **실제처럼 보이는 AI 음식·조리 장면을 만들면 공개 대상**이다. 조리 장면은 실제 촬영을 원칙으로 한다. |
| S19 | On YouTube's recommendation system | YouTube Official Blog (Cristos Goodrow) | https://blog.youtube/inside-youtube/on-youtubes-recommendation-system/ | 2021-09-15 | 2026-11-03 | 본문 확인 | [공식] | 신호는 클릭, 시청시간, 설문, 공유, 좋아요, 싫어요다. 1~5점 설문에서 4~5점을 받은 시청만 "valued watchtime"으로 센다. 응답하지 않은 사람의 설문 응답은 모델로 예측한다. 뉴스·정보성 주제에서는 정보 품질이 이 신호들보다 우선할 수 있다. | 길게 붙잡아 두는 것보다 "볼 가치가 있었다"는 만족이 목표다. 낚시성 오프닝은 단기 시청은 늘려도 만족 신호에는 불리할 수 있다(가설). |
| S20 | How YouTube Works — Recommendations | YouTube | https://www.youtube.com/howyoutubeworks/product-features/recommendations/ | 미표기 | 2026-11-03 | 본문 확인 | [공식] | 시청 행동, 좋아요·싫어요, 구독, 만족도 설문을 활용하고, 검색처럼 채널의 평판과 품질도 고려한다. 건강·과학 등은 고품질 출처를 우대한다. 사실적인 합성 미디어는 공개해야 하며 라벨이 붙는다. | 식품안전·영양 정보는 "고품질 출처" 판단을 받는 주제에 가깝다. 조리기능장 자격과 근거 인용을 영상 설명에 명시한다. |
| S21 | Rene's Top Five (March 4, 2024) — Shorts 조회 하락 Q&A | YouTube Official Blog (Creator Liaison Rene Ritchie) | https://blog.youtube/creator-and-artist-stories/renes-top-five-march-4-2024/ | 2024-03-04 | 2026-11-03 | 본문 확인 | [공식] | Shorts 책임자 Todd Sherman의 답변 요지: Shorts 피드에는 썸네일·노출·CTR이 없고, 초기 수백~수천 조회는 롱폼의 "노출"과 비슷한 탐색 단계다. 이 단계에서 "viewed vs swiped away"(실제 Analytics 지표)로 반응을 본다. 피드는 경쟁적이라서 다른 Shorts보다 성과가 낮으면 거기서 멈추고, 나중에 다시 터질 수도 있다. | 초기 조회가 수백에서 멈추는 것은 정상적인 탐색 단계다. 편별 "viewed %"를 오프닝 품질의 대리 지표로 쓴다. |
| S22 | YouTube Explains How Shorts Algorithm Works | Search Engine Journal | https://www.searchenginejournal.com/youtube-explains-how-shorts-algorithm-works/494953/ | 2023-08-28 | 2026-11-03 | 본문 확인 | [공식·2차] | Todd Sherman 인터뷰를 정리했다: "The audience is the algorithm." 이상적인 길이를 묻자 특정 길이보다 스토리텔링을 우선하라고 답했다. 해시태그는 필수가 아니다. 피드를 넘기기만 한 것은 조회로 세지 않았다(2023년 기준이며, 이후 S14에서 바뀜). | "Shorts는 N초가 최적" 같은 규칙은 공식 근거가 없다. 이야기 구조(질문→실험→답)가 길이를 결정하게 한다. |
| S23 | YouTube ABCDs: Video ad best practices | Think with Google (Google) | https://business.google.com/us/think/future-of-marketing/youtube-video-ad-creative/ | 미표기 | 2026-11-03 | 본문 확인 | [업계] | Ipsos와 협업하고 Nielsen·Kantar가 검토한 광고 원칙이다. A=Attention(처음부터 강하게, 액션 중간에서 시작, 클로즈업, 음악·보이스오버) / B=Branding("Brand early, often, and richly") / C=Connection(유머·놀람 등 감정, 메시지 집중) / D=Direction. "YouTube is almost entirely a sound-on experience." ABCD를 따르면 평균적으로 단기 판매 가능성이 30%, 장기 브랜드 기여가 17% 올라간다고 주장한다. | **광고**를 대상으로 한 연구이며 오가닉 Shorts에 그대로 적용할 수는 없다. 다만 "오프닝은 액션 중간에서", "음성 활용"은 시험해 볼 가치가 있다. 브랜드 노출 방식은 S43(펄싱)과 함께 검토한다. |
| S24 | Validating Google's ABCD framework with the power of AI | Kantar | https://www.kantar.com/industries/technology-and-telecoms/validating-googles-abcd-framework-with-the-power-of-artificial-intelligence | 미표기 | 2026-11-03 | 본문 확인 | [업계] | Link AI로 광고 1만 1천여 편, 크리에이티브 특징 180개를 분석했다. ABCD와 **예측된** 단기 판매 상승·장기 브랜드 자산 사이에 강한 상관이 있다고 밝힌다. | S23의 30%는 모델 예측치의 상관관계이며, 실측 판매 증가가 아니다. 인용할 때는 이 한계를 함께 적는다. |

## 3. 네이버 공식 자료

| 번호 | 자료명 | 발행처 | URL | 발행/갱신일 | 확인일 | 확인 방식 | 근거 수준 | 핵심 내용 | FoodStrategyLab 시사점 |
|---|---|---|---|---|---|---|---|---|---|
| S25 | 주제별 출처의 신뢰도와 인기도를 반영하는 C-Rank 알고리즘 | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=220774795442 | 2016-07-29 | 2026-11-03 | 본문 확인 | [공식] | C-Rank는 문서가 아니라 출처(블로그)의 신뢰도를 평가한다. 주제 집중도(Context), 정보 품질(Content), 소비·생산의 연쇄반응(Chain)을 바탕으로 Creator의 신뢰도와 인기도를 계산한다. 블로그 전체 글의 주제 분포로 집중도를 계산하므로, 일상 글보다 특정 주제의 전문 글이 많을수록 유리하다. 출처 품질이 문서 품질보다 과대 반영될 수 있다는 한계도 스스로 밝힌다. | 블로그는 "요리 과학·조리 원리·식품안전" 주제에 집중하고, 일상·잡담 글 비중을 낮게 유지한다. |
| S26 | 출처의 신뢰도에 기반한 UGC검색 알고리듬 'C-Rank', 검색 주제별로 더욱 고도화 | 네이버 (보도자료) | https://navercorp.com/media/pressReleasesDetail?seq=29672 | 2018-01-12 | 2026-11-03 | 본문 확인 | [공식] | C-Rank는 2015년부터 적용되었다. 주제별 UGC 소비 방식을 분석한 랭킹 요소를 추가해 **'맛집'과 '여행' 모바일 검색에 먼저 적용**했다. '맛집' 주제는 "이미지 중심의 문서를 빠르게 소비하는" 패턴을 보인다. | 음식 분야는 네이버가 일찍부터 주제별 랭킹을 세분화한 영역이다. 레시피·조리 원리 글에도 직접 촬영한 이미지를 충분히 넣는다(단, S31·S33의 "핵심은 텍스트로"와 병행). |
| S27 | 생성형 AI 활용 문서에 대한 검색 노출 정책 안내 | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=223367781299 | 2024-02-28 | 2026-11-03 | 본문 확인 | [공식] | "좋은 문서라면 문서 생성 방식과 관계없이 검색에 노출이 가능"하지만 "생성형 AI를 활용했다면 해당 사실을 문서에 명시할 것을 권고"한다. 좋은 문서의 특성: 신뢰성 있는 정보, 솔직한 경험, 독창적 정보, 심층적 구성, 좋은 가독성. 어뷰징 예시: 생성형 AI로 동일·유사 콘텐츠를 대량 생산하거나 남의 글을 짜깁기해 자동화하는 행위. 탐지된 문서는 C-Rank, D.I.A.+, 유사문서 판독 시스템 학습에 쓰인다. | 블로그 본문에 "이 글의 캐릭터 이미지는 AI로 생성했으며, 조리 내용은 이희재가 직접 검증·작성"처럼 AI 활용 범위를 밝힌다. 대량 자동 발행은 하지 않는다. |
| S28 | UGC 문서 노출 시스템이 더욱 정교하게 개선됩니다 | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=223777208497 | 2025-02-28 | 2026-11-03 | 본문 확인 | [공식] | UGC 검색에는 C-Rank, D.I.A.+, 유사문서 판독 시스템이 적용되어 있다. LLM으로 문서 평가 방식을 업데이트해 "자동 생성된 저품질 콘텐츠나 실제 경험에 기반하지 않은 광고성 도배글"을 더 정교하게 판별한다. 유사문서 판독 속도와 정확도도 개선했다. | 영상 대본을 그대로 블로그에 붙여 넣는 식의 자기 복제와 짧은 시차의 중복 발행은 유사문서로 판정될 위험이 있으므로 블로그는 별도로 구성한다(가설). |
| S29 | AI와 검색의 시너지 – 더 신뢰할 수 있는 검색을 향한 전진 | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=223996219153 | 2025-09-05 | 2026-11-03 | 본문 확인 | [공식] | LLM(HyperCLOVA X)과 VLM으로 출처의 성격·신뢰성·공식성·전문성을 판별한다. 개편 뒤 공공기관 등 신뢰도 높은 출처의 클릭이 77.2%, 학술·연구기관 등 전문성 높은 출처의 클릭이 30.7% 늘었다고 밝힌다. | 식품안전처럼 공식 출처가 강한 질의에서는 개인 블로그가 밀릴 수 있다. 식약처 등 공식 자료를 인용·링크하고, 조리기능장의 실험이라는 "경험"으로 차별화한다. |
| S30 | 신뢰도 중심 통합 랭킹 모델 A/B 테스트 진행 안내 | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=224083616020 | 2025-11-24 | 2026-11-03 | 본문 확인 | [공식] | 웹·블로그·카페·지식iN·동영상을 하나의 영역에 함께 노출하고, 공신력·공식성·전문성이 높은 출처를 위쪽 통합 영역에 올린다(A/B 테스트). | 블로그와 영상이 같은 영역에서 경쟁하게 된다. 전문성 신호(자격, 이력, 인용)를 일관되게 노출한다. |
| S31 | AI 시대에 사용자의 선택을 받는 콘텐츠 작성 가이드 | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=224296857688 | 2026-05-26 | 2026-11-03 | 본문 확인 | [공식] | AI 브리핑에 잘 인용되는 콘텐츠의 5원칙: ①직접 경험한 지식(구체 사례, 실패, 통계·공식자료 인용) ②일관된 주제 ③거짓 없는 진정성(협찬·내돈내산 표시, 원문 링크) ④읽기 쉬운 구조(**이미지·영상 핵심은 텍스트로도**) ⑤최신성. 지양할 것: "AI가 기계적으로 생성•요약한 글을 무분별하게 발행", 과도한 광고, 무관 키워드, 무관 이미지, 부정확한 정보. FAQ: 특정 주제에 꾸준히 양질의 글을 써 온 채널이 더 자주 인용될 수 있다. | 블로그 템플릿을 [질문 → 이희재 실험 과정(시간순) → 수치 결과 → 실패·주의점 → 근거 링크]로 고정한다. 영상을 삽입하면 핵심 내용을 텍스트로 다시 적는다. |
| S32 | AI 시대에 사용자의 선택을 받는 콘텐츠 작성 가이드_실전편 | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=224305800678 | 2026-06-04 | 2026-11-03 | 본문 확인 | [공식] | 셀프 체크 5가지: 독자·목적(TPO) / 절차와 구체적 해결 과정 / 대안 비교 분석 / 실제 적용 결과와 시행착오(통계·공식 문서 인용) / 맥락에 맞는 이미지·영상(텍스트 병기). Good/Bad 예시: 수치를 넣은 시간순 기록은 좋고, 제조사 스펙을 그대로 옮기거나 무관한 이미지를 넣는 것은 나쁘다. | 레시피 비교 실험(예: 방법 A·B·C 직접 비교 + 상황별 추천)은 네이버가 제시한 "좋은 콘텐츠" 예시 구조와 일치한다. |
| S33 | 알아두면 도움이 되는 '웹 콘텐츠 스팸 사례' 안내 | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=224335446939 | 2026-07-06 | 2026-11-03 | 본문 확인 | [공식] | 스팸 유형으로 키워드 반복·남용, 낚시성 제목, "저품질 콘텐츠 대량 생성"(동일·유사 템플릿, AI·자동화 활용 포함 가능), 스크래핑, "합성 또는 생성 이미지·동영상 등 명백히 허위이거나 사실로 오인"되는 사용자 혼동 콘텐츠를 든다. 스팸으로 판정되면 노출 제외나 순위 하락을 받을 수 있다. | AI로 만든 "가짜 완성 요리 사진"은 사용자 혼동 콘텐츠가 될 수 있으므로 쓰지 않는다. 결과 사진은 실제 조리 결과물로 한다. |
| S34 | 콘텐츠 작성시 권장 사항 | 네이버 서치어드바이저 | https://searchadvisor.naver.com/guide/content-basic | 미표기 (S33에서 링크) | 2026-11-03 | 본문 확인 | [공식] | 웹 콘텐츠 5원칙(전문성·경험, 일관 주제 — "전체 콘텐츠의 절반 이상이 핵심 주제", 진정성·투명성 — "AI 생성 콘텐츠를 그대로 게시하지 않고 운영자의 관점을 더했나요?", 읽기 쉬운 구조, 최신성). 검색로봇은 이미지 속 텍스트를 인식하기 어렵다. | 블로그 셀프 체크리스트로 그대로 쓴다. 인포그래픽만 올리지 말고 같은 내용을 텍스트로도 쓴다. |
| S35 | 최신 트렌드가 담긴 클립 콘텐츠를 이제 검색결과에서 만나보세요! | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=224230629036 | 2026-03-26 | 2026-11-03 | 본문 확인 | [공식] | 맛집·여행·쇼핑 등 질의에 맞는 클립(숏폼 영상·게시물)을 검색 결과에 노출한다. 모바일에서는 영상 5초 미리보기를 자동 제공한다. PC에도 클립 탭을 신설했다. 전문 크리에이터·브랜드에 인증 마크를 준다. | 네이버 클립도 배포 채널 후보다. 검색 결과에서 자동 재생되는 **처음 5초**에 질문과 요리가 보이게 한다(가설). |
| S36 | AI 브리핑이 클립 영상을 더해 더욱 풍부해집니다 | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=224312639595 | 2026-06-11 | 2026-11-03 | 본문 확인 | [공식] | '클립 AI 브리핑'은 조리법, 실험 원리, 운동법처럼 영상과 함께 볼 때 유용한 질의에 적용된다. 음성 인식(ASR), 문자 인식(OCR), VLM으로 영상을 요약하고 구간별 타임스탬프를 제공한다. 레시피가 예시 분야로 명시되어 있다. | 이희재의 말(음성)과 화면 자막에 핵심 수치·단계를 명확히 넣으면 AI 요약에 인용될 가능성이 올라갈 수 있다(가설). 웅얼거림이나 배경음 과다는 피한다. |
| S37 | 인플루언서 검색에서 문서 품질의 중요성이 더욱 확대됩니다 | 네이버 검색 공식 블로그 | https://m.blog.naver.com/PostView.naver?blogId=naver_search&logNo=223272955808 | 2023-11-23 | 2026-11-03 | 본문 확인 | [공식] | 인플루언서 검색 랭킹은 영향력·키워드 적합성·사용자 피드백을 반영하는데, 문서 품질 비중을 확대해 영향력(구독자·팬 수)이 낮아도 품질이 높으면 상위에 노출될 수 있게 했다. | 초기 소규모 채널도 글 품질로 상위 노출이 가능하다. 네이버 인플루언서 신청을 중기 과제로 검토한다. |
| S38 | 네이버, AI 생성물 표기 이중 기준...쇼핑은 의무·블로그는 자율 | MTN 머니투데이방송 | https://news.mtn.co.kr/news-detail/2026072417015682342 | 2026-07-25 | 2026-11-03 | 본문 확인 (네이버 원 공지는 미확인) | [공식·2차] | 네이버는 지난 5월 블로그·카페·네이버TV·클립에 'AI 활용' 표기 기능을 적용한다고 공지했다. 일반 콘텐츠는 권장 사항이라 표기하지 않아도 제재가 없다. 쇼핑 광고는 표기가 의무이고, 신선식품·건강기능식품 등 일부 품목은 AI 활용 자체가 제한된다. | 블로그와 클립에 맛조수가 등장하면 'AI 활용' 표기를 자율적으로 켜는 것을 기본값으로 한다. 향후 제품 협업(신선식품 등)을 할 때는 쇼핑 규정을 따로 확인한다. |
| S39 | 인공지능기본법 시행과 「인공지능 투명성 확보 가이드라인」 (뉴스레터) | 법무법인(유) 세종 | https://www.shinkim.com/kor/media/newsletter/3142 | 2026-02-26 | 2026-11-03 | 본문 확인 | [업계] (법률 해설) | 인공지능기본법과 시행령은 2026-01-22에 시행되었다. 의무를 지는 쪽은 "인공지능사업자"(개발·이용사업자)이며, 해설에 따르면 "단순히 인공지능 생성 결과물을 활용하여 자신의 콘텐츠를 제작·제공하는 경우"는 이용자에 해당해 법상 의무 대상이 아니다(예: Sora로 영상을 만드는 유튜버). 딥페이크 결과물은 사업자 측에 고지·표시 의무가 있다. | 법적 의무와 별개로 플랫폼 정책(S13, S18, S27, S38)은 공개를 권장하거나 요구한다. 수익 사업으로 확장할 때는 법률 자문을 받아 다시 확인한다(이 해설은 법무법인의 해석이다). |

## 4. 학술·업계 연구

| 번호 | 자료명 | 발행처 | URL | 발행/갱신일 | 확인일 | 확인 방식 | 근거 수준 | 핵심 내용 (표본·한계) | FoodStrategyLab 시사점 |
|---|---|---|---|---|---|---|---|---|---|
| S40 | How Video Production Affects Student Engagement: An Empirical Study of MOOC Videos (Guo, Kim, Rubin) | ACM Learning@Scale 2014 | https://up.csail.mit.edu/other-pubs/las2014-pguo-engagement.pdf | 2014 | 2026-11-03 | 본문 확인 (PDF) | [연구] | edX 4개 과정, 시청 세션 690만 건. 짧은 영상일수록 참여가 훨씬 높았고, 영상 길이와 상관없이 중앙 참여시간은 최대 6분이었다. 비격식 토킹헤드가 슬라이드만 있는 영상보다 참여가 높았다. **한계**: MOOC 학습 맥락이고 관찰 데이터이며, 숏폼 피드 환경과 다르다. | "전문가 얼굴이 나오는 비격식 설명"이 정보 영상의 참여를 높인다는 간접 근거다. 이희재의 직접 출연 비중을 정할 때 참고한다. 숏폼 최적 길이의 근거로는 쓰지 않는다. |
| S41 | Deconfounding Duration Bias in Watch-time Prediction for Video Recommendation (Zhan et al.) | arXiv 2206.06003 (Kuaishou) | https://arxiv.org/abs/2206.06003 | 2022-06 | 2026-11-03 | 본문 확인 (초록) | [연구] (프리프린트) | 시청시간을 최적화하는 추천은 긴 영상 쪽으로 편향되고, 영상 길이가 노출과 시청시간 예측을 동시에 교란한다. 길이별 분위수(D2Q)로 보정했으며 Kuaishou 앱에 전면 적용했다. **한계**: 플랫폼 내부 모델 연구라 크리에이터 전략과 직접 연결되지는 않는다. | 길이를 늘려 절대 시청시간을 키우는 전략과 짧게 만들어 완주율을 높이는 전략 중 무엇이 유리한지는 플랫폼 보정 방식에 달려 있다. 길이 규칙을 정하지 말고 A/B로 검증한다. |
| S42 | Swiping, fast and slow: assessing the QoE of short-form videos via crowdsourcing | IEEE (Augsburg Univ. 리포지토리, 2025 postprint) | https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/125900 | 2025 | 2026-11-03 | 본문 확인 (초록) | [연구] | 크라우드소싱 실험 2건. 초기 지연(initial delay)은 재생 중 멈춤(stalling)보다 처음 10초 안에 다음 영상으로 넘길 확률을 3배 높였다. **한계**: 네트워크 품질 실험이며 콘텐츠 내용 효과가 아니다. | 첫 프레임부터 바로 시작해야 한다(무음 인트로, 검은 화면, 로고 페이드인은 피한다). 업로드 화질과 용량 최적화도 함께 챙긴다. |
| S43 | Moment-to-Moment Optimal Branding in TV Commercials: Preventing Avoidance by Pulsing (Teixeira, Wedel, Pieters) | Marketing Science 29(5) | https://research.tilburguniversity.edu/en/publications/moment-to-moment-optimal-branding-in-tv-commercials-preventing-av/ | 2010 | 2026-11-03 | 본문 확인 (초록) | [연구] | TV 광고 31편, 약 2,000명의 재핑과 시선추적 데이터를 썼다. 주의가 분산되면 회피를 강하게 예측한다. **화면 중앙의 브랜드 위치는 회피를 늘렸고(크기는 무관)**, 총 노출량은 그대로 두고 브랜드를 짧게 반복 노출하는 '펄싱'이 회피를 유의하게 줄였다. **한계**: TV 광고이며 숏폼 오가닉 콘텐츠가 아니다. | 맛조수와 로고를 화면 중앙에 오래 고정하기보다 짧게 반복 등장시키는 편이 이탈을 줄일 수 있다(가설). S23의 "brand early, often"과 함께 실험한다. |
| S44 | Emotion-Induced Engagement in Internet Video Advertisements (Teixeira, Wedel, Pieters) | Journal of Marketing Research 49(2) | https://research.tilburguniversity.edu/en/publications/emotion-induced-engagement-in-internet-video-ads/ | 2012 | 2026-11-03 | 본문 확인 (초록) | [연구] | 얼굴 표정 자동 분석, 시선추적, 재핑을 기록한 통제 실험이다. 놀람과 기쁨은 주의를 집중시키고 시청을 유지시킨다. 주의 집중에는 놀람의 **수준**이, 시청 유지에는 기쁨의 **변화 속도**가 가장 크게 작용했다. 기쁨은 오를 때의 이득이 떨어질 때의 손실보다 컸다. **한계**: 인터넷 광고 대상이며 표본 규모는 검색 요약상 광고 28편·50명(원문 미확인). | 오프닝에 놀라운 사실을 두어 주의를 끌고, 중간에 웃음 포인트를 점점 고조시켜 유지하는 구성을 시험한다. "N초마다 컷" 같은 편집 규칙이 아니라 **감정 곡선**을 설계 단위로 삼는다. |
| S45 | Spokes-characters: Creating character trust and positive brand attitudes (Garretson & Niedrich) | Journal of Advertising 33(2) | https://repository.lsu.edu/marketing_pubs/39 | 2004 | 2026-11-03 | 본문 확인 (초록) | [연구] | 캐릭터 특성이 브랜드 태도에 미치는 효과를 **캐릭터 신뢰**가 매개했다. 이 효과는 브랜드 경험이 적은 소비자에게 컸고, 경험이 많은 소비자에게는 거의 없었다. **한계**: 2004년 전통 광고 캐릭터 연구다. | 맛조수는 채널을 처음 보는 신규 시청자에게 신뢰의 입구 역할을 할 수 있다는 가설의 근거가 된다. 기존 팬에게는 캐릭터보다 내용(이희재)이 중요할 수 있다. |
| S46 | Parasocial interactions with real and virtual influencers: The role of perceived similarity and human-likeness (Stein, Breves, Anders) | New Media & Society 26(6) | https://www.mcm.uni-wuerzburg.de/fileadmin/06110000/2026/stein-et-al-2022-parasocial-interactions-with-real-and-virtual-influencers-the-role-of-perceived-similarity-and-human.pdf | 2024 (온라인 2022) | 2026-11-03 | 본문 확인 (PDF 초록) | [연구] | 사전등록 실험(N=179). 가상 인플루언서와 인간 인플루언서 사이에 준사회적 상호작용(PSI)의 전체 차이는 유의하지 않았다. 가상 쪽은 직접효과는 더 강했지만, 정신적 인간다움과 유사성을 낮게 평가받아 그 이점이 상쇄되었다. **한계**: Twitch 스트리밍 맥락이고 표본이 작다. | 맛조수에게 "시청자와 비슷한 고민"(실수, 궁금증)을 부여하면 유사성이 높아져 PSI 손실을 줄일 수 있다(가설). |
| S47 | People are skeptical of headlines labeled as AI-generated, even if true or human-made, because they assume full AI automation (Altay & Gilardi) | PNAS Nexus 3(10) | https://pmc.ncbi.nlm.nih.gov/articles/PMC11443540 | 2024-10 | 2026-11-03 | 검색 결과 요약만 확인 (PMC 캡차로 열람 실패) | [연구] | 사전등록 실험 2건(미·영, 4,976명). "AI 생성" 라벨은 참·거짓이나 실제 작성 주체와 상관없이 정확성 인식과 공유 의향을 낮췄다. 효과 크기는 "거짓" 라벨의 약 1/3이었다. 사람들은 라벨이 붙으면 **AI가 전부 만들었다고 가정**하는 경향이 있었다. **한계**: 뉴스 헤드라인 대상이다. | 맛조수에 AI 라벨이 붙으면 내용 전체가 AI 생성이라고 오해받을 위험이 있다. "질문 캐릭터만 AI, 답변·조리·검증은 실제 전문가"라고 역할 범위를 명시하는 것이 대응책이 될 수 있다(가설). |
| S48 | Video Captions Benefit Everyone (Gernsbacher) | Policy Insights from the Behavioral and Brain Sciences 2(1) | https://successforkidswithhearingloss.com/wp-content/uploads/2020/04/Video-Captions-Benefit-Everyone_2015.pdf | 2015 | 2026-11-03 | 본문 확인 (PDF 초록, 제3자 호스팅) | [연구] (리뷰) | 100건이 넘는 실증 연구를 근거로 자막이 이해, 주의, 기억을 높인다고 정리했다. 비원어민, 읽기 학습자, 청각장애인에게 특히 효과가 크다. **한계**: 리뷰 논문이며, "모두에게" 이롭다는 일반화는 과하다는 비판이 있다(Learning and the Brain 블로그, 검색 결과로 확인). | 정보 전달형 숏폼은 자막을 기본으로 둔다. 다만 S01의 "텍스트 위주 화면" 감점과 균형을 맞춰 하단 2줄 이내 등으로 규칙을 정한다. |
| S49 | Captions increase view time 12% (Facebook 내부 테스트 인용) | 3Play Media 등 2차 보도 | https://3playmedia.com/blog/captions-increase-viewership-for-facebook-video-ads | 약 2016 (추정, 미확인) | 2026-11-03 | 검색 결과 요약만 확인 | [업계] (2차) | Facebook 임원(Matt Idema)이 자막이 평균 시청시간을 12% 늘렸다고 말했다는 보도다. 널리 퍼진 "85%가 무음 시청" 수치는 Facebook이 아니라 Digiday가 출처다. **한계**: 오래된 데이터이고 원자료가 공개되지 않았다. | 근거 수준이 낮으므로 내부 보고서에 수치를 인용하지 않는다. 자막의 근거는 S02·S03(공식)과 S48(연구)로 댄다. |
| S50 | Eating with our eyes: From visual hunger to digital satiation (Spence et al.) | Brain and Cognition 110 | https://pubmed.ncbi.nlm.nih.gov/26432045/ | 2016 | 2026-11-03 | 본문 확인 (PubMed 초록) | [연구] (리뷰) | 디지털로 맛있는 음식 이미지('food porn')에 노출되면 음식 욕구('visual hunger')가 높아지는지 문제를 제기했다. 음식 이미지가 신경 활동, 생리·심리 반응, 시각 주의에 큰 영향을 주며 특히 배고픈 뇌에서 그렇다는 인지신경과학 연구를 검토했다. **한계**: 리뷰이며 행동(섭취·구매) 인과는 확정하지 않았다. | 완성 요리 클로즈업과 시즐(김, 소리, 단면) 컷은 주의를 끄는 소재가 될 수 있다(가설). 게시 시간대(식사 전)도 실험 변수로 둔다. |
| S51 | ASMR 광고·먹방 관련 연구들 (Douce et al. 학회 발표, 먹방 ASMR 상관연구 등) | Hasselt Univ. 문서서버 등 | https://documentserver.uhasselt.be/bitstream/1942/42051/1/ASMR_Lieve%20Douce_Euregio2023.pdf | 2023 | 2026-11-03 | 검색 결과 요약만 확인 | [연구] (학회 발표·소규모) | (검색 요약) 240명 실험에서 ASMR 광고의 구매의도 효과는 핸드백 브랜드에서만 나타났고 음식 브랜드(McDonald's)에서는 나타나지 않았다. 먹방 ASMR과 식욕의 관련성은 학생 대상 상관연구다. **한계**: 증거가 빈약하고 결과가 엇갈린다. | "음식은 ASMR이 무조건 통한다"는 말은 검증되지 않은 속설이다. 조리 소리는 보조 요소로만 실험한다. |
| S52 | The Differential Effects of Humor on Three Scientific Issues (Yeo, Su, Cacciatore, Zhang, McKasy) | NSF PAR 원고 (Int. J. Science Education Part B 투고 수정본) | https://par.nsf.gov/servlets/purl/10414831 | 원고 (출판 연도는 원문에서 미확인) | 2026-11-03 | 본문 확인 (원고 초록) | [연구] | 세 과학 주제(지구온난화·AI·마이크로바이옴)에 유머 이미지와 언어 유머를 결합한 실험이다. AI·마이크로바이옴에서는 유머 유형에 따라 즐거움(mirth)이 달랐고, 참여 의향에 대한 효과는 응답자의 '유머 욕구'에 따라 조절되었다. 지구온난화에서는 같은 효과가 나타나지 않았다. **한계**: 이미지 기반이고 소셜 참여 '의향'을 측정했다. | 유머 효과는 주제와 시청자에 따라 달라진다. 식품안전·건강 위험 주제에서는 유머 강도를 낮추고, 조리 팁·상식 주제에서 높이는 차등 실험을 한다. |
| S53 | A meta-analysis of humor in advertising (Eisend) | Journal of the Academy of Marketing Science 37 | (원문 미열람 — DOI 10.1007/s11747-008-0096-y, 검색 결과 기준) | 2009 (온라인 2008) | 2026-11-03 | 검색 결과 요약만 확인 | [연구] (메타분석) | (검색 요약) 광고 유머는 주의와 광고 태도를 개선하는 효과가 가장 강했다. 브랜드 태도와 구매의도에 대한 효과는 상대적으로 불명확하다는 해석이 있다. **한계**: 원문의 효과 크기는 미확인이다. | 유머는 "보게 만드는" 장치이지 "믿게 만드는" 장치가 아니다. 신뢰는 전문가 실연과 근거가 담당하도록 역할을 나눈다. |
| S54 | Cooking using social media (Camargo et al.) / 요리 인플루언서 대리경험 연구 (Sokolova, Perez & Vessal) | British Food Journal (2024) / Technological Forecasting and Social Change (2024) | https://emerald.com/insight/content/doi/10.1108/BFJ-07-2023-0607/full/html | 2024 | 2026-11-03 | 검색 결과 요약만 확인 (Emerald 403) | [연구] | (검색 요약) 브라질 청년 대상 질적 연구: 경험이 적은 요리자는 영상 기능에 의존해 기술과 자기효능감을 키운다. 프랑스 여성 213명 대상 연구: 대리경험은 인플루언서와의 준사회적 관계, 소속감, 오락성이 이끌고, 레시피 매력과 새로움 추구가 따라 하기 의도를 높인다. **한계**: 표본과 지역이 한정적이다. | "보고 따라 할 수 있다"는 자기효능감을 주는 설계(재료 수, 실패 포인트 제시)와 오락성을 결합하는 근거가 된다. |
| S55 | 2025 아이엠 리포트 (인크로스) — 숏폼 시청률 기사 | i-boss (인크로스 조사 인용) | https://www.i-boss.co.kr/ab-2877-16780 | 2025 | 2026-11-03 | 검색 결과 요약만 확인 (사이트 403) | [업계] | (검색 요약) 만 15~69세 2,000명을 조사한 결과 숏폼 시청률은 94.9%였고, 주 이용 플랫폼은 YouTube Shorts 83.4%, Instagram Reels 49.3%, TikTok 24.6%였다. **한계**: 민간 조사이며 원문은 미확인이다. | 국내에서는 Shorts를 1순위, Reels를 2순위로 두는 배포 우선순위의 참고 자료다(원문 확인 후 사용). |

> 총 55건: 본문 확인 48건, 검색 결과 요약만 확인 7건(S07, S47, S49, S51, S53, S54, S55). S07은 페이지를 열었지만 본문을 추출하지 못해 요약으로 분류했다. S14·S15 안의 일부 부가 내용(2025-03 Shorts 집계 변경, viewed vs swiped away 정의)은 해당 칸에 "검색 결과 요약"이라고 따로 표시했다.

---

## 핵심 발견 (근거 기반)

각 항목은 **확인된 사실**(공식·연구 출처가 직접 말한 것), **제작자 경험**(업계 통념, 근거 미확인), **실험할 가설**(우리가 검증할 것)로 나눴다.

### F1. 추천 노출의 1차 관문은 "원본성"이고, 고정 캐릭터 포맷은 반복 템플릿 위험이 있다
- **확인된 사실**: Instagram은 워터마크, 재업로드, 비원본 콘텐츠를 추천에서 제외하거나 덜 노출하고, 계정 단위로도 제재한다(S01, S04, S05, S07, S08). YouTube YPP는 2025-07-15부터 "inauthentic content"라는 이름으로 템플릿형 반복 콘텐츠, **같은 상황·같은 결말이 반복되는 캐릭터 영상**, 창작자의 통찰 없이 범용 템플릿으로 만든 AI 콘텐츠를 수익화 불가로 명시했다(S17). 네이버는 생성형 AI 대량 생산과 동일 템플릿 대량 발행을 어뷰징·스팸으로 규정한다(S27, S28, S33).
- **제작자 경험**: "캐릭터 IP는 반복할수록 기억된다"는 통념이 있다. 반복은 브랜드 자산이 될 수 있지만, 위 정책과 충돌할 수 있다는 점은 업계에서 잘 다루지 않는다.
- **실험할 가설**: 형식(맛조수가 질문, 이희재가 답변)은 고정하되 내용 변화량(새 질문, 실제 실험, 수치 결과, 매번 다른 결말)을 매 편 확보하면 정책 위험 없이 캐릭터 인지도를 쌓을 수 있다. 제작 체크리스트에 "이번 편의 새로운 정보 1개 이상 + 실제 촬영 장면 비중"을 넣는다.

### F2. Reels 랭킹의 공식 핵심 신호: 공유(보내기), 완주·시청시간, 좋아요
- **확인된 사실**: Instagram이 밝힌 Reels 예측 항목은 리셰어, 끝까지 시청, 좋아요, 오디오 페이지 이동이다(S01). 추천 신호는 시청시간, 리텐션, 공유, 좋아요, 댓글이고, 소규모 노출 뒤 점진적으로 확산한다(S02, S05). Mosseri는 2025-01에 상위 3개 신호로 시청시간, 좋아요, 보내기를 꼽았고, 비팔로워 대상 콘텐츠에서는 보내기가 "slightly more important"라고 말했다(S09, 2차 보도).
- **제작자 경험**: "보내기가 좋아요의 3~5배 가치" 같은 배수는 출처가 확인되지 않는다. Mosseri는 "slightly"라고만 말했다.
- **실험할 가설**: "친구에게 보내고 싶은 이유"(가족에게 알려 줄 식품안전 팁, 같이 해 볼 레시피)를 엔딩 직전에 두면 보내기/도달이 오른다.

### F3. "첫 3초"는 Instagram 공식 권고이자 측정 기준이다. 다만 "3초 안에 반드시 X를 해야 한다"는 세부 규칙은 검증되지 않았다
- **확인된 사실**: Instagram은 "첫 3초 안에 훅"을 여러 공식 페이지에서 권한다(S02, S03, S06). skip rate는 "처음 3초 안에 넘긴 조회 비율"로 정의된다(S10, S11). YouTube는 Shorts에 "viewed vs swiped away" 지표를 두지만 초 단위 기준은 공식 자료에서 찾지 못했다(S21). 네이버 클립은 검색 결과에서 5초 미리보기를 보여준다(S35). 연구로는, 초기 지연이 있으면 처음 10초 안에 넘길 확률이 3배였고(S42, 기술 품질 요인), 광고에서 놀람이 주의를 집중시켰다(S44).
- **제작자 경험(미검증)**: "3초 안에 얼굴을 보여라", "첫 프레임에 텍스트 훅 필수", "질문으로 시작해야 한다"는 플랫폼이나 연구가 직접 뒷받침하는 규칙이 아니다.
- **실험할 가설**: (a) 맛조수의 질문으로 시작하는 오프닝 vs (b) 완성 요리나 실험 결과 장면으로 시작하는 오프닝을 트라이얼 릴스(S03)로 A/B 테스트하고, skip rate와 viewed %로 판정한다.

### F4. "N초마다 컷을 바꿔라"는 공식·학술 근거를 찾지 못했다
- **확인된 사실**: 조사한 공식 자료(Instagram, YouTube, 네이버) 어디에도 컷 간격 권고는 없다. 가장 가까운 연구는 시청 유지에 **기쁨 감정의 변화 속도**가 영향을 준다는 결과다(S44). 이는 컷 빈도가 아니라 감정 곡선에 관한 것이다. 주의가 분산되면 회피가 늘어난다는 결과(S43)는 과도한 화면 전환이 오히려 해로울 수 있음도 시사한다.
- **제작자 경험(미검증)**: "1.5~3초마다 컷" 같은 편집 규칙이 크리에이터 사이에 퍼져 있다.
- **실험할 가설**: 컷 수를 고정 규칙으로 두지 않는다. 리텐션 그래프(S10)가 꺾이는 지점에 놀람이나 웃음 포인트를 넣는 방식이 컷 빈도를 늘리는 방식보다 효과적이다.

### F5. 길이: 두 플랫폼 모두 "3분 이하"가 공식 상한이고, 최적 길이는 공식적으로 제시되지 않았다
- **확인된 사실**: Reels는 3분을 넘으면 비팔로워에게 추천되지 않는다(S02, S03, S06). YouTube Shorts는 3분 이하만 Shorts로 분류되고, 1분을 넘는 Short에 저작권 클레임이 있으면 전 세계에서 차단된다(S16). YouTube Shorts 책임자는 특정 길이보다 스토리텔링을 우선하라고 했다(S22). 추천 시스템은 긴 영상 쪽으로 편향되는 '길이 편향'이 있어 플랫폼이 이를 보정한다는 연구가 있다(S41). MOOC 연구에서는 짧을수록 참여가 높았지만 맥락이 다르다(S40).
- **제작자 경험(미검증)**: "Shorts는 15~30초가 최적", "Reels는 7초 루프" 같은 수치 규칙. (Mosseri가 상대·절대 시청시간을 모두 본다고 말했다는 2차 블로그 서술이 검색에 나왔지만 원문을 확인하지 못해 근거로 쓰지 않는다.)
- **실험할 가설**: 같은 주제로 30~45초판과 60~90초판을 만들어 완주율, 평균 시청시간, 보내기/도달을 비교한다. 1분 초과판에는 상업 음원을 쓰지 않는다.

### F6. 자막과 무음 대응은 공식 권고다. 단, 화면을 텍스트로 덮으면 감점 요인이다
- **확인된 사실**: Instagram은 "Optimize for sound off (use text/closed captions)"를 권하고 무음 재생 시 자막을 자동 표시한다(S02, S03). Edits는 자동 자막을 제공한다(S11). 반면 "reels that are majority text"와 "text가 화면 대부분을 덮는 영상"은 덜 노출하거나 비권장한다(S01, S06). Google은 YouTube를 "almost entirely a sound-on experience"라고 표현한다(S23, 광고 맥락). 리뷰 연구에서 자막은 이해, 주의, 기억을 높였다(S48).
- **제작자 경험**: "85% 무음 시청"은 Digiday가 출처인 오래된 Facebook 수치이고 "자막으로 시청시간 12% 증가"도 2차 보도라서(S49) 근거로 쓰지 않는다.
- **실험할 가설**: 보이스(이희재와 맛조수의 대화) + 하단 자막(2줄 이내) + 핵심 수치 강조 자막 조합이, 자막 없는 버전이나 텍스트가 큰 버전보다 완주율과 저장이 높다.

### F7. 유머와 놀람은 주의를 끌고 시청을 유지시키는 근거가 있다. 신뢰나 설득 효과는 별개다
- **확인된 사실**: 광고 연구에서 놀람은 주의를 집중시키고 기쁨의 상승은 시청을 유지시켰다(S44). Instagram 공식 Reels 팁(https://creators.instagram.com/reels, 본문 확인)은 "Surprise people"이라는 항목에서 big reveal, punchline, plot twist를 권한다(S03과 같은 Instagram for Creators 사이트). 과학 유머의 참여 효과는 주제와 개인의 '유머 욕구'에 따라 달랐고 지구온난화에서는 나타나지 않았다(S52). 광고 유머 메타분석은 주의와 광고 태도 효과가 가장 강하다고 요약된다(S53, 검색 요약).
- **제작자 경험**: "에듀테인먼트는 무조건 정보형보다 잘 된다."(미검증)
- **실험할 가설**: 맛조수의 엉뚱한 질문이나 오해(유머)로 주의를 끌고, 이희재의 실험 결과(놀람: "실제로는 반대")로 정보를 확정하는 구조가 효과적이다. 식품안전·건강 주제에서는 유머 강도를 낮춘 버전과 비교한다.

### F8. 마스코트는 "신뢰의 입구"가 될 수 있고, 노출 방식은 고정 노출보다 반복 등장이 유리할 수 있다
- **확인된 사실**: 광고 캐릭터의 특성은 캐릭터 신뢰를 거쳐 브랜드 태도에 영향을 주었고, 브랜드 경험이 적은 소비자에게서 효과가 컸다(S45). TV 광고에서는 화면 중앙의 브랜드 위치가 회피를 늘렸고, 총량은 같게 두고 짧게 반복하는 펄싱이 회피를 줄였다(S43). Google ABCD는 "Brand early, often"을 권한다(S23, 광고).
- **제작자 경험**: "마스코트는 영상 내내 화면에 있어야 기억된다."(미검증)
- **실험할 가설**: 맛조수가 계속 화면에 있는 버전과 질문, 리액션, 엔딩 3회만 짧게 등장하는 버전을 비교해 skip rate, 리텐션, 프로필 방문·팔로우를 본다. 신규 시청자 비중이 높은 비팔로워 도달에서 캐릭터 효과가 더 클 것이다(S45 기반).

### F9. AI 캐릭터의 신뢰 리스크는 "전부 AI가 만들었다"는 오해에서 생긴다
- **확인된 사실**: 가상 인플루언서와 인간 인플루언서의 준사회적 상호작용은 전체적으로 차이가 유의하지 않았지만, 가상 쪽은 인간다움과 유사성이 낮게 평가되었다(S46). "AI 생성" 라벨은 참인 정보도 덜 믿게 만들었고, 사람들은 라벨이 붙으면 전부 AI가 만들었다고 가정했다(S47, 검색 요약).
- **제작자 경험**: "AI 캐릭터는 신뢰를 떨어뜨린다" vs "AI 캐릭터는 친근하다"는 상반된 주장이 공존한다.
- **실험할 가설**: 영상 첫 등장과 프로필에 "질문은 AI 조수, 답과 조리는 조리기능장 이희재"라는 역할 분리를 명시하면 AI 라벨의 신뢰 하락을 상쇄할 수 있다. 댓글 정성 분석(신뢰나 의심 표현)과 저장률로 측정한다.

### F10. AI 사용 공개는 플랫폼마다 기준이 다르다. 핵심은 "사실처럼 보이는 AI 장면"을 만들지 않는 것이다
- **확인된 사실**: YouTube는 사실적인 AI 콘텐츠만 공개를 의무화하고, 비사실적 애니메이션과 대본·썸네일 보조는 면제한다(S18). Meta는 감지하거나 자진 공개하면 "AI info" 라벨을 붙인다(S13). 네이버는 검색에서 AI 활용 명시를 권고하고(S27), 블로그·클립의 'AI 활용' 표기는 자율이라고 보도되었다(S38). 네이버 스팸 정책은 사실로 오인될 수 있는 합성·생성 이미지와 영상을 노출 제한 대상으로 든다(S33). 한국 인공지능기본법은 콘텐츠를 만드는 이용자가 아니라 AI 사업자에게 표시 의무를 지운다는 법무법인 해석이 있다(S39).
- **실험할 가설 및 운영 원칙**: 조리 장면과 완성 사진은 100% 실제 촬영한다. 맛조수는 명확히 비사실적인 캐릭터 디자인으로 만든다. 플랫폼 라벨은 자진 공개를 기본값으로 한다. (법적 판단은 자문으로 다시 확인)

### F11. 네이버 블로그: "주제 집중 + 직접 경험 + 텍스트화"가 2016년부터 2026년까지 일관된 공식 메시지다
- **확인된 사실**: C-Rank는 블로그 단위의 주제 집중도와 품질을 평가한다(S25). 맛집 주제에는 2018년부터 주제별 랭킹 요소가 적용되었다(S26). UGC 검색에는 C-Rank, D.I.A.+, 유사문서 판독이 적용되며 LLM 평가가 도입되었다(S27, S28). 2026년 가이드 5원칙은 직접 경험, 일관 주제, 진정성(협찬 표시·원문 링크), 읽기 쉬운 구조(이미지·영상 핵심의 텍스트 병기), 최신성이다(S31, S32, S34). 출처의 공식성·전문성을 판별하는 신뢰도 중심 랭킹을 테스트 중이다(S29, S30). 인플루언서 검색에서도 문서 품질 비중이 커졌다(S37).
- **제작자 경험(미검증)**: "1일 1포스팅해야 지수가 오른다", "특정 금지 키워드가 있다", "저품질 블로그 낙인" 등. 네이버는 2016년 글(S25)에서 이런 개념에 매몰되지 말라고 직접 언급했다.
- **실험할 가설**: 영상 1편당 블로그 1편을 [독자 상황 → 실험 절차(시간순, 수치) → A·B·C 비교 → 실패와 주의점 → 공식 근거 링크]로 쓰면 AI 브리핑 인용과 검색 유입이 늘어난다. 이 구조는 S32의 Good Case와 같다.

### F12. 네이버 클립과 AI 브리핑은 영상의 음성과 자막을 읽는다
- **확인된 사실**: 클립 AI 브리핑은 조리법 같은 질의에 ASR, OCR, VLM으로 영상을 요약하고 타임스탬프를 제공한다(S36). 맛집 등 질의에 클립을 검색 결과로 노출하고 5초 미리보기를 보여준다(S35).
- **실험할 가설**: 이희재가 핵심 수치와 단계를 또렷하게 말하고 같은 내용을 자막으로 넣은 영상이 클립 AI 브리핑에 더 자주 인용된다. 네이버 클립에 같은 영상을 올리고 인용 여부를 추적한다.

### F13. 조회수는 더 이상 성과 지표가 아니다. 판정 지표를 미리 정해 둔다
- **확인된 사실**: YouTube는 2026-08-24부터 모든 형식에서 재생이 시작되는 순간 조회를 집계한다. 수익화 기준은 engaged views다(S14, S15). Instagram은 skip rate, Retention 차트, 팔로워·비팔로워 도달, 공유를 제공한다(S10, S11, S12). YouTube 추천은 "valued watchtime"(설문 4~5점)을 학습한다(S19).
- **운영 원칙**: 주간 대시보드는 YouTube에서 viewed vs swiped away, 평균 시청 비율, engaged views, Shorts발 구독을, Instagram에서 skip rate, 평균 시청시간, 보내기/도달, 비팔로워 도달 비율, 게시물발 팔로우를 본다.

### F14. 음식의 감각 소구는 주의를 끄는 근거가 있다. ASMR이나 먹방의 효과는 증거가 엇갈린다
- **확인된 사실**: 음식 이미지가 신경·생리 반응과 시각 주의에 강한 영향을 준다는 연구들이 리뷰되었다(S50, 행동 인과는 미확정). 음식 ASMR 광고의 구매의도 효과는 음식 브랜드에서 나타나지 않았다는 학회 발표가 있다(S51, 검색 요약). 요리 영상은 자기효능감과 따라 하기 의도에 관련된다는 연구가 있다(S54, 검색 요약).
- **실험할 가설**: 오프닝에 완성 요리의 시즐 컷(단면, 김, 윤기)을 넣으면 질문형 오프닝보다 skip rate가 낮다. 조리 소리 ASMR 구간을 늘리는 것은 효과가 불확실하므로 별도 실험으로만 다룬다.

### F15. 공식 "실험 도구"를 쓰면 가설 검증 비용이 낮다
- **확인된 사실**: Instagram 트라이얼 릴스는 비팔로워에게만 먼저 노출하고 24시간 뒤 지표를 보여주며, 캐릭터와 스타일 실험 용도로 공식 소개된다(S03). Edits 인사이트는 skip rate를 제공한다(S11). 네이버도 검색 기능을 A/B 테스트로 운영한다고 공지한다(S30).
- **운영 원칙**: F3, F5, F7, F8, F14의 A/B 테스트는 트라이얼 릴스로 먼저 돌리고, 이긴 버전만 본 계정과 Shorts에 배포한다.

---

## 확인하지 못한 것 (공백·후속 과제)

1. **네이버 D.I.A./D.I.A.+ 공식 원문**: D.I.A.+가 공식 알고리즘으로 언급된 것(S27, S28)은 확인했다. 그러나 평가 요소(경험 정보, 독창성 등)를 설명한 네이버 원 게시글은 찾아 열지 못했다. 업계 블로그의 "D.I.A. 평가 요소 목록"은 미검증이다.
2. **네이버 'AI 활용' 표기 기능 원 공지(2026년 5월)**: 언론 보도(S38)로만 확인했다. 블로그·클립 고객센터 공지 원문은 미확인이다.
3. **Instagram 2026-04-30 원본성 확대 공지 본문(S07)**: 클라이언트 렌더링 때문에 텍스트 추출에 실패했다. 브라우저로 원문을 확인해야 한다.
4. **Mosseri 원본 영상과 2025~2026 후속 발언**: 2차 보도(S09)로만 확인했다. "상대·절대 시청시간을 모두 본다"는 발언도 원문을 확인하지 못했다.
5. **YouTube Shorts 랭킹 신호의 공식 목록**: Shorts 전용 신호를 체계적으로 공개한 공식 문서는 찾지 못했다. "viewed vs swiped away"의 공식 정의 문구(S15)도 검색 요약으로만 확인했다.
6. **"N초마다 컷", "3초 안에 얼굴", 최적 길이(초), 최적 게시 시간·빈도, 해시태그 개수**: 공식·학술 근거를 찾지 못했다. 모두 [경험] 또는 [가설]로 취급한다.
7. **숏폼 오가닉 콘텐츠 자체를 대상으로 한 동료심사 연구**: 오프닝과 리텐션 연구 대부분이 TV·인터넷 광고(S43, S44), MOOC(S40), 네트워크 품질(S42) 맥락이다. 오가닉 숏폼의 첫 몇 초 내용 효과를 직접 검증한 동료심사 연구는 확인하지 못했다. 숏폼 학습 효과 연구도 검색상 결과가 엇갈리고 소규모였다.
8. **Meta for Business Reels 광고 크리에이티브 가이드(세이프존, 사운드온 통계)**: 공식 페이지를 열지 못했고 제3자 정리만 봤기 때문에 목록에서 제외했다.
9. **한국 숏폼 이용 공공 통계(KISDI, 방송통신위원회)**: 2025~2026 공식 수치를 찾지 못했다. 민간 조사(S55)도 원문은 미확인이다.
10. **유료 학술 DB 접근**: SAGE, ScienceDirect, MDPI, Emerald, PMC가 막혀 Altay & Gilardi(S47), Eisend(S53), Camargo(S54) 등은 초록이나 원문을 직접 읽지 못했다. 표본 수와 효과 크기는 원문으로 다시 확인해야 한다.
11. **인공지능기본법 「투명성 확보 가이드라인」 원문**: 법무법인 해설(S39)만 봤다. 과기정통부 원문과 이후 시행령 개정 여부는 미확인이다.
12. **TikTok**: 이번 범위(Reels, Shorts, 네이버)에서 제외했다.
