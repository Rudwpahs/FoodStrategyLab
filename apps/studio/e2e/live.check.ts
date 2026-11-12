import { expect, test } from '@playwright/test';

/**
 * F. 실제 서버 점검 (E2E_PLAN.md 4절 F, 2단계). 배포된 주소를 읽기만 한다 — 로그인하지 않고 아무것도 바꾸지 않는다.
 * 실행: npm run e2e:live   (주소를 바꾸려면 STUDIO_URL)
 */

test('F1 /api/health: 살아 있고 Claude 설정됨', async ({ request }) => {
  const r = await request.get('/api/health');
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.ok).toBe(true);
  expect(body.ai, 'ANTHROPIC_API_KEY 설정').toBe(true);
});

test('F2 첫 화면: 로그인 화면이 뜬다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /로그인|계정 만들고 시작하기/ })).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('F3 로그인 없이는 API·DB 파일이 막혀 있다', async ({ request }) => {
  for (const p of ['/api/projects', '/media/studio.db', '/media/settings.json']) {
    expect((await request.get(p)).status(), p).toBe(401);
  }
});

test('F4 보안 헤더', async ({ request }) => {
  const r = await request.get('/api/health');
  expect(r.headers()['x-content-type-options']).toBe('nosniff');
});
