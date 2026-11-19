# 시청자 심층 분석 · 영상 형식 다양화 (2026-11-19)

- 계기: 사용자 지적 (2026-11-19) — "수사 파일이 뭐야, 초딩도 아니고", "항상 클리셰야, 레파토리가 똑같아, 배경도 내용 구성도 스토리도 없고", "문제당 최소 30분은 리서치하고 진행해, 너 맘대로 고르지 말고"
- 시청 대상(사용자 지정): **2·30대 젊은 주부**, **4·50대 요리 취미·배우는 사람**
- 적용 코드: `packages/recipe-core/src/generator/story.ts` (형식 라이브러리·시청자 정보·프롬프트·검사), `diversity.ts`(다양성 지표), `packages/video/src/music.ts`(형식별 음악)
- 이 문서는 [hook-library.md](hook-library.md), [character-brand-guide.md](character-brand-guide.md), [instagram/official-guidance.md](instagram/official-guidance.md), [instagram/story-diversity-2026-11-19.md](instagram/story-diversity-2026-11-19.md)를 이어받는다.

## 0. 한눈에

| 문제 | 근거로 본 원인 | 바꾼 것 |
| --- | --- | --- |
| "수사 파일·내기"가 유치하다 | 대본 갈래 7개 중 4개(추리·구출·내기·시간 싸움)가 어린이 방송식 구도였고, 맛조수 성격을 "성급·허세·큰 리액션"으로 정해 두었다. 어른 시청자는 과장·억지 연출에 반감이 크다 (1-4장) | 추리·내기·구출·선물·시간 싸움 갈래 삭제. 맛조수를 "차분한 또래 진행자"로 다시 정하고, 유치한 말(범인·수사·사건·내기·작전·미션·으악 등)과 느낌표 과다를 경고 |
| 레파토리가 똑같다 | 모든 대본이 "훅 → 갈등 → 전환 → 해결 → 보상" 한 가지 흐름을 강제받았고, 첫 장면도 "결과 또는 실패 화면"만 허용했다. 견본 15편의 첫 대사 15개가 모두 문제·실패로 시작했다 (2-1장) | 형식 10가지, 형식마다 다른 장면 구성. 실패로 시작하는 대본은 한 번에 하나까지. 장면 구성 다양성·실패 시작 수를 지표로 잰다 |
| 내용·배경이 없다 | 대본이 "맛조수가 망쳤다 → 노트 → 해결" 연기에 글자를 썼고, 시청자의 실제 상황(가족 반찬·손님상·제철·보관·전통)과 이어지지 않았다 | 형식이 시청자 상황(쓰임·제철·보관·전통·연구자 답변)에서 출발하게 하고, 원본에 근거가 있을 때만 그 형식을 고르게 함 |

## 1. 조사 방법과 한계 (먼저 읽기)

- 웹 검색 약 60회(한국어·영어), 2024~2026 자료 우선. 조사 시간: 시청자 분석 30분 이상, 형식 조사 30분 이상.
- **이 세션에서는 brunch.co.kr, blog.opensurvey.co.kr 등을 직접 열 수 없었다** (네트워크 허용 목록 밖). 그래서 보고서 원문 대신 **검색 결과에 나온 기사·요약 발췌**를 근거로 썼다. 원문 표를 확인해야 하는 수치는 "원문 확인 필요"로 적었다.
- 근거 표시: **[조사]** 공개된 설문·통계, **[공식]** 플랫폼 자체 발표, **[연구]** 논문·학술 발표, **[보도]** 언론 기사, **[2차]** 마케팅 매체·블로그(참고만), **[내부]** 이 저장소의 견본·실험, **확인 못 함** = 근거를 찾지 못했거나 출처끼리 충돌.
- 사용자가 예로 든 채널 중 확인되지 않은 곳은 근거로 쓰지 않았다 (1-5장 표).

## 1장. 시청자 심층 분석

### 1-1. 두 무리 공통 데이터

| 내용 | 근거 |
| --- | --- |
| 일평균 숏폼 이용: 30대 41분, 40대 40분, 50대 33분 (서울·경기 1,000명) | [조사] CJ메조미디어 2025 타겟 리포트 (S1) |
| 30대 = "미디어 옵티마이저"(평균적·효율적), 40대 = "하이퍼 리프레셔"(숏폼 이용률 97%, 틈틈이 환기) | [조사] CJ메조미디어 2026 타겟 리포트 요약 (S2) |
| 구매에 가장 영향 준 광고: 10~30대 인플루언서 추천·리뷰, 40대 검색 상단 키워드 광고, 50대 영상 속 간접광고(PPL) → 50대는 **영상 안에서 자연스럽게 나오는 정보**를 믿는 편 | [조사] CJ메조미디어 2025 (S1, S3) |
| 인스타그램 사용자: 30대 596만, 40대 637만(40대 1위 SNS가 밴드→인스타그램으로 바뀜), 50대는 밴드 427만·인스타그램 285만 | [조사] 와이즈앱·리테일 2025-06 추정 (S3) |
| SNS 이용률 40대 77.8%·50대 52.7%, 인스타그램 이용률 40대 50.5%·50대 28.7% | [조사] 서울시50플러스재단 2025-02 (S3) |
| 50대의 숏폼 플랫폼 순서는 유튜브 쇼츠 다음 네이버 클립 (20~40대는 쇼츠 다음 릴스) | [보도] (S4) — 조사 기관 원문 확인 필요 |
| 인스타그램은 시청 뒤 **DM 공유 25.3%**로 세 플랫폼 중 가장 높고, 유튜브는 "추가 행동 없음" 41.0% | [조사] 오픈서베이 소셜미디어 트렌드 리포트 2026 (S5) |
| SNS의 AI 콘텐츠: "새롭다" 9.6% vs "인위적·어색하다" 49.9%, 사실 여부를 의심 39.0%, 표시 필요 85.6%. 반감 요인으로 **과장·반복·AI 티**를 꼽음 | [조사] 오픈서베이 2026, 15~59세 900명 (S5, S6) |
| 요리·먹방 시청 동기는 정보추구·오락·대리만족·시간 보내기 네 갈래로 반복 확인 | [연구] KCI 논문 (S7, S8) |

