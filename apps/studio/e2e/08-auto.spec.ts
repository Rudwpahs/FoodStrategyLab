import path from 'node:path';
import type { Page } from '@playwright/test';
import { CHECKLIST, RESEARCHER, ensureAccounts, expect, horizontalOverflow, login, projectWithRender, test } from './helpers.ts';

/**
 * H. 자동 게시(예약)·댓글 답장 (휴대폰). 가짜 Meta 서버(시험 서버의 /__e2e/meta)만 쓴다.
 * - 처음에는 둘 다 꺼짐, 켤 때 확인창을 거친다 (실제 계정에서 움직이므로)
 * - 예약 게시 → '먼저 시험'은 무엇이 올라갈지 보여 주기만 하고 Meta를 부르지 않는다
 * - 댓글 규칙은 사람이 쓴 문구 그대로, 시험 댓글로 미리 본다
 * 화면 사진: AUTO_SHOTS_DIR을 주면 그 폴더에 auto-*.png로 남긴다.
 */
test.describe.configure({ mode: 'serial' });

const shot = async (page: Page, name: string) => {
  const dir = process.env.AUTO_SHOTS_DIR;
  if (dir) await page.screenshot({ path: path.join(dir, `auto-${name}.png`), fullPage: true });
};
const metaCalls = async (page: Page) => (await (await page.request.get('/__e2e/meta-calls')).json()) as { calls: number; published: number; replies: number; dms: number };

test.beforeEach(async ({ page }) => {
  await ensureAccounts(page.request);
  await login(page.request, RESEARCHER);
});

test.afterAll(async ({ request }) => {
  // 다른 시나리오가 '인스타그램 설정 전' 그대로 돌도록 되돌린다
  await login(request, RESEARCHER);
  const o = await (await request.get('/api/auto')).json();
  for (const p of o.scheduled ?? []) if (p.status === 'scheduled') await request.delete(`/api/auto/scheduled/${p.id}`);
  await request.put('/api/auto/settings', { data: { autoPost: false, commentReplies: false } });
  await request.post('/__e2e/instagram', { data: { on: false } });
});

test('H1 처음에는 꺼져 있고, 인스타그램 설정 전이면 그렇게 알려 준다', async ({ page }) => {
  await page.goto('/#/account');
  await page.getByRole('link', { name: /자동 게시 · 댓글 답장/ }).click();
  await expect(page).toHaveURL(/#\/auto/);
  await expect(page.getByRole('heading', { name: '자동 게시 · 댓글 답장' })).toBeVisible();
  await expect(page.getByLabel('예약 게시 켜기')).not.toBeChecked();
  await expect(page.getByLabel('댓글 답장 켜기')).not.toBeChecked();
  await expect(page.getByText('관리자 설정 전').first()).toBeVisible();
  await expect(page.getByText(/실제 인스타그램 계정/).first()).toBeVisible();
  expect(await horizontalOverflow(page), '#/auto 가로 넘침(px)').toBeLessThanOrEqual(0);
});

test('H2 가짜 Meta로 연결 → 켜기는 확인창을 거친다 → 댓글 권한은 따로 다시 연결', async ({ page }) => {
  await page.request.post('/__e2e/instagram', { data: { on: true } });
  await page.goto('/#/auto');
  await page.getByRole('button', { name: '인스타그램 계정 연결' }).click();
  await expect(page.getByText('인스타그램 연결 완료')).toBeVisible();
  await page.goto('/#/auto');
  await expect(page.getByText('@matlab_lab 연결됨')).toBeVisible();
  await expect(page.getByText('지금 연결에는 댓글·DM 권한이 없어요.')).toBeVisible();

  // 확인창에서 '취소'하면 켜지지 않는다
  page.once('dialog', (d) => d.dismiss());
  await page.getByLabel('예약 게시 켜기').click();
  await expect(page.getByLabel('예약 게시 켜기')).not.toBeChecked();
  expect((await (await page.request.get('/api/auto')).json()).settings.autoPost).toBe(false);
  // '확인'하면 켜진다 (확인창에 실제 계정 이름이 나온다)
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.accept();
  });
  await page.getByLabel('예약 게시 켜기').click();
  await expect(page.getByText('예약 게시 켜짐')).toBeVisible();
  expect(message).toContain('@matlab_lab');
  expect(message).toContain('실제 인스타그램 계정');

  await page.getByRole('button', { name: '댓글 권한까지 다시 연결' }).click();
  await expect(page.getByText('인스타그램 연결 완료')).toBeVisible();
  await page.goto('/#/auto');
  await expect(page.getByText('@matlab_lab 연결됨')).toBeVisible();
  await expect(page.getByText('지금 연결에는 댓글·DM 권한이 없어요.')).toHaveCount(0);
  await shot(page, 'toggles');
});

