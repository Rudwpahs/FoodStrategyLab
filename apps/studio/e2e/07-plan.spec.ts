import type { APIRequestContext, Page } from '@playwright/test';
import { addDays } from '@mat-lab/recipe-core';
import { RESEARCHER, ensureAccounts, expect, horizontalOverflow, login, projectWithRender, test, waitRender } from './helpers.ts';

/**
 * G. 주간 계획·승인 대기열·쉬운 말 수정 요청 (#/plan). 휴대폰 화면에서:
 * 다음 주 계획 세우기 → 칸 보기 → 카드 승인(확인 항목 4개 → 기존 검수 API) → 수정 요청(가짜 Claude) → 새 버전·영상 → 칸 옮기기·빼기.
 * 화면 사진: E2E_SHOTS=폴더 를 주면 plan-*.png로 남긴다.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await ensureAccounts(page.request);
  await login(page.request, RESEARCHER);
});

const shot = async (page: Page, name: string, fullPage = false) => {
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/plan-${name}.png`, fullPage });
};

type Slot = { id: number; projectId: number; at: string; status: string };

/** 콘텐츠가 계획 칸에 들어갈 때까지 다음 주부터 한 주씩 계획한다 (앞 시나리오의 콘텐츠가 먼저 들어갈 수 있다) */
async function ensureSlot(request: APIRequestContext, pid: number): Promise<{ week: string; slot: Slot }> {
  let plan = await (await request.post('/api/plan/next-week', { data: {} })).json();
  for (let i = 0; i < 30; i++) {
    const slot = (plan.slots as Slot[]).find((s) => s.projectId === pid);
    if (slot) return { week: plan.weekStart, slot };
    plan = await (await request.post('/api/plan/next-week', { data: { week: addDays(plan.weekStart, 7) } })).json();
  }
  throw new Error(`콘텐츠 ${pid}이(가) 30주 안에 계획되지 않음`);
}

const slotOf = async (request: APIRequestContext, week: string, pid: number) => ((await (await request.get(`/api/plan?week=${week}`)).json()).slots as Slot[]).find((s) => s.projectId === pid);

let approveId = 0;
let changeId = 0;
let week = '';

test('G1 계획 화면: 아래 탭의 [계획] → 다음 주 계획 세우기 → 다음 주 칸이 보인다', async ({ page }) => {
  approveId = (await projectWithRender(page.request)).id;
  changeId = (await projectWithRender(page.request, '시금치나물')).id;
  await page.goto('/#/');
  const tab = page.locator('nav.tabbar a', { hasText: '계획' });
  await expect(tab).toBeVisible();
  // 탭 4개가 390px 화면 안에 들어간다
  for (const a of await page.locator('nav.tabbar a').all()) {
    const box = (await a.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390 + 0.5);
  }
  await tab.click();
  await expect(page.getByRole('heading', { name: '주간 계획' })).toBeVisible();
  await expect(tab).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: '다음 주 계획 세우기' }).click();
  await expect(page).toHaveURL(/#\/plan\?week=\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator('.plan-slot').first()).toBeVisible();
  await expect(page.locator('.badge', { hasText: '다음 주' })).toBeVisible();
  expect(await horizontalOverflow(page), '계획 화면 가로 넘침(px)').toBeLessThanOrEqual(0);
  await shot(page, 'calendar', true);

  // 두 콘텐츠 모두 칸을 받을 때까지 (앞 시나리오의 콘텐츠가 먼저 들어갈 수 있다)
  week = (await ensureSlot(page.request, approveId)).week;
  await ensureSlot(page.request, changeId);
});

test('G2 승인 대기열: 카드 [승인 →] → 확인 항목 4개를 모두 체크해야 승인 → 칸이 승인됨', async ({ page }) => {
  await page.goto(`/#/plan?week=${week}`);
  const card = page.locator(`.swipe-card[data-project="${approveId}"]`);
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await shot(page, 'queue');
  await card.getByRole('button', { name: '승인 →' }).click();
  const sheet = page.getByRole('dialog', { name: '승인 전 확인' });
  await expect(sheet).toBeVisible();
  const approve = sheet.getByRole('button', { name: '승인하기' });
  const boxes = sheet.getByRole('checkbox');
  await expect(boxes).toHaveCount(4);
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  // 하나라도 빠지면 승인할 수 없다
  await expect(approve).toBeDisabled();
  await boxes.nth(3).check();
  await shot(page, 'approve');
  await approve.click();
  await expect(page.locator('.toast').last()).toContainText('승인했어요');
  await expect(sheet).toBeHidden();
  await expect(card).toBeHidden();
  const p = await (await page.request.get(`/api/projects/${approveId}`)).json();
  expect(p.approval).toMatchObject({ scriptVersion: p.latest.version, byResearcher: true });
  expect(p.approval.note).toContain('계획 화면에서 승인');
  expect((await slotOf(page.request, week, approveId))!.status).toBe('approved');
  await expect(page.locator(`.plan-slot[data-project="${approveId}"] .badge`)).toHaveText('승인됨');
});

