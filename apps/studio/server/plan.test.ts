import './testDataDir.ts';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, formatIngredient } from '@mat-lab/recipe-core';
import { createApp, type AppDeps } from './app.ts';
import { DATA_DIR } from './config.ts';
import { openDb } from './db.ts';
import { HttpError, Repo } from './repo.ts';
import { ScriptReviser, type ReviseCallFn } from './scriptReviser.ts';
import { fakeReviseCall } from '../e2e/fakeRevise.ts';
import { recordUsage } from './claudeUsage.ts';

let base = '';
let repo: Repo;
let close: () => void;
/** true면 가짜 제작기가 영상을 '만드는 중'으로 남겨 둔다 */
let holdRenders = false;
let reviseCalls = 0;

const counted: ReviseCallFn = async (req) => {
  reviseCalls++;
  return fakeReviseCall(req);
};

beforeAll(async () => {
  const fakeRender: AppDeps['startRender'] = (r, pid) => {
    const state = r.versionState(pid);
    if (state.latestScriptVersion === null) throw new HttpError(409, '대본이 아직 없습니다.');
    const rid = r.createRender(pid, state.latestScriptVersion);
    if (holdRenders) return rid;
    const dir = path.join(DATA_DIR, 'renders', String(rid));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'video.mp4'), 'fake');
    fs.writeFileSync(path.join(dir, 'cover.png'), 'fake');
    r.updateRender(rid, { status: 'done', stage: '완료', progress: 1, outputDir: dir, finished: true });
    return rid;
  };
  repo = new Repo(openDb(':memory:'));
  const app = createApp(repo, { startRender: fakeRender, scriptReviser: new ScriptReviser(repo.db, counted) });
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

const allChecked = { ingredients: true, safety: true, noFakeClaims: true, expression: true };
const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

