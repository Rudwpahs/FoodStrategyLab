import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

/** 시험 계정 (시험 서버 전용 임시 데이터. 운영 비밀번호가 아니다) */
export const RESEARCHER = { username: 'heejae', displayName: '이희재', password: 'e2e researcher pw 1' };
export const HELPER = { username: 'helper', displayName: '도우미', password: 'e2e helper password', reset: 'e2e helper password 2', changed: 'e2e helper password 3' };
export const SETUP_CODE = 'e2e-setup-code-2026';
export const CHECKLIST = { ingredients: true, safety: true, noFakeClaims: true, expression: true };

/**
 * 모든 시나리오 공통: 화면 오류(pageerror)가 하나라도 나면 실패. 대화창(confirm)은 기본으로 '확인'.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
      await use(errors);
      expect(errors, '화면 오류(pageerror)').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** API로 로그인 (브라우저와 같은 쿠키 상자를 쓴다) */
export async function login(request: APIRequestContext, who: { username: string; password: string }) {
  const r = await request.post('/api/auth/login', { data: { username: who.username, password: who.password } });
  expect(r.status(), `${who.username} 로그인`).toBe(200);
}

/** 휴대폰에서 화면이 옆으로 밀리지 않는지 (가로 넘침 px) */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** 예시 레시피로 콘텐츠를 만든다 (API) */
export async function createSampleProject(request: APIRequestContext, dish = '호두정과'): Promise<number> {
  const meta = await (await request.get('/api/meta')).json();
  const recipe = meta.samples.find((s: { dishName: string }) => s.dishName === dish);
  expect(recipe, `예시 레시피 ${dish}`).toBeTruthy();
  const r = await request.post('/api/projects', { data: { recipe } });
  expect(r.status()).toBe(201);
  return (await r.json()).id as number;
}

/** 제작이 끝날 때까지 기다린다 */
export async function waitRender(request: APIRequestContext, renderId: number, timeoutMs = 100_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const r = await (await request.get(`/api/renders/${renderId}`)).json();
    if (['done', 'failed', 'canceled'].includes(r.status)) return r;
    if (Date.now() > until) throw new Error(`제작 #${renderId}이(가) ${timeoutMs / 1000}초 안에 끝나지 않음 (${r.status} ${r.stage})`);
    await new Promise((res) => setTimeout(res, 300));
  }
}

/** 대본(기본 템플릿) + 검수용 영상까지 만든다 (API) */
export async function projectWithRender(request: APIRequestContext, dish = '호두정과') {
  const id = await createSampleProject(request, dish);
  expect((await request.post(`/api/projects/${id}/script/template`)).ok()).toBe(true);
  const r = await request.post(`/api/projects/${id}/renders`);
  expect(r.status()).toBe(202);
  const { renderId } = await r.json();
  const done = await waitRender(request, renderId);
  expect(done.status, done.error ?? '').toBe('done');
  const project = await (await request.get(`/api/projects/${id}`)).json();
  return { id, renderId: renderId as number, version: project.latest.version as number };
}

/**
 * 계정 준비: 계정 시나리오(01)를 먼저 돌렸으면 그대로 쓰고, 이 파일만 따로 돌릴 때는 API로 연구자·도우미 계정을 만든다.
 * (도우미 비밀번호는 01에서 바뀌므로, 다른 시나리오는 도우미가 필요하면 helperLogin을 쓴다)
 */
export async function ensureAccounts(request: APIRequestContext) {
  const me = await (await request.get('/api/auth/me')).json();
  if (me.mode !== 'setup') return;
  const r = await request.post('/api/auth/setup', { data: { code: SETUP_CODE, username: RESEARCHER.username, displayName: RESEARCHER.displayName, password: RESEARCHER.password, researcher: true } });
  expect(r.status()).toBe(200);
  expect((await request.post('/api/auth/users', { data: { username: HELPER.username, displayName: HELPER.displayName, password: HELPER.changed } })).status()).toBe(201);
}
