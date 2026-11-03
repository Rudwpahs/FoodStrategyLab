const { chromium } = require('playwright');
// 사용법: 빈 데이터로 스튜디오를 띄운 뒤 (MATLAB_DATA_DIR=tmp/e2e-data PORT=5190 TTS_PROVIDER=none npm run dev)
// node apps/studio/e2e/content-lab.e2e.cjs  — 스크린샷은 현재 폴더에 저장
const base = process.env.STUDIO_URL ?? 'http://127.0.0.1:5190';
(async () => {
  // 호두정과 프로젝트 생성 (API)
  const meta = await (await fetch(`${base}/api/meta`)).json();
  const walnut = meta.samples.find((s) => s.dishName === '호두정과');
  const { id } = await (await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipe: walnut }) })).json();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(`${base}/#/p/${id}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  // 대본 단계로 이동
  const scriptTab = p.locator('.steps').getByText('AI 대본');
  await scriptTab.click().catch(() => {});
  await p.waitForSelector('text=연출과 첫 장면 고르기', { timeout: 15000 });
  await p.locator('button', { hasText: '캐릭터 코미디형' }).click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'hookpicker.png', fullPage: false });
  await p.getByText('③ 이 연출과 첫 장면으로 새 대본 만들기').click();
  await p.waitForSelector('text=첫 장면', { timeout: 15000 });
  await p.waitForTimeout(800);
  const firstLine = await p.locator('textarea').first().inputValue();
  console.log('first scene line after comedy:', firstLine);
  // 훅만 바꾸기: 결과 선공개형 선택
  await p.getByText('결과 선공개형').first().click();
  await p.getByText('지금 대본의 첫 장면만 바꾸기').click();
  await p.waitForTimeout(1500);
  console.log('first scene line after hook change:', await p.locator('textarea').first().inputValue());
  await p.screenshot({ path: 'script-after.png', fullPage: true });
  // 게시 단계: 블로그 유형 선택
  await p.locator('.steps').getByText('블로그·내보내기').click();
  await p.waitForSelector('text=네이버 블로그 원고', { timeout: 15000 });
  await p.selectOption('select', { label: '전문가 조리 노트형 — 핵심 단계의 이유와 실패를 줄이는 방법 중심' });
  await p.waitForSelector('text=이희재 연구자에게 묻기', { timeout: 15000 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'blog.png', fullPage: false });
  const before = await p.locator('.blog-preview').innerText();
  console.log('pending in preview:', (before.match(/답변 대기/g) || []).length);
  const tas = p.locator('textarea[placeholder="연구자가 직접 말하거나 적은 내용 그대로"]');
  await tas.nth(0).fill('[E2E 테스트 답변] 핵심 단계 예시');
  await p.getByText('저장', { exact: true }).click();
  await p.waitForTimeout(1500);
  const after = await p.locator('.blog-preview').innerText();
  console.log('answer in preview:', after.includes('[E2E 테스트 답변]'), 'pending now:', (after.match(/답변 대기/g) || []).length);
  console.log('errors:', JSON.stringify(errors));
  await b.close();
})().catch((e) => { console.error('E2E FAIL', e.message); process.exit(1); });
