# 인스타그램 릴스 공식 가이드 조사 (기준일 2026-11-07)

대상: 3D AI 캐릭터 '맛조수'가 진행하는 30초 요리 릴스를 자동 제작하고, Instagram API(Instagram 로그인, 콘텐츠 게시)로 올리는 팀.

## 조사 방법과 한계 (먼저 읽기)

- 이 세션에서는 `developers.facebook.com`, `transparency.meta.com` 페이지를 **직접 열 수 없었다**(네트워크 허용 목록 밖). 그래서 공식 페이지 내용은 **웹 검색 결과에 나온 공식 페이지 발췌**로 확인했다. 숫자를 코드에 박기 전에 실제 페이지를 한 번 더 열어 볼 것.
- 표시: **[공식]** = Meta/Instagram 자체 페이지 발췌, **[보도]** = 신뢰할 만한 매체 보도(Mosseri·@creators 발언 전달), **[2차]** = 마케팅 블로그 등, **확인 못 함** = 근거를 못 찾았거나 출처끼리 충돌.

---

## 1. 릴스 추천은 지금 어떻게 돌아가나

### 1-1. 핵심 신호

- **[보도] Mosseri, 2025년 1월경**: "랭킹에 가장 중요한 세 가지는 시청 시간, 좋아요, 보내기(공유)". 인사이트에서 **평균 시청 시간, 도달 대비 좋아요(likes per reach), 도달 대비 보내기(sends per reach)**를 보라고 함. 팔로워에게는 좋아요 비율, **비팔로워에게는 보내기 비율이 조금 더 중요**.
  - Instagram Shares Algorithm Insights To Inform Strategy — https://www.socialmediatoday.com/news/instagram-shares-algorithm-insights-2025/738034/
- **[보도] 2024년**: 보내기 비율이 전체 도달과 가장 상관이 높다고 함.
  - Instagram Chief Says Post Share Rates Are Now a Key Driver of Reach — https://www.socialmediatoday.com/news/instagram-chief-post-share-rates-key-driver-reach/716540/
  - Instagram Chief Reiterates That Sends Are Now a Key Focus — https://www.socialmediatoday.com/news/instagram-chief-reiterates-sends-now-key-focus/720531/
- **[보도] 2026년 중반(검색 결과상 약 160일 전, 정확한 날짜 확인 못 함)**: "도달에는 참여율이 가장 중요. 팔로워에겐 좋아요 비율, 비팔로워에겐 보내기 비율이 더 중요. 시청 시간·조회수·참여 시간도 반영".
  - Instagram engagement rates provide insight into reach — https://www.socialmediatoday.com/news/instagram-engagement-rates-provide-insight-into-reach/821170/
- **[보도]** 시청 시간은 "완주 비율(상대)"과 "절대 시청 시간"을 둘 다 본다(가중치 비공개).
  - Instagram Explains How Its Algorithm Weighs Time Spent Watching Longer Clips — https://www.socialmediatoday.com/news/instagram-longer-video-watch-time-versus-completion-rate/740916/
- **[공식] Meta 투명성 센터 – Instagram Reels Chaining AI 시스템**: 후보를 모은 뒤 가벼운 모델로 약 100개로 줄이고 최종 점수로 정렬. 예측 항목: 끝까지 볼 확률, 댓글, **재공유**, 작성자 팔로우, **오디오 사용**. 입력 신호 예: 비슷한 릴스를 얼마나 오래 봤는지, 오디오 링크 클릭. 모델·신호는 자주 바뀐다고 명시.
  - https://transparency.meta.com/features/explaining-ranking/ig-reels-chaining/
  - Our approach to explaining ranking — https://transparency.meta.com/features/explaining-ranking/
- **[공식] Instagram Ranking Explained (2023)**: 릴스 예측 = 재공유할지, 끝까지 볼지, 좋아요할지, 오디오 페이지로 갈지.
  - https://about.instagram.com/blog/announcements/instagram-ranking-explained
- **[공식] 배포 방식**: 처음엔 비팔로워 소수에게 시험 노출 → 반응 좋으면 점점 넓게.
  - Finding success on reels in 2025 — https://creators.instagram.com/blog/the-latest-with-instagram
