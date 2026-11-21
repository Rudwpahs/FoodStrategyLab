# 3D 음식을 '확실한 만화풍'으로: 조사·결정·결과 (2026-11-21)

사용자 지적: "3D 음식이 실제 요리처럼 보이지 않고 자연스럽지 않다." 앞선 조사(`food-realism-2026-11.md`)에서 '조금 어색한 사실풍'이 가장 거부감이 크고, 확실한 만화풍이나 진짜는 괜찮다는 연구를 찾았다. 사용자는 실제 음식을 찍을 수 없어 **3D 음식을 반쯤 사실적인 것이 아니라 확실한 만화풍으로** 가기로 정했다. 이 문서는 그 방향을 어떻게 구현할지에 대한 조사(약 30분)와 결정, 결과다.

출처 표시: **[연구]** 동료 심사 논문, **[공식]** 제작사·도구 공식 문서, **[실무]** 업계 가이드·튜토리얼·인터뷰(근거 약함), **[관찰]** 이 저장소의 실제 프레임. 이번 조사 환경에서는 웹 페이지 본문을 직접 열 수 없는 곳이 많아(80.lv, medium.com, news-medical.net 등) **검색 결과 요약으로만 확인한 출처는 (요약만)** 이라고 적었다.

## 1. 조사: 만화풍 음식이 맛있어 보이는 조건

| # | 내용 | 출처 | 수준 |
| --- | --- | --- | --- |
| T1 | **어설픈 사실풍이 가장 불쾌, 확실한 만화풍·진짜는 괜찮다.** 95명, 이미지 38장(진짜·왜곡된 AI·만화풍 AI·상한 음식). 골짜기 효과는 사실풍을 노렸지만 어긋난 이미지에만 나타났다. 낯선 음식을 꺼리는 사람일수록 더 불쾌 | Diel 외 2025 "Eerie edibles", *Appetite* (보도: PetaPixel 2025-03-27, News-Medical 2025-02-24) | [연구] 1편, 표본 작음, 보도로만 확인 |
| T2 | 시각적 맛의 요인: **대칭·모양·신선함·광택(윤기)·움직임 표현**, 배경·조명 색 | Spence, Motoki & Petit 2022, *Food Quality and Preference* 102:104672 (리뷰) | [연구] |
| T3 | **움직이는 김**은 뜨거움·먹고 싶음·신선함을 올리고, **정지한 김은 효과 없음**. 원래 덜 맛있어 보이는 사진일수록 효과가 컸다 | Zhang, Desebrock, Okajima & Spence 2024, *FQP* 120:105233 | [연구] |
| T4 | 픽사 〈라따뚜이〉: 음식을 영화의 양식화된 세계 안에 두되 **알아볼 수 있고 먹음직스럽게**. 모양은 양식화해도 표면 반응(하이라이트·반투명)은 살린다. 〈메이의 새빨간 비밀〉 인터뷰도 "모양은 양식화, 셰이딩 반응은 실감" | befores & afters 2020-07-22, Pixar SIGGRAPH 2007 강좌 "Anyone Can Cook" | [공식·실무] |
| T5 | 애니 음식 그리기: **실제보다 채도 높은 색**, 윤기가 두 번째로 중요한 요인, 하이라이트는 **순백이 아닌 옅은 노랑** 계열, 모든 음식이 반짝이지는 않는다(재질대로) | CLIP STUDIO TIPS "How to Draw Mouth-Watering Anime Food" 외 같은 사이트 튜토리얼 여러 편 | [실무] (요약만) |
| T6 | 지브리 음식: 공식 답은 "미야자키가 직접 요리해 본다"(관찰·참고). 기법 설명은 '과장'(애니메이션 12원칙) 정도이고 근거가 얇다 | Kotaku·Nerdist 2021 보도(스즈키 도시오 트윗) | [실무, 약함] |
| T7 | 음식 일러스트: 사실을 그대로 베끼지 말 것, **시럽에 밝은 하이라이트**, **납작한 한 가지 갈색을 피할 것**, 따뜻한 색(노랑·주황·빨강), 배경과 대비 | Creative Bloq "6 food illustration tips", Escape Motions(Nicoli), Skillshare(Sell) | [실무] (요약만) |
| T8 | 만화풍 음식의 '먹음직함'은 반짝이는 표면(시럽·젤리 같은 광택)에서 오고, 색 있는 음식의 그늘을 **짙은 회색·검정으로 칠하지 말 것** | budgetpixel 블로그(팝아트 음식) | [실무, 약함] |
| T9 | 셀 스타일: 그라데이션 대신 단계, 짙은 물체의 하이라이트는 순백을 피함 | Highrise(Pocketworld) 아트 가이드 | [실무] (다른 게임, 비유) |
| T10 | 오버쿡드: "밝고 단단한 그림이 멀리서도 잘 읽히게", '통통한(chunky) 그림' | Cane and Rinse 인터뷰(Ghost Town Games), PC Gamer 회고 | [실무] (요약만) |
| T11 | 동물의 숲 요리(2021-11 2.0 업데이트): 사실적이지 않지만 '부드럽게 렌더된' 그림이 매력 | Kotaku 2021 | [실무, 약함] |
| T12 | 일관성이 디테일보다 중요: 모든 자원이 한 세계에 속해 보여야 완성도 있어 보인다 | Unity 블로그 "Finding a visual style for your game" | [실무] |
| T13 | three.js 만화 음영: `MeshToonMaterial` + 작은 그라디언트 맵(가까운 값 필터면 칼같은 단계). 외곽선은 **뒤집은 껍데기**(같은 모양을 부풀려 뒷면만 검게) 또는 화면 후처리(윤곽 검출). 껍데기 방식은 싸고 튼튼, 후처리는 정밀하지만 화면 전체 계산 | three.js 공식 문서(MeshToonMaterial·OutlineEffect), three.js 포럼 | [공식·실무] |
| T14 | three.js `OutlineEffect`는 인스턴스 메시(같은 모양 여러 개 한 번에 그리기)에 안 맞는다는 포럼 보고 | three.js 포럼 | [실무] → 직접 만든 껍데기 셰이더로 해결 |