test('H3 승인된 영상을 예약 → 먼저 시험은 Meta를 부르지 않고 무엇이 올라갈지 보여 준다', async ({ page }) => {
  const { id, version } = await projectWithRender(page.request);
  const approve = await page.request.post(`/api/projects/${id}/reviews`, { data: { version, reviewer: RESEARCHER.displayName, checklist: CHECKLIST, decision: 'approved', note: '' } });
  expect(approve.status()).toBe(200);
  await page.goto(`/#/p/${id}/publish`);
  const when = page.getByLabel('예약 게시 날짜와 시간');
  await when.scrollIntoViewIfNeeded();
  await expect(when).not.toHaveValue('');
  await page.getByRole('button', { name: '예약 게시', exact: true }).click();
  await expect(page.locator('.toast').last()).toContainText('예약했어요');
  await expect(page.locator('.schedule-post').getByText('예약됨')).toBeVisible();
  expect(await horizontalOverflow(page), '게시 화면 가로 넘침(px)').toBeLessThanOrEqual(0);
  await page.locator('.schedule-post').scrollIntoViewIfNeeded();
  await shot(page, 'schedule');

  const before = await metaCalls(page);
  await page.goto('/#/auto');
  await expect(page.locator('.auto-post').first()).toContainText('예약됨');
  await page.getByRole('button', { name: '예약 게시 미리 보기' }).click();
  await expect(page.locator('.dry-run .check-item.ok').first()).toContainText('올라감');
  const after = await metaCalls(page);
  expect(after.calls, '먼저 시험은 Meta를 부르지 않는다').toBe(before.calls);
  expect(after.published).toBe(0);
  await page.locator('.dry-run').scrollIntoViewIfNeeded();
  await shot(page, 'dry-run');
});

test('H4 댓글 규칙: 사람이 쓴 답글을 저장하고, 시험 댓글로 미리 본다 (Meta를 부르지 않음)', async ({ page }) => {
  await page.goto('/#/auto');
  await page.getByRole('button', { name: '규칙 더하기' }).click();
  const rule = page.locator('.rule-edit').last();
  await rule.getByLabel(/댓글에서 찾을 단어/).fill('레시피, 재료');
  await rule.getByLabel(/공개 답글/).fill('DM으로 레시피 카드를 보내 드렸어요!');
  await rule.getByLabel(/DM 문구/).fill('맛 연구소 레시피 카드예요.');
  await rule.getByLabel(/DM에 붙일 링크/).fill('https://blog.naver.com/matlab/1');
  await page.getByRole('button', { name: '규칙 저장' }).click();
  await expect(page.locator('.toast').last()).toContainText('댓글 규칙을 저장했어요');
  const saved = (await (await page.request.get('/api/auto')).json()).rules;
  expect(saved[0]).toMatchObject({ keywords: ['레시피', '재료'], reply: 'DM으로 레시피 카드를 보내 드렸어요!' });

  const before = await metaCalls(page);
  await page.getByLabel(/이런 댓글이 달리면/).fill('레 시 피 알려주세요 🙏');
  await page.getByRole('button', { name: '답글 미리 보기' }).click();
  await expect(page.locator('.comment-preview')).toContainText('DM으로 레시피 카드를 보내 드렸어요!');
  await expect(page.locator('.comment-preview')).toContainText('https://blog.naver.com/matlab/1');
  await page.getByLabel(/이런 댓글이 달리면/).fill('맛있겠다');
  await page.getByRole('button', { name: '답글 미리 보기' }).click();
  await expect(page.locator('.comment-preview')).toContainText('맞는 규칙이 없어요');
  expect((await metaCalls(page)).calls).toBe(before.calls);

  // 휴대폰: 가로 넘침 없음, 입력칸 16px 이상 (아이폰 확대 방지)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]), textarea, select')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => parseFloat(getComputedStyle(el).fontSize))
      .filter((s) => s < 16),
  );
  expect(small).toEqual([]);
  await page.locator('.rule-edit').last().scrollIntoViewIfNeeded();
  await shot(page, 'rules');
});