- **[2차]** "2026년 5대 신호" 같은 글은 공식 근거 확인 못 함.

### 1-2. 독창성(오리지널) 규칙

- **[공식] 2024년 4월**: 같은 콘텐츠가 여러 계정에 있으면 **원본만 추천**, 재게시물엔 원작자 링크 라벨, **애그리게이터(모아 올리는 계정)는 추천 제외**. 밈·패러디처럼 변형한 것은 예외.
  - Helping Creators Find New Audiences — https://creators.instagram.com/recommendations-and-originality
  - Helping creators of all sizes break through — https://creators.instagram.com/blog/helping-creators-of-all-sizes-break-through
  - Engadget 보도 — https://www.engadget.com/instagrams-algorithm-overhaul-will-reward-original-content-and-penalize-aggregators-130018977.html
- **[공식] 덜 보여주는 릴스**: **저해상도, 워터마크, 무음(muted), 테두리(border), 대부분이 글자(majority text)**, 이미 인스타에 올라온 릴스.
  - Instagram Ranking Explained — https://about.instagram.com/blog/announcements/instagram-ranking-explained
  - About original content on Instagram (워터마크 추가·클립 이어붙이기는 "실질적 편집"이 아님) — https://help.instagram.com/1800814370401535/
  - Tips for Improving Your Reach — https://creators.instagram.com/blog/tips-for-improving-your-reach
- **[보도] 2026년 4월 30일**: Mosseri가 비독창 콘텐츠 제재를 릴스에서 사진·캐러셀로 확대. 남의 것 위주로 올리는 계정은 **비팔로워 추천에서 빠지고 팔로워에게만** 노출. **최근 30일 단위**로 판단. 캡션·테두리·워터마크·자막만 바꾼 재게시는 걸림. 해결책: 직접 보이스오버·해설·원작자와 콜라보. Account Status에서 확인·이의제기 가능.
  - New Instagram Policies Target Reposted Content (PetaPixel, 2026-04-30) — https://petapixel.com/2026/04/30/new-instagram-policies-target-reposted-content/
  - Tubefilter (2026-04-30) — https://www.tubefilter.com/2026/04/30/instagram-removes-algorithm-recommendations-repost-content-aggregator/amp/
  - Digital Camera World — https://www.digitalcameraworld.com/tech/social-media/two-years-later-instagram-is-finally-giving-photographers-the-same-protection-as-videographers-with-this-key-change
  - (TechCrunch 기사 원문은 직접 확인 못 함)
- 우리 팀 시사점: 레시피·3D 영상·목소리를 직접 만드므로 원본 콘텐츠에 해당. 다만 **같은 영상을 여러 계정에 올리거나, 다른 플랫폼 로고·워터마크(예: 틱톡, 렌더 도구 워터마크)가 남으면 불리**.

### 1-3. 길이

- **[보도·공식] 2025년 1월**: 릴스 업로드 최대 3분. Mosseri는 "여전히 짧은 영상 중심"이라고 함. 보도에 따르면 Instagram은 **90초 이하가 성과가 더 좋은 경향**이라고 재확인.
  - Social Media Today — https://www.socialmediatoday.com/news/instagram-officially-expands-reels-length-3-minutes/737766/
  - Instagram Says Posting Longer Reels Can Hurt Your Performance — https://www.socialmediatoday.com/news/instagram-longer-reels-hurt-performance/715867/
- **[공식]** 3분 이하 릴스는 비팔로워 추천 대상(추천되려면 3분 이하여야 함).
  - https://creators.instagram.com/blog/the-latest-with-instagram
- "30초가 최적"이라는 공식 수치는 **확인 못 함**. 공식 메시지는 "짧게 + 시청 시간(완주)·보내기"이므로 30초 형식은 유지해도 무방.

### 1-4. 체험용 릴스(Trial Reels)

- **[공식]** 체험용 릴스는 **비팔로워에게만** 먼저 보여 줌. 2025-12-03 Meta 개발자 블로그: 콘텐츠 게시 API에서 체험용 릴스 생성 지원(Facebook 로그인·**Instagram 로그인 둘 다**).
  - Instagram API Updates for Insights, Content Management, and Collaboration — https://developers.facebook.com/blog/post/2025/12/03/instragram-api-updates/