### 근거가 갈리거나 없는 것
- **선명한 색**: 애니·일러스트 실무는 "실제보다 채도 높게"(T5·T7), 연구는 채도↑ → 신선·맛 기대↑이지만 **너무 높으면 인공적**(이전 조사 E3, Liu 외 2022). → 채도를 조금만(+18%) 올린다.
- **외곽선을 넣을지**: 애니 음식(특히 사실적인 쪽, 예: 식극의 소마)은 선을 빼고 그라데이션을 쓰기도 하고(CLIP STUDIO 비교), 캐주얼 게임은 굵은 선을 쓰기도 한다. 효과를 잰 연구는 찾지 못했다. → 우리 맛조수는 선이 없는 매끈한 장난감 같은 입체라, **검정 굵은 선 대신 음식 색의 짙은 톤으로 가는 선**을 택했다(선택지: 선 없음 / 짙은 톤 가는 선 / 검정 굵은 선).
- **칼같은 셀 음영 vs 부드러운 장난감 음영**: 둘 다 '확실한 만화풍'(T1)이다. 맛조수와 한 세계로 보이려면(T12) 칼같은 2단보다 **경계가 아주 조금 부드러운 3단**이 맞다고 판단(주관 판단, 연구 없음).
- **번쩍임(별 모양 반짝이) 효과**: 요리 게임·애니에 흔하지만 근거를 찾지 못했고 과하면 유치해 보여 넣지 않음.

## 2. 결정 (한 가지 스타일: '말랑한 장난감 같은 만화 음식')

