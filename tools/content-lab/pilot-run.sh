#!/bin/bash
# 앞선 파스타 렌더가 끝나길 기다린 뒤 파일럿 3편을 차례로 만든다
cd /home/user/FoodStrategyLab
while pgrep -f "[v]oiced.ts full" >/dev/null; do sleep 30; done
REMOTION_GL=swangle REMOTION_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell npx tsx tools/content-lab/pilot.ts "$@"