### 1-2. 2·30대 젊은 주부

| 내용 | 근거 |
| --- | --- |
| 고물가·배달비 부담 속 **2030 중심으로 "현실 집밥"·냉장고 털기 콘텐츠** 인기: 오래된 재료 활용, 마트 간편식 조합, 프라이팬 하나·전자레인지·에어프라이어 | [보도] 더팩트 인플루언서 프리즘 2026-06-07 (S9) |
| 응답자 45.1%가 비용 절감을 위해 집밥 실천, 집밥을 하게 된 계기로 "간단한 조리법을 알게 돼서", "시판 재료·소스가 많아서" | [조사] 오픈서베이 2026 식생활 트렌드 (S10) — 45.1%는 기사 인용, 원문 확인 필요 |
| **제철 관심은 2030이 이끈다**: 네이버 데이터랩 19~39세 '제철음식' 검색지수 2020년 39 → 2024년 89, 인스타그램 '제철' 게시물 2022년 약 9만 → 2024년 17만+, "계절 한정 경험을 일부러 찾는다" 20대 64.5%·30대 60.5% | [보도] 세계일보·머니투데이 (S11, S12) |
| 저장이 많이 되는 콘텐츠: 방법(How-to), 목록 정리, **비교 분석**, 경험 리뷰 | [2차] (S13) |
| 저장한 레시피를 실제로 하기 어려운 이유: 재료 정리 부담 68.6%, 인분 계산 부담 52.9% (102명, 작은 표본) | [2차] (S14) |
| 인스타그램의 완벽한 가족 식사 이미지는 부모에게 비현실적 기대 압박을 준다 → "엄마라면 이 정도는" 식 압박 구도는 피한다 | [연구] 보도 2025-06 (S15) |
| 2030 대상 "억지 농담·유행어·밈 따라 하기"는 거부, 그 브랜드다운 개성은 환영 (13~39세 1,500명+2,500명) | [조사] YPulse Cringe Trend Report 2025-08 (S16) |
| 너무 매끈한 광고는 신뢰를 떨어뜨린다 40%, 진짜 같은 콘텐츠를 즐긴다 56% | [조사] I Hate Ads Report 2025 (S17) |

### 1-3. 4·50대 요리 취미·배우는 사람

| 내용 | 근거 |
| --- | --- |
| 중장년은 콘텐츠의 **전문성**과 주제의 민감성을, 젊은 층은 재미를 더 중시 | [조사] 2019 오디오 콘텐츠 조사 (S18) — 오래되고 매체가 달라 방향만 참고 |
| **50세 이상 여성이 가장 많이 딴 국가기술자격이 한식조리기능사** (2021 통계연보). 조리·제과 분야 응시에서 한식조리기능사가 27.3%로 1위, 40대가 16.2% | [조사] 국가기술자격 통계연보·보도 (S19) |
| 45~64세 시청 상위 요리 채널 '김대석 셰프TV': 55세 이상 비중이 높고 여성 70% 이상. 34년 경력 셰프가 냉장고 재료로 요령(신김치·식은 밥)을 담백하게 설명 | [2차] eopla·openads 분석, [보도] 위키트리 (S20, S21) |
| '만원요리 최씨남매': "조리기능장에게 배웠다"는 계보를 내세우고 궁중요리로 전환한 뒤 크게 성장 | [보도]·나무위키 — 기존 조사 [korean-cases.md](instagram/korean-cases.md) 사례 2 |
| '심방골주부'(39년차 주부): "엄마·할머니가 해 주던 맛"이라는 반응 | [공식] YouTube 블로그 인터뷰 2021 (S22) |
| 중장년 대상 요리 교실이 저염·저당, 제철 건강 요리를 가르친다 (마포구 40~70대 남성 요리교실 2026-05, 강남구 어르신 쿠킹클래스) | [보도] (S23) |
| 이 저장소 견본: "기능장 되는 법"류는 약했고, **기능장이 구체적인 문제 하나를 푼 영상은 채널 중앙값의 약 21배** | [내부] README 원칙 8 (C08) |

### 1-4. 말투: 믿는 것 vs 유치하다고 느끼는 것