| 결정 | 근거 | 구현 (packages/video/src/three) |
| --- | --- | --- |
| 반사 환경·겉 막(클리어코트) 같은 **사실풍 재질을 버리고 단계 음영 재질**로 | T1(어설픈 사실풍 회피), T13 | `toon.ts` `toonMaterial`: `MeshToonMaterial` + 3단 음영표(`toonRamp`, 경계 폭 2.5%) |
| **반짝이는 점(하이라이트)**을 칼같이, 화면 기준 왼쪽 위에서. 순백 대신 옅은 크림색. 윤기 있는 음식만(시럽 호두·노른자·양념·전의 기름) | T2·T4·T5·T7·T9 | 셰이더에 몇 줄 추가(반사 환경 계산 없음). 장면 조명 위치와 상관없이 늘 보이게 |
| 그늘에도 음식 자기 색을 조금 더함 (회색으로 죽지 않게) | T8 | 같은 셰이더 |
| 테두리를 따라 아주 약한 밝은 띠 | 윤곽을 또렷하게(T10) | 같은 셰이더 |
| **외곽선**: 음식 색의 짙은 톤, 가늘게. 작은 조각은 크기에 비례해 더 가늘게, 멀리서는 자연히 가늘어짐. 얇은 판(잎)에는 안 씀 | T10·T13·T14, 위 '갈리는 것' | `inkMaterial`(뒤집은 껍데기, 인스턴스 메시도 지원), `inkColor` |
| 색을 조금 선명하게(+18%), 색상·밝기는 그대로 | T5·T7, E3 경고 | `vivid` |
| **모양 단순화**: 잔무늬를 빼고 큰 모양만 | T1·T10 | 전: 잔 얼룩 → 큰 노릇한 얼룩 몇 개 + 바삭한 갈색 테두리 띠(경계 또렷), 잔물결 → 큰 물결. 호두: 뇌 모양 잔주름 → 굵은 주름 서너 줄 + 2단 그늘(꼭짓점 36×24 → 28×18). 나물: 잎맥 무늬 빼고 줄기 연두만. 면: 가는 가닥 34개 → 조금 굵은 22개, 냄비 속 면은 꺾인 막대 → 빙글 도는 곡선 |
| 노릇함은 탁한 갈색이 아니라 **따뜻한 황금빛**, 시럽 견과는 호박색 | T7 | `cookedTone` |
| **만화식 김**(S자 흰 선)이 올라가며 흔들리고 흐려진다. **뜨거운 음식에만** | T3(움직이는 김만 효과), 레시피 충실(원칙 1) | `steamTexture`·`Steam`, 뜨거운지는 recipe-core `servedHot`(아래) |
| 작은 움직임: 팬 가장자리 **지글지글 기름 방울**, 반숙 노른자 살짝 출렁, 삶는 달걀 들썩 | T2(움직임), 이전 조사 E5 | `Bubbles`(ring), `Eggs` |
| 물·국물: 평평한 색 + 만화식 흰 반사 자국 둘 | T5(재질대로 윤기) | `Broth` |
| 팬·냄비·그릇·재료 소품도 같은 재질 | T12(한 세계) | `Pan`·`Pot`·`Plate`·`Bowl`·`IngredientModel` |
| 화면 전체 후처리(윤곽 검출·블룸)는 **넣지 않음** | 비용: 1080×1920 전체를 다시 계산(이전 조사에서 BokehPass 후처리가 렌더 2.5~3배) | — |

### 김은 뜨거운 음식에만 (레시피 충실)
예전에는 완성 접시마다 김을 올려, 찬물에 헹군 시금치나물·얼음물에 식힌 반숙 달걀·식혀 먹는 호두정과에도 김이 났다. 원본 조리와 다른 장면이다. recipe-core `servedHot`이 정한다:
- 요리 이름이 찬 요리(나물·무침·정과·강정·샐러드·냉면 등)면 김 없음
- **마지막 두 단계**에 식히는 말(얼음물·찬물·식혀·냉장 등)이 있으면 김 없음. '식힘망'은 눅눅해지지 않게 올려 두는 것이라 뜨거운 음식으로 본다. 중간 준비 단계(파스타 소스 '식혀서 냉동보관')는 보지 않는다
- 그 밖에는 종류로: 나물은 차게, 나머지는 뜨겁게
- 결과: 김치전·들깨고사리파스타 = 김 있음 / 시금치나물·반숙 달걀·호두정과 = 없음. 조리 중(불 위)에는 모두 김.

