import './testDataDir.ts';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '@mat-lab/recipe-core';
import { createApp, type AppDeps } from './app.ts';
import { openDb } from './db.ts';
import { HttpError, Repo } from './repo.ts';
import { AuditSummarizer, inventedNumbers, type AuditSummaryCallFn } from './auditSummary.ts';
import { fakeAuditCall } from '../e2e/fakeAudit.ts';
import { recordUsage } from './claudeUsage.ts';

let base = '';
let repo: Repo;
let close: () => void;
let calls = 0;
let gate: Promise<void> | null = null;
let reply: ((user: string) => string) | null = null;

const counted: AuditSummaryCallFn = async (req) => {
  calls++;
  if (gate) await gate;
  const out = await fakeAuditCall(req);
  return reply ? { ...out, summary: reply(req.user) } : out;
};

beforeAll(async () => {
  const fakeRender: AppDeps['startRender'] = (r, pid) => {
    const state = r.versionState(pid);
    if (state.latestScriptVersion === null) throw new HttpError(409, '대본이 아직 없습니다.');
    const rid = r.createRender(pid, state.latestScriptVersion);
    r.updateRender(rid, { status: 'done', stage: '완료', progress: 1, finished: true });
    return rid;
  };
  repo = new Repo(openDb(':memory:'));
  const app = createApp(repo, { startRender: fakeRender, auditSummarizer: new AuditSummarizer(repo.db, counted) });
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

describe('계정 진단 API', () => {
  it('규칙 진단은 Claude 없이 나오고, 요약은 저장돼 다시 열어도 보인다', async () => {
    const empty = await call('GET', '/audit');
    expect(empty.status).toBe(200);
    expect(empty.body.audit.enoughData).toBe(false);
    expect(empty.body.audit.next).toEqual([]);
    expect(empty.body.summary).toBeNull();
    expect(empty.body.ai).toEqual({ available: true, writing: false });

    // 레시피 3개: 하나는 승인·게시까지, 둘은 아직 영상 없음
    const ids: number[] = [];
    for (const r of SAMPLE_RECIPES.slice(0, 3)) ids.push((await call('POST', '/projects', { recipe: r })).body.id);
    const [done, review] = ids as [number, number, number];
    await call('POST', `/projects/${done}/script/template`);
    await call('POST', `/projects/${done}/renders`);
    expect((await call('POST', `/projects/${done}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved' })).status).toBe(200);
    const posted = await call('POST', `/projects/${done}/publications`, { platform: 'instagram', url: 'https://www.instagram.com/reel/abc123' });
    expect(posted.status).toBe(201);
    await call('POST', `/projects/${review}/script/template`);

    const audit = (await call('GET', '/audit')).body.audit;
    expect(audit.counts).toMatchObject({ projects: 3, posts30: 1, postsWithMetrics: 0, recipesWithoutVideo: 2 });
    expect(audit.next.map((s: { projectId: number }) => s.projectId)).not.toContain(done);
    // 대본이 있는 것(검수 대기)이 먼저
    expect(audit.next[0].projectId).toBe(review);
    expect(audit.starter.length).toBeGreaterThan(0);
    expect(audit.holdBack.find((f: { id: string }) => f.id === 'no-video').title).toBe('영상이 아직 없는 레시피 2개');

    const before = calls;
    const wrote = await call('POST', '/audit/summary');
    expect(wrote.status).toBe(200);
    expect(calls - before).toBe(1);
    expect(wrote.body.summary.text).toContain('최근 30일 동안 영상 1편');
    expect(wrote.body.summary.stale).toBe(false);
    const usage = repo.db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE purpose = 'audit'").get() as { n: number };
    expect(usage.n).toBe(1);

    const reload = await call('GET', '/audit');
    expect(reload.body.summary.text).toBe(wrote.body.summary.text);
    expect(reload.body.summary.stale).toBe(false);

    // 숫자가 바뀌면(레시피 추가) 요약이 예전 숫자라고 알린다
    await call('POST', '/projects', { recipe: SAMPLE_RECIPES[3] });
    expect((await call('GET', '/audit')).body.summary.stale).toBe(true);
  });

  it('진단에 없는 숫자를 쓴 요약은 받지 않는다 (사용료는 기록)', async () => {
    reply = () => '조회수가 12345회로 업계 평균보다 높아요.';
    const before = (repo.db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE purpose = 'audit'").get() as { n: number }).n;
    const bad = await call('POST', '/audit/summary');
    reply = null;
    expect(bad.status).toBe(502);
    expect(bad.body.error).toContain('12345');
    const after = (repo.db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE purpose = 'audit'").get() as { n: number }).n;
    expect(after).toBe(before + 1);
    // 저장된 요약은 앞의 것 그대로
    expect((await call('GET', '/audit')).body.summary.text).toContain('최근 30일');
  });

  it('쓰는 중에 또 누르면 두 번 부르지 않는다, 월 한도를 넘으면 부르지 않는다', async () => {
    let open!: () => void;
    gate = new Promise((r) => (open = r));
    const before = calls;
    const first = call('POST', '/audit/summary');
    await new Promise((r) => setTimeout(r, 50));
    expect((await call('GET', '/audit')).body.ai.writing).toBe(true);
    expect((await call('POST', '/audit/summary')).status).toBe(409);
    open();
    gate = null;
    expect((await first).status).toBe(200);
    expect(calls - before).toBe(1);

    recordUsage(repo.db, 'test', 'claude-opus-5-5', 0, 0, 1000);
    expect((await call('POST', '/audit/summary')).status).toBe(429);
    expect(calls - before).toBe(1);
    // 한도를 넘어도 규칙 진단은 그대로 본다
    expect((await call('GET', '/audit')).status).toBe(200);
  });

  it('Claude가 설정되지 않아도 진단은 보이고, 요약 버튼만 쓸 수 없다', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const db = openDb(':memory:');
    const s = new AuditSummarizer(db);
    expect(s.available()).toBe(false);
    await expect(s.summarize('사실')).rejects.toMatchObject({ status: 409 });
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  });

  it('지어낸 숫자 찾기: 쉼표·소수점을 같은 수로 본다', () => {
    expect(inventedNumbers('도달 1,000명당 12.0', '도달 1000명당 12')).toEqual([]);
    expect(inventedNumbers('3편 중 2편', '영상 3편')).toEqual(['2']);
  });
});