| 내용 | 근거 |
| --- | --- |
| 과장된 억양·과장된 칭찬·웃음은 **깔보는 말**로 들린다 (노인 대상 연구, 31명 평가) | [연구] Univ. of Iowa 2023 (S24) — 대상이 고령층이라 4050에는 **방향만** 적용 |
| 귀여운 캐릭터가 강하게 밀어붙이는 말을 하면 따뜻함이 깎인다. 캐릭터가 판매 도구로 보이면 진정성을 낮게 본다 | [연구] Journal of Advertising Research, WARC 요약 (S25) |
| 귀여움은 브랜드 인상(따뜻함·유능함)과 맞을 때만 효과, 결과가 자주 엇갈린다 | [연구] Frontiers in Psychology 2026 (S26) |
| 실수는 **유능한 사람**이 할 때만 호감을 올리고, 평범한 사람의 실수는 호감을 깎는다(실수가 클수록 더) | [연구] Aronson 1966과 후속 연구 (S27) |
| 펭수가 2030 어른에게 통한 이유는 아기 같은 귀여움이 아니라 **솔직하고 따뜻한 말** | [보도] EBS PD 인터뷰 등 2019~2020 (S28) |
| 듀오링고 부엉이의 "막 나가는" 유머는 그 브랜드에 맞춰 계산된 것이고, 다른 브랜드에 통한다는 보장이 없다고 담당자 스스로 말함 | [보도] Marketing Week 등 (S29) |
| 반말·존댓말 선호를 직접 잰 조사 | **확인 못 함** |
| "잼민이" 같은 어린이 톤 AI 목소리 숏폼의 피로감을 다룬 조사 | **확인 못 함** (커뮤니티 글 수준의 반감만 있음, S30) |
| 추리·수사·내기 구도를 어른이 유치하게 본다는 직접 조사 | **확인 못 함** → 사용자(계정 주인)의 직접 판단 + 위 간접 근거(과장·억지 반감, 정보추구 동기, 전문성 중시)로 결정 |

### 1-5. 사용자가 든 채널 확인 결과

| 채널 | 확인 | 쓸 만한 점 |
| --- | --- | --- |
| 1분요리 뚝딱이형 | 확인 (유튜브 약 305만, 1분 레시피, AI 목소리 두 캐릭터) | 1분 리듬·외식 메뉴 집밥화. 단 **어린이 목소리 캐릭터 대화는 우리 시청자에게 맞는다는 근거 없음** — 리듬만 가져온다 |
| 백종원(요리비책) | 확인 (첫 영상 3주 만에 200만, 쉬운 집밥·양념 비율) | 정량·쉬운 말. "90% 성공" 같은 수치는 근거 없음 |
| 류수영(어남선생, 편스토랑) | 확인 (편스토랑 10승, 유튜브 레시피 누적 3억 뷰, 요리책 베스트셀러) | 실패 요인을 미리 짚는 설명(블로그 수준 근거) |
| 김대석 셰프TV | 확인 (45~64세 상위, 여성 70%+) | 4050 여성층, 경력 셰프의 담백한 요령 |
| 정육왕 | 확인 (고기 전문, 약 76만, 2021 보도) | 비교·실험형 콘텐츠의 근거로 쓸 자료는 **확인 못 함** |
| 승우아빠 | 확인 (셰프 출신, 특이 재료 요리, 꾸밈없는 진행) | 남성 시청층 중심으로 보여 직접 참고는 약함. 논란 이력 있음 |
| 만개의레시피 | 확인 (앱 이용자 1,000만 홍보 문구) | 이용자 연령 자료 **확인 못 함** |
| 하루한끼 | 채널 존재는 보이나 수치 **확인 못 함** | — |
| 수빙수, 요리왕비룡, 이밥차 | **확인 못 함** (검색에서 계정·특징을 찾지 못함) | 근거로 쓰지 않음 |
| 키친토크 | 커뮤니티 게시판 이름으로 보이며 숏폼 채널 근거 **확인 못 함** | — |

### 1-6. 페르소나 (근거 묶음을 사람 모양으로 정리한 가상 인물)

**A. 2030 젊은 주부 — "저장해 두고 이번 주에 해 볼 것"을 찾는 사람**
- 상황: 맞벌이 또는 육아 중, 장보기·식비를 신경 쓴다. 쉬는 틈에 릴스를 넘기고 괜찮으면 저장하거나 배우자·친구에게 DM으로 보낸다 (S5, S9, S10).
- 원하는 것: 한 번에 되는 요령 하나, 집에 있는 재료·남은 재료, 가족·아이 반찬·도시락, 제철 재료, 보관 (S9, S11, S13).
- 싫어하는 것: 억지 농담·유행어, 매끈하기만 한 광고 느낌, AI 티와 과장, "엄마라면" 식 압박 (S5, S15, S16, S17).
- 믿는 말투: 또래가 요점만 짚어 주는 담백한 해요체.
- 훅: 실용·비교형 — "이 단계 하나로 결과가 달라져요", "두 방법, 어디서 갈릴까요?", "남은 재료, 이렇게 쓰면 돼요".