### 지킨 것
- 음식 색·조각은 여전히 recipe-core `foodProfile`이 원본 재료로 정한다. 원본에 없는 고명을 새로 그리지 않았다(깨는 원본에 깨가 있을 때만).
- 캔버스(WebGL)는 하나 그대로. 화면 전체 후처리 없음.
- 맛조수(`Chef3D.tsx`)·무대(`Sets.tsx`)는 바꾸지 않았다.

## 3. 결과

전후 비교 그림(같은 프레임, 샘플 5개 × 첫 화면·조리·완성 접시·엔딩): 작업 보고에 첨부(`before.png`·`after.png`·`compare.png`). `tools/content-lab/foodframes.ts`로 그렸다.

### 렌더 시간
측정: `tools/content-lab/rendertime.ts`(샘플 대본의 정해진 60프레임을 실제 영상으로, 준비 렌더 1번 버리고 2번째를 잼), 소프트웨어 WebGL(`REMOTION_GL=swangle`, 배포 서버와 같은 방식), CPU 4개. 같은 머신에서 다른 작업이 함께 돌아(부하 약 4) **예전·새 코드를 번갈아** 쟀다. 예전 코드는 저장소 안 임시 폴더에 꺼내 같은 도구로 그렸다.

| 구간 | 예전 | 새 만화풍 | 변화 |
| --- | --- | --- | --- |
| 김치전 562~621 (팬에서 부치는 조리) | 104.1초 · 107.0초 (평균 105.6) | 84.2초 · 91.3초 (평균 87.8) | **약 −17%** |
| 호두정과 577~636 (완성 접시·엔딩) | 103.9초 · 111.8초 (평균 107.9) | 84.9초 · 85.9초 (평균 85.4) | **약 −21%** |
| 들깨고사리파스타 337~396 (냄비 속 면) | 153.7초 | 91.2초 | **약 −41%** (1회만: 2회째는 디스크가 차서 기록이 사라짐) |
| (참고) 정지 화면 19장 평균, `foodframes.ts` | 7.9초/장 | 5.3초/장 | 약 −33% (브라우저 준비 시간 포함) |

- 줄어든 이유: 화소마다 반사 환경·겉 막을 계산하던 사실풍 재질 대신 단계 음영 재질(계산이 훨씬 적음), 면 가닥 34개를 따로 그리던 것을 하나로 합침(그리기 호출 34번 → 1번), 반사 환경을 캔버스마다 굽던 준비 단계 삭제.
- 늘어난 것: 외곽선 껍데기(부피 있는 음식 모양을 한 번 더 그림). 정점 계산만 늘고 화소 계산은 가벼워 전체로는 위처럼 줄었다.
- 측정 뒤에 색·주름 깊이·물 색만 조금 더 고쳤다(모양 수·재질 종류는 같음).

### 요리별 솔직한 평가 (직접 본 것)
| 요리 | 좋아진 것 | 아직 어색한 것 |
| --- | --- | --- |
| 바삭한 김치전 | 연한 반죽 원판 → 노릇한 얼룩 + 바삭한 갈색 테두리 + 외곽선, 확실한 만화 전. 접시 위에 김 | 팬 장면에서 불빛 때문에 가운데가 노랗게 빛나 '조명'처럼 보인다. 접시 위 김치 조각이 낮은 각도에서 가는 빨간 줄로 보인다. 전체적으로 오렌지 오믈렛처럼 보일 수 있다 |
| 시금치나물 | 줄기 연두·잎 초록 두 톤, 김 없음(찬 나물) | 잎은 얇은 판이라 외곽선이 없어 예전과 차이가 가장 작다 |
| 반숙 달걀 | 냄비 물이 파랗게, 껍질은 갈색 달걀, 외곽선. 접시의 반숙 노른자가 또렷하고 살짝 출렁. 김 없음(얼음물에 식힘) | 냄비 장면은 여전히 밋밋하다(달걀 세 개뿐) |
| 호두정과 | 갈색 덩어리 → 굵은 주름의 호박색 호두 + 시럽 하이라이트 + 외곽선. 가장 크게 좋아짐. 김 없음(정과) | 가까이서는 '반짝이는 젤리 과자'처럼도 보인다. 외곽선이 조금 굵게 느껴질 수 있다 |
| 들깨고사리파스타 | 냄비 속 면이 감자튀김 같던 막대 → 빙글 도는 면 가닥 | 완성 접시는 이 대본에서 비교 화면(작게)으로만 나와 차이가 작다. 크림 소스와 면 색이 비슷해 대비가 낮다 |

