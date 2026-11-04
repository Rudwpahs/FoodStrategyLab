# 오라클 무료 서버에 스튜디오 올리기

> **지금 기본 방법은 [Modal 클라우드](MODAL_SETUP.md)입니다** (가입 → 열쇠 3개 → 버튼 한 번). 이 문서는 Modal을 쓸 수 없을 때의 대안입니다.

컴퓨터 없이 휴대폰만으로 쓰기 위한 설정입니다. 한 번만 하면 됩니다(약 1~2시간, 대부분 기다리는 시간).

- 비용: 오라클 **Always Free** 범위(ARM CPU 2개 · 메모리 12GB · 디스크 200GB)만 쓰면 0원
- 접속: **Tailscale**(무료)로 내 휴대폰·PC에서만 접속. 인터넷에 공개하지 않음
- 확인한 근거: [오라클 Always Free 문서](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm), [무료 등급 FAQ](https://www.oracle.com/cloud/free/faq/) (2026-11-04 확인)

## 1. 오라클 가입 (PC에서)

1. https://www.oracle.com/cloud/free/ → **무료로 시작하기**
2. **홈 지역(Home Region): South Korea Central (Seoul)** 을 고르세요. 문서에 따르면 춘천(South Korea North)에서는 ARM 무료 서버를 만들 수 없게 되어 있습니다.
3. 신용카드(또는 신용카드처럼 쓰는 체크카드)를 등록합니다. 확인용 임시 승인만 있고 실제로 청구되지 않습니다. 선불·일회용 카드는 안 됩니다.
4. 무료 체험(30일, US$300 크레딧)이 끝나도 Always Free 서버는 계속 무료입니다. **유료 서버를 따로 만들지만 않으면** 돈이 나가지 않습니다.

## 2. 서버 만들기

1. 오라클 콘솔 → **Compute → Instances → Create instance**
2. 이름: `matlab-studio`
3. **Image**: Canonical **Ubuntu 24.04**
4. **Shape**: Change shape → **Ampere** → `VM.Standard.A1.Flex` → **OCPU 2, 메모리 12GB** ("Always Free-eligible" 표시 확인)
5. **SSH keys**: "Generate a key pair for me" → **Save private key** (파일을 잘 보관하세요)
6. **Boot volume**: "Specify a custom boot volume size" → **150GB**
7. **Create**

"Out of host capacity" 오류가 나오면 서버가 잠시 부족한 것입니다(문서에 안내된 정상 상황). 몇 시간~며칠 뒤 다시 Create를 누르세요.

## 3. 서버에 접속

서버 화면에 나오는 **Public IP address**를 확인한 뒤, PC의 PowerShell에서:

```
ssh -i 내려받은키파일경로 ubuntu@공용IP주소
```

(처음 물으면 `yes`)

## 4. 설치 (명령 두 줄)

접속한 서버 화면에 아래를 그대로 붙여넣습니다.

```
curl -fsSL https://raw.githubusercontent.com/Rudwpahs/FoodStrategyLab/main/deploy/oracle/install.sh -o install.sh
bash install.sh
```

설치 중 두 번 입력할 것이 있습니다.

1. **비밀번호** (스튜디오 로그인용, 10자 이상, 두 번): 화면에 글자가 안 보이는 게 정상입니다.
2. **Tailscale 로그인 주소**: 화면에 나오는 `https://login.tailscale.com/...` 주소를 휴대폰이나 PC 브라우저로 열어 로그인하면 서버가 연결됩니다. (Tailscale 계정이 없으면 구글 계정 등으로 바로 만들 수 있어요)

설치가 끝나면 **스튜디오 주소**(예: `https://matlab-studio.xxxx.ts.net`)가 나옵니다. 적어 두세요.

> 주소 대신 "Enable HTTPS" 안내가 나오면: https://login.tailscale.com/admin/dns 에서 **Enable HTTPS**를 누른 뒤 서버에서 `sudo tailscale serve --bg 5178` 을 실행하세요.

**꼭 한 번 해 주세요 (6개월 뒤 끊김 방지)**: https://login.tailscale.com/admin/machines 에서 `matlab-studio` 오른쪽 `…` → **Disable key expiry**. Tailscale은 기본적으로 180일마다 기기 로그인을 다시 하게 되어 있어, 이걸 끄지 않으면 6개월 뒤 서버가 연결에서 빠집니다.

맛조수 목소리는 설치 뒤 **백그라운드에서 20~60분** 동안 자동으로 준비됩니다(모델 내려받기 + 목소리 만들기). 그동안에도 스튜디오는 쓸 수 있고, 영상 만들기만 목소리가 준비된 뒤에 하세요. 확인: `journalctl -u matlab-voice-setup -f` 에 "목소리 준비 끝"이 나오면 완료.

## 5. 휴대폰

1. **Tailscale 앱** 설치 → 위와 **같은 계정**으로 로그인 → 연결(ON)
2. **맛 연구소 앱(APK)** 설치 → 처음 화면에 스튜디오 주소 입력 → 로그인
   (앱 없이도 크롬에서 주소를 열고 "홈 화면에 추가"로 쓸 수 있어요)

## 6. 평소 관리 (거의 할 일 없음)

| 상황 | 자동으로 되는 것 | 직접 할 일 |
| --- | --- | --- |
| 서버 재시작·정전 | 스튜디오·목소리 엔진 자동 시작 | 없음 |
| 프로그램이 멈춤 | 자동 재시작 (5~10초 뒤) | 없음 |
| 데이터 보관 | 매일 04:30 백업, 7일치 보관 (`/opt/matlab/backups`) | 없음 |
| 새 기능 받기 | — | 서버에서 `matlab-update` |
| 비밀번호 잊음 | — | 서버에서 `matlab-user heejae --reset` |
| 가족 계정 추가 | — | 서버에서 `matlab-user 아이디 이름` |

### 알아 둘 점

- **속도**: CPU 2개짜리 무료 서버라 영상 한 편에 **목소리 약 20분 + 렌더 약 1시간**이 걸릴 것으로 예상합니다(직접 재 보지 않은 추정). "영상 만들기"를 누르고 앱을 닫아도 서버에서 계속 만들어집니다. 진행 중에는 "취소"로 멈출 수 있습니다.
- **오라클 회수 규칙**: 7일 동안 CPU·네트워크·메모리 사용률이 **모두** 20% 미만이면 오라클이 무료 서버를 회수할 수 있다고 문서에 적혀 있습니다. 목소리 엔진이 켜져 있으면 메모리를 쓰고 있어 해당하지 않을 가능성이 크지만 보장되지는 않습니다. 회수되면 서버를 다시 만들고 설치를 다시 실행한 뒤, 백업 파일(`/opt/matlab/backups`)을 옮겨 복구합니다. 중요한 영상·원고는 휴대폰에도 내려받아 두세요.
- **계정 방치**: 오라클 계정에 30일 넘게 로그인하지 않으면 정지될 수 있다고 FAQ에 적혀 있습니다. 한 달에 한 번 오라클 콘솔에 로그인해 주세요.
- **확인하지 못한 것**: ARM 서버에서 목소리 엔진(VoxCPM2)이 실제로 설치·실행되는지는 이 작업 환경에서 시험할 수 없었습니다. 설치 스크립트는 목소리 엔진 설치가 실패해도 스튜디오는 켜지게(자막만으로 영상 제작) 되어 있고, 실패하면 화면에 알려 줍니다. 그때 `~/matlab-install.log` 파일을 보내 주세요.