test('G3 카드를 왼쪽으로 밀면 수정 요청 → 가짜 Claude가 고친 새 버전(ai-revise) → 영상을 다시 만든다', async ({ page }) => {
  await page.goto(`/#/plan?week=${week}`);
  const card = page.locator(`.swipe-card[data-project="${changeId}"]`);
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  const before = await (await page.request.get(`/api/projects/${changeId}`)).json();
  // 카드 글자 부분을 잡고 왼쪽으로 끈다
  const box = (await card.locator('.queue-title').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2 + 4, { steps: 8 });
  await page.mouse.up();
  const sheet = page.getByRole('dialog', { name: '무엇을 바꿀까요?' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('무엇을 바꿀까요?').fill('첫 장면을 더 궁금하게');
  await shot(page, 'change');
  await sheet.getByRole('button', { name: '고쳐 달라고 하기' }).click();
  await expect(page.locator('.toast').last()).toContainText('영상을 다시 만들기 시작했어요');
  const p = await (await page.request.get(`/api/projects/${changeId}`)).json();
  expect(p.latest.version).toBe(before.latest.version + 1);
  expect(p.latest.source).toBe('ai-revise');
  expect(p.latest.script.scenes[0].line).toBe(`잠깐만요! ${before.latest.script.scenes[0].line}`);
  expect(p.approval).toBeNull();
  expect(p.reviews[0]).toMatchObject({ decision: 'changes_requested', scriptVersion: before.latest.version });
  expect(p.renders[0].scriptVersion).toBe(p.latest.version);
  expect((await waitRender(page.request, p.renders[0].id)).status).toBe('done');
  // 새 영상이 완성되면 다시 승인 대기열에 새 버전으로
  await page.reload();
  await expect(card).toContainText(`대본 v${p.latest.version} · AI 수정`);
  expect((await slotOf(page.request, week, changeId))!.status).toBe('waiting');
});

test('G4 원본에 없는 분량이 생기는 수정 요청은 저장하지 않는다 (원칙 1)', async ({ page }) => {
  await page.goto(`/#/plan?week=${week}`);
  const card = page.locator(`.swipe-card[data-project="${changeId}"]`);
  const before = await (await page.request.get(`/api/projects/${changeId}`)).json();
  await card.getByRole('button', { name: '← 고쳐 주세요' }).click();
  const sheet = page.getByRole('dialog', { name: '무엇을 바꿀까요?' });
  await sheet.getByLabel('무엇을 바꿀까요?').fill('설탕을 더 넣는다고 말해 줘');
  await sheet.getByRole('button', { name: '고쳐 달라고 하기' }).click();
  await expect(page.locator('.toast.error').last()).toContainText('원본 레시피와 다른');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: '취소' }).click();
  const after = await (await page.request.get(`/api/projects/${changeId}`)).json();
  expect(after.latest.version).toBe(before.latest.version);
});

test('G5 칸 옮기기(같은 주 수요일 19:30)와 빼기', async ({ page }) => {
  await page.goto(`/#/plan?week=${week}`);
  const slot = page.locator(`.plan-slot[data-project="${changeId}"]`);
  await slot.getByRole('button', { name: '옮기기' }).click();
  const sheet = page.getByRole('dialog', { name: '올릴 날·시간 바꾸기' });
  const wed = addDays(week, 2);
  // 같은 날 다른 칸이 있을 수 있어 분은 잘 안 쓰는 값으로
  await sheet.getByLabel('새 날짜·시간 (한국 시간)').fill(`${wed}T19:37`);
  await sheet.getByRole('button', { name: '옮기기' }).click();
  await expect(page.locator('.toast').last()).toContainText('옮겼어요');
  expect((await slotOf(page.request, week, changeId))!.at).toBe(`${wed}T19:37:00+09:00`);
  await expect(page.locator(`.plan-day[aria-label*="수요일"] .plan-slot[data-project="${changeId}"]`)).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.locator(`.plan-slot[data-project="${changeId}"]`).getByRole('button', { name: '빼기' }).click();
  await expect(page.locator('.toast').last()).toContainText('계획에서 뺐어요');
  await expect(page.locator(`.plan-slot[data-project="${changeId}"]`)).toHaveCount(0);
  expect(await slotOf(page.request, week, changeId)).toBeUndefined();
});
