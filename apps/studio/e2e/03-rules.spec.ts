import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKLIST, RESEARCHER, ensureAccounts, expect, login, projectWithRender, test, waitRender } from './helpers.ts';

/** C. 원칙·예외 경로 (E2E_PLAN.md 4절 C) */
const here = path.dirname(fileURLToPath(import.meta.url));

test.beforeEach(async ({ page }) => {
  await ensureAccounts(page.request);
  await login(page.request, RESEARCHER);
});

test('C1·C2 사진 읽기 → 주제를 고르기 전에는 후보가 없고, 다른 주제 더 보기 → 주제 고르면 후보 5개', async ({ page }) => {
  await page.goto('/#/new');
  await page.locator('input[type=file]').setInputFiles(path.join(here, 'fixtures/tiny.png'));
  await page.getByRole('button', { name: '레시피 읽기 → 주제 고르기' }).click();
  await expect(page).toHaveURL(/#\/p\/\d+\/script/);
  const id = Number(/#\/p\/(\d+)\//.exec(page.url())![1]);
  await expect(page.getByRole('heading', { name: '영상 주제 고르기' })).toBeVisible();
  // 읽은 재료·분량은 적힌 그대로 (원칙 1)
  const p = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(p.recipe.ingredients.map((i: { name: string; amount: string }) => `${i.name} ${i.amount}`)).toEqual(['신김치 200g', '부침가루 1컵', '찬물 150ml', '식용유 3큰술']);
  // 주제를 고르기 전에는 후보를 만들지 않는다
  const early = await page.request.get(`/api/projects/${id}/candidates?count=5`);
  expect(early.status()).toBe(409);
  expect(await early.text()).toContain('주제를 먼저');
  // 근거 인용이 원문에 없는 주제는 "확인 필요"
  await expect(page.locator('label.suggestion', { hasText: '김치전 180도 vs 160도' })).toContainText('확인 필요');
  // C2 다른 주제 더 보기: 새 주제가 맨 위
  await page.getByRole('button', { name: '다른 주제 더 보기' }).click();
  await expect(page.locator('label.suggestion').first()).toContainText('김치전 팬, 달구고 올려야 덜 먹어요');
  await page.getByRole('button', { name: '이 주제로 후보 영상 만들기 →' }).click();
  await expect(page.locator('.candidate')).toHaveCount(5, { timeout: 20_000 });
  const after = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(after.recipe.topic).toBe('김치전 팬, 달구고 올려야 덜 먹어요');
});

test('C3 대본에 원본에 없는 분량을 넣으면 승인할 수 없다 (원칙 1)', async ({ page }) => {
  const { id } = await projectWithRender(page.request);
  const p = await (await page.request.get(`/api/projects/${id}`)).json();
  const script = structuredClone(p.latest.script);
  script.scenes[1].line = `${script.scenes[1].line} 설탕은 7큰술 넣어요.`;
  expect((await page.request.put(`/api/projects/${id}/script`, { data: { script, note: 'E2E: 원본에 없는 분량' } })).status()).toBe(200);
  const v = (await (await page.request.get(`/api/projects/${id}`)).json()).latest.version;
  const r = await page.request.post(`/api/projects/${id}/reviews`, { data: { version: v, reviewer: RESEARCHER.displayName, checklist: CHECKLIST, decision: 'approved', note: '' } });
  expect(r.status()).toBe(409);
  expect(await r.text()).toContain('원본 레시피와 다른');
  // 검수 화면에도 오류로 보인다
  await page.goto(`/#/p/${id}/review`);
  await expect(page.getByText(/7큰술/).first()).toBeVisible();
});

test('C4 품질 검사에서 대사 잘림이 나온 영상은 확인창을 거쳐야 승인되고, 그 사실이 기록된다', async ({ page }) => {
  const { id } = await projectWithRender(page.request);
  await page.request.post('/__e2e/next-audit', { data: { issues: [{ level: 'error', code: 'cut', scene: 2, at: 5.1, message: '장면 2 대사 끝이 잘렸어요 (5.1초).' }] } });
  const { renderId } = await (await page.request.post(`/api/projects/${id}/renders`)).json();
  const done = await waitRender(page.request, renderId);
  expect(done.qa.issues.map((i: { code: string }) => i.code)).toContain('cut');
  await page.goto(`/#/p/${id}/review`);
  await expect(page.getByText('장면 2 대사 끝이 잘렸어요').first()).toBeVisible();
  for (const box of await page.locator('label.check input').all()) await box.check();
  // 확인창에서 '취소'를 누르면 승인되지 않는다
  page.once('dialog', (d) => d.dismiss());
  await page.locator('button.primary', { hasText: '승인' }).click();
  await page.waitForTimeout(500);
  expect((await (await page.request.get(`/api/projects/${id}`)).json()).approval).toBeNull();
  page.once('dialog', (d) => d.accept());
  await page.locator('button.primary', { hasText: '승인' }).click();
  await expect(page.locator('.toast').last()).toContainText('승인했습니다');
  const p = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(p.approval.note).toContain('직접 확인하고 승인');
});

test('C5 영상을 만드는 중에는 다른 후보로 만들 수 없고, 대본 버전·승인이 그대로다', async ({ page }) => {
  const { id, version } = await projectWithRender(page.request);
  expect((await page.request.post(`/api/projects/${id}/reviews`, { data: { version, reviewer: RESEARCHER.displayName, checklist: CHECKLIST, decision: 'approved', note: '' } })).status()).toBe(200);
  await page.request.post('/__e2e/hold', { data: { hold: true } });
  try {
    const { renderId } = await (await page.request.post(`/api/projects/${id}/renders`)).json();
    const cands = await (await page.request.get(`/api/projects/${id}/candidates?count=5`)).json();
    const c = cands.candidates[0];
    const r = await page.request.post(`/api/projects/${id}/candidates/make`, { data: { style: c.style, hookType: c.hookType } });
    expect(r.status()).toBe(409);
    const p = await (await page.request.get(`/api/projects/${id}`)).json();
    expect(p.latest.version).toBe(version);
    expect(p.versionState.approvedScriptVersion).toBe(version);
    // 화면도 만드는 중이라고 알린다
    await page.goto(`/#/p/${id}/script`);
    await expect(page.getByText('영상을 만드는 중이에요')).toBeVisible();
    await page.request.post('/__e2e/hold', { data: { hold: false } });
    expect((await waitRender(page.request, renderId)).status).toBe('done');
  } finally {
    await page.request.post('/__e2e/hold', { data: { hold: false } });
  }
});