**B. 4050 요리 취미·배우는 사람 — "제대로, 이유까지" 알고 싶은 사람**
- 상황: 40대는 인스타그램이 1위 SNS, 50대는 쇼츠·네이버 클립·밴드. 영상 안에서 나오는 정보를 믿는 편 (S1, S3, S4).
- 원하는 것: 원리, 정석, 흔한 방법과의 차이, 전통 음식·손님상·명절, 전문가(조리기능장)에게 직접 듣는 답 (S18, S19, S20, 내부 C08).
- 싫어하는 것: 어린아이에게 하듯 과장된 억양, 가르치려 드는 말투, 근거 없는 단정 (S24, S25).
- 믿는 말투: 차분하고 정확한 해요체, 이유를 먼저, 어려운 말은 쉬운 말로.
- 훅: 원리·정석형 — "조리기능장은 이 단계를 왜 먼저 할까요?", "흔한 방법과 정석, 차이는 이 한 가지예요".

### 1-7. 쓰지 않을 구도·말 (코드로 경고)

| 피할 것 | 이유 |
| --- | --- |
| 추리·수사·범인·사건·단서·용의자 | 사용자 지적. 어린이 탐정물 구도. 견본 4편이 모두 "범인 찾기"였다 (반복) |
| 내기("~에 걸었어요") | 사용자 지적. 정보와 상관없는 억지 갈등 |
| 구출 작전·미션·출동·대결 | 어린이 방송식 과장 위기 |
| 맛조수 세계의 가상 인물(친구 로봇·할머니)과 감동 반응, "아이가 잘 먹었어요" 같은 지어낸 후기 | 어른에게는 유치하거나 가짜 후기로 보인다. 사실 규칙(지어내기 금지)과도 겹친다 |
| 비명·과장 감탄("으악", "헉", "짜잔", "두둥"), 느낌표 남발(대본 전체 4개 이상), 자기 비하, 아기 말투·반말 | 과장 억양은 깔보는 말로 들리고(S24), 과장·반복·AI 티는 반감 요인(S5) |
| 매번 실패로 시작 | 사용자 지적 "레파토리가 똑같다". 무능한 실수 반복은 호감을 깎는다(S27). YouTube는 같은 상황·결말이 반복되는 영상을 수익화에서 뺀다(S31) |

## 2장. 영상 형식 조사

### 2-1. 지금 대본이 왜 똑같았나 (내부 진단)

- 견본 15편(요리 5가지×3편, [story-diversity-2026-11-19.md](instagram/story-diversity-2026-11-19.md)): 첫 대사 15개가 모두 **문제·실패 상황**("~가 왜 이래요?", "~가 흥건해요!")으로 시작했다. 첫 대사 글자는 서로 달라도 **구성은 하나**였다.
- 원인: 프롬프트가 (1) 모든 대본에 "훅 → 갈등(실수·위기·내기) → 전환(선생님 노트) → 해결 → 보상"을 요구했고, (2) 첫 장면을 "결과 또는 실패 화면"으로 정했고, (3) 맛조수를 "성급하고 자주 실수하는" 성격으로 정했고, (4) "재미 = 과장된 리액션·웃긴 실수"라고 적었다.
- 기존 다양성 지표(첫 대사 중복·문장 유사도)는 이 반복을 잡지 못했다 → 장면 구성 다양성·실패 시작 수를 새 지표로 넣었다.

### 2-2. 다양성을 지키는 방법 (근거)

| 내용 | 근거 |
| --- | --- |
| 같은 광고를 반복할 때 **겉모습만 바꾸는 변형은 관심 낮은 사람에게, 내용 자체를 바꾸는 변형은 관심 높은 사람에게** 효과 → 요리를 배우려는 4050에는 내용(형식)이 달라야 한다 | [연구] Schumann·Petty·Clemons 1990, Journal of Consumer Research (S32) |
| YouTube 2025-07: "반복적·대량 생산" → "비진정성 콘텐츠"로 이름을 바꾸고, 한 틀로 조금씩만 다른 영상, 같은 구조의 대량 업로드를 수익화 불가 예로 듦. 채널 전체 단위로 판단 | [공식]·[보도] (S31) |
| 성공한 요리 크리에이터는 **이름 붙은 시리즈 여러 개**를 돌린다: Joshua Weissman "But Better / But Cheaper / But Faster", Bon Appétit "Gourmet Makes / It's Alive / Reverse Engineering" | [보도]·[2차] (S33) |
| 인스타그램은 2026-06 릴스를 회차로 묶는 "시리즈" 기능을 일부 크리에이터에게 시험 | [보도] (S34) — 시험 중 |
| Mosseri: 한 게시물에 일희일비하지 말고 꾸준히 통하는 것을 밀어라 | [보도] (S35) |
| 짧은 학습 영상은 **한 영상에 한 가지 요점**일 때 기억에 남는다 (나눠 보여 주기 효과 메타분석 56편) | [연구] 인지부하 이론, Rey 외 2019 메타분석 (S36) — 2차 인용, 원문 확인 권장 |

### 2-3. 형식 라이브러리 (코드: `STORY_TYPES`, `STORY_TYPE_INFO`)

모든 형식은 30~40초(대사 170~220자), 재료·조리 장면은 원본 그대로, 원리·팁 카드는 원본 문장으로 고정된다. "고를 수 있는 조건"이 맞지 않으면 그 형식은 프롬프트에 아예 나오지 않는다 (형식을 위해 사실을 지어내지 않게).