- 맛조수는 선이 없는 매끈한 입체라, 음식(외곽선 있음)과 나란히 나오면 아주 조금 다른 그림처럼 보일 수 있다. 맛조수에도 같은 외곽선을 넣을지는 **사용자 결정**(이번에는 맛조수·무대는 바꾸지 않았다).
- 3D로 '진짜 같은 맛'은 여전히 한계다. 진짜 질감이 필요하면 연구자 촬영 영상(실제 촬영 모드)이 답이다(`food-realism-2026-11.md`).

## 4. 출처 (확인 날짜 2026-11-21)
- Diel, A. 외 (2025). Eerie edibles: Realism and food neophobia predict an uncanny valley in AI-generated food images. *Appetite*. 보도: https://petapixel.com/2025/03/27/ai-generated-food-images-can-make-people-feel-uncomfortable (2025-03-27), https://www.news-medical.net/news/20250224/AI-generated-food-images-make-some-people-uneasye28094heree28099s-why.aspx (2025-02-24)
- Spence, C., Motoki, K., & Petit, O. (2022). Factors influencing the visual deliciousness / eye-appeal of food. *Food Quality and Preference* 102:104672. https://ora.ox.ac.uk/objects/uuid:dba2e23a-1abd-432e-8c3a-1e8b0bfa0f1e
- Zhang, T., Desebrock, C., Okajima, K., & Spence, C. (2024). 'Hot stuff': Making food more desirable with animated temperature cues. *Food Quality and Preference* 120:105233. https://www.psy.ox.ac.uk/publications/1998717
- befores & afters (2020-07-22). Retro RenderMan: shading food for Ratatouille. https://beforesandafters.com/2020/07/22/retro-renderman-shading-food-for-ratatouille/ · Pixar "Anyone Can Cook" (SIGGRAPH 2007). https://graphics.pixar.com/library/AnyoneCanCook
- CLIP STUDIO TIPS, How to Draw Mouth-Watering Anime Food. https://tips.clip-studio.com/de-de/articles/3745 (요약만)
- Creative Bloq, 6 food illustration tips from the experts. https://www.creativebloq.com/advice/6-food-illustration-tips-from-the-experts · Escape Motions, food illustration tips from Gloria Vanessa Nicoli. https://www.escapemotions.com/blog/food-illustration-tips-from-gloria-vanessa-nicoli (요약만)
- budgetpixel, How to Create Hyper-Vibrant Pop-Art Food. https://budgetpixel.com/blog/how-to-create-hyper-vibrant-pop-art-food-glossy-boba-bouncing-desserts-and-sticker-aesthetics (요약만, 약함)
- Pocketworld Highrise 아트 가이드(material). https://github.com/pocketzworld/creator-docs/blob/main/pages/learn/designer-resources/artguides/material.md (요약만)
- Cane and Rinse, Ghost Town Games 인터뷰. https://caneandrinse.com/ghost-town-games/ · PC Gamer, How Overcooked's tiny team took over our living rooms. https://pcgamer.com/how-overcookeds-tiny-team-took-over-our-living-rooms (요약만)
- Kotaku (2021), Animal Crossing's new update is full of picture-perfect food. https://kotaku.com/animal-crossings-new-update-is-full-of-picture-perfect-1847997220 (요약만)
- Kotaku (2021), Why Studio Ghibli's anime food always looks so delicious. https://kotaku.com/why-studio-ghiblis-anime-food-always-looks-so-delicious-1846617793 (요약만)
- Unity 블로그, Finding a visual style for your game. https://unity.com/blog/game-art-styles-guide (요약만)
- three.js 문서: MeshToonMaterial https://threejs.org/docs/pages/MeshToonMaterial.html , OutlineEffect https://threejs.org/docs/pages/OutlineEffect.html · three.js 포럼(OutlineEffect와 인스턴스 메시) https://discourse.threejs.org/t/outlineeffect-on-instances-of-instancedmesh/66175
