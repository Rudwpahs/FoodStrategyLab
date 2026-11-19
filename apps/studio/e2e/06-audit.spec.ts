import path from 'node:path';
import { CHECKLIST, RESEARCHER, createSampleProject, ensureAccounts, expect, horizontalOverflow, login, projectWithRender, test } from './helpers.ts';

/** F. 계정 진단 (#/audit): 규칙 진단 카드 3개 + 가짜 Claude 요약. 휴대폰 화면에서 */

test.beforeEach(async ({ page }) => {
  await ensureAccounts(page.request);
  await login(page.request, RESEARCHER);
});

/** 손으로 화면을 확인할 때만: AUDIT_SHOT_DIR을 주면 그 폴더에 화면을 남긴다 */
const shot = async (page: import('@playwright/test').Page, name: string) => {
  const dir = process.env.AUDIT_SHOT_DIR;
  if (dir) await page.screenshot({ path: path.join(dir, `audit-${name}.png`), fullPage: true });
};

test('F1 계정 진단: 잘하는 점·발목 잡는 점·다음 영상 3개, 요약은 다시 열어도 남는다', async ({ page }) => {
  // 승인·게시까지 한 콘텐츠 하나 + 영상이 없는 레시피 둘
  const { id: done, version } = await projectWithRender(page.request, '반숙 달걀');
  expect((await page.request.post(`/api/projects/${done}/reviews`, { data: { version, reviewer: RESEARCHER.displayName, checklist: CHECKLIST, decision: 'approved', note: '' } })).status()).toBe(200);
  const pub = await page.request.post(`/api/projects/${done}/publications`, { data: { platform: 'instagram', url: 'https://www.instagram.com/reel/AUDIT1' } });
  expect(pub.status()).toBe(201);
  await createSampleProject(page.request, '시금치나물');
  await createSampleProject(page.request, '들깨고사리파스타');

  await page.goto('/#/audit');
  await expect(page.getByRole('heading', { name: '계정 진단' })).toBeVisible();
  const good = page.getByRole('region', { name: '잘하고 있는 점' });
  const hold = page.getByRole('region', { name: '발목 잡는 점' });
  const next = page.getByRole('region', { name: '다음에 만들 영상 3개' });
  await expect(good).toBeVisible();
  await expect(hold).toBeVisible();
  await expect(hold.getByText(/영상이 아직 없는 레시피 \d+개/)).toBeVisible();
  // 성과를 적은 영상이 없으니 숫자 비교 대신 솔직하게 말한다
  await expect(page.getByRole('region', { name: '아직 기록이 적어요' })).toBeVisible();

  const links = next.locator('a[href^="#/p/"]');
  await expect(links).toHaveCount(3);
  // 이미 게시한 콘텐츠는 다음 영상 후보에 없다
  await expect(next.locator(`a[href="#/p/${done}"]`)).toHaveCount(0);

  // 휴대폰: 가로 넘침 없음, 아래 메뉴 4칸이 한 줄에, '계정 진단'이 지금 화면
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const tabs = page.locator('nav.tabbar a');
  await expect(tabs).toHaveCount(4);
  const tops = await tabs.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await expect(page.locator('nav.tabbar a[href="#/audit"]')).toHaveAttribute('aria-current', 'page');
  await shot(page, 'cards');

  // 요약 (가짜 Claude): 진단 숫자만 옮겨 쓴다
  const ai = page.getByRole('region', { name: 'AI 요약' });
  await expect(ai.getByText('약 $0.05~0.1 (추정')).toBeVisible();
  await ai.getByRole('button', { name: '요약 받기' }).click();
  await expect(ai.getByText(/최근 30일 동안 영상 \d+편을 올렸어요/)).toBeVisible();
  await expect(ai.getByRole('button', { name: '다시 요약하기' })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('region', { name: 'AI 요약' }).getByText(/최근 30일 동안 영상 \d+편을 올렸어요/)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await shot(page, 'summary');

  // 다음 영상 카드를 누르면 그 콘텐츠로 간다
  const first = page.getByRole('region', { name: '다음에 만들 영상 3개' }).locator('a[href^="#/p/"]').first();
  const href = await first.getAttribute('href');
  await first.click();
  await page.waitForURL((u) => u.hash.startsWith(href!));
  await expect(page.locator('.back').first()).toBeVisible();
});
