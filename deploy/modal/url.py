"""배포된 스튜디오의 공개 주소를 출력한다 (GitHub Actions에서 사용)."""

import modal

web = modal.Function.from_name("matlab-studio", "web")
web.hydrate()
print(web.get_web_url())
