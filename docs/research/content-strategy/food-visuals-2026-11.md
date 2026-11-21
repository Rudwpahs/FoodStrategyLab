# 음식 비주얼·배경 다양화 연구와 적용 (2026-11)

사용자 지적(원문): "음식 비주얼도 영 별로야 … 배경도 …"
- 음식: 호두가 주황색 덩어리, 전이 납작하고 밋밋함, 접시가 흔한 흰 원판, 김이 회색 공처럼 보임.
- 흐름: 영상마다 접시 첫 화면 → 맛조수 얼굴 → 재료 → 팬 클로즈업 → 같은 식탁 엔딩.

조사 기간: 2026-11-19 16:13~16:43(UTC) 웹 조사 + 로컬 렌더 측정. 구현은 그 뒤.
근거 수준 표시: **[연구]** 동료 심사 논문·학술 발표, **[공식]** 플랫폼·표준 단체 문서, **[실무]** 업계 가이드·블로그(근거 약함), **[관찰]** 이 저장소의 실제 프레임.

---

## 1. 음식이 화면에서 맛있어 보이는 조건 — 무엇이 근거가 있나

| # | 요인 | 근거 | 수준 | 우리에게 주는 뜻 |
| --- | --- | --- | --- | --- |
| E1 | **윤기(광택)·대칭·모양·조명·색** | Spence, Motoki & Petit (2022) "Factors influencing the visual deliciousness / eye-appeal of food", *Food Quality and Preference* — 광택·신선함·대칭·움직이는 표현·배경/조명 색을 시각적 맛의 요인으로 정리한 리뷰. Califano & Spence (2024) *FQP* 116, 105149 (n=297) — AI 음식 이미지가 대칭·모양·광택·조명·색을 키워 실제 사진보다 더 맛있어 보였다(출처를 모를 때만) | [연구] | 3D 음식은 **반사(광택)가 진짜로 보여야** 한다. 지금은 환경 반사가 없어 클리어코트가 거의 안 보였다 |
| E2 | 광택 = 신선함 | 생선 눈 광택 분포와 신선도 판단(PLOS ONE 2013), 딸기·당근 표면 광택과 신선도. 일본 음식의 '테리·츠야'(윤기)가 맛있어 보임의 핵심 요인(Arce-Lopera 외 2015) | [연구] | 양념·조청·참기름은 젖은 듯한 반사 하이라이트로 |
| E3 | **채도가 높으면 더 신선하고 맛있어 보인다** | Liu, Wu, Yu & Huang (2022) *J. Business Research* 151:366–378 (온라인 실험 2회, 1차 n=267) — 채도↑ → 신선함·맛 기대↑ → 구매 의향↑. 단, 가까이 찍은 사진에서는 효과가 작다. 빈 대학 연구: 채도↑ → 건강·맛 평가↑(신선함 매개). 너무 높으면 인공적으로 보임(당근 연구). Spence (2015) *Flavour* 리뷰 — 색은 맛 기대를 정하는 가장 중요한 음식 자체 단서 | [연구] | 색이 바래 보이는 톤 매핑을 고친다. 과한 채도는 금지 |
| E4 | **움직이는 김(스팀)은 효과가 있고, 정지한 김은 없다** | Zhang, Desebrock, Okajima & Spence (2024) "'Hot stuff': Making food more desirable with animated temperature cues", *FQP* 120, 105233 — 온라인 실험 3회, **움직이는 김**을 더하면 뜨거움·먹고 싶음·신선함 평가가 올랐고, **정지한 김 그림은 효과 없음**. 원래 덜 맛있어 보이는 사진일수록 효과가 컸다. 냉동식품 포장 후속 연구(FQP 2024)도 같은 방향 | [연구] | 김을 '올라가며 흩어지는' 반투명 연기로 다시 만든다(지금은 회색 공이 떠다님) |
| E5 | 움직임은 '먹고 싶음'을 조금 올린다 | Toet 외 (2019) *Int. J. Food Design* — 음식 시네마그래프(일부만 움직이는 사진)는 정지 사진보다 '먹고 싶음' 점수가 약간 높고 '좋아함'은 같았다. 음식마다 다름 | [연구] | 완성 접시도 김·윤기 반짝임 같은 작은 움직임을 둔다 |
| E6 | '정지 사진 속 암시된 움직임'(붓기 순간 등)은 **근거가 갈린다** | Gvili 외 원 연구는 효과 있음 → 2021 *Foods* 재현 실험(n=626, 3회)에서 효과 없음 | [연구, 상충] | 사진 한 장 효과가 아니라 영상의 실제 움직임으로 해결 |
| E7 | **담음새가 정성스러우면 더 좋아하고 더 낸다** | Michel, Velasco, Gatti & Spence (2014) "A taste of Kandinsky", *Flavour* 3:7 (n=60) — 같은 샐러드도 그림처럼 담으면 더 좋아하고 더 비싸게 낼 의향, 먹은 뒤 맛 평가도 높음. Zellner 외 (2011) "Neatness counts", *Appetite* — 같은 음식도 가지런히 담으면 더 좋아하고, 더 정성 들였고 더 좋은 식당 음식이라 여김 | [연구] | 아무렇게나 흩뿌린 조각 대신 가운데를 높게 쌓고, 접시 여백을 남긴다 |
| E8 | **음식과 그릇의 대비** | Piqueras-Fiszman 외 (2012) *FQP* — 같은 딸기 무스가 흰 접시에서 더 달고 진하게 느껴짐(n=53, 일부 후속 연구는 음식·그릇마다 다름). Van Ittersum & Wansink (2012) *J. Consumer Research* — 음식과 접시 색 대비가 크면 음식이 더 또렷하게(크기 판단이 달라짐) 보임 | [연구, 일부 상충] | 그릇 색을 음식 밝기와 반대로: 밝은 음식(달걀·크림 파스타)은 짙은 그릇, 갈색·빨강·초록 음식은 흰 백자 |
| E9 | 따뜻한 색온도 | Lin & Au (2025) *Int. J. Hospitality Mgmt* — 따뜻한 색 음식 이미지가 맛 지향 선택을 늘림(이미지 실험). Wu & Wang (2015) — 2700K 조명이 더 즐거운 분위기 | [연구, 약함] | 음식 장면은 따뜻한 빛 유지(이미 golden/fire 분위기). 더 세게 할 근거는 없음 |
| E10 | 가까이·먹는 사람 시점, 구도 | 1인칭 시점 음식 영상이 관련 뇌 활동↑(Basso 외 2018 *Appetite*). 구도 실무: 45°가 기본, 납작한 음식(전·피자)은 위에서, 높이가 있는 음식은 낮게(촬영 가이드 다수). 3/4 각도 vs 위에서 비교 학부 논문(Jacobs 2017)은 결과 원문 미확인. 가까이 보여 주면 소비 반응↑(학회 발표 2019, 예비). 모바일에서는 제품 클로즈업이 특히 중요(Think with Google APAC 음식 광고 가이드) | [연구 약함·실무] | 완성 접시 화면을 더 가깝고 낮게(먹기 직전 시점) |
| E11 | 얕은 피사계 심도(배경 흐림) | **효과를 잰 연구를 찾지 못함.** 사진 실무에서는 흔한 기법 | [실무만] | 렌더 비용이 큰데 근거가 없어 넣지 않는다(§3) |
| E12 | 김이 보이려면 뒤에서 오는 빛 + 어두운 배경. 접시 **건너편에서** 카메라 쪽으로 반사되게 비추면 반사 하이라이트가 생겨 '젖은 듯' 보임. 큰 부드러운 광원의 넓은 반사가 음식 색을 살리고, 너무 세면 기름져 보임 | 음식 사진 실무 가이드 다수(역광·측후광 45°, 검은 판; PictureCorrect 'Specular Highlights & Falloff', Strobist) | [실무] | 음식 뒤쪽에서 비추는 작은 '음식 조명' + 부드러운 방 모양 반사, 세기는 절제 |

