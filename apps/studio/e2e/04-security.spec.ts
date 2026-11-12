import { RESEARCHER, ensureAccounts, expect, login, projectWithRender, test } from './helpers.ts';

/** D. 보안 (E2E_PLAN.md 4절 D). API를 직접 부른다 */

test.beforeEach(async ({ page }) => {
  await ensureAccounts(page.request);
});

test('D1 로그인 없이는 API·미디어가 막힌다', async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.20' } });
  expect((await anon.get('/api/projects')).status()).toBe(401);
  expect((await anon.get('/media/renders/1/video.mp4')).status()).toBe(401);
  expect((await anon.get('/api/health')).status()).toBe(200);
  await anon.dispose();
});

test('D2 데이터 폴더의 DB·설정 파일은 받을 수 없다', async ({ page }) => {
  await login(page.request, RESEARCHER);
  // 주소 정리('..' 풀기)는 브라우저·요청 도구가 먼저 해서 /studio.db 같은 화면 주소가 되기도 한다 → 그때는 앱 첫 화면(HTML)이 온다.
  // 어떤 경우에도 DB 파일·설정 파일 내용이 와서는 안 된다
  for (const p of ['/media/studio.db', '/media/settings.json', '/media/renders/../studio.db', '/media/%2e%2e/studio.db', '/media/%2E%2E%2Fstudio.db', '/media/audio/..%2Fstudio.db', '/media/renders/%2e%2e%2f..%2fstudio.db']) {
    const r = await page.request.get(p);
    const body = await r.body();
    expect(body.subarray(0, 15).toString('latin1'), `${p} DB 내용`).not.toBe('SQLite format 3');
    if (r.status() === 200) expect(r.headers()['content-type'], `${p}는 앱 화면이어야`).toContain('text/html');
  }
});

test('D3 승인 전 영상의 원고·묶음은 주소를 바꿔도 받을 수 없다', async ({ page }) => {
  await login(page.request, RESEARCHER);
  const { renderId } = await projectWithRender(page.request);
  for (const f of ['blog.md', 'blog%2emd', 'package.zip', 'package%2ezip', 'instagram.txt']) {
    const r = await page.request.get(`/media/renders/${renderId}/${f}`);
    expect(r.status(), f).not.toBe(200);
  }
  // 영상은 검수용으로 볼 수 있다
  expect((await page.request.get(`/media/renders/${renderId}/video.mp4`)).status()).toBe(200);
});

test('D4 HTML 파일을 레시피로 올려도 웹페이지로 실행되지 않는다', async ({ page }) => {
  await login(page.request, RESEARCHER);
  const html = Buffer.from('<html><body><script>alert(1)</script>레시피</body></html>').toString('base64');
  const r = await page.request.post('/api/projects/from-files', { data: { files: [{ name: 'evil.html', type: 'text/html', data: html }] } });
  if (r.status() >= 400) return; // 받지 않으면 그것으로 안전
  const id = (await r.json()).id;
  const p = await (await page.request.get(`/api/projects/${id}`)).json();
  for (const f of p.source.files as { url: string; name: string }[]) {
    expect(f.url, '저장 이름').not.toMatch(/\.html?(\?|$)/);
    const res = await page.request.get(f.url);
    const type = res.headers()['content-type'] ?? '';
    expect(type, f.name).not.toContain('text/html');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  }
});

test('D5 다른 사이트에서 보낸 변경 요청은 막는다', async ({ page }) => {
  await login(page.request, RESEARCHER);
  const meta = await (await page.request.get('/api/meta')).json();
  const r = await page.request.post('/api/projects', { headers: { origin: 'https://evil.example' }, data: { recipe: meta.samples[0] } });
  expect(r.status()).toBe(403);
});

test('D6 응답에 서버 데이터 폴더 경로가 들어 있지 않다', async ({ page }) => {
  await login(page.request, RESEARCHER);
  const { id, renderId } = await projectWithRender(page.request);
  const dataDir = process.env.E2E_DATA_DIR!;
  expect(dataDir).toBeTruthy();
  for (const url of [`/api/projects/${id}`, `/api/renders/${renderId}`, '/api/projects']) {
    const text = await (await page.request.get(url)).text();
    expect(text.includes(dataDir), `${url}에 데이터 폴더 경로`).toBe(false);
  }
});