/** 콘텐츠 만들기: 'none' 대본 없음 · 'script' 대본만 · 'render' 대본+영상 · 'posted' 승인+영상+인스타그램 게시 */
async function project(stage: 'none' | 'script' | 'render' | 'posted', recipe = walnut): Promise<number> {
  const pid = (await call('POST', '/projects', { recipe })).body.id as number;
  if (stage === 'none') return pid;
  await call('POST', `/projects/${pid}/script/template`);
  if (stage === 'script') return pid;
  expect((await call('POST', `/projects/${pid}/renders`)).status).toBe(202);
  if (stage === 'render') return pid;
  expect((await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved' })).status).toBe(200);
  expect((await call('POST', `/projects/${pid}/publications`, { platform: 'instagram', url: 'https://www.instagram.com/reel/abc123' })).status).toBe(201);
  return pid;
}

// 먼 미래의 월요일 (지금 시각과 상관없이 모든 칸이 '앞으로'가 되게)
const WEEK = '2030-01-07';
const WEEK2 = '2030-01-14';
type SlotView = { id: number; projectId: number; at: string; status: string; coverUrl: string | null };

describe('주간 계획 API', () => {
  let waitingId = 0;
  let scriptId = 0;
  let emptyId = 0;

  it('다음 주 계획 세우기: 준비된 콘텐츠부터 화·목·토에, 올린 콘텐츠는 빼고, 다시 눌러도 겹치지 않는다', async () => {
    emptyId = await project('none');
    scriptId = await project('script');
    waitingId = await project('render');
    const postedId = await project('posted');

    const planned = await call('POST', '/plan/next-week', { week: WEEK });
    expect(planned.status).toBe(200);
    expect(planned.body.created).toHaveLength(3);
    const slots = planned.body.slots as SlotView[];
    expect(slots.map((s) => [s.projectId, s.at, s.status])).toEqual([
      [waitingId, '2030-01-08T18:00:00+09:00', 'waiting'],
      [scriptId, '2030-01-10T12:30:00+09:00', 'planned'],
      [emptyId, '2030-01-12T10:00:00+09:00', 'planned'],
    ]);
    expect(slots.some((s) => s.projectId === postedId)).toBe(false);
    expect(slots[0]!.coverUrl).toMatch(/^\/media\/renders\/\d+\/cover\.png$/);
    expect(planned.body.times.source).toBe('default');
    expect(planned.body.revise.available).toBe(true);
    expect(planned.body.unplanned).toBe(0);

    const again = await call('POST', '/plan/next-week', { week: WEEK });
    expect(again.body.created).toEqual([]);
    expect(again.body.slots).toHaveLength(3);
    // 다음 주에도 같은 콘텐츠를 또 넣지 않는다
    expect((await call('POST', '/plan/next-week', { week: WEEK2 })).body.created).toEqual([]);
    // 작업 기록에 남는다
    expect((await call('GET', `/projects/${waitingId}`)).body.events.some((e: { type: string }) => e.type === 'plan')).toBe(true);
  });

  it('승인 대기열: 최신 대본 영상이 완성된 칸만, 기존 검수 API로 승인하면 칸이 승인됨으로', async () => {
    const view = await call('GET', `/plan?week=${WEEK}`);
    expect(view.body.queue).toHaveLength(1);
    const card = view.body.queue[0];
    expect(card).toMatchObject({ projectId: waitingId, version: 1, source: 'template', qaErrors: [], fidelityErrors: [], aiPending: false });
    expect(card.videoUrl).toMatch(/\/media\/renders\/\d+\/video\.mp4$/);

    // 체크리스트가 모자라면 승인되지 않는다 (같은 검수 API)
    expect((await call('POST', `/projects/${waitingId}/reviews`, { version: 1, reviewer: '이희재', checklist: { ...allChecked, safety: false }, decision: 'approved' })).status).toBe(400);
    expect((await call('POST', `/projects/${waitingId}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved' })).status).toBe(200);
    const slot = repo.db.prepare('SELECT status FROM plan_slots WHERE project_id = ?').get(waitingId) as { status: string };
    expect(slot.status).toBe('approved');
    expect((await call('GET', `/plan?week=${WEEK}`)).body.queue).toEqual([]);
  });

  it('칸 옮기기·빼기: 한국 시간으로 저장, 같은 시각 겹침·잘못된 값은 막는다', async () => {
    const slots = (await call('GET', `/plan?week=${WEEK}`)).body.slots as SlotView[];
    const s = slots.find((x) => x.projectId === scriptId)!;
    const moved = await call('PUT', `/plan/slots/${s.id}`, { at: '2030-01-09T19:30' });
    expect(moved.status).toBe(200);
    expect(moved.body.at).toBe('2030-01-09T19:30:00+09:00');
    expect((await call('PUT', `/plan/slots/${s.id}`, { at: '2030-01-08T18:00' })).status).toBe(409);
    expect((await call('PUT', `/plan/slots/${s.id}`, { at: '아무 때나' })).status).toBe(400);
    expect((await call('GET', '/plan?week=2030-01-08')).status).toBe(400);
    const empty = slots.find((x) => x.projectId === emptyId)!;
    expect((await call('DELETE', `/plan/slots/${empty.id}`)).status).toBe(200);
    expect((await call('DELETE', `/plan/slots/${empty.id}`)).status).toBe(404);
    // 빼면 다시 계획에 넣을 수 있다
    expect((await call('GET', `/plan?week=${WEEK}`)).body.unplanned).toBe(1);
  });

  it('게시 기록이 생기면 칸은 올림, 올린 칸은 옮기거나 지우지 않는다', async () => {
    expect((await call('POST', `/projects/${waitingId}/publications`, { platform: 'instagram', url: 'https://www.instagram.com/reel/xyz789' })).status).toBe(201);
    const s = ((await call('GET', `/plan?week=${WEEK}`)).body.slots as SlotView[]).find((x) => x.projectId === waitingId)!;
    expect(s.status).toBe('posted');
    expect((await call('PUT', `/plan/slots/${s.id}`, { at: '2030-01-11T10:00' })).status).toBe(409);
    expect((await call('DELETE', `/plan/slots/${s.id}`)).status).toBe(409);
  });
});

describe('쉬운 말로 수정 요청 API (가짜 Claude)', () => {
  it('요청대로 고친 대본을 새 버전(ai-revise)으로 저장하고 영상을 다시 만든다. 칸은 고치는 중 → 영상이 나오면 승인 대기', async () => {
    const pid = await project('render', SAMPLE_RECIPES[1]);
    await call('POST', '/plan/next-week', { week: '2030-02-04' });
    const before = (await call('GET', `/projects/${pid}`)).body;
    holdRenders = true;
    try {
      const r = await call('POST', `/projects/${pid}/script/revise`, { request: '첫 장면을 더 궁금하게', version: 1 });
      expect(r.status).toBe(202);
      expect(r.body.version).toBe(2);
      expect(r.body.changes).toContain('첫 장면');
      const p = r.body.project;
      expect(p.latest.source).toBe('ai-revise');
      expect(p.latest.script.scenes[0].line).toBe(`잠깐만요! ${before.latest.script.scenes[0].line}`);
      // 재료 카드는 원본 그대로 (원칙 1)
      expect(p.latest.script.scenes.find((s: { type: string }) => s.type === 'ingredients').cardItems).toEqual(SAMPLE_RECIPES[1]!.ingredients.map(formatIngredient));
      // 요청은 이전 버전의 '수정 요청' 검수 기록으로, 승인은 없음 (원칙 2)
      expect(p.reviews[0]).toMatchObject({ scriptVersion: 1, decision: 'changes_requested' });
      expect(p.reviews[0].note).toContain('첫 장면을 더 궁금하게');
      expect(p.approval).toBeNull();
      expect(p.renders[0]).toMatchObject({ id: r.body.renderId, scriptVersion: 2, status: 'queued' });
      const usage = repo.db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE purpose = 'revise'").get() as { n: number };
      expect(usage.n).toBe(1);

      const slot = () => ((repo.db.prepare('SELECT status FROM plan_slots WHERE project_id = ?').get(pid) as { status: string }).status);
      await call('GET', '/plan?week=2030-02-04');
      expect(slot()).toBe('change-requested');
      // 만드는 중에는 또 요청할 수 없다
      expect((await call('POST', `/projects/${pid}/script/revise`, { request: '대사를 더 짧게' })).status).toBe(409);
      repo.updateRender(r.body.renderId, { status: 'done', stage: '완료', progress: 1, finished: true });
      const view = await call('GET', '/plan?week=2030-02-04');
      expect(slot()).toBe('waiting');
      expect(view.body.queue.find((c: { projectId: number }) => c.projectId === pid)).toMatchObject({ version: 2, source: 'ai-revise' });
    } finally {
      holdRenders = false;
    }
  });

  it('원본에 없는 분량이 생기거나 고친 곳이 없으면 저장하지 않는다', async () => {
    const pid = await project('render');
    const calls = reviseCalls;
    const sugar = await call('POST', `/projects/${pid}/script/revise`, { request: '설탕을 더 넣는다고 말해 줘' });
    expect(sugar.status).toBe(422);
    expect(sugar.body.error).toContain('원본 레시피와 다른');
    const same = await call('POST', `/projects/${pid}/script/revise`, { request: '그대로 둬' });
    expect(same.status).toBe(422);
    expect(same.body.error).toContain('고친 곳이 없어요');
    expect(reviseCalls - calls).toBe(2);
    const p = (await call('GET', `/projects/${pid}`)).body;
    expect(p.latest.version).toBe(1);
    expect(p.reviews).toEqual([]);
    expect(p.events.some((e: { message: string }) => e.message.includes('수정 요청을 반영하지 못함'))).toBe(true);
  });

  it('잘못된 요청은 Claude를 부르지 않는다: 빈 요청·바뀐 버전·승인된 대본·대본 없음·월 한도', async () => {
    const calls = reviseCalls;
    const pid = await project('render');
    expect((await call('POST', `/projects/${pid}/script/revise`, { request: ' ' })).status).toBe(400);
    expect((await call('POST', `/projects/${pid}/script/revise`, { request: '훅을 더 세게', version: 9 })).status).toBe(409);
    const none = await project('none');
    expect((await call('POST', `/projects/${none}/script/revise`, { request: '훅을 더 세게' })).status).toBe(400);
    const approved = await project('render');
    await call('POST', `/projects/${approved}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved' });
    expect((await call('POST', `/projects/${approved}/script/revise`, { request: '훅을 더 세게' })).status).toBe(409);
    expect(reviseCalls).toBe(calls);
    recordUsage(repo.db, 'test', 'claude-opus-5-5', 0, 0, 1000);
    expect((await call('POST', `/projects/${pid}/script/revise`, { request: '훅을 더 세게' })).status).toBe(429);
    expect(reviseCalls).toBe(calls);
  });

  it('Claude가 설정되지 않았으면 쓸 수 없다고 알린다', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const reviser = new ScriptReviser(repo.db);
      expect(reviser.available()).toBe(false);
      await expect(reviser.revise(walnut, { title: 't', scenes: [] } as never, '훅을 더 세게')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('대본 직접 고치기') });
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
