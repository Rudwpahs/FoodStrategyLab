import { strFromU8, unzipSync } from 'fflate';
import { RESEARCHER, ensureAccounts, expect, horizontalOverflow, login, test, waitRender } from './helpers.ts';

/**
 * B. 콘텐츠 전체 흐름 (E2E_PLAN.md 4절 B). 연구자 계정으로 새 콘텐츠 → 후보 → 영상 → 블로그 → 승인 → 내보내기 → 게시 기록 → 승인 뒤 수정.
 * 휴대폰·PC 두 화면에서 같은 흐름을 돈다.
 */
test.describe.configure({ mode: 'serial' });

let id = 0;
let renderId = 0;

test.beforeEach(async ({ page }) => {
  await ensureAccounts(page.request);
  await login(page.request, RESEARCHER);
});

const noOverflow = async (page: import('@playwright/test').Page, where: string) => expect(await horizontalOverflow(page), `${where} 가로 넘침(px)`).toBeLessThanOrEqual(0);

test('B1 새 콘텐츠: 예시 레시피로 만들기', async ({ page }) => {
  const meta = await (await page.request.get('/api/meta')).json();
  const walnut = meta.samples.find((s: { dishName: string }) => s.dishName === '호두정과');
  await page.goto('/#/new');
  await page.getByText('직접 입력하기').click();
  await page.locator('select').filter({ hasText: '파일럿 샘플 불러오기' }).selectOption({ label: walnut.topic });
  await noOverflow(page, '새 콘텐츠');
  await page.getByRole('button', { name: '저장하고 후보 영상 보기 →' }).click();
  await expect(page).toHaveURL(/#\/p\/\d+\/script/);
  id = Number(/#\/p\/(\d+)\//.exec(page.url())![1]);
  const p = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(p.recipe.dishName).toBe('호두정과');
  // 재료·분량·순서는 원본 그대로 (원칙 1)
  expect(p.recipe.ingredients).toEqual(walnut.ingredients);
  expect(p.recipe.steps).toEqual(walnut.steps);
});

test('B2 후보 5개 → 다른 후보 보기(본 조합 제외) → 처음 후보로 → 하나로 만들기', async ({ page }) => {
  const first = page.waitForResponse((r) => /\/candidates\?count=5$/.test(r.url()));
  await page.goto(`/#/p/${id}/script`);
  const firstKeys = ((await (await first).json()).candidates as { key: string }[]).map((c) => c.key);
  await expect(page.locator('.candidate')).toHaveCount(5);
  expect(new Set(firstKeys).size).toBe(5);
  await noOverflow(page, '후보');
  const more = page.waitForResponse((r) => r.url().includes('/candidates?count=5&exclude='));
  await page.getByRole('button', { name: '다른 후보 보기' }).click();
  const moreKeys = ((await (await more).json()).candidates as { key: string }[]).map((c) => c.key);
  expect(moreKeys.length).toBeGreaterThan(0);
  for (const k of moreKeys) expect(firstKeys, '다시 보기에 이미 본 조합이 없어야').not.toContain(k);
  const back = page.waitForResponse((r) => /\/candidates\?count=5$/.test(r.url()));
  await page.getByRole('button', { name: '처음 후보로' }).click();
  const backData = (await (await back).json()).candidates as { key: string; firstLine: string }[];
  const pick = backData[2]!;
  await page.locator('.candidate').nth(2).getByRole('button', { name: '이 영상으로 만들기' }).click();
  await expect(page.locator('.toast').last()).toContainText('영상을 만들기 시작했어요');
  const p = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(p.latest.script.scenes[0].line).toBe(pick.firstLine);
  renderId = p.renders[0].id;
});

test('B3 영상 완성: 진행이 끝나고 영상·표지·카드가 열리며 품질 검사 통과', async ({ page }) => {
  const done = await waitRender(page.request, renderId);
  expect(done.status, done.error ?? '').toBe('done');
  await page.goto(`/#/p/${id}/video`);
  await expect(page.getByRole('heading', { name: `완성본 (작업 #${renderId})` })).toBeVisible();
  for (const alt of ['커버', '썸네일', '레시피 카드']) {
    const img = page.getByAltText(alt);
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), `${alt} 그림`).toBe(true);
  }
  // 완성본 영상 (미리보기 플레이어의 영상 요소와 헷갈리지 않게 파일 주소로 고른다)
  const video = page.locator('video[src$="/video.mp4"]').first();
  // 영상 정보(길이·크기)를 읽었는지. 느린 컴퓨터에서는 몇 초 걸릴 수 있다. 영상 오류(error)는 없어야 한다
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect(await video.evaluate((v: HTMLVideoElement) => v.error?.code ?? 0), '영상 재생 오류').toBe(0);
  await expect(page.getByText(/자동 품질 검사 — 통과/)).toBeVisible();
  await expect(page.getByText('검수용 · 승인 후 내려받기')).toBeVisible();
  await noOverflow(page, '영상');
});

test('B4 블로그 원고 2개 비교 → 하나 고르기 (서버에 저장)', async ({ page }) => {
  await page.goto(`/#/p/${id}/video`);
  const choose = page.getByRole('button', { name: '이 원고 고르기' }).first();
  await choose.scrollIntoViewIfNeeded();
  const saved = page.waitForResponse((r) => r.url().endsWith(`/projects/${id}/blog-style`) && r.request().method() === 'PUT');
  await choose.click();
  expect((await saved).status()).toBe(200);
  const p = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(p.blogStyle).not.toBe('');
});

