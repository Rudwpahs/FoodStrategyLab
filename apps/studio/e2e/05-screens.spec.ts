import { RESEARCHER, ensureAccounts, expect, horizontalOverflow, login, projectWithRender, test } from './helpers.ts';

/** E. 화면 품질 (E2E_PLAN.md 4절 E): 가로 넘침, 입력칸 글자 크기, 연결 끊김 */

test.beforeEach(async ({ page }) => {
  await ensureAccounts(page.request);
  await login(page.request, RESEARCHER);
});

test('E1·E2 모든 화면: 가로 넘침 없음, (휴대폰) 입력칸 16px 이상', async ({ page }, info) => {
  const { id } = await projectWithRender(page.request);
  const pages = ['/#/', '/#/new', '/#/character', '/#/account', `/#/p/${id}/script`, `/#/p/${id}/video`, `/#/p/${id}/review`, `/#/p/${id}/publish`];
  for (const p of pages) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    expect(await horizontalOverflow(page), `${p} 가로 넘침(px)`).toBeLessThanOrEqual(0);
    if (info.project.name === 'mobile') {
      // 아이폰 사파리는 16px보다 작은 입력칸을 누르면 화면을 확대한다
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select')]
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({ el: el.outerHTML.slice(0, 80), size: parseFloat(getComputedStyle(el).fontSize) }))
          .filter((x) => x.size < 16),
      );
      expect(small, `${p} 16px보다 작은 입력칸`).toEqual([]);
    }
  }
});

test('E3 서버에 연결하지 못하면 멈춘 화면 대신 쉬운 문구가 보인다', async ({ page }) => {
  await page.route('**/api/projects', (route) => route.abort('connectionrefused'));
  await page.goto('/#/');
  await expect(page.getByText(/서버에 연결하지 못했어요/).first()).toBeVisible();
});