- API 사용법은 3장 참고. 자격 조건(팔로워 1,000명 이상 등)은 출처마다 달라 **확인 못 함**.
- **[2차]** 체험 릴스끼리만 비교하라, 24~72시간 뒤 판단 — 공식 아님.
  - https://postfa.st/blog/instagram-trial-reels , https://adaptlypost.com/blog/instagram-trial-reels

### 1-5. 첫 장면·자막·음악

- **[공식] Creators FAQ**: **첫 3초가 흥미로워야** 넘기지 않는다. 팔로워가 아닌 사람도 이해되게 만들 것. **유행 오디오 사용이 배포에 영향**(유행 인기도가 랭킹에 반영).
  - https://creators.instagram.com/faq?locale=en_US
- **[공식]** 무음 릴스는 덜 보여 줌(위 1-2). → 반드시 소리(목소리·효과음·음악) 포함.
- 자막(번인 자막)에 대한 공식 랭킹 언급은 **확인 못 함**. 다만 "대부분이 글자인 릴스"는 덜 보여 주므로 **글자 카드가 화면 대부분을 덮는 장면을 길게 두지 말 것**.
- **API 한계**: API로는 인스타 음악 라이브러리 곡을 붙일 수 없다(공식 문서에 그런 파라미터 없음 — 파라미터 목록 기준 추정, 명시 문장은 확인 못 함). 할 수 있는 건 `audio_name`으로 **원본 오디오 이름 바꾸기**(릴스 전용, 1회만).

### 1-6. 커버·프로필 그리드

- **[보도] 2025년 1월**: 프로필 그리드가 정사각형 → **세로 직사각형(3:4)**으로 바뀜. 가운데 기준으로 잘림. 원본은 열면 원래 비율.
  - Engadget — https://www.engadget.com/social-media/instagrams-experimental-profile-grid-has-rectangular-images-instead-of-squares-160007086.html
  - Inquirer — https://usa.inquirer.net/165044/bye-squares-why-instagram-switched-to-a-taller-grid
- 9:16 커버를 3:4로 가운데 자르면 **위아래가 잘림**(1080×1920 기준 가운데 1080×1440 영역만 보임). → 커버의 제목·음식은 **가운데 3:4 영역 안에**.
- API로 그리드 자르기 위치를 정하는 파라미터는 **확인 못 함**.

### 1-7. 화면 안전 영역(UI가 가리는 곳)

- **[2차, Meta 광고 가이드 인용]** 릴스 광고: **위 14%, 아래 35%, 좌우 각 6%** 비우기(1080×1920 기준 약 위 269px, 아래 672px, 좌우 65px). 일반(오가닉) 릴스에 그대로 적용되는지는 **확인 못 함**. Meta 원문 페이지 직접 확인 못 함.
  - https://houseofmarketers.com/guide-to-safe-zones-tiktok-facebook-instagram-stories-reels/
  - https://www.inro.social/tools/instagram-reels-safe-zone-checker
- 실무: 아래쪽은 캡션·버튼, 오른쪽은 좋아요·댓글·공유 버튼이 덮음. 자막·재료 카드는 화면 가운데~중상단에.

### 1-8. 영상 규격 (API 기준, [공식] IG User Media 레퍼런스 발췌)

| 항목 | 값 |
| --- | --- |
| 컨테이너 | MOV 또는 MP4(MPEG-4 Part 14), edit list 없음, **moov atom 앞쪽(faststart)** |
| 비디오 코덱 | HEVC 또는 H.264, 프로그레시브, closed GOP, 4:2:0 |
| 프레임 | **23–60 fps** |
| 해상도 | 가로 최대 1920px, 비율 0.01:1~10:1 허용, **9:16 권장** (→ 1080×1920) |
| 비디오 비트레이트 | VBR, **최대 25 Mbps** |
| 오디오 | AAC, 최대 48 kHz, 모노/스테레오, **128 kbps** |
| 길이 | **3초 ~ 15분** (단, 추천 대상은 3분 이하) |
| 파일 크기 | **최대 300 MB** |

- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/

### 1-9. 해시태그·캡션 키워드·대체 텍스트·위치

- **해시태그 [보도] 2025년 12월 18~19일**: @creators 공지로 **게시물·릴스당 해시태그 최대 5개**(이전 30개). Mosseri: 구체적인 태그 몇 개가 긴 목록보다 낫고, 해시태그는 검색엔 도움이 되지만 **도달을 늘리는 도구는 아님**.
  - Instagram now limits you to five hashtags per post (Digital Trends) — https://www.digitaltrends.com/social-media/instagram-now-limits-you-to-five-hashtags-per-post/
  - https://www.techbuzz.ai/articles/instagram-caps-hashtags-at-five-to-combat-spam
  - 충돌: Instagram 도움말 페이지(오래된 문서)는 아직 "최대 30개" — https://help.instagram.com/351460621611097 . API 문서도 아직 "30 hashtags"(3장). 한때 5개 제한이 풀렸다는 글도 있음(https://www.lilachbullock.com/why-instagram-only-lets-you-use-5-hashtags-some-posts/). → **현행 공식 한도 확정은 확인 못 함. 안전하게 5개 이하로**.
- **캡션 키워드 [보도·2차]**: Mosseri가 검색에 도움 되는 곳으로 **아이디·프로필 이름·소개·캡션**을 꼽음(1차 출처 확인 못 함). 2025년 7월부터 **프로페셔널 계정의 공개 게시물이 구글 등 검색엔진에 색인**된다는 보도 다수(Instagram 공식 문서 직접 확인 못 함).
  - https://blog.hootsuite.com/instagram-seo , https://www.inro.social/blog/instagram-seo
- **대체 텍스트(alt text) [공식]**: API의 `alt_text`는 **이미지 전용(최대 1,000자), 릴스·스토리 미지원**.
- **위치 [공식]**: API `location_id` = 위치 정보가 있는 페이스북 페이지 ID. 위치 없는 페이지면 `INSTAGRAM_PLATFORM_API__INVALID_LOCATION_ID` 오류. 위치가 랭킹에 미치는 영향은 확인 못 함.

---

## 2. AI 콘텐츠 규칙

### 2-1. Meta "AI 정보(AI info)" 라벨

