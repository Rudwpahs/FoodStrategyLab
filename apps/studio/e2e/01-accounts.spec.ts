import { CHECKLIST, HELPER, RESEARCHER, SETUP_CODE, expect, horizontalOverflow, login, projectWithRender, test } from './helpers.ts';

/**
 * A. 계정·로그인 (E2E_PLAN.md 4절 A, C6). 순서대로 이어진다: 첫 계정 → 도우미 → (연구자 계정 없을 때 승인) → 연구자 계정 정하기 → 권한 → 비밀번호.
 */
test.describe.configure({ mode: 'serial' });

test('A1 설정 코드로 첫 계정 만들기 (틀린 코드는 거절)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('처음 한 번만 계정을 만들어요')).toBeVisible();
  const fill = async (code: string) => {
    await page.getByLabel('설정 코드').fill(code);
    await page.getByLabel('이름 (승인 기록에 남아요)').fill(RESEARCHER.displayName);
    await page.getByLabel('아이디 (영문·숫자)').fill(RESEARCHER.username);
    await page.getByLabel('비밀번호 (10자 이상)').fill(RESEARCHER.password);
    await page.getByLabel('비밀번호 한 번 더').fill(RESEARCHER.password);
  };
  await fill('wrong-code-xxxx');
  // 연구자 계정 정하기는 뒤(A4)에서 화면으로 시험한다
  await page.getByLabel(/연구자 본인 계정이에요/).uncheck();
  await page.getByRole('button', { name: '계정 만들고 시작하기' }).click();
  await expect(page.locator('.issue.error')).toContainText('설정 코드가 맞지 않아요');
  await fill(SETUP_CODE);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '계정 만들고 시작하기' }).click();
  await expect(page.getByRole('link', { name: '콘텐츠 목록' })).toBeVisible();
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(me.user.username).toBe(RESEARCHER.username);
  expect(me.user.role).toBe('member');
  expect(me.researcherSet).toBe(false);
});

test('A2 로그아웃 → 틀린 비밀번호 → 맞는 비밀번호', async ({ page }) => {
  await login(page.request, RESEARCHER);
  await page.goto('/');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await page.getByLabel('아이디').fill(RESEARCHER.username);
  await page.getByLabel('비밀번호').fill('not my password');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.locator('.issue.error')).toContainText('맞지 않아요');
  await page.getByLabel('비밀번호').fill(RESEARCHER.password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.getByRole('link', { name: '콘텐츠 목록' })).toBeVisible();
});

test('A3 [계정]에서 도우미 계정 추가 → 도우미로 로그인', async ({ page, browser }) => {
  await login(page.request, RESEARCHER);
  await page.goto('/#/account');
  await page.getByLabel('이름', { exact: true }).fill(HELPER.displayName);
  await page.getByLabel('아이디 (영문·숫자 3자 이상)').fill(HELPER.username);
  await page.getByLabel(/처음 비밀번호/).fill(HELPER.password);
  await page.getByRole('button', { name: '계정 만들기' }).click();
  await expect(page.getByText(`${HELPER.displayName} (${HELPER.username})`)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  // 같은 아이디는 다시 못 만든다
  const dup = await page.request.post('/api/auth/users', { data: { username: HELPER.username, displayName: 'x', password: 'another long pw 1' } });
  expect(dup.status()).toBe(409);
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.11' } });
  await login(ctx.request, HELPER);
  expect((await (await ctx.request.get('/api/auth/me')).json()).user.displayName).toBe(HELPER.displayName);
  await ctx.close();
});

test('C6 연구자 계정이 아직 없을 때 도우미가 승인하면, 공개 문구에 연구자 이름을 쓰지 않는다', async ({ playwright }) => {
  const helper = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.12' } });
  await login(helper, HELPER);
  const { id, version } = await projectWithRender(helper);
  const r = await helper.post(`/api/projects/${id}/reviews`, { data: { version, reviewer: HELPER.displayName, checklist: CHECKLIST, decision: 'approved', note: '' } });
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.warning).toContain('연구자 계정');
  expect(body.approval.byResearcher).toBe(false);
  const blog = await (await helper.get(`/api/projects/${id}/blog`)).json();
  // 제목·출처의 레시피 저자 표기는 그대로 두고, '검토' 문구에만 연구자 이름이 없어야 한다
  expect(blog.post.markdown).not.toMatch(/이희재\S*\s*검토|검토[^\n]*이희재/);
  expect(blog.post.markdown).toMatch(/검토를 마쳤습니다|조리 정보 검토 완료/);
  await helper.dispose();
});