test('B5 승인 전에는 내보내기·게시 기록이 막힌다 (원칙 2)', async ({ page }) => {
  expect((await page.request.get(`/api/renders/${renderId}/download`)).status()).toBe(409);
  const pub = await page.request.post(`/api/projects/${id}/publications`, { data: { platform: 'instagram', url: 'https://www.instagram.com/reel/EARLY1' } });
  expect(pub.status()).toBe(409);
  await page.goto(`/#/p/${id}/publish`);
  await expect(page.getByText('이희재 연구자의 승인을 받은 최신 콘텐츠만 게시·기록할 수 있어요.')).toBeVisible();
});

test('B6 검수 체크 → 승인 → ZIP: 연구자 검토 문구와 원본 재료·분량', async ({ page }) => {
  await page.goto(`/#/p/${id}/review`);
  await noOverflow(page, '검수');
  for (const box of await page.locator('label.check input').all()) await box.check();
  await page.locator('button.primary', { hasText: '승인' }).click();
  await expect(page.locator('.toast').last()).toContainText('승인했습니다');
  const zip = await page.request.get(`/api/renders/${renderId}/download`);
  expect(zip.status()).toBe(200);
  const files = unzipSync(new Uint8Array(await zip.body()));
  for (const f of ['video.mp4', 'cover.png', 'recipe-card.png', 'blog.md', 'captions.srt', 'instagram.txt']) expect(Object.keys(files), f).toContain(f);
  const blog = strFromU8(files['blog.md']!);
  expect(blog).toMatch(/조리기능장 이희재/);
  expect(blog).toMatch(/검토/);
  const p = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(p.approval.byResearcher).toBe(true);
  for (const ing of p.recipe.ingredients as { name: string }[]) expect(blog, `재료 ${ing.name}`).toContain(ing.name);
});

test('B7 게시 기록 → 같은 콘텐츠 다시 기록은 확인창을 거친다', async ({ page }) => {
  await page.goto(`/#/p/${id}/publish`);
  await noOverflow(page, '게시');
  const ig = page.locator('input[placeholder^="https://www.instagram.com"]');
  await ig.fill('https://www.instagram.com/reel/E2ETEST1');
  await page.getByRole('button', { name: '게시 기록' }).first().click();
  await expect(page.locator('.toast').last()).toContainText('게시 기록을 남겼어요');
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  await ig.fill('https://www.instagram.com/reel/E2ETEST2');
  await page.getByRole('button', { name: '게시 기록' }).first().click();
  await expect.poll(() => dialogs.length).toBeGreaterThan(0);
  expect(dialogs[0]).toContain('다시');
  await expect
    .poll(async () => ((await (await page.request.get(`/api/projects/${id}`)).json()).publications as { platform: string }[]).filter((x) => x.platform === 'instagram').length)
    .toBe(2);
});

test('B8 연구자 답변 없이는 네이버 발행 기록이 막히고, 답변은 원문 그대로 실린다 (원칙 4)', async ({ page }) => {
  await page.goto(`/#/p/${id}/publish`);
  const naver = page.locator('input[placeholder^="https://blog.naver.com"]');
  await naver.fill('https://blog.naver.com/matlab/223000000001');
  await page.getByRole('button', { name: '발행 기록' }).click();
  await page.waitForTimeout(800);
  const naverCount = async () => ((await (await page.request.get(`/api/projects/${id}`)).json()).publications as { platform: string }[]).filter((x) => x.platform === 'naver').length;
  expect(await naverCount()).toBe(0);
  const answer = '[E2E 답변] 호두는 데친 뒤 물기를 완전히 말려야 튀길 때 기름이 튀지 않아요.';
  const answers = page.locator('textarea[placeholder="연구자가 직접 말하거나 적은 내용 그대로"]');
  const n = await answers.count();
  // 필수 질문(펼쳐진 칸)만 채운다. 선택 질문은 접혀 있다
  for (let i = 0; i < n; i++) {
    const box = answers.nth(i);
    if (await box.isVisible()) await box.fill(i === 0 ? answer : `[E2E 답변 ${i + 1}] 연구자가 직접 적은 내용입니다.`);
  }
  await page.locator('label', { hasText: '연구자 본인이 위 답변을 읽고 확인했습니다' }).locator('input').check();
  await page.locator('input[placeholder="확인한 연구자 이름"]').fill(RESEARCHER.displayName);
  await page.getByRole('button', { name: '저장', exact: true }).first().click();
  await expect(page.locator('.toast').last()).not.toHaveClass(/error/);
  await naver.fill('https://blog.naver.com/matlab/223000000001');
  await page.getByRole('button', { name: '발행 기록' }).click();
  await expect.poll(naverCount).toBe(1);
  const style = (await (await page.request.get(`/api/projects/${id}`)).json()).blogStyle;
  const blog = await (await page.request.get(`/api/projects/${id}/blog?style=${style}`)).json();
  expect(blog.post.markdown, `고른 원고(${style})에 답변 원문`).toContain(answer);
});

test('B9 승인 뒤 대본을 고치면 새 버전·재검수, 옛 영상은 내보낼 수 없다 (원칙 2)', async ({ page }) => {
  await page.goto(`/#/p/${id}/script`);
  await page.locator('summary', { hasText: '대본 직접 고치기' }).click();
  const ta = page.locator('.scene textarea').nth(1);
  await ta.fill((await ta.inputValue()) + ' 수정');
  await page.getByRole('button', { name: '새 버전으로 저장' }).click();
  await expect(page.locator('.toast').last()).toContainText('새 버전');
  const p = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(p.status).toBe('review');
  expect(p.versionState.approvedScriptVersion).not.toBe(p.latest.version);
  expect((await page.request.get(`/api/renders/${renderId}/download`)).status()).toBe(409);
});