### AI·CG 음식과 '불쾌한 골짜기'

| 연구 | 결과 |
| --- | --- |
| Diel 외 (2025) "Eerie edibles: Realism and food neophobia predict an uncanny valley in AI-generated food images", *Appetite* (n=95, 이미지 38장) | **조금 어색한 사실풍** AI 음식이 가장 불쾌하고 덜 좋음. **확실히 만화풍**이거나 **진짜**는 괜찮음. 낯선 음식을 꺼리는 사람일수록 더 불쾌 |
| Diel & Pimpini (2026) *Scientific Reports* (n=87, 60쌍) | AI 음식 이미지는 칼로리·건강 판단은 실제와 같지만 **덜 사실적이고 먹고 싶은 마음이 낮음** |
| Califano & Spence (2024) *FQP* | 출처를 모르면 AI 이미지가 더 맛있어 보이고, 알려 주면 차이가 사라짐 |
| Pixar 〈라따뚜이〉 음식 셰이딩(befores & afters 2020 회고) | 일부러 양식화하되 표면 성질(반투명·윤기)은 사실적으로, 반투명은 과장. 조명이 큰 몫 |

→ **결론**: 우리 3D 음식은 '어설픈 사실풍'(울퉁불퉁한 덩어리 + 탁한 색)이라 연구가 말하는 **골짜기 구간**에 가까웠다. 맛조수·무대가 로우폴리 만화풍이므로, 음식은 **깔끔한 양식화된 모양 + 사실적인 표면(윤기·반사·김)**으로 간다(Pixar와 같은 방향). 진짜 사실감이 필요하면 연구자 본인 촬영 영상(실제 촬영 모드)이 답이다.

