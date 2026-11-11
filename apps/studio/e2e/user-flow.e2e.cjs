const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
// 최종 사용자 흐름 점검 (휴대폰 폭 390px, 호두정과 파일럿 C 영상 사용). CI에는 넣지 않는다 (브라우저·서버 필요).
// 0) Playwright 준비 (한 번): npm i --no-save playwright && npx playwright install chromium
// 1) 빈 데이터로 서버: MATLAB_DATA_DIR=$PWD/tmp/e2e-flow PORT=5190 TTS_PROVIDER=none npm run dev
// 2) node apps/studio/e2e/user-flow.e2e.cjs   (out/pilot/C-experiment.mp4 필요 — tools/content-lab/pilot.ts)
const base = process.env.STUDIO_URL ?? 'http://127.0.0.1:5190';
const repoRoot = path.resolve(__dirname, '../../..');
const log = (...a) => console.log(...a);
(async () => {
  const meta = await (await fetch(`${base}/api/meta`)).json();
  const walnut = meta.samples.find((s) => s.dishName === '호두정과');
  const recipe = { ...walnut, commonMistake: '호두를 데치지 않고 바로 조리면 떫은맛이 남을 수 있어요.' };
  const { id } = await (await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipe }) })).json();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  p.on('dialog', (d) => d.accept());
  // 휴대폰에서 화면이 옆으로 밀리지 않는지 (가로 넘침)
  const overflow = async (where) => {
    const w = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    log(`가로 넘침 [${where}]`, w > 0 ? `${w}px ✕` : '없음 ✓');
  };
  const go = async (step) => { await p.goto(`${base}/#/p/${id}/${step}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500); await overflow(step); };

  // 2~4. 후보 → 다른 후보 → 처음 후보로 → C로 만들기
  await go('script');
  // 후보마다 '첫 대사' (같은 연출이면 제목이 같을 수 있어 첫 대사로 비교)
  const titles = () => p.locator('.candidate').evaluateAll((els) => els.map((e) => e.querySelectorAll('.small')[0]?.textContent ?? ''));
  log('후보', JSON.stringify(await titles()));
  await p.getByText('다른 후보 보기').click();
  await p.waitForTimeout(3500);
  log('다른 후보', JSON.stringify(await titles()));
  await p.screenshot({ path: 'f2-more.png' });
  await p.getByText('처음 후보로').click();
  await p.waitForTimeout(3500);
  await p.locator('button', { hasText: '이 영상으로 만들기' }).nth(2).click();
  await p.waitForSelector('text=영상을 만들기 시작했어요', { timeout: 15000 });
  const chosen = await (await fetch(`${base}/api/projects/${id}`)).json();
  log('선택 후 첫 대사', chosen.latest.script.scenes[0].line);

  // 5. 검수용 영상: 시작된 렌더는 취소하고(30분 렌더 대신) 이미 만든 파일럿 C 영상을 연결
  await p.waitForSelector('button:has-text("취소")', { timeout: 15000 });
  await p.locator('button', { hasText: '취소' }).first().click();
  await p.waitForTimeout(2000);
  log(execSync(`MATLAB_DATA_DIR=${repoRoot}/tmp/e2e-flow npx tsx tools/content-lab/seed-pilot-render.ts ${id} out/pilot/C-experiment.mp4 out/pilot/C-experiment-first.png 2>/dev/null`, { cwd: repoRoot }).toString().trim());
  await go('video');
  log('영상 단계 배지', await p.locator('.badge.review').allInnerTexts());
  // 6. 블로그 후보 2개 중 첫 번째 선택
  await p.locator('button', { hasText: '이 원고 고르기' }).first().click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'f3-video-blog.png', fullPage: true });

  // 승인 전 ZIP·게시 기록은 막힘
  const proj = await (await fetch(`${base}/api/projects/${id}`)).json();
  const rid = proj.renders[0].id;
  log('승인 전 ZIP', (await fetch(`${base}/api/renders/${rid}/download`)).status);

  // 7. 검수·승인
  await go('review');
  await p.screenshot({ path: 'f4-review.png' });
  for (const box of await p.locator('label.check input').all()) await box.check();
  await p.locator('button.primary', { hasText: '승인' }).click();
  await p.waitForTimeout(2500);
  log('승인 후 ZIP', (await fetch(`${base}/api/renders/${rid}/download`)).status);

  // 8~10. 게시·기록
  await go('publish');
  const ig = p.locator('input[placeholder^="https://www.instagram.com"]');
  await ig.fill('https://www.instagram.com/reel/TEST123');
  await p.locator('button', { hasText: '게시 기록' }).first().click();
  await p.waitForTimeout(1500);
  // 네이버: 답변 대기 칸이 있으면 발행 기록이 막힌다
  await p.locator('input[placeholder^="https://blog.naver.com"]').fill('https://blog.naver.com/matlab/223000000001');
  await p.locator('button', { hasText: '발행 기록' }).click();
  await p.waitForTimeout(1500);
  log('답변 전 네이버 기록 수', (await (await fetch(`${base}/api/projects/${id}`)).json()).publications.filter((x) => x.platform === 'naver').length);
  // 연구자 답변 입력(테스트용 문구) + 본인 확인
  const answers = p.locator('textarea[placeholder="연구자가 직접 말하거나 적은 내용 그대로"]');
  for (let i = 0; i < 3; i++) await answers.nth(i).fill(`[검증용 답변 ${i + 1}] 실제 운영에서는 이희재 연구자의 답이 들어갑니다.`);
  await p.locator('label', { hasText: '연구자 본인이 위 답변을 읽고 확인했습니다' }).locator('input').check();
  await p.locator('input[placeholder="확인한 연구자 이름"]').fill('이희재');
  await p.locator('button', { hasText: '저장' }).filter({ hasNotText: '성과' }).first().click();
  await p.waitForTimeout(2000);
  await p.locator('input[placeholder^="https://blog.naver.com"]').fill('https://blog.naver.com/matlab/223000000001');
  await p.locator('button', { hasText: '발행 기록' }).click();
  await p.waitForTimeout(1500);
  const metric = (label, v) => p.locator('label.field', { hasText: label }).locator('input').first().fill(v);
  await metric('도달 계정', '1200');
  await metric('건너뛰기 비율', '38');
  await metric('평균 시청', '14');
  await metric('저장', '25');
  await metric('보내기', '9');
  await p.locator('button', { hasText: '성과 저장' }).click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'f5-publish.png', fullPage: true });
  const after = await (await fetch(`${base}/api/projects/${id}`)).json();
  log('게시 기록', JSON.stringify(after.publications.map((x) => [x.platform, x.status, x.url, x.metrics])));
  log('인사이트', JSON.stringify(await (await fetch(`${base}/api/insights`)).json()));

  // 승인 후 수정 → 재승인 필요
  await go('script');
  await p.locator('summary', { hasText: '대본 직접 고치기' }).click();
  const ta = p.locator('.scene textarea').nth(1);
  await ta.fill((await ta.inputValue()) + ' 수정');
  await p.locator('button', { hasText: '새 버전으로 저장' }).click();
  await p.waitForTimeout(2000);
  const ed = await (await fetch(`${base}/api/projects/${id}`)).json();
  log('수정 후 상태', ed.status, '예전 영상 ZIP', (await fetch(`${base}/api/renders/${rid}/download`)).status);
  log('errors', JSON.stringify(errors));
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
