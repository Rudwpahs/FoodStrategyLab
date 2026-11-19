import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESEARCHER, createSampleProject, ensureAccounts, expect, horizontalOverflow, login, test } from './helpers.ts';

/**
 * H. 실제 촬영 영상 넣기: [영상·블로그] 단계에서 촬영 목록을 보고, 휴대폰 영상을 묶음에 넣고 뺀다.
 * 넣은 휴대폰 영상은 촬영 소리를 켜고(sound), 원본 조리 순서 문장은 그대로 보인다 (원칙 1).
 */
const here = path.dirname(fileURLToPath(import.meta.url));

test.beforeEach(async ({ page }) => {
  await ensureAccounts(page.request);
  await login(page.request, RESEARCHER);
});

test('H1 촬영 목록을 보고 휴대폰 영상을 넣고 뺀다', async ({ page }) => {
  const id = await createSampleProject(page.request);
  expect((await page.request.post(`/api/projects/${id}/script/template`)).ok()).toBe(true);
  const project = await (await page.request.get(`/api/projects/${id}`)).json();
  await page.goto(`/#/p/${id}/video`);
  await expect(page.getByRole('heading', { name: '실제 촬영 영상 넣기' })).toBeVisible();
  await expect(page.getByText('진짜 음식이 보이면 더 끝까지 봐요.')).toBeVisible();
  await expect(page.getByText('완성 요리 · 첫 장면')).toBeVisible();
  // 조리 장면 안내에는 원본 조리 순서 문장이 글자 그대로 들어간다
  const steps: string[] = project.recipe.steps;
  const stepRow = page.locator('.shot-row').filter({ hasText: '조리 과정' }).first();
  await expect(stepRow).toBeVisible();
  const quoted = await stepRow.textContent();
  expect(steps.some((s) => quoted!.includes(s)), '원본 조리 순서 문장').toBe(true);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByLabel('촬영 1 넣기').setInputFiles(path.join(here, 'fixtures/tiny.mp4'));
  await expect(page.locator('.toast').last()).toContainText('촬영 1을 넣었어요');
  await expect(page.getByText('1개 넣음').first()).toBeVisible();
  const after = await (await page.request.get(`/api/projects/${id}/preview`)).json();
  const first = project.latest.script.scenes[0].id as string;
  expect(after.props.sceneMedia[first]).toMatchObject({ kind: 'video', sound: true });

  await page.locator('.shot-row').first().getByRole('button', { name: '빼기' }).click();
  await expect(page.locator('.toast').last()).toContainText('촬영 1을 뺐어요');
  expect((await (await page.request.get(`/api/projects/${id}`)).json()).sceneMedia).toEqual({});
});