| 형식 (id) | 구성 | 잘 맞는 시청자 | 왜 통하나 (근거) | 고를 수 있는 조건 |
| --- | --- | --- | --- | --- |
| 실패 원인 하나 (`one-fix`) | 흔한 결과 → 원인 한 가지 → 원리 → 재료·조리 → 고친 결과 | 2030·4050 | 실패 해결은 저장되는 How-to (S13), 기능장이 문제 하나를 푼 영상이 강했다 (내부 C08), 실패 요인을 미리 짚는 설명 (류수영, 블로그 수준). **단 반복하면 레파토리가 된다** → 한 번에 하나까지 | 원본에 흔한 실수가 있거나 분류가 "실패 해결" |
| 두 방법 비교 (`compare`) | 두 방법을 나란히 → 갈리는 곳 → 원리 → 원본 방법 조리 → 차이 정리 | 2030·4050 | 비교 분석형은 저장률이 높다 (S13), 결과를 미리 맞혀 보게 하는 구조가 시청을 붙든다 (GMM 맛 비교, S37), KREI: 비교 영상이 구매 결정에 영향 (S38) | 원본에 원리가 있음. "해 봤더니" 같은 실험 결과 표현 금지 |
| 조리기능장의 정석 (`standard`) | 흔한 방법·질문 → 조리기능장은 이렇게 → 이유 → 재료·조리 → 정석 한 줄 | 4050 | 50세 이상 여성 1위 자격증이 한식조리기능사 (S19), 중장년은 전문성 중시 (S18), 기능장 계보·궁중요리 사례 (korean-cases 사례 2) | 원본에 팁·흔한 실수·오해 중 하나 |
| 이 단계는 왜? (`why`) | 왜 이 단계? → 원리 → 그 단계 조리 → 재료·나머지 → 기억할 한 문장 | 4050(·2030) | 정보추구 동기 (S7), "왜 이렇게 하는지"를 내세운 Cook's Illustrated 방식 (S39), 한 영상 한 요점 (S36) | 원본에 원리가 있음 |
| 한눈에 레시피 (`quick`) | 완성 → 재료 → 빠른 순서 → 포인트 하나 → 마무리 | 2030 | 1분 레시피 뚝딱이형 305만 (S40), 1분 압축 음식 콘텐츠로의 이동 (데일리안 2026-04, S41), 저장해 두고 따라 하기 (S13) | 조리 순서 2개 이상 |
| 언제 내면 좋을까 (`occasion`) | 쓰임 상황(손님상·가족 반찬·도시락·명절) → 맞는 이유 → 재료·조리 → 차려 낸 모습 | 2030·4050 | 2030 현실 집밥·도시락 (S9), 명절 상차림 간소화·명절 직전 검색 집중 (S42), 인스타그램 DM 공유 — "이번 주말에 이거 하자" (S5) | 항상 (단 지어낸 반응·효능 금지, 제안형으로) |
| 제철 이야기 (`season`) | 계절·제철 재료 → 다루는 이유 → 재료·조리 → 계절 마무리 | 2030·4050 | 19~39세 제철 검색 2배 이상, 계절 한정 경험 추구 20대 64.5%·30대 60.5% (S11, S12) | 원본에 계절·제철·명절 말이 있음 |
| 보관·남은 재료 (`leftover`) | 남은 재료·보관 고민 → 원본 보관·손질 팁 → 재료·조리 → 다음에 쓸 때 | 2030 | 냉털·현실 집밥 (S9), 저장 뒤 재료 정리가 부담 68.6% (S14) | 원본에 보관·손질·남은 재료 말이 있음 |
| 선생님께 묻다 (`qa`) | 할 법한 질문 → 연구자 답변 원문 → 답이 보이는 조리 → 재료 → 정리 | 4050(·2030) | 댓글에 영상으로 답하는 형식이 크리에이터 사이에 널리 쓰임 (TikTok 공식, S43 — 효과 수치는 일화 수준), 연구자 본인의 답이라는 신뢰 (원칙 4) | 연구자 답변이 있음 (실제 받은 댓글인 척 금지) |
| 음식 이야기 (`heritage`) | 얽힌 이야기·전통 → 예부터 이렇게 한 이유 → 재료·조리 → 오늘 식탁으로 | 4050 | 궁중·전통 요리 반응 (korean-cases 사례 2), "엄마·할머니 맛" (S22) | 원본에 이야기가 있거나 분류가 "전통조리" (유래는 원본 이야기에 있을 때만) |

**호두정과(원본: 실수·이야기 없음, 분류 전통조리)로 고를 수 있는 형식**: 두 방법 비교, 조리기능장의 정석, 이 단계는 왜?, 한눈에 레시피, 언제 내면 좋을까, 음식 이야기 (테스트로 확인).

### 2-4. 진행 캐릭터(맛조수)가 어른에게 호감을 얻으려면

- **유능함 + 따뜻함, 귀여움은 거들 뿐** (S26). 맛조수는 "차분하고 센스 있는 또래 진행자": 시청자 대신 묻고, 선생님 노트를 정확히 전한다. 지식의 주인처럼 단정하지 않는다 (기존 뱀파이어 효과 대응 유지, character-brand-guide 1장).
- **반응은 짧게, 대본 하나에 한 번** ("오, 그래서였네요"). 과장 억양·과장 칭찬은 깔보는 말로 들린다 (S24).
- **실수 연기는 `one-fix`에서만, 원본의 흔한 실수를 담담하게**. 유능하지 않은 인물의 실수 반복은 호감을 깎는다 (S27).
- **밀어붙이는 말 금지** ("꼭 따라 해 보세요" 등) — 귀여운 캐릭터 + 강한 권유는 따뜻함을 깎는다 (S25). 기존 금지 문구에도 들어 있다.
- **해요체 존댓말**. 반말·존댓말 선호 조사는 찾지 못했지만, 4050에 깔보는 말로 들릴 위험을 피하고 기존 채널 말투와 맞춘다 (4장 선택지 2).

