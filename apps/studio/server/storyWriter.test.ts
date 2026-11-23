import './testDataDir.ts';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, formatIngredient } from '@mat-lab/recipe-core';
import { createApp, type AppDeps } from './app.ts';
import { openDb } from './db.ts';
import { HttpError, Repo } from './repo.ts';
import { StoryWriter, type StoryCallFn } from './storyWriter.ts';
import { fakeStoryCall } from '../e2e/fakeStories.ts';
import { recordUsage } from './claudeUsage.ts';

let base = '';
let repo: Repo;
let close: () => void;
let calls = 0;
let gate: Promise<void> | null = null;
let lastUser = '';

const counted: StoryCallFn = async (req) => {
  calls++;
  lastUser = req.user;
  if (gate) await gate;
  return fakeStoryCall(req);
};

beforeAll(async () => {
  const fakeRender: AppDeps['startRender'] = (r, pid) => {
    const state = r.versionState(pid);
    if (state.latestScriptVersion === null) throw new HttpError(409, '대본이 아직 없습니다.');
    return r.createRender(pid, state.latestScriptVersion);
  };
  repo = new Repo(openDb(':memory:'));
  const app = createApp(repo, { startRender: fakeRender, storyWriter: new StoryWriter(repo.db, counted) });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  close = () => server.close();
});
afterAll(() => close());

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
const kimchi = SAMPLE_RECIPES.find((r) => r.dishName === '바삭한 김치전')!;

describe('AI 이야기 대본 API', () => {
  it('이야기를 받아 저장하고, 원본 대조를 통과한 것만 영상으로 만든다', async () => {
    const pid = (await call('POST', '/projects', { recipe: walnut })).body.id;
    const empty = await call('GET', `/projects/${pid}/stories`);
    expect(empty.body).toMatchObject({ available: true, writing: false, stories: [] });

    const wrote = await call('POST', `/projects/${pid}/stories`);
    expect(wrote.status).toBe(200);
    expect(wrote.body.added).toEqual(['story-1', 'story-2', 'story-3']);
    const [why, occasion, bad] = wrote.body.stories;
    expect(why.script.scenes[0].hook).toBe(true);
    expect(why.script.scenes.find((s: { type: string }) => s.type === 'ingredients').cardItems).toEqual(walnut.ingredients.map(formatIngredient));
    expect(why.blocked).toBe(false);
    expect(occasion.label).toBe('언제 내면 좋을까');
    // 원본에 없는 분량(설탕 99큰술)을 지어낸 대본은 만들 수 없다 (원칙 1)
    expect(bad.blocked).toBe(true);
    expect((await call('POST', `/projects/${pid}/stories/${bad.id}/make`)).status).toBe(400);

    // 사용량은 'story'로 기록된다
    const usage = repo.db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE purpose = 'story'").get() as { n: number };
    expect(usage.n).toBe(1);

    const made = await call('POST', `/projects/${pid}/stories/${why.id}/make`);
    expect(made.status).toBe(202);
    expect(made.body.project.latest.source).toBe('ai-story');
    expect(made.body.project.latest.script.title).toBe(why.script.title);
    const listed = await call('GET', `/projects/${pid}/stories`);
    expect(listed.body.currentTitle).toBe(why.script.title);

    // 다시 쓰면 앞의 제목을 피하라고 알려 주고, 번호가 이어진다
    const again = await call('POST', `/projects/${pid}/stories`);
    expect(again.body.added).toEqual(['story-4', 'story-5', 'story-6']);
    expect(again.body.stories.length).toBe(6);
  });

  it('레시피를 고치면 저장된 이야기를 지금 레시피로 다시 대조한다', async () => {
    const pid = (await call('POST', '/projects', { recipe: walnut })).body.id;
    await call('POST', `/projects/${pid}/stories`);
    const changed = { ...walnut, ingredients: walnut.ingredients.map((i) => (i.name === '호두' ? { ...i, amount: '300g' } : i)) };
    expect((await call('PUT', `/projects/${pid}/recipe`, { recipe: changed })).status).toBe(200);
    const listed = await call('GET', `/projects/${pid}/stories`);
    const card = listed.body.stories[0].script.scenes.find((s: { type: string }) => s.type === 'ingredients');
    expect(card.cardItems).toContain('호두 300g');
  });

  it('웃음 형식 돌려쓰기는 다른 콘텐츠에서 실제로 만든 영상으로 센다 (바로 앞 영상이 웃음 형식이면 이번엔 정보형만)', async () => {
    const made = async (hookType: string) => {
      const other = (await call('POST', '/projects', { recipe: walnut })).body.id;
      const scenes = [0, 1, 2].map((i) => ({ id: `s${i + 1}`, type: 'question', emotion: 'curious', line: `장면 ${i + 1}` }));
      repo.addScriptVersion(other, { title: `${hookType} 영상`, style: 'ai-story', hookType, scenes }, 'ai-story', '테스트');
      await new Promise((r) => setTimeout(r, 5));
    };
    const pid = (await call('POST', '/projects', { recipe: kimchi })).body.id;
    await made('wordplay');
    expect((await call('POST', `/projects/${pid}/stories`)).status).toBe(200);
    expect(lastUser).not.toContain('웃음 형식은 이번 묶음에');
    await made('why');
    await call('POST', `/projects/${pid}/stories`);
    expect(lastUser).toContain('웃음 형식은 이번 묶음에');
    expect(lastUser).not.toMatch(/^- wordplay\(/m);
  });

  it('쓰는 중에 또 누르면 두 번 부르지 않는다, 월 한도를 넘으면 부르지 않는다', async () => {
    const pid = (await call('POST', '/projects', { recipe: walnut })).body.id;
    let open!: () => void;
    gate = new Promise((r) => (open = r));
    const before = calls;
    const first = call('POST', `/projects/${pid}/stories`);
    await new Promise((r) => setTimeout(r, 50));
    expect((await call('GET', `/projects/${pid}/stories`)).body.writing).toBe(true);
    expect((await call('POST', `/projects/${pid}/stories`)).status).toBe(409);
    open();
    gate = null;
    expect((await first).status).toBe(200);
    expect(calls - before).toBe(1);

    recordUsage(repo.db, 'test', 'claude-opus-5-5', 0, 0, 1000);
    const over = await call('POST', `/projects/${pid}/stories`);
    expect(over.status).toBe(429);
    expect(calls - before).toBe(1);
  });
});