## 2. 음식 비주얼 개선 방법 비교

| 방법 | 품질 근거 | 비용·속도 | 라이선스·정직성 | 판단 |
| --- | --- | --- | --- | --- |
| (a) **절차적 3D 개선**: 환경 반사(코드로 만든 방, 파일 없음), 색을 지키는 톤 매핑, 음식 전용 조명, 움직이는 김, 그릇 대비, 모양·색 다듬기 | E1~E8 (광택·채도·움직이는 김·담음새·대비) | 렌더 시간 측정(§4). 외부 파일·패키지 없음 | 문제 없음. 레시피 원본 재료만 그림(원칙 1) | **채택 (지금 적용)** |
| (a') 후처리(피사계 심도·블룸, @react-three/postprocessing) | E11: 근거 없음 | 배포 렌더는 GPU 없는 소프트웨어 WebGL(swangle). 화면 전체 패스가 추가될 때마다 1080×1920 전체를 다시 계산 | 패키지 추가(MIT) | **보류** — 근거 없는데 비용만 확실 |
| (b) CC0·상업 가능 3D 음식 모델 | Kenney Food Kit(CC0, 200개 이상, 로우폴리)·Quaternius Low Poly Food Pack(CC0, 100개 이상)은 **서양 음식 위주의 단색 로우폴리**라 김치전·나물·정과가 없다. Poly Haven은 CC0이지만 한식 모델 확인 못 함. Sketchfab 스캔은 모델마다 CC-BY/BY-SA/NC가 섞이고 'NoAI' 추가 조건도 있음 | 파일 크기·관리 부담 | CC-BY는 출처 표기 의무가 영상마다 따라다님, NC는 사용 불가 | **채택 안 함** (한식이 없음). 소품(그릇 등)도 코드로 충분 |
| (c) 무료 실사 사진·영상 (Pexels·Pixabay) | 진짜 음식이라 골짜기 없음 | 0원 | 상업 이용 가능, 출처 표기 불요. 단 **오해를 부르는 사용 금지**(Pexels·Pixabay 약관). 다른 사람이 만든 음식을 이희재 연구자의 레시피 결과처럼 보이면 원칙(정직성·원칙 3·4)에 어긋남 | **채택 안 함** (결과물로 오인될 위험). 쓰더라도 '참고 이미지' 표기가 필요 → 사용자 결정 사항 |
| (d) 생성 AI 이미지·영상 | E1(출처 모르면 더 맛있어 보임) vs Diel 2025·2026(어설프면 불쾌, 먹고 싶은 마음↓) — **상충** | 유료 API(사용자 승인 필요) | Meta는 사실적인 AI 영상에 'AI 정보' 표시를 요구(2024-02 공지), 한국 AI 기본법(2026-01-22 시행)은 생성형 AI 결과물 표시 의무(사업자 대상). 연구자 레시피 결과처럼 보이면 정직성 문제 | **채택 안 함** (기본값으로). 이미 있는 '생성 AI 클립' 기능은 사용자 선택으로만 |
| (e) 2D 일러스트 음식 | 만화풍은 골짜기 밖(Diel 2025). 브랜드 일관성 장점(실무) | 3D 무대와 섞으면 이질감, 새 그림 자원 필요 | 직접 그리면 문제 없음 | **부분 채택**: 3D를 '양식화 + 사실적 표면' 방향으로 (같은 근거) |
| (f) 연구자 본인 촬영 영상을 기본으로 | 진짜 음식 = 골짜기 없음, 정직성 최고 | 연구자 촬영 시간 필요 | 문제 없음 | **권장 (사용자 결정)**: 실제 촬영 모드가 이미 있음. 촬영 요령은 §5 |

## 3. 영상마다 똑같아 보이는 흐름 — 근거

| 근거 | 수준 | 뜻 |
| --- | --- | --- |
| YouTube 2025-07-15부터 '반복적인 콘텐츠'를 '진정성 없는 콘텐츠'로 이름을 바꾸고 **한 틀로 찍어 낸 차이가 적은 영상**을 수익화 불가 예시로 듦(이미 있던 규칙의 명확화) | [공식, 보도] | 같은 틀 반복은 채널 단위 위험 |
| Instagram은 원본 콘텐츠를 우대하고 재게시를 원본으로 바꿔 추천(2024-04 발표, 2026 사진까지 확대 보도) | [공식, 보도] | 우리 영상끼리 겉모습이 너무 같으면 불리할 수 있음(직접 근거는 아님) |
| 광고 반복 연구: 같은 광고를 반복하면 효과가 떨어지고(wear-out), 겉모습 변화(cosmetic)와 내용 변화(substantive)를 구분(Schumann, Petty & Clemons 1990 *JCR* 17(2)) | [연구] | 색만 바꾸는 것보다 구도·장면 구성 자체를 바꿔야 함 |
| Meta 광고 가이드(2025-07)도 '같은 틀의 변형'보다 '서로 다른 크리에이티브'를 권장 | [공식, 2차 보도] | 같은 방향 |
| 컷 빈도 효과는 비선형(Dost 2026 학회 논문, 예비). "N초마다 컷" 수치는 근거 없음 | [연구 약함] | 컷 수를 늘리지 않고 **구도 종류**를 바꾼다 |
| 결과 먼저 vs 과정 먼저 오프닝: 실무 가이드 다수가 결과 먼저를 권하지만 **비교 실험 없음** | [실무, 공백] | 하나로 고정하지 않고 영상마다 돌린다(§4) |
| 첫 화면에 음식이 보여야 함(우리 사례 관찰 F7, sources.md) | [관찰] | 오프닝을 바꿔도 첫 프레임에 음식은 꼭 보이게 |

## 4. 결정과 적용 (이 브랜치)

### 4-1. 음식 (packages/video/src/three/`Food3D.tsx`·`foodShapes.ts`·`KitchenScene.tsx`)

> 2026-11-21 바뀜: 아래의 반사 환경·사실풍 재질은 걷어 내고 '확실한 만화풍' 재질로 바꿨다 → [food-toon-2026-11.md](food-toon-2026-11.md). 그릇 대비·담음새·움직이는 김 같은 결정은 그대로 이어진다.

| 바꾼 것 | 근거 | 화면에서 |
| --- | --- | --- |
| **음식·그릇 전용 반사 환경**: 어두운 방 + 소프트박스 셋(음식 뒤 위 큰 판, 옆 판 둘)을 코드로 만들어 한 번 굽고, 음식·그릇 재질에만 반사로 넣음 | E1·E2(광택), E12(접시 건너편에서 오는 빛이 '젖은 듯한' 반사) | 양념·조청·참기름·유약에 하이라이트가 생김. **처음엔 three.js 기본 밝은 방(RoomEnvironment)을 썼더니 사방에서 오는 빛이 커져 음식 색이 하얗게 바랬다** → 어두운 스튜디오로 바꿈(시행착오 기록) |
| 클리어코트(겉 막) 매끈함을 윤기에 비례, 반사 세기 절제 | E12(너무 세면 기름져 보임) | 윤기 있는 음식만 반짝, 마른 것은 무광 |
| **꼭짓점 색(틈 그늘·노릇함)**: 호두 주름 사이 어둡게, 전 가장자리·자국 노릇하게(아랫면 전체 노릇), 나물 줄기 연두색 | 업계 표준 기법(꼭짓점에 굽는 AO/색, Unity·Substance 문서) — 텍스처·조명 추가 없이 '한 색 덩어리' 탈피 | 덩어리 → 재료로 보임 |
| 호두: 두 덩이 + 가운데 골 + 뇌 모양 주름의 반쪽 알맹이, 조청 색은 갈색 대신 호박색, 접시엔 시럽 웅덩이 없이 소복이 | 실제 호두정과(투명한 시럽 코팅, 노릇한 호박색) 레시피 설명, E7 | 주황 덩어리 → 윤기 나는 견과 더미 |
| 나물: 길쭉하고 비틀린 가닥(줄기 연두) 30가닥을 가운데 높게 소복이, 참기름 윤기 | 시금치나물 '소복하게 담기'(레시피 다수), E7(가지런함) | 미역·브로콜리 같던 것 → 무친 나물 |
| **버그 수정**: 깨가 없는 나물 접시에 빈 고명 목록이 '익은 색 덩어리'로 그려지던 것 | 원칙 1(원본에 없는 재료를 그리지 않음)과도 맞음 | 나물 위 초록 덩어리 사라짐 |
| 반숙 달걀: 진한 주황 노른자 + 촉촉한 가운데 하이라이트 | 촬영 실무(진한 노른자, 흐르는 순간) | 노른자가 또렷 |
| 파스타: 접시에 둥지처럼 말아 올린 면 + 소스 + 원본 재료 건더기(고사리 모양 규칙 추가) | 파스타 담음새 관행, E7 | 감자튀김 같던 것 → 말아 올린 면 |
| **그릇 대비 규칙**(`tablewareFor`): 밝은 음식은 짙은 돌그릇(흰밥은 놋그릇), 진한 음식은 흰 백자. 접시는 굽·테두리가 있는 돌림판 모양 | E8(대비 → 또렷함), "흰 달걀을 흰 접시에 두면 밋밋함" | 달걀·크림 파스타가 짙은 접시 위에서 또렷 |
| **움직이는 김**: 흰 공 → 흐릿한 연기 판이 올라가며 커지고 흐려짐 | E4(움직이는 김만 효과), E5 | 회색 구슬 → 김 |
| 가스 불빛 1.6 → 0.9, 팬 앞쪽 비스듬히 | 관찰: 팬 속 음식이 하얗게 날아감 | 팬 속 전·호두 색이 보임 |
| 톤 매핑은 **그대로(ACES)** | Khronos PBR Neutral(색 보존)을 실제로 그려 봄 → 무대·식탁보까지 주황으로 짙어져 인공적(E3의 '과한 채도' 경고) | 바꾸지 않음(시험 기록만) |
| 피사계 심도(배경 흐림) **넣지 않음** | E11 근거 없음 + 측정: three.js BokehPass를 넣으면 60프레임 렌더가 약 2.5~3배(4-3) | — |

### 4-2. 화면 흐름·배경 다양화 (`shots.ts`·`places.ts`·`Sets.tsx`)

- **새 구도 둘**: `food-macro`(먹기 직전 눈높이로 음식에 바짝), `top-table`(식탁을 바로 위에서 본 한 상). 완성 접시 기본 구도(`plate-close`)도 더 가깝게.
- **오프닝 풀 확대**: 결과 먼저(result) 4가지, 실패 클로즈업 2가지, 비교 화면 2가지 — 같은 접시 화면으로만 시작하지 않게. 결과 먼저 vs 과정 먼저는 근거가 갈려(§3) **대본 유형이 정하는 대로 두고** 구도만 다양화.
- **엔딩 풀 확대**: 서명 엔딩이 '접시 든 맛조수' 2가지 → 4가지(+ 식탁 위 접시 낮게, 위에서 본 한 상). 마무리(outro)도 3가지.
- **오프닝·엔딩 갈래 규칙**: 오프닝과 엔딩이 같은 갈래(접시/위에서/접시 든 맛조수…)면 엔딩을 다른 갈래로 바꾼다(`shotFamily`). 테스트로 강제.
- **식탁 차림 4가지**(빨간 체크·흰 리넨·맨 나무·쪽빛 체크)를 영상 제목 씨앗으로. 결과·엔딩은 대부분 식탁이라 차림이 같으면 영상끼리 같은 그림으로 끝났다. 기존 장소·시간대·구도 씨앗 값은 그대로(뒤에 이어서 뽑음).
- 샘플 5개 × 후보 5개(25편) 기준: 엔딩 구도 예전 2종 → 4종, 오프닝 7종.
- 장소 규칙(엔딩·결과=식탁, 조리=주방)은 기존 테스트대로 유지. 계절별 무대는 대본에 날짜·계절 정보가 없어 하지 않음(다음 후보).

### 4-3. 렌더 시간

측정 도구: `tools/content-lab/rendertime.ts` (샘플 레시피 대본에서 정해진 60프레임 구간을 실제 영상 렌더로, 준비 렌더 1번 버리고 2번째를 잼). 소프트웨어 WebGL(`REMOTION_GL=swangle`, 배포 서버와 같은 방식), CPU 4개. 같은 머신에서 다른 작업들이 함께 돌아 부하가 계속 바뀌므로 **전·후를 번갈아** 두 번씩 쟀다. 예전 코드는 저장소 안 임시 폴더에 꺼내 같은 도구로 그렸다.

| 구간 | 예전 | 바꾼 뒤 | 증가 |
| --- | --- | --- | --- |
| 김치전 555~614프레임 (팬에서 부치는 조리 장면) — 부하 약 8에서 번갈아 2회 | 100.8초 · 99.7초 (평균 100.3) | 115.8초 · 111.0초 (평균 113.4) | **약 +13%** |
| 호두정과 570~629프레임 (엔딩) — 같은 조건 | 101.0초 · 102.3초 (평균 101.7) | 133.7초 · 121.7초 (평균 127.7) | **약 +26%** — 엔딩 구도가 '접시 든 맛조수'(접시가 작게)에서 '식탁 위 접시를 낮게'로 바뀌어 윤기 재질의 호두 40여 개가 화면을 채우는 구간이라, 같은 화면끼리 비교가 아니다 |
| (참고) 부하가 낮을 때 1회: 김치전 / 호두정과 | 60.7초 / 64.1초 | 72.3초 / 87.5초 | +19% / +36% (그 뒤 비용 줄이기 전) |
| (참고) 피사계 심도 후처리(BokehPass)를 예전 코드에 넣었을 때 | 60.7초 / 64.1초 | 148.5초 / 199.4초 | **+145% / +211%** → 넣지 않음 |

- 늘어난 비용은 음식이 화면에 크게 나올 때만 생긴다(음식·그릇 재질의 반사 계산). 맛조수·무대만 나오는 장면은 바뀐 것이 없다. 영상 한 편 전체로는 음식 화면 비중에 따라 대략 +5~15%로 추정(전체 렌더는 재지 않음).
- 비용 줄이기: 윤기가 거의 없는 재질은 겉 막(클리어코트) 끔, 호두 모양 꼭짓점 수 줄임(48×32 → 36×24), 반사 환경은 캔버스마다 한 번만 굽기, 무대에는 반사를 넣지 않음.

### 4-4. 전후 비교와 남은 약점 (직접 본 것)

비교 그림: 샘플 5개 × (첫 화면·조리·완성 접시·엔딩) 전·후 — `tools/content-lab/foodframes.ts`로 같은 규칙으로 고른 프레임.
- 좋아진 것: 나물(짙은 초록 가닥이 소복, 줄기 연두, 참기름 윤기), 반숙 달걀(짙은 접시 위 주황 노른자), 호두(주황 덩어리 → 윤기 나는 호박색 견과 더미), 김치전(가장자리 노릇, 전체가 하얗게 날아가던 팬 화면이 색을 찾음), 파스타(말아 올린 둥지), 김(구슬 → 연기).
- 남은 약점: 호두는 가까이서 보면 아직 '윤기 나는 덩어리'에 가깝다(주름이 작게 보임). 냄비 속 면은 여전히 뻣뻣하다. 달걀 삶는 냄비 장면은 크게 바뀌지 않았다. 3D로 '진짜처럼'은 한계가 있고(연구상 어설픈 사실풍은 오히려 위험), 진짜 질감은 실제 촬영 영상이 답이다.

### 4-5. 사용자 결정이 필요한 것

1. **실제 촬영 영상을 기본으로 할지** (권장): 진짜 음식이 가장 정직하고 연구상 불쾌감도 없다. 연구자 촬영 부담이 든다. 촬영 요령은 §5, 화면 공통 요령에 반영.
2. 무료 실사 사진(Pexels·Pixabay)이나 생성 AI 음식 이미지: 약관상 상업 이용은 되지만 **연구자 요리처럼 보이면 정직성 원칙에 어긋난다**. 쓰려면 '참고 이미지/AI 생성' 표시가 필요(한국 AI 기본법 제31조, Meta AI 정보 표시). 기본값으로 넣지 않았다.
3. 결과 먼저 vs 과정 먼저 오프닝: 근거가 없으니 실제 계정에서 A/B로 3초 이탈률을 비교할 것(experiments.md 방식).

## 5. 연구자 촬영 요령 (실제 촬영 모드용)

진짜 음식이 가장 정직하고(원칙), 연구상으로도 '어설픈 사실풍 CG'의 불쾌감(Diel 2025)이 없다. 실제 촬영 모드(`realFootage.ts`, 촬영 목록 `shotList.ts`)는 이미 있으므로, 기본값으로 할지는 **사용자 결정**이다(연구자 촬영 시간이 든다). 촬영 화면의 공통 요령(`SHOT_TIPS`)에 근거 있는 것만 더했다.

| 요령 | 근거 |
| --- | --- |
| 창가 옆에서, 천장 불은 끄고 (빛이 한쪽에서 오게) | 측광이 질감·윤기를 살림, 섞인 조명은 색이 틀어짐(National Geographic 휴대폰 음식 촬영, 음식 사진 실무 다수) [실무] |
| 화면을 길게 눌러 밝기·초점 고정 | 찍는 중 밝기가 바뀌지 않게, 아이폰은 밝게 찍히는 편(TechRadar, ckbk 가이드) [실무] |
| 흰 음식은 어두운 그릇, 진한 음식은 흰 그릇 | 음식·그릇 대비(Van Ittersum & Wansink 2012, Piqueras-Fiszman 2012), "흰 달걀을 흰 접시에 두면 밋밋함"(Food Bloggers of Canada) [연구+실무] |
| 김이 나는 순간은 뒤쪽이 어두운 곳에서 | 김은 역광 + 어두운 배경에서 보임(음식 사진 실무), 움직이는 김은 먹고 싶은 마음을 올림(Zhang 외 2024) [실무+연구] |

## 출처

조회일은 모두 2026-11-19. 이 작업 환경은 웹 검색은 되지만 다수 학술 사이트 직접 열람(WebFetch)이 막혀 있어(ora.ox.ac.uk, pmc.ncbi.nlm.nih.gov, pexels.com, kenney.nl 등 DNS 차단) **초록·기관 요약·보도로 확인한 것**이 많다. 수치를 인용하기 전에 원문을 확인할 것.

연구
- Spence, Motoki & Petit (2022) Factors influencing the visual deliciousness / eye-appeal of food. *Food Quality and Preference*. https://ora.ox.ac.uk/objects/uuid:dba2e23a-1abd-432e-8c3a-1e8b0bfa0f1e
- Califano & Spence (2024) Assessing the visual appeal of real/AI-generated food images. *FQP* 116:105149. doi:10.1016/j.foodqual.2024.105149 · 요약 https://www.ox.ac.uk/news/2024-03-15-ai-generated-food-images-look-tastier-real-ones
- Zhang, Desebrock, Okajima & Spence (2024) 'Hot stuff': Making food more desirable with animated temperature cues. *FQP* 120:105233. doi:10.1016/j.foodqual.2024.105233 · https://www.psy.ox.ac.uk/publications/1998717 · 학회판 https://proceedings.emac-online.org/pdfs/A2024-119631.pdf
- Ready meals that look hot… (FQP 2024, 같은 연구진) https://ora.ox.ac.uk/objects/uuid:59a8b94b-f2d8-4d6b-a5b6-0381ce04815f
- Diel 외 (2025) Eerie edibles: Realism and food neophobia predict an uncanny valley in AI-generated food images. *Appetite*. 보도 https://www.news-medical.net/news/20250224/AI-generated-food-images-make-some-people-uneasye28094heree28099s-why.aspx · https://petapixel.com/2025/03/27/ai-generated-food-images-can-make-people-feel-uncomfortable
- Diel & Pimpini (2026) AI-generated food stimuli match real counterparts in perceived healthiness… *Scientific Reports*. https://cris.maastrichtuniversity.nl/en/publications/ai-generated-food-stimuli-match-real-counterparts-in-perceived-he/
- Liu, Wu, Yu & Huang (2022) Marketing online food images via color saturation. *J. Business Research* 151:366–378. doi:10.1016/j.jbusres.2022.06.061 · https://news.osu.edu/how-color-in-photos-can-make-food-look-tastier/
- Michel, Velasco, Gatti & Spence (2014) A taste of Kandinsky. *Flavour* 3:7. https://flavourjournal.biomedcentral.com/track/pdf/10.1186/2044-7248-3-7
- Piqueras-Fiszman, Alcaide, Roura & Spence (2012) Is it the plate or is it the food? *FQP*. 요약 https://www.livescience.com/17046-plate-color-flavor-psychology.html · Stewart & Goss (2013) *Flavour* 2:27 https://flavourjournal.biomedcentral.com/track/pdf/10.1186/2044-7248-2-27
- Van Ittersum & Wansink (2012) Plate size and color suggestibility (Delboeuf illusion). *J. Consumer Research*. https://www.eurekalert.org/news-releases/766349
- Toet 외 (2019) Do food cinemagraphs evoke stronger appetitive responses than stills? *Int. J. Food Design*. https://doaj.org/article/5c382a7ddfab468ab8e7d4b26a8335b8
- Food on the Move (2021) 암시된 움직임 재현 실패. *Foods* 10(9):2194. doi:10.3390/foods10092194
- Basso 외 (2018) Taste at first (person) sight. *Appetite* 128:242–254. doi:10.1016/j.appet.2018.06.009 · https://www.pubmed.gov/29906489/
- 광택과 신선도: Glossiness and Perishable Food Quality (PLOS ONE 2013) https://ideas.repec.org/a/plo/pone00/0058994.html · Arce-Lopera 외 (2015) visual palatability https://bibliotecadigital.icesi.edu.co/biblioteca_digital/bitstream/10906/82412/1/arce_visual_palatability_2015.pdf
- 색온도: Lin & Au (2025) *Int. J. Hospitality Mgmt* https://research.polyu.edu.hk/en/publications/painting-the-healthy-food-items-attractive-the-color-effects-on-d/ · Wu & Wang (2015) https://www.jstage.jst.go.jp/article/ijae/14/1/14_19/_article
- Spence (2015) On the psychological impact of food colour. *Flavour* 4:21. https://flavourjournal.biomedcentral.com/track/pdf/10.1186/s13411-015-0031-3
- Spence 외 (2016) Eating with our eyes: From visual hunger to digital satiation. *Brain and Cognition* 110:53–63. https://pubmed.ncbi.nlm.nih.gov/26432045/
- Zellner 외 (2011) Neatness counts. How plating affects liking for the taste of food. *Appetite*. https://researchwith.montclair.edu/en/publications/neatness-counts-how-plating-affects-liking-for-the-taste-of-food/
- Schumann, Petty & Clemons (1990) Repetition-variation hypotheses. *JCR* 17(2):192–202. https://fbaum.unc.edu/teaching/articles/Schuman_1990.pdf
- Dost (2026) jump-cut 빈도와 시청 지속(학회 논문, 예비) https://archives.marketing-trends-congress.com/2026/pages/PDF/paper_professor_DOST_HUANG.pdf
- Pixar 〈라따뚜이〉 음식 셰이딩 회고 https://beforesandafters.com/2020/07/22/retro-renderman-shading-food-for-ratatouille/

공식·표준
- YouTube '진정성 없는 콘텐츠'(2025-07-15) 보도 https://www.plagiarismtoday.com/2025/07/08/youtube-targets-inauthentic-content/ · https://gulfnews.com/technology/youtube-updates-monetisation-policies-ai-and-repetitive-content-ban-begins-july-15-1.500192660
- Instagram 원본 우대 https://www.engadget.com/instagrams-algorithm-overhaul-will-reward-original-content-and-penalize-aggregators-130018977.html
- Meta AI 표시 https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/ · https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/
- 한국 AI 기본법 시행(2026-01-22), 제31조(사전 고지·생성형 결과물 표시·실제와 구분 어려운 결과물 고지) https://mobile.newsis.com/view/NISX20260121_0003484769 · https://shinkim.com/kor/media/newsletter/3142
- Think with Google APAC 음식 광고 영상 https://thinkwithgoogle.com/intl/en-apac/future-of-marketing/creativity/food-advertisement-video-strategy
- Khronos PBR Neutral 톤 매퍼 https://www.khronos.org/news/cn/khronos-pbr-3d · https://modelviewer.dev/examples/tone-mapping
- three.js RoomEnvironment https://threejs.org/docs/pages/RoomEnvironment.html · MeshPhysicalMaterial 비용 https://discourse.threejs.org/t/meshphysicalmaterial-can-i-measure-how-much-more-expensive-it-is/60398
- Remotion GL 옵션(GPU 없으면 swangle) https://www.remotion.dev/docs/gl-options

자원 라이선스
- Kenney Food Kit (CC0) https://kenney.nl/assets/food-kit · https://opengameart.org/content/food-kit
- Quaternius Low Poly Food Pack (CC0) https://opengameart.org/content/low-poly-food-pack
- Poly Haven (CC0) https://polyhaven.com
- Sketchfab CC 라이선스 안내 https://sketchfab.com/blogs/community/an-introduction-to-creative-commons-licenses
- Pexels 이용 규칙 https://help.pexels.com/hc/en-us/articles/360042332714-What-are-the-rules-for-using-Pexels-photos-or-videos · 약관 https://pexels.com/terms-of-service
- Pixabay Content License https://pixabay.com/en/service/license/

실무(근거 약함)
- 반사 하이라이트와 '젖은 듯한' 음식 https://www.picturecorrect.com/food-photography-lighting-specular-highlights-falloff/ · https://strobist.blogspot.com/2016/07/lighting-102-four-zones-four-names.html
- 김(스팀) 촬영: https://expertphotography.com/how-to-photograph-steam · 측광: https://www.ckbk.com/blog/food-photography-with-rupa-part-2-light-it-right
- 음식 스타일링(글리세린·기름 붓질) https://www.lovefood.com/galleries/amp/68705/32-food-stylist-secrets-why-food-looks-great-in-adverts
- 한식 사진 접시 색 대비 https://miso.kr/blog/thread/%EC%9D%8C%EC%8B%9D-%EC%82%AC%EC%A7%84-%EC%A0%91%EC%8B%9C-%EC%83%89-%EA%BF%80%ED%8C%81
- 레시피 영상 구도(45°·위에서·완성 컷) https://www.insta360.com/blog/tips/how-to-shoot-cooking-videos.html · https://animoto.com/blog/video-ideas/tips-tasty-style-recipe-video
- 휴대폰 음식 촬영(창가 측광, 섞인 조명 피하기) https://www.nationalgeographic.com/culture/article/5-tips-for-photographing-food-on-your-phone