- **[공식] 2024년**: "Made with AI" → **"AI info"**로 이름 변경. AI로 **생성된** 것은 눈에 보이는 라벨, AI로 **편집만** 한 것은 메뉴 안으로.
  - Our Approach to Labeling AI-Generated Content — https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/ (한국어: https://about.fb.com/ko/news/2024/04/our-approach-to-labeling-ai-generated-content-and-manipulated-media/)
  - Labeling AI Content — https://transparency.meta.com/governance/tracking-impact/labeling-ai-content/
- **[공식] 의무 범위**: **사실처럼 보이는(photorealistic) 영상이나 실제처럼 들리는 음성**을 디지털로 만들거나 바꿨으면 공개 도구로 라벨을 달아야 함. 안 하면 불이익 가능. 감지 기술로 **C2PA** 등 업계 표준 사용(IPTC 언급은 이번 검색에서 확인 못 함).
  - How Meta Is Preparing for the 2026 US Midterm Elections (2026-02) — https://about.fb.com/news/2026/02/meta-prepares-for-2026-us-midterms/
  - Instagram 도움말 — https://help.instagram.com/761121959519495
- **애니메이션 캐릭터**: 공식 문구는 "photorealistic"으로 한정 → 만화풍 3D 캐릭터는 **의무 대상 밖일 가능성이 큼**. "만화풍 AI 영상은 라벨 불필요" 예시는 2차 출처뿐(공식 문장 확인 못 함).
  - **주의(우리 팀)**: 맛조수 **목소리가 VoxCPM2 합성 음성**이다. 공식 기준에 "realistic-sounding audio(실제 사람처럼 들리는 음성)"가 들어 있어 **음성 때문에 라벨 대상이 될 수 있음**. 또 음식 장면이 사진처럼 사실적이면 해당 가능. → **자발적으로 AI 라벨을 켜는 쪽이 안전**.
- **자동 라벨**: C2PA 등 AI 신호가 파일에 있으면 Instagram이 자동으로 라벨을 달 수 있음.

### 2-2. API로 올린 AI 콘텐츠

- **[공식]** 콘텐츠 게시 API에 **`is_ai_generated`** 파라미터(선택, AI 사용 자진 공개 → AI info 라벨). REELS·CAROUSEL·STORIES 컨테이너에 사용, 캐러셀 자식에는 불가. **Instagram 로그인·Facebook 로그인 둘 다 지원**. `GET /{ig_media_id}?fields=is_ai_generated`로 확인. 변경 기록 날짜는 2026-06-22로 보도(Changelog 원문 직접 확인 못 함). 게시 후 추가 불가라는 말은 2차 출처.
  - Changelog — https://developers.facebook.com/documentation/instagram-platform/changelog.md
  - IG User Media — https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
  - Content Publishing — https://developers.facebook.com/documentation/instagram-platform/content-publishing.md

### 2-3. 계정 단위 라벨: "AI 생성 프로필"

- **[공식+보도] 2026-05-04**: 선택형 "AI creator" 계정 라벨 시험(당시 랭킹 영향 없음).
  - Engadget — https://engadget.com/2162426/instagram-is-testing-optional-ai-creator-labels
- **[공식] 2026-08-31**: 이름을 **"AI-generated profile(AI 생성 프로필)"**로 바꾸고, **AI로 만든 사람(AI-generated people)이 나오는 계정이 라벨을 안 달면 도달을 제한할 수 있음**. 스스로 단 계정은 도달 변화 없음. AI로 사진 보정·캡션 다듬기·그래픽만 하는 계정은 대상 아님. 이의제기 가능.
  - Bringing More Transparency to AI-Generated Profiles on Instagram — https://creators.instagram.com/blog/ai-generated-profile-label
  - TechCrunch (2026-08-31) — https://techcrunch.com/2026/08/31/instagram-puts-new-limits-on-undisclosed-ai-profiles/
- 우리 팀: 맛조수가 "AI로 만든 사람"인지(3D 만화 캐릭터) 공식 기준이 애매 → **확인 못 함**. 계정 정체성 자체가 AI 캐릭터 진행이므로 **프로필 라벨을 켜 두는 것이 도달 제한 위험을 피하는 길**. 이 라벨을 API로 켜는 방법은 확인 못 함(앱 설정).

### 2-4. 한국 「인공지능기본법」 (2026-01-22 시행)

- **[공식] 시행**: 「인공지능 발전과 신뢰 기반 조성 등에 관한 기본법」 2026-01-22 시행. 시행령은 2026-01-20 국무회의 의결.
  - 정책뉴스 — https://www.korea.kr/news/policyNewsView.do?newsId=148958380
  - [보도참고] 추가 설명 — https://www.korea.kr/briefing/pressReleaseView.do?newsId=156741740
- **[공식] 법 제31조**: 생성형 AI 결과물을 제공하는 **사업자**는 생성형 AI로 만들었다는 사실을 표시(②). 실제와 구분하기 어려운 가상 음향·이미지·영상은 이용자가 명확히 알 수 있게 고지·표시, 예술·창작물은 감상을 해치지 않는 방식 허용(③).
  - https://www.law.go.kr/LSW//lsSideInfoP.do?lsiSeq=282791&joNo=0031&joBrNo=00&docCls=jo&urlMode=lsScJoRltInfoR
- **[공식] 시행령 제23조**: 사람이 알아보는 표시 또는 기계가 읽는 표시 모두 허용. 기계 판독 방식이면 안내 문구·음성으로 1회 이상 알려야 함. 딥페이크가 아닌 **애니메이션·웹툰 등은 보이지 않는 디지털 워터마크도 허용**.
- **[공식] 과태료**: 최대 3천만 원, **계도기간 최소 1년**(사실조사·과태료 유예).
- **[공식/해석] 의무 주체**: 과기정통부 「인공지능 투명성 확보 가이드라인」 및 법무법인 해설 — **AI 결과물을 활용해 자기 콘텐츠를 만들어 올리는 경우는 '이용자'로 보아 표시 의무 대상 아님**이 우세한 해석. 우리 스튜디오가 외부 고객에게 AI 생성 서비스를 제공하면 달라질 수 있음.
  - 가이드라인 공개 보도자료 — https://www.korea.kr/briefing/pressReleaseView.do?newsId=156740669 (본문 직접 확인 못 함)
  - 법무법인 세종(법률신문) — https://www.lawtimes.co.kr/news/articleView.html?idxno=216500
  - 신김(뉴스레터) — https://www.shinkim.com/kor/media/newsletter/3142
- 개정 이력: 국가법령정보센터에 2026-07-21, 2026-08-20 시행 개정 항목이 보임 → 최신 조문은 **확인 못 함**.
- 결론: 법적 의무는 약할 수 있으나, 플랫폼(Meta) 규칙 + 신뢰를 위해 **영상 안 짧은 "AI 캐릭터·AI 음성" 표시 + `is_ai_generated=true`**를 권장.

---

## 3. 콘텐츠 게시 API 한도·파라미터 (Instagram 로그인 기준)

| 항목 | 내용 | 근거 |
| --- | --- | --- |
| 하루 게시 한도 | **24시간 이동 창 기준 게시 수 제한. 문서끼리 충돌: 100개(Content Publishing 가이드) vs 50개(media_publish·content_publishing_limit 레퍼런스)**. `media_publish`에서만 셈, 캐러셀=1개. `GET /<IG_ID>/content_publishing_limit`로 실제 값 확인 | [공식] 아래 링크 |
| 컨테이너 생성 한도 | 24시간에 **400개**, 컨테이너는 **24시간 뒤 만료** | [공식] |
| 권한 | Instagram 로그인: `instagram_business_content_publish` | [공식] |
| 커버 | `cover_url`(공개 서버 이미지, 우리가 cURL로 가져감) 또는 `thumb_offset`(ms). **둘 다 주면 cover_url 우선** | [공식] |
| share_to_feed | true면 피드+릴스 탭 둘 다 가능, false면 릴스 탭만. 노출은 보장 안 됨 | [공식] |
| 협업자 | `collaborators`: 최대 **3명**(피드 이미지·릴스·캐러셀). 다른 페이지엔 5명·Facebook 로그인 전용이라고 나와 충돌 → 확인 못 함 | [공식] |
| 위치 | `location_id`(위치 있는 페이지 ID) | [공식] |
| 사용자 태그 | `user_tags`(공개 계정 아이디) | [공식] |
| 오디오 이름 | `audio_name`(릴스 전용, 1회만 변경) | [공식] |
| 체험용 릴스 | `trial_params` = `{graduation_strategy: MANUAL \| SS_PERFORMANCE}`, media_type은 REELS여야 함. MANUAL=앱에서 수동 전환, SS_PERFORMANCE=성과 좋으면 자동 전환 | [공식] |
| AI 라벨 | `is_ai_generated=true` | [공식] |
| 대체 텍스트 | `alt_text` **이미지만**, 릴스 미지원 | [공식] |
| 캡션 | 최대 **2,200자, 해시태그 30개, @멘션 20개**(API 문서 기준). 앱 정책상 해시태그는 5개로 줄었다는 보도 → **5개 이하 권장** | [공식]+[보도] |
| 계정 | 프로페셔널(비즈니스/크리에이터) 계정만. "크리에이터 계정은 릴스 API 불가"라는 2차 주장은 확인 못 함 | [2차] |

출처:
- Publish Content using the Instagram Platform — https://developers.facebook.com/docs/instagram-platform/content-publishing/
- Content Publishing (md) — https://developers.facebook.com/documentation/instagram-platform/content-publishing.md
- IG User Media — https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/
- IG User Media Publish — https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media_publish
- IG User Content Publishing Limit — https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit.md
- Collaborators — https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-media/collaborators.md
- 2025-12-03 블로그 — https://developers.facebook.com/blog/post/2025/12/03/instragram-api-updates/

---

## 4. 추천 자격 가이드라인(음식 콘텐츠에 영향 줄 수 있는 것)

- **[공식] 두 단계**: 커뮤니티 가이드라인 위반 = 삭제. 그보다 약한 **저품질·불쾌·민감 콘텐츠는 삭제는 안 해도 비팔로워 추천에서 제외**. 팔로워 피드·스토리엔 계속 보임.
  - Reducing the distribution of problematic content — https://transparency.meta.com/enforcement/taking-action/lowering-distribution-of-problematic-content/ (출처 원본성 낮은 콘텐츠, 영상 형식을 악용한 저품질 영상, 허위정보 등 배포 축소)
  - Understanding Instagram Outages & Account Status — https://about.instagram.com/blog/announcements/instagram-outages-and-account-status
- **[공식] 건강 관련**: 추천 제외될 수 있는 예로 **건강 효능을 내세워 상품·서비스를 파는 콘텐츠(예: 살 빼는 보조제)**, 의약품 등 규제 상품 홍보.
  - Limit sensitive content — https://help.instagram.com/251027992727268
  - About Sensitive Content Control — https://help.instagram.com/1055538028699165
  - Facebook 쪽 문서는 **"과장된 건강 주장(exaggerated health claims)"**을 추천 불가로 명시(인스타 문구로는 확인 못 함) — https://www.facebook.com/business/help/1082519118875784
- **[공식] 저품질 릴스**: 저해상도·워터마크·무음·테두리·대부분 글자·이미 올라온 영상(1-2 참고).
- **[공식] 정보성 점수**: Instagram 피드 추천 신호 중 LLM이 매기는 "게시물이 얼마나 유익한가" 점수가 있음.
  - Instagram Feed Recommendations AI system — https://transparency.meta.com/features/explaining-ranking/ig-feed-recommendations/
- **[공식] 반복 위반**: 추천 가이드라인을 반복 위반하면 **일정 기간 계정의 모든 게시물이 추천 제외**. Account Status에서 추천 자격 확인·이의제기.
- **[공식] 10대**: 성인에게는 추천되는 콘텐츠도 10대에겐 더 엄격 — https://transparency.meta.com/policies/age-appropriate-content/
- 음식 콘텐츠 시사점: "다이어트 효과", "혈당을 낮춘다", "면역력" 같은 **건강 효능 문구**를 캡션·자막에 넣지 말 것. 술 관련 레시피는 규제 상품 쪽 확인 필요(확인 못 함).

---

## 5. 우리 제작·게시 방식에 바로 반영할 것 (요약)

1. 규격: 1080×1920, 30fps(23–60 범위), H.264, AAC 48kHz 128kbps, **faststart(moov 앞)**, 25Mbps 이하, 300MB 이하, 3초 이상.
2. 첫 3초에 결과물·훅. 소리 없는 구간 금지(무음 릴스 감점). 테두리(레터박스) 금지.
3. **재료·순서 카드가 화면 대부분을 덮는 장면을 길게 두지 않기**("대부분 글자" 감점). 3D 장면 위에 작게.
4. 자막·카드·로고는 위 14%·아래 35%·좌우 6% 밖으로(광고 기준 차용, 오가닉은 확인 못 함).
5. 커버: `cover_url`로 별도 이미지, 핵심은 가운데 3:4(1080×1440) 안.
6. 렌더 도구·다른 플랫폼 워터마크 금지. 같은 영상을 여러 계정에 올리지 않기.
7. 해시태그 5개 이하, 캡션 앞부분에 요리 이름 등 검색 키워드. 캡션 2,200자 이하.
8. `is_ai_generated=true` 기본 적용(합성 음성 때문에라도). 계정에 "AI 생성 프로필" 라벨 검토. 영상에 C2PA가 붙으면 자동 라벨될 수 있음.
9. 하루 게시 한도는 `content_publishing_limit`로 확인 후 사용(문서상 50 또는 100).
10. 새 훅·연출 실험은 `trial_params`(MANUAL)로 비팔로워에게 먼저 시험 → 사용자 승인 필요한 외부 게시이므로 기존 승인 흐름 유지.
11. 건강 효능 문구 금지.
