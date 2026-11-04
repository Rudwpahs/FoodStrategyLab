# 인스타그램 공식 게시 연결

스튜디오의 [게시] 단계에서 승인된 릴스를 **버튼 한 번(+확인)**으로 어머니 인스타그램에 올리기 위한 설정입니다. Meta의 공식 방식(Instagram API with Instagram Login)만 씁니다. 비공식 자동화는 쓰지 않습니다.

- 근거: Meta 공식 문서 (2026-11-04 확인) — [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login), [Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing), [Meta 앱 만들기](https://developers.facebook.com/docs/instagram-platform/create-an-instagram-app)
- 비용: 없음 (Meta API는 무료). 계정당 24시간에 100건까지 게시 가능.
- 먼저 [Modal 배포](MODAL_SETUP.md)가 끝나 **스튜디오 주소**(`https://…modal.run`)가 있어야 합니다. Meta가 그 주소에서 영상을 내려받습니다.

## 1. 어머니 인스타그램을 프로페셔널 계정으로 (휴대폰 인스타그램 앱)

설정 → 계정 유형 및 도구 → **프로페셔널 계정으로 전환** → 크리에이터 또는 비즈니스. 계정은 **공개**여야 합니다.

## 2. Meta 개발자 앱 만들기 (PC 권장)

1. https://developers.facebook.com → 로그인 → **내 앱 → 앱 만들기**
2. 사용 사례에서 **Instagram**(메시지·댓글 관리, 콘텐츠 게시…)을 고르고, 앱 유형은 **비즈니스**
3. 앱 이름(예: 맛 연구소 스튜디오), 연락 이메일 입력 → 만들기
4. 앱 대시보드에서 **Instagram** 제품 추가 → **API setup with Instagram login**

## 3. 스튜디오 주소 등록과 앱 정보 복사

**Instagram → API setup with Instagram login → 3. Set up Instagram business login → Business login settings**

1. **OAuth redirect URIs**에 아래 주소를 그대로 넣고 저장 (스튜디오 [게시] 화면에도 나옵니다):
   ```
   https://(스튜디오 주소)/api/instagram/callback
   ```
   끝에 `/`가 자동으로 붙으면 지우고 저장하세요. 한 글자라도 다르면 연결이 거절됩니다.
2. 같은 화면의 **Instagram App ID**와 **Instagram app secret**을 복사해 둡니다(페이스북 앱 ID와 다른 값입니다).

## 4. 어머니 계정을 앱에 추가 (테스터)

**App roles → Roles**(또는 Instagram → API setup with Instagram login의 계정 추가)에서 어머니 인스타그램 계정을 추가하고, 어머니 계정으로 로그인해 초대를 수락합니다.

> 앱 심사(App Review): Meta 문서는 "실제 데이터에 접근하려면 앱 심사가 필요하다"고 안내합니다. 앱에 역할(테스터)로 추가한 본인 계정만 쓰는 경우 심사 없이 게시되는지는 **실제로 확인하지 못했습니다.** 연결이나 게시가 권한 오류로 막히면 앱 대시보드의 **App Review**에서 `instagram_business_basic`, `instagram_business_content_publish` 심사를 요청해야 합니다.

## 5. 앱 정보를 서버에 넣기

GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 |
| --- | --- |
| `INSTAGRAM_APP_ID` | Instagram App ID |
| `INSTAGRAM_APP_SECRET` | Instagram app secret |

그다음 **Actions → Deploy to Modal → Run workflow**로 다시 배포합니다(몇 분).
이 값은 채팅·메모에 붙여넣지 마세요. 서버는 앱 비밀값으로 토큰을 암호화해 저장합니다.

## 6. 스튜디오에서 연결

1. 스튜디오 → 콘텐츠 → [게시] → 인스타그램 릴스 → **인스타그램 계정 연결**
2. 인스타그램 로그인 화면에서 어머니 계정으로 로그인 → **콘텐츠 게시 허용**
3. "인스타그램 연결 완료" 화면이 나오면 스튜디오로 돌아와 **연결 확인**
4. 연결은 60일 동안 유지되고, 그 안에 스튜디오를 열면 자동으로 다시 60일 연장됩니다. 60일 넘게 쓰지 않으면 다시 연결하세요.

## 7. 올리기

승인된 최신 대본으로 만든 영상만 올릴 수 있습니다.

1. 설명 글(자동으로 채워짐)을 확인·수정 → **인스타그램에 올리기** → 확인 창에서 **확인**
2. 진행: 영상 보내는 중 → 인스타그램이 처리하는 중(보통 1~3분) → 게시 완료
3. 완료되면 게시 이력에 릴스 주소가 자동으로 기록됩니다. 성과 숫자는 하루 이틀 뒤 직접 적어 주세요.

안전장치:
- 같은 콘텐츠를 이미 올렸으면 한 번 더 확인해야 다시 올라갑니다.
- 게시 단계는 자동으로 다시 시도하지 않습니다(두 번 올라가는 것 방지). "처리가 오래 걸려요"가 나오면 인스타그램 앱에서 먼저 확인하세요.
- Meta가 영상을 내려받는 주소는 추측할 수 없는 임시 주소이며, 게시가 끝나거나 2시간이 지나면 닫힙니다.

## 문제가 생기면

| 메시지 | 할 일 |
| --- | --- |
| 설정 전 | 5단계(앱 정보 넣고 다시 배포) |
| 연결 요청이 만료됐어요 | 스튜디오에서 다시 "인스타그램 계정 연결" (10분 안에 로그인 마치기) |
| redirect_uri 관련 오류 | 3단계 주소가 스튜디오 [게시] 화면의 주소와 똑같은지 확인 |
| 인스타그램 연결이 끊겼어요 | 다시 연결 (비밀번호 변경·권한 해제·60일 경과 등) |
| 영상을 처리하지 못했어요 (ERROR) | 영상을 다시 만들어 보고, 계속되면 오류 문구를 Claude/Codex에게 보여 주기 |
| 권한(permission) 오류 | 4단계 테스터 수락 확인, 필요하면 앱 심사 |