## 3장. 결정과 구현

| 결정 | 코드 |
| --- | --- |
| 갈래 7개(추리·구출·내기·선물·오해·시간 싸움·추억) → 형식 10개 | `STORY_TYPES`, `STORY_TYPE_INFO`(구성·지킬 것·맞는 시청자) |
| 예전에 저장된 초안은 그대로 읽힌다 ("추리(예전)" 이름표, 음악도 예전대로) | `storyTypeLabel`, `musicFor` |
| 형식마다 장면 구성이 다르게. 장면 자리 이름을 갈등형(hook·conflict·turn·solve·payoff)에서 중립형(hook·context·point·method·close)으로 | `STORY_BEATS`, 프롬프트 규칙 1 |
| 원본에 근거가 있을 때만 그 형식을 보여 준다 | `availableStoryTypes(recipe, { expertAnswers })` |
| 시청자 정보를 조사 근거로 다시 씀 | `AUDIENCE_INFO` |
| 맛조수 말투 기준(차분한 또래 진행자, 해요체, 반응 한 번, 실수 연기 제한) | `storySystem()` 등장인물 |
| 유치한 구도 금지 + 경고, 느낌표 4개 이상 경고 | `CHILDISH_FRAMING`, `findChildishFraming`, `MAX_EXCLAMATIONS`, `finalizeStory` 경고 |
| 실패로 시작하는 대본은 한 번에 하나까지, 첫 장면 실패 화면은 `one-fix`에서만 | 프롬프트 규칙 2·3 |
| 지어낸 인물·후기·"해 봤더니" 금지 (사실 규칙 13 강화) | 프롬프트 |
| 다양성 지표에 장면 구성 다양성·실패 시작 수·유치한 말 대본 수 추가 | `storyDiversity` (`uniqueStructures`, `failOpenings`, `childishHits`), `tools/content-lab/diversity-report.ts` |
| 형식별 음악: 따뜻함(음식 이야기·쓰임·제철) 오르골, 궁금증(왜·비교·묻다) 피치카토, 빠른 호흡(한눈에·보관) 리듬, 나머지 우쿨렐레 | `packages/video/src/music.ts` |
| 지키는 것: 원본 재료·분량·순서 고정, 개수 말 금지, 연구자 경험은 원문만, 반복 문구 금지, 계정 단위 반복 회피(최근 형식·소재) | 그대로 |

### 측정 (다음에 할 일)

- 실제 AI 작가로 요리 5가지×3편을 다시 써서 `diversity-report.ts`로 비교: 목표는 `failOpenings` ≤ 편수의 1/3, `childishHits` 0, `uniqueStructures` ≥ 0.8.
- 인스타그램 트라이얼 릴스로 형식별 건너뛰기 비율(첫 3초)·평균 시청 시간·보내기/도달을 3편 이상 중앙값으로 비교 (hook-library 4장 방식).

## 4장. 근거가 갈린 것 — 사용자 선택이 필요한 부분

1. **맛조수 실수 연기**: (가) 지금처럼 `one-fix`에서만 담담하게 허용 / (나) 완전히 없애고 실패는 "이렇게 되는 경우가 많아요" 설명으로만. 실수 효과 연구는 "유능한 인물의 가끔 실수는 호감↑, 반복은 호감↓"이라 (가)를 골랐다.
2. **말투**: (가) 두 시청자 모두 해요체(지금) / (나) 2030 대본만 더 가벼운 말투(문장 끝 생략 등). 직접 조사를 찾지 못했다. 1분요리 뚝딱이형은 반말 캐릭터 대화로 성공했지만 어린이 목소리라 우리 시청자에 맞는다는 근거가 없다.
3. **형식에 시리즈 이름 붙이기**: 해외 사례(But Better 등)는 이름 붙은 시리즈를 돌린다. (가) 지금처럼 형식만 바꾸기 / (나) "정석 노트", "왜 그럴까", "제철 한 접시" 같은 고정 시리즈 이름·표지로 묶기(인스타그램 시리즈 기능 시험 중). (나)를 하려면 표지·제목 규칙을 따로 정해야 한다.
4. **두 방법 비교의 화면**: 예전 실험에서 3D 비교 화면은 차이가 약했다(README 2장 5번). (가) 3D 비교 + "설명용 연출" 표시 / (나) 연구자가 실제 비교 촬영을 올린 콘텐츠에서만 비교 형식을 쓰기.
5. **제철 형식의 시청자**: 데이터는 2030이 제철 관심을 이끈다고 보여 주고(S11), 4050과 제철을 잇는 자료는 찾지 못했다. 지금은 두 무리 모두에 열어 두었다.
6. **느낌표 기준(3개)**과 **유치한 말 목록**은 근거를 바탕으로 정한 출발점이다. 경고만 하고 막지는 않는다. 견본을 보고 기준을 조정할 수 있다.

