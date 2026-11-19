import './testDataDir.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '@mat-lab/recipe-core';
import { createApp } from './app.ts';
import { Auth } from './auth.ts';
import { AUTO_NOTE, AutoPilot, type AutoPost } from './autoPilot.ts';
import { openDb } from './db.ts';
import { FAKE_LONG_TOKEN, fakeMetaRouter, newFakeMetaState, type FakeMetaState } from './fakeMeta.ts';
import { Instagram } from './instagram.ts';
import { Repo } from './repo.ts';

/**
 * 자동 게시(예약)·댓글 답장 — 가짜 Meta 서버로만 시험한다 (실제 인스타그램 계정에는 아무것도 하지 않는다).
 * 시각은 tick(now)에 직접 넘겨 기다리지 않는다.
 */
let meta: FakeMetaState;
let studio = '';
let closeAll: () => void;
let repo: Repo;
let auto: AutoPilot;
const cookies: Record<string, string> = {};
const ENV = ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_GRAPH_URL', 'INSTAGRAM_OAUTH_URL', 'INSTAGRAM_AUTHORIZE_URL', 'IG_POLL_MS', 'IG_POLL_TRIES', 'IG_ALLOW_HTTP'];

beforeAll(async () => {
  meta = newFakeMetaState();
  const m = express();
  m.use(fakeMetaRouter(meta));
  const ms = m.listen(0);
  await new Promise((r) => ms.once('listening', r));
  const metaUrl = `http://127.0.0.1:${(ms.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    INSTAGRAM_APP_ID: '111',
    INSTAGRAM_APP_SECRET: 'auto-secret',
    INSTAGRAM_GRAPH_URL: metaUrl,
    INSTAGRAM_OAUTH_URL: metaUrl,
    INSTAGRAM_AUTHORIZE_URL: `${metaUrl}/oauth/authorize`,
    IG_POLL_MS: '10',
    IG_POLL_TRIES: '5',
    IG_ALLOW_HTTP: '1',
  });
  repo = new Repo(openDb(':memory:'));
  const auth = new Auth(repo.db);
  auth.addUser('heejae', '이희재', 'correct horse battery', 'researcher');
  auth.addUser('helper', '도우미', 'helper horse battery');
  const ig = new Instagram(repo.db);
  auto = new AutoPilot(repo, ig);
  const app = createApp(repo, { startRender: () => 0, auth, instagram: ig, autoPilot: auto });
  const ss = app.listen(0);
  await new Promise((r) => ss.once('listening', r));
  studio = `http://127.0.0.1:${(ss.address() as AddressInfo).port}`;
  for (const [u, pw] of [
    ['heejae', 'correct horse battery'],
    ['helper', 'helper horse battery'],
  ]) {
    const login = await fetch(`${studio}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) });
    cookies[u!] = login.headers.get('set-cookie')!.split(';')[0]!;
  }
  closeAll = () => {
    auto.stop();
    ms.close();
    ss.close();
  };
});

afterAll(() => {
  closeAll();
  for (const k of ENV) delete process.env[k];
});

const call = async (method: string, p: string, body?: unknown, who = 'heejae') => {
  const res = await fetch(`${studio}/api${p}`, { method, headers: { 'content-type': 'application/json', cookie: cookies[who]! }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: (text ? JSON.parse(text) : null) as Record<string, unknown> };
};

/** 실제로 연결한 것처럼 (가짜 로그인 창 → 돌아오기) */
async function connect(comments = false) {
  const url = String((await call('POST', comments ? '/auto/connect' : '/instagram/connect')).json.url);
  const auth = await fetch(url, { redirect: 'manual' });
  const back = await fetch(String(auth.headers.get('location')));
  expect(back.status).toBe(200);
}

/** 승인된 대본 + 완성 영상(가짜 MP4) */
async function approvedProject(i = 0): Promise<{ pid: number; renderId: number }> {
  const pid = Number((await call('POST', '/projects', { recipe: SAMPLE_RECIPES[i % SAMPLE_RECIPES.length] })).json.id);
  await call('POST', `/projects/${pid}/script/template`);
  const checklist = { ingredients: true, safety: true, noFakeClaims: true, expression: true };
  const ok = await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist, decision: 'approved' });
  expect(ok.status).toBe(200);
  const renderId = repo.createRender(pid, 1);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-reel-'));
  fs.writeFileSync(path.join(dir, 'video.mp4'), Buffer.alloc(2048, 7));
  repo.updateRender(renderId, { status: 'done', outputDir: dir, finished: true });
  return { pid, renderId };
}

const inMin = (n: number) => new Date(Date.now() + n * 60_000);
async function schedule(pid: number, minutes = 2): Promise<AutoPost> {
  const r = await call('POST', '/auto/scheduled', { projectId: pid, at: inMin(minutes).toISOString() });
  expect(r.status, r.text).toBe(201);
  return r.json as unknown as AutoPost;
}
async function settle(id: number): Promise<AutoPost> {
  for (let i = 0; i < 200; i++) {
    const p = auto.getPost(id);
    if (!['scheduled', 'posting'].includes(p.status)) return p;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('auto post did not finish');
}
const turnOn = (patch: Record<string, unknown>) => call('PUT', '/auto/settings', { ...patch, confirm: true });

describe('설정: 기본은 꺼짐, 켜려면 확인 + 연구자 계정', () => {
  it('처음에는 자동 게시·댓글 답장 모두 꺼져 있다', async () => {
    const o = (await call('GET', '/auto')).json;
    expect(o.settings).toMatchObject({ autoPost: false, commentReplies: false, dailyMax: 3 });
    expect(o.instagram).toMatchObject({ configured: true, connected: false });
  });

  it('확인 없이 켤 수 없고, 연구자 계정이 있으면 도우미는 바꿀 수 없다', async () => {
    const noConfirm = await call('PUT', '/auto/settings', { autoPost: true });
    expect(noConfirm.status).toBe(400);
    expect(noConfirm.text).toContain('확인');
    expect((await call('PUT', '/auto/settings', { autoPost: true, confirm: true }, 'helper')).status).toBe(403);
    expect((await call('PUT', '/auto/rules', { rules: [] }, 'helper')).status).toBe(403);
    expect(auto.settings().autoPost).toBe(false);
    expect((await call('PUT', '/auto/settings', { dailyMax: 99 })).status).toBe(400);
  });

  it('기본 연결은 댓글 권한을 요청하지 않고, [댓글 권한까지 다시 연결]만 요청한다', async () => {
    const plain = new URL(String((await call('POST', '/instagram/connect')).json.url));
    expect(plain.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish');
    const withComments = new URL(String((await call('POST', '/auto/connect')).json.url));
    expect(withComments.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages');
  });
});

describe('예약 게시', () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await call('PUT', '/auto/settings', { autoPost: false, commentReplies: false, dailyMax: 3 });
    meta.quota = { usage: 0, total: 50 };
    meta.quotaFail = false;
    // 시험끼리 서로 섞이지 않게: 올리는 중인 것은 끝날 때까지 기다리고, 남은 예약은 취소하고, 지난 게시는 하루 전으로 돌린다
    for (const p of auto.upcoming().filter((x) => x.status === 'posting')) await settle(p.id);
    repo.db.prepare("UPDATE auto_posts SET status = 'canceled' WHERE status = 'scheduled'").run();
    repo.db.prepare("UPDATE auto_posts SET updated_at = '2000-01-01T00:00:00.000Z' WHERE status IN ('posted', 'posting')").run();
  });

  it('승인 전 콘텐츠·지난 시각은 예약할 수 없다', async () => {
    const pid = Number((await call('POST', '/projects', { recipe: SAMPLE_RECIPES[1] })).json.id);
    await call('POST', `/projects/${pid}/script/template`);
    const r = await call('POST', '/auto/scheduled', { projectId: pid, at: inMin(5).toISOString() });
    expect(r.status).toBe(409);
    expect(r.text).toContain('승인');
    const { pid: ok } = await approvedProject();
    expect((await call('POST', '/auto/scheduled', { projectId: ok, at: inMin(-5).toISOString() })).status).toBe(400);
    const wrong = await call('POST', '/auto/scheduled', { projectId: ok, at: inMin(5).toISOString(), caption: '설탕 999g 넣었어요 #요리' });
    expect(wrong.status).toBe(409);
    expect(wrong.text).toContain('999g');
  });

  it('꺼져 있으면 시각이 돼도 Meta를 부르지 않는다', async () => {
    const { pid } = await approvedProject();
    const p = await schedule(pid);
    const before = meta.calls.length;
    await auto.tick(inMin(3));
    expect(auto.getPost(p.id).status).toBe('scheduled');
    expect(meta.calls.length).toBe(before);
    await call('DELETE', `/auto/scheduled/${p.id}`);
    expect(auto.getPost(p.id).status).toBe('canceled');
  });

  it('켜고 시각이 되면 승인된 최신 영상을 올리고 게시 이력에 남긴다. 다시 돌아도·다른 서버가 돌아도 두 번 올리지 않는다', async () => {
    const { pid, renderId } = await approvedProject();
    const p = await schedule(pid);
    expect((await turnOn({ autoPost: true })).status).toBe(200);
    // 아직 시각 전
    await auto.tick(inMin(1));
    expect(auto.getPost(p.id).status).toBe('scheduled');
    const before = meta.published;
    await auto.tick(inMin(3));
    const done = await settle(p.id);
    expect(done).toMatchObject({ status: 'posted', renderId, permalink: `https://www.instagram.com/reel/AUTO${before + 1}/` });
    expect(meta.published).toBe(before + 1);
    expect(meta.fetchedVideo).toBeGreaterThan(0);
    expect(repo.listPublications(pid)[0]).toMatchObject({ platform: 'instagram', status: 'published', note: AUTO_NOTE, renderId });
    // 다시 돌기 + 서버가 하나 더 있다고 쳐도 그대로
    await auto.tick(inMin(4));
    await new AutoPilot(repo, new Instagram(repo.db)).tick(inMin(5));
    await new Promise((r) => setTimeout(r, 100));
    expect(meta.published).toBe(before + 1);
    // 같은 콘텐츠를 또 예약하면 '이미 올림'으로 건너뛴다
    const again = await schedule(pid);
    await auto.tick(inMin(3));
    expect(await settle(again.id)).toMatchObject({ status: 'skipped' });
    expect(auto.getPost(again.id).reason).toContain('두 번 올리지 않았어요');
    expect(meta.published).toBe(before + 1);
  });

  it('예약한 뒤 대본이 바뀌면(승인 풀림) 올리지 않는다', async () => {
    const { pid } = await approvedProject();
    const p = await schedule(pid);
    await turnOn({ autoPost: true });
    await call('POST', `/projects/${pid}/script/template`); // 새 버전 → 승인 풀림
    const before = meta.published;
    await auto.tick(inMin(3));
    const done = await settle(p.id);
    expect(done.status).toBe('failed');
    expect(done.reason).toContain('승인');
    expect(meta.published).toBe(before);
  });

  it('새 버전을 다시 승인해도, 예약한 버전과 다르면 올리지 않는다 (승인된 최신 버전만)', async () => {
    const { pid } = await approvedProject();
    const p = await schedule(pid);
    await turnOn({ autoPost: true });
    await call('POST', `/projects/${pid}/script/template`);
    await call('POST', `/projects/${pid}/reviews`, { version: 2, reviewer: '이희재', checklist: { ingredients: true, safety: true, noFakeClaims: true, expression: true }, decision: 'approved' });
    const before = meta.published;
    await auto.tick(inMin(3));
    const noVideo = await settle(p.id);
    expect(noVideo.status).toBe('failed');
    expect(noVideo.reason).toContain('영상');
    // 새 버전 영상까지 있어도 예약은 v1에 묶여 있다
    await call('POST', `/auto/scheduled/${p.id}/retry`);
    const r2 = repo.createRender(pid, 2);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-reel-'));
    fs.writeFileSync(path.join(dir, 'video.mp4'), Buffer.alloc(100, 1));
    repo.updateRender(r2, { status: 'done', outputDir: dir, finished: true });
    await auto.tick(inMin(1));
    const changed = await settle(p.id);
    expect(changed.status).toBe('failed');
    expect(changed.reason).toContain('v1 → v2');
    expect(meta.published).toBe(before);
  });

  it('인스타그램이 처리하는 동안 대본이 바뀌면 게시 직전에 멈춘다', async () => {
    const { pid } = await approvedProject();
    const p = await schedule(pid);
    await turnOn({ autoPost: true });
    meta.containerStatus = ['IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'FINISHED'];
    const before = meta.published;
    await auto.tick(inMin(3));
    expect(auto.getPost(p.id).status).toBe('posting');
    await call('POST', `/projects/${pid}/script/template`);
    const done = await settle(p.id);
    expect(done.status).toBe('failed');
    expect(done.reason).toContain('대본');
    expect(meta.published).toBe(before);
    expect(repo.listPublications(pid)).toHaveLength(0);
  });

  it('인스타그램 24시간 한도를 다 썼으면 올리지 않고 한 시간 뒤로 미룬다. 한도를 못 읽으면 스튜디오 기록으로 센다', async () => {
    const { pid } = await approvedProject();
    const p = await schedule(pid);
    await turnOn({ autoPost: true });
    meta.quota = { usage: 50, total: 50 };
    const before = meta.published;
    await auto.tick(inMin(3));
    const waiting = auto.getPost(p.id);
    expect(waiting.status).toBe('scheduled');
    expect(waiting.reason).toContain('한도(50건)');
    expect(Date.parse(waiting.notBefore)).toBeGreaterThan(inMin(50).getTime());
    expect(meta.published).toBe(before);
    // 한도를 못 읽어도 스튜디오 기록이 50건 미만이면 올린다
    meta.quotaFail = true;
    await auto.tick(new Date(Date.parse(waiting.notBefore) + 1000));
    expect((await settle(p.id)).status).toBe('posted');
  });

  it('우리가 정한 하루 최대를 넘기면 미룬다', async () => {
    await turnOn({ autoPost: true, dailyMax: 1 });
    const a = await approvedProject(2);
    const b = await approvedProject(3);
    const pa = await schedule(a.pid);
    const pb = await schedule(b.pid);
    await auto.tick(inMin(3));
    expect((await settle(pa.id)).status).toBe('posted');
    await auto.tick(inMin(4));
    const pbNow = auto.getPost(pb.id);
    expect(pbNow.status).toBe('scheduled');
    expect(pbNow.reason).toContain('24시간에 1건');
  });

  it('예약 시각이 6시간 넘게 지났으면(서버가 잠들어 있었음) 늦게 올리지 않는다', async () => {
    const { pid } = await approvedProject();
    const p = await schedule(pid);
    await turnOn({ autoPost: true });
    const before = meta.published;
    await auto.tick(inMin(60 * 7));
    const done = auto.getPost(p.id);
    expect(done.status).toBe('failed');
    expect(done.reason).toContain('6시간');
    expect(meta.published).toBe(before);
  });

  it('올리는 도중 서버가 다시 켜졌던 예약은 다시 올리지 않고 확인을 부탁한다', async () => {
    const { pid } = await approvedProject();
    const p = await schedule(pid);
    repo.db.prepare("UPDATE auto_posts SET status = 'posting' WHERE id = ?").run(p.id);
    const fresh = new AutoPilot(repo, new Instagram(repo.db));
    expect(fresh.recoverInterrupted()).toBe(1);
    const after = auto.getPost(p.id);
    expect(after.status).toBe('failed');
    expect(after.reason).toContain('인스타그램 앱에서');
    await turnOn({ autoPost: true });
    const before = meta.published;
    await auto.tick(inMin(3));
    expect(meta.published).toBe(before);
  });

  it('주간 계획 표(plan_slots)가 없으면 빈 목록, 생기면 승인된 칸을 한 번만 올리고 칸을 posted로 바꾼다', async () => {
    expect(auto.dueSlots(inMin(60))).toEqual([]);
    repo.db.exec(`CREATE TABLE plan_slots (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('planned','waiting','approved','change-requested','posted','skipped')))`);
    const { pid } = await approvedProject(4);
    const { pid: waitingPid } = await approvedProject(5);
    // 시각은 한국 시각(+09:00)으로 적혀 있다
    const kstAt = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().replace('Z', '+09:00');
    const slot = Number(repo.db.prepare("INSERT INTO plan_slots (project_id, at, status) VALUES (?, ?, 'approved')").run(pid, kstAt(inMin(1))).lastInsertRowid);
    repo.db.prepare("INSERT INTO plan_slots (project_id, at, status) VALUES (?, ?, 'waiting')").run(waitingPid, kstAt(inMin(1)));
    expect(auto.dueSlots(inMin(2)).map((s) => s.id)).toEqual([slot]);
    const dry = auto.dryRun(new Date());
    expect(dry.posts.find((x) => x.projectId === waitingPid)?.verdict).toBe('blocked');
    await turnOn({ autoPost: true });
    const before = meta.published;
    await auto.tick(inMin(2));
    const row = repo.db.prepare('SELECT id FROM auto_posts WHERE slot_id = ?').get(slot) as { id: number };
    expect((await settle(row.id)).status).toBe('posted');
    expect(meta.published).toBe(before + 1);
    expect((repo.db.prepare('SELECT status FROM plan_slots WHERE id = ?').get(slot) as { status: string }).status).toBe('posted');
    await auto.tick(inMin(3));
    expect(meta.published).toBe(before + 1);
    expect(repo.db.prepare('SELECT COUNT(*) AS n FROM auto_posts WHERE slot_id = ?').get(slot)).toEqual({ n: 1 });
  });
});

describe('댓글 답장', () => {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const later = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

  beforeAll(async () => {
    await call('PUT', '/auto/settings', { autoPost: false });
  });

  it('규칙은 사람이 쓴 문구 그대로 저장하고, 먼저 시험은 Meta를 부르지 않는다', async () => {
    const saved = await call('PUT', '/auto/rules', {
      rules: [
        { keywords: '레시피, 재료', reply: '레시피를 DM으로 보내 드렸어요!', dmText: '레시피 카드 링크예요.', dmLink: 'https://blog.naver.com/matlab/1' },
        { keywords: '시간', reply: '본문 영상에 시간이 나와요.' },
      ],
    });
    expect(saved.status, saved.text).toBe(200);
    const before = meta.calls.length;
    const hit = (await call('POST', '/auto/test-comment', { text: '레 시 피 알려주세요 🙏' })).json;
    expect(hit).toMatchObject({ matched: true, keyword: '레시피', reply: '레시피를 DM으로 보내 드렸어요!', dm: '레시피 카드 링크예요.\nhttps://blog.naver.com/matlab/1' });
    expect((await call('POST', '/auto/test-comment', { text: '맛있겠다' })).json).toEqual({ matched: false });
    const dry = (await call('POST', '/auto/dry-run')).json as { comments: { blockers: string[] } };
    expect(dry.comments.blockers.join(' ')).toContain('꺼져');
    expect(meta.calls.length).toBe(before);
  });

  it('댓글 권한 없이 연결돼 있으면 알려 주고, 다시 연결하면 권한이 생긴다', async () => {
    expect(((await call('GET', '/auto')).json.instagram as { commentScopes: string }).commentScopes).toBe('no');
    await connect(true);
    expect(((await call('GET', '/auto')).json.instagram as { commentScopes: string }).commentScopes).toBe('yes');
  });

  it('켜기 전 댓글·내 댓글·규칙에 없는 댓글에는 답하지 않고, 맞는 새 댓글에 답글 + DM을 한 번만 보낸다', async () => {
    meta.media = [{ id: 'MEDIA-1', timestamp: ago(60), permalink: 'https://www.instagram.com/reel/AAA/', comments_count: 5 }];
    meta.comments['MEDIA-1'] = [{ id: 'old-1', text: '레시피 주세요', timestamp: ago(30), username: 'early', from: { id: '9', username: 'early' } }];
    expect((await turnOn({ commentReplies: true })).status).toBe(200);
    meta.comments['MEDIA-1']!.push(
      { id: 'c-1', text: '레시피 주세요!!', timestamp: later(1), username: 'fan1', from: { id: '11', username: 'fan1' } },
      { id: 'c-2', text: '몇 분 끓이나요? 시간', timestamp: later(1), username: 'fan2', from: { id: '12', username: 'fan2' } },
      { id: 'c-3', text: '맛있겠다', timestamp: later(1), username: 'fan3', from: { id: '13', username: 'fan3' } },
      { id: 'mine', text: '레시피를 DM으로 보내 드렸어요!', timestamp: later(1), username: 'matlab_lab', from: { id: '1789', username: 'matlab_lab' } },
    );
    await auto.tick(inMin(2));
    expect(meta.replies).toEqual([
      { commentId: 'c-1', message: '레시피를 DM으로 보내 드렸어요!' },
      { commentId: 'c-2', message: '본문 영상에 시간이 나와요.' },
    ]);
    expect(meta.dms).toEqual([{ commentId: 'c-1', text: '레시피 카드 링크예요.\nhttps://blog.naver.com/matlab/1' }]);
    const log = (await call('GET', '/auto')).json.recentReplies as { commentId: string; status: string }[];
    expect(log.map((r) => [r.commentId, r.status]).sort()).toEqual([
      ['c-1', 'done'],
      ['c-2', 'done'],
    ]);
    // 다시 돌아도 (다른 서버여도) 같은 댓글에는 답하지 않는다
    await auto.replyComments(inMin(3));
    await new AutoPilot(repo, new Instagram(repo.db)).replyComments(inMin(4));
    expect(meta.replies).toHaveLength(2);
    expect(meta.dms).toHaveLength(1);
  });

  it('DM을 보내지 못하면 답글만 단 것으로 기록하고 다시 시도하지 않는다', async () => {
    meta.rejectDm = true;
    meta.comments['MEDIA-1']!.push({ id: 'c-4', text: '재료 알려주세요', timestamp: later(1), username: 'fan4', from: { id: '14', username: 'fan4' } });
    await auto.replyComments(inMin(5));
    meta.rejectDm = false;
    const row = auto.recentReplies().find((r) => r.commentId === 'c-4')!;
    expect(row.status).toBe('partial');
    expect(row.reason).toContain('DM은 보내지 못했어요');
    await auto.replyComments(inMin(6));
    expect(meta.replies.filter((r) => r.commentId === 'c-4')).toHaveLength(1);
    expect(meta.dms.filter((r) => r.commentId === 'c-4')).toHaveLength(0);
  });

  it('응답·기록 어디에도 토큰 원문이 없다', async () => {
    const o = await call('GET', '/auto');
    expect(o.text).not.toContain(FAKE_LONG_TOKEN);
    expect(JSON.stringify(repo.db.prepare('SELECT * FROM auto_replies').all())).not.toContain(FAKE_LONG_TOKEN);
  });
});