test('A4 연구자가 [계정]에서 연구자 계정을 정하면, 도우미는 승인·계정 추가를 못 한다', async ({ page, playwright }) => {
  await login(page.request, RESEARCHER);
  await page.goto('/#/account');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '이 계정을 연구자 계정으로 정하기' }).click();
  await expect(page.getByText('연구자 계정', { exact: true }).first()).toBeVisible();
  expect((await (await page.request.get('/api/auth/me')).json()).user.role).toBe('researcher');
  // 한 번 정하면 다른 계정이 가로챌 수 없다
  const helper = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.13' } });
  await login(helper, HELPER);
  expect((await helper.post('/api/auth/claim-researcher')).status()).toBe(409);
  expect((await helper.post('/api/auth/users', { data: { username: 'third', displayName: '셋', password: 'third long pw 1' } })).status()).toBe(403);
  // 도우미의 승인은 거절 (수정 요청은 된다)
  const { id, version } = await projectWithRender(helper);
  const denied = await helper.post(`/api/projects/${id}/reviews`, { data: { version, reviewer: HELPER.displayName, checklist: CHECKLIST, decision: 'approved', note: '' } });
  expect(denied.status()).toBe(403);
  expect(await denied.text()).toContain('연구자 계정만');
  await helper.dispose();
});

test('A4 화면: 도우미가 검수 화면에서 승인을 누르면 거절 문구가 보인다', async ({ page }) => {
  await login(page.request, HELPER);
  const { id } = await projectWithRender(page.request);
  await page.goto(`/#/p/${id}/review`);
  for (const box of await page.locator('label.check input').all()) await box.check();
  await page.locator('button.primary', { hasText: '승인' }).click();
  await expect(page.locator('.toast.error')).toContainText('연구자 계정만');
});

test('A5 비밀번호를 잊었어요 → 설정 코드로 재설정 → 옛 로그인은 끊김', async ({ page, playwright }) => {
  const old = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.14' } });
  await login(old, HELPER);
  await page.goto('/');
  await page.getByRole('button', { name: '비밀번호를 잊었어요' }).click();
  await page.getByLabel('설정 코드').fill(SETUP_CODE);
  await page.getByLabel('아이디').fill(HELPER.username);
  await page.getByLabel(/새 비밀번호/).fill(HELPER.reset);
  await page.getByLabel('비밀번호 한 번 더').fill(HELPER.reset);
  await page.getByRole('button', { name: '새 비밀번호로 바꾸고 로그인' }).click();
  await expect(page.getByRole('link', { name: '콘텐츠 목록' })).toBeVisible();
  expect((await old.get('/api/projects')).status()).toBe(401);
  await old.dispose();
});

test('A6 내 비밀번호 바꾸기 (지금 비밀번호가 틀리면 거절, 이 기기는 계속 로그인)', async ({ page }) => {
  await login(page.request, { username: HELPER.username, password: HELPER.reset });
  await page.goto('/#/account');
  await page.getByLabel('지금 비밀번호').fill('wrong password!!');
  await page.getByLabel('새 비밀번호 (10자 이상)').fill(HELPER.changed);
  await page.getByRole('button', { name: '비밀번호 바꾸기' }).click();
  await expect(page.locator('.toast.error')).toContainText('지금 비밀번호가 맞지 않아요');
  await page.getByLabel('지금 비밀번호').fill(HELPER.reset);
  await page.getByLabel('새 비밀번호 (10자 이상)').fill(HELPER.changed);
  await page.getByRole('button', { name: '비밀번호 바꾸기' }).click();
  await expect(page.locator('.toast').last()).toContainText('비밀번호를 바꿨어요');
  expect((await page.request.get('/api/projects')).status()).toBe(200);
});