## 5장. 출처 (접속일 2026-11-19, 날짜는 발행일)

- S1. CJ메조미디어 2025 타겟 리포트 보도 — 바이라인네트워크 2025-04-29 https://byline.network/2025/04/29-334/ · 디지털인사이트 https://ditoday.com/?p=144289
- S2. CJ메조미디어 2026 타겟 리포트 — 브런치 https://brunch.co.kr/@mezzomedia/180 (직접 열지 못함, 검색 요약), i-boss https://www.i-boss.co.kr/ab-3208-1746
- S3. 와이즈앱·리테일 2025-06, 서울시50플러스재단 2025-02 (검색 요약, 원문 확인 필요) — 브라보마이라이프 https://bravo.etoday.co.kr/view/atc_view/16073 · 국민일보 https://www.kukinews.com/article/view/kuk202502070063
- S4. 50대 숏폼 플랫폼 순서 — 한국기자협회 https://www.journalist.or.kr/news/article.html?no=56994 (조사 기관 원문 확인 필요)
- S5. 오픈서베이 소셜미디어 트렌드 리포트 2026 (2026-09) — https://blog.opensurvey.co.kr/trendreport/socialmedia-2026/ · https://blog.opensurvey.co.kr/article/socialmedia-2026-2/ · SBS Biz https://biz.sbs.co.kr/amp/article/20000336750 · 아이뉴스24 https://inews24.com/view/2009131
- S6. AI 광고 반감 이유(과장·반복·AI 티) — AI매터스 https://aimatters.co.kr/news-report/52782/ · 이코노미스트 https://economist.co.kr/article/view/ecn202609230048
- S7. 장윤재·김미라, 정서적 허기인가 정보와 오락의 추구인가 (먹방·쿡방 시청동기, 669명) — KCI https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002132367
- S8. TV 음식 프로그램 이용 동기 — 한국콘텐츠학회 https://koreascience.or.kr/article/JAKO202022560455230.page
- S9. 더팩트 [인플루언서프리즘] 고물가·배달비 부담 속에 '냉털' 유튜브 채널 전성시대 (2026-06-07) — https://news.tf.co.kr/read/ogmeta/2329999.htm
- S10. 오픈서베이 2026 식생활 트렌드 — https://blog.opensurvey.co.kr/article/webinar-eat-2025-1/ · 머니투데이 2026-01-12 https://www.mt.co.kr/industry/2026/01/12/2026011119520783783
- S11. 세계일보 제철음식 검색·게시물 증가 (2025-11-15) — https://www.segye.com/newsView/20251115501537
- S12. 머니투데이 '제철코어' (2025-10-03) — https://www.mt.co.kr/future/2025/10/03/2025100112371353533 · 파이낸셜뉴스 https://www.fnnews.com/news/202602270958403352
- S13. 저장률 높은 콘텐츠 유형 — i-boss "요즘은 좋아요보다 저장이 중요해요" https://www.i-boss.co.kr/ab-6141-67017 · Socialinsider https://www.socialinsider.io/ko/social-media-benchmarks/instagram-engagement-report
- S14. 요리GO 2026 자체 설문(102명) — tilnote https://tilnote.io/pages/6a091b322b0d77dede4edc07
- S15. Hidden pressures behind Instagram's family meal trends (2025-06-17) — https://www.news-medical.net/news/20250617/Hidden-pressures-behind-Instagrams-family-meal-trends.aspx
- S16. YPulse The Cringe Trend Report (2025-08-07) — https://www.ypulse.com/report/2025/08/07/the-cringe-trend-report/ · https://www.ypulse.com/article/2025/10/27/the-coolest-and-cringiest-things-brands-do-according-to-gen-z/
- S17. I Hate Ads Report 2025 — Mediaweek https://www.mediaweek.com.au/i-hate-ads-study-lifts-lid-on-what-gen-z-love-and-hate-about-brands · B&T https://www.bandt.com.au/avoid-the-cringe-trap-when-going-after-gen-z/
- S18. 연령별 콘텐츠 기대(2019, 19~59세 1,000명) — i-boss https://www.i-boss.co.kr/ab-74668-908
- S19. 국가기술자격 응시·취득 통계 — 메트로서울 2023-10-10 https://www.metroseoul.co.kr/article/20231010500110 · 아시아경제 2024-09-23 https://view.asiae.co.kr/article/2024092318541693195 · 브라보마이라이프 https://bravo.etoday.co.kr/view/atc_view/13671
- S20. 연령대별 유튜브 인기 채널(45~64세 김대석 셰프TV) — openads https://openads.co.kr/content/contentDetail?contsId=18809 · eopla https://eopla.net/magazines/39885 · 뉴닉 https://newneek.co/@ugwanggi/article/39039 (집계 방식 비공개, 참고만)
- S21. 위키트리 김대석 셰프 김치볶음밥 — https://www.wikitree.co.kr/articles/1110550
- S22. YouTube 공식 블로그 #유튜브로성장해요: 심방골주부 (2021-10) — https://blog.youtube/intl/ko-kr/creator-and-artist-stories/2021_10_gwyt-korean-food-recipes/
- S23. 마포구 꽃중년 남성 건강 요리교실 (2026-05-15) — https://www.heraldk.com/article/2026051516433463003 · 강남구 어르신 쿠킹클래스 https://www.gangnam.go.kr/gangnamlife/2025/html/vol357/sub01_04.html
- S24. Do older adults appraise elderspeak as patronizing or respectful? (Univ. of Iowa, 2023 학회 초록) — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10738631/ · Evaluations of elderspeak https://profiles.wustl.edu/en/publications/evaluations-of-elderspeak-in-a-caregiving-context/
- S25. WARC, How brands can use 'cute' characters to drive results (Journal of Advertising Research 요약) — https://www.warc.com/content/feed/how-brands-can-use-cute-characters-to-drive-results/en-GB/96
- S26. Frontiers in Psychology 2026, 귀여움 유형 × 따뜻함·유능함 — https://www.frontiersin.org/articles/10.3389/fpsyg.2026.1730776
- S27. Pratfall effect (Aronson 1966, 후속 연구) — https://en.wikipedia.org/wiki/Pratfall_effect
- S28. 펭수 분석 — 디지털인사이트 https://ditoday.com/?p=31661 · 서울신문 2019-11-04 https://m.seoul.co.kr/news/2019/11/04/20191104017001
- S29. 듀오링고 — Marketing Week https://www.marketingweek.com/duolingo-cmo-unhinged-social/ · Campaign https://campaignlive.com/article/duolingo-comms-head-sam-dalsimer-leads-wholesome-unhinged-strategy/1910699
- S30. AI 목소리 영상 피로감(커뮤니티 글) — https://damoang.net/free/6358295
- S31. YouTube 비진정성 콘텐츠 정책 (2025-07-15) — Search Engine Journal https://www.searchenginejournal.com/youtube-monetization-update-spam-not-reaction-channels/550755/ · Plagiarism Today https://www.plagiarismtoday.com/2025/07/08/youtube-targets-inauthentic-content/ · 기존 sources.md S17
- S32. Schumann, Petty & Clemons (1990) Predicting the effectiveness of different strategies of advertising variation, JCR 17(2) — https://econpapers.repec.org/RePEc:oup:jconrs:v:17:y:1990:i:2:p:192-202
- S33. 요리 시리즈 형식 — But Cheaper https://www.thetvdb.com/series/but-cheaper/allseasons/official · The Penny Hoarder https://thepennyhoarder.com/?p=166212 · Kinda Brief(시리즈 형식 분석) https://kinda-brief.beehiiv.com/p/please-dont-put-pasta-in-a-flshlight
- S34. 인스타그램 릴스 시리즈 기능 시험 (2026-06) — https://kompozy.io/news/instagram-episodic-reels-series-algorithm-controls (2차, 공식 발표 확인 필요)
- S35. Mosseri 게시 빈도·꾸준함 — https://routenote.com/blog/how-often-you-should-post-on-instagram/ · https://www.socialmediatoday.com/news/instagram-chief-shares-algorithm-insights-and-posting-tips/
- S36. 한 영상 한 요점·나눠 보여 주기 — Forasoft(메타분석 인용) https://www.forasoft.com/learn/elearning-video/articles-elearning/pedagogy-of-video-attention-retention-chunking · Rey, G. D. et al. (2019) A meta-analysis of the segmenting effect, Educational Psychology Review (원문 확인 권장)
- S37. 맛 비교·결과 맞히기 형식 — Good Mythical Morning taste test https://rosetta.to/u/goodmythicalmorning/low-vs-high-heat-taste-test
- S38. 한국농촌경제연구원 2025 식품소비행태조사 통계보고서 (2025-12) — https://repository.krei.re.kr/handle/2018.oak/33315 (레시피 정보 경로 연령별 표는 원문 확인 필요)
- S39. Cook's Illustrated / America's Test Kitchen 방식 — https://www.americastestkitchen.com/articles/7088-how-we-make-our-recipes-failproof-every-time · https://cooksillustrated.com
- S40. 1분요리 뚝딱이형 — 아주경제 2023-08-31 https://www.ajunews.com/view/20230831231935854 · 타입캐스트 인터뷰 https://typecast.ai/kr/creator/interview-ddukddak · 기존 korean-cases.md 사례 1
- S41. 데일리안 [2026 먹방의 현재③] 1분 압축 미식 리포트 (2026-04-26) — https://www.dailian.co.kr/news/view/1636854
- S42. 명절 상차림 간소화·명절 직전 검색 — 세계일보 https://www.segye.com/newsView/20240904512249 · i-boss https://www.i-boss.co.kr/ab-6141-65070
- S43. TikTok Reply to comments with video (2020-06-18) — https://newsroom.tiktok.com/en-us/product-tutorial-reply-to-comments-with-video
- 채널 확인용: 백종원 구독자 200만 (2019-07-03) https://twig24.com/news/entertainments/broadcasting/2019/07/03/20190703500152 · 류수영 요리책·누적 3억 뷰 https://v.daum.net/v/20250708214042327?f=p · 편스토랑 10승 https://www.osen.co.kr/article/G1112053352 · 정육왕 더팩트 2021 https://news.tf.co.kr/read/ogmeta/1849023.htm · 승우아빠 https://www.osen.co.kr/article/G1112050474 · 만개의레시피 앱 https://apps.apple.com/kr/app/id494190282
