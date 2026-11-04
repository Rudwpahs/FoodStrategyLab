import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '@mat-lab/recipe-core';
import { createApp } from './app.ts';
import { Auth } from './auth.ts';
import { openDb } from './db.ts';
import { Instagram, checkCaption, openToken, sealToken, igConfig } from './instagram.ts';
import { Repo } from './repo.ts';

/**
 * 가짜 Meta 서버로 인스타그램 연결·게시 흐름 전체를 확인한다 (실제 계정에는 아무것도 올리지 않는다).
 * 공식 문서의 순서: 로그인 코드 → 짧은 토큰 → 장기 토큰 → 컨테이너 → 상태 FINISHED → media_publish → permalink
 */
const LONG_TOKEN = 'LONG-LIVED-SECRET-TOKEN-123';
const meta = {
  fetchedVideo: 0,
  videoBytes: 0,
  published: 0,
  containerStatus: ['IN_PROGRESS', 'FINISHED'] as string[],
  lastCaption: '',
  lastAuth: '',
};

let metaUrl = '';
let studio = '';
let closeAll: () => void;
let repo: Repo;
let cookie = '';

beforeAll(async () => {
  // ── 가짜 Meta (instagram.com · api.instagram.com · graph.instagram.com 역할) ──
  const m = express();
  m.use(express.urlencoded({ extended: false }));
  m.use(express.json());
  m.post('/oauth/access_token', (req, res) => {
    if (req.body.code !== 'GOOD-CODE' || req.body.client_secret !== 'app-secret-xyz') return res.status(400).json({ error_type: 'OAuthException', code: 400, error_message: 'Matching code was not found or was already used' });
    res.json({ data: [{ access_token: 'SHORT-TOKEN', user_id: '1789', permissions: 'instagram_business_basic,instagram_business_content_publish' }] });
  });
  m.get('/access_token', (req, res) => {
    if (req.query.grant_type !== 'ig_exchange_token' || req.query.access_token !== 'SHORT-TOKEN') return res.status(400).json({ error: { message: 'bad exchange' } });
    res.json({ access_token: LONG_TOKEN, token_type: 'bearer', expires_in: 5183944 });
  });
  m.get('/v26.0/me', (req, res) => res.json({ user_id: '1789', username: 'matlab_lab' }));
  m.post('/v26.0/1789/media', async (req, res) => {
    meta.lastAuth = String(req.headers.authorization);
    meta.lastCaption = req.body.caption;
    if (req.body.media_type !== 'REELS') return res.status(400).json({ error: { message: 'need REELS' } });
    // Meta는 video_url을 직접 내려받는다: 로그인 없이 열려야 한다
    const v = await fetch(req.body.video_url);
    if (v.ok) {
      meta.fetchedVideo++;
      meta.videoBytes = (await v.arrayBuffer()).byteLength;
    }
    res.json({ id: 'C-1' });
  });
  m.get('/v26.0/C-1', (_req, res) => res.json({ status_code: meta.containerStatus.shift() ?? 'FINISHED' }));
  m.post('/v26.0/1789/media_publish', (req, res) => {
    if (req.body.creation_id !== 'C-1') return res.status(400).json({ error: { message: 'bad creation id' } });
    meta.published++;
    res.json({ id: 'M-1' });
  });
  m.get('/v26.0/M-1', (_req, res) => res.json({ permalink: 'https://www.instagram.com/reel/ABC123/' }));
  const ms = m.listen(0);
  await new Promise((r) => ms.once('listening', r));
  metaUrl = `http://127.0.0.1:${(ms.address() as AddressInfo).port}`;

  Object.assign(process.env, {
    INSTAGRAM_APP_ID: '990602627938098',
    INSTAGRAM_APP_SECRET: 'app-secret-xyz',
    INSTAGRAM_GRAPH_URL: metaUrl,
    INSTAGRAM_OAUTH_URL: metaUrl,
    INSTAGRAM_AUTHORIZE_URL: `${metaUrl}/oauth/authorize`,
    IG_POLL_MS: '20',
    IG_POLL_TRIES: '5',
    IG_ALLOW_HTTP: '1',
  });

  // ── 스튜디오 ──
  repo = new Repo(openDb(':memory:'));
  const auth = new Auth(repo.db);
  auth.addUser('heejae', '이희재', 'correct horse battery');
  const app = createApp(repo, { startRender: () => 0, auth, instagram: new Instagram(repo.db) });
  const ss = app.listen(0);
  await new Promise((r) => ss.once('listening', r));
  studio = `http://127.0.0.1:${(ss.address() as AddressInfo).port}`;
  const login = await fetch(`${studio}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'heejae', password: 'correct horse battery' }) });
  cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  closeAll = () => {
    ms.close();
    ss.close();
  };
});

afterAll(() => {
  closeAll();
  for (const k of ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_GRAPH_URL', 'INSTAGRAM_OAUTH_URL', 'INSTAGRAM_AUTHORIZE_URL', 'IG_POLL_MS', 'IG_POLL_TRIES', 'IG_ALLOW_HTTP']) delete process.env[k];
});

const call = async (method: string, p: string, body?: unknown) => {
  const res = await fetch(`${studio}/api${p}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: (text ? JSON.parse(text) : null) as Record<string, unknown> };
};
const waitJob = async (jobId: string) => {
  for (let i = 0; i < 100; i++) {
    const j = (await call('GET', `/instagram/jobs/${jobId}`)).json;
    if (j.status === 'published' || j.status === 'failed') return j;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('job did not finish');
};

/** 승인된 대본 + 완성 영상(가짜 MP4)을 만든다 */
async function approvedProject(): Promise<{ pid: number; renderId: number }> {
  const pid = Number((await call('POST', '/projects', { recipe: SAMPLE_RECIPES[0] })).json.id);
  await call('POST', `/projects/${pid}/script/template`);
  const checklist = { ingredients: true, safety: true, noFakeClaims: true, expression: true };
  const ok = await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist, decision: 'approved' });
  expect(ok.status).toBe(200);
  expect(ok.json.approval).toBeTruthy();
  const renderId = repo.createRender(pid, 1);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
  fs.writeFileSync(path.join(dir, 'video.mp4'), Buffer.alloc(4096, 7));
  repo.updateRender(renderId, { status: 'done', outputDir: dir, finished: true });
  return { pid, renderId };
}

describe('인스타그램 토큰 보관', () => {
  it('토큰은 암호화해 저장하고, 앱 비밀값이 다르면 풀 수 없다', () => {
    const cfg = igConfig()!;
    const sealed = sealToken(cfg, LONG_TOKEN);
    expect(sealed).not.toContain(LONG_TOKEN);
    expect(openToken(cfg, sealed)).toBe(LONG_TOKEN);
    expect(openToken({ ...cfg, appSecret: 'other' }, sealed)).toBeNull();
  });

  it('설명 글 한도(2,200자·해시태그 30개)를 지킨다', () => {
    expect(checkCaption('맛 연구소 #요리')).toBeNull();
    expect(checkCaption('가'.repeat(2201))).toMatch(/2,200/);
    expect(checkCaption(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' '))).toMatch(/30개/);
  });
});

describe('인스타그램 연결 (가짜 Meta 서버)', () => {
  it('연결 전에는 게시할 수 없고, 로그인 창 주소에 필요한 값이 들어 있다', async () => {
    const st = (await call('GET', '/instagram')).json;
    expect(st).toMatchObject({ configured: true, connected: false });
    expect(String(st.redirectUri)).toBe(`${studio}/api/instagram/callback`);
    const url = new URL(String((await call('POST', '/instagram/connect')).json.url));
    expect(url.searchParams.get('client_id')).toBe('990602627938098');
    expect(url.searchParams.get('redirect_uri')).toBe(`${studio}/api/instagram/callback`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('위조된 state나 취소는 연결하지 않는다', async () => {
    const forged = await fetch(`${studio}/api/instagram/callback?code=GOOD-CODE&state=forged`);
    expect(forged.status).toBe(400);
    expect(await forged.text()).toContain('만료');
    const canceled = await fetch(`${studio}/api/instagram/callback?error=access_denied&error_reason=user_denied`);
    expect(canceled.status).toBe(400);
    expect((await call('GET', '/instagram')).json.connected).toBe(false);
  });

  it('로그인하고 돌아오면(브라우저, 스튜디오 로그인 없이) 장기 토큰을 암호화해 저장한다', async () => {
    const url = new URL(String((await call('POST', '/instagram/connect')).json.url));
    const back = await fetch(`${studio}/api/instagram/callback?code=GOOD-CODE&state=${url.searchParams.get('state')}`);
    expect(back.status).toBe(200);
    expect(await back.text()).toContain('@matlab_lab');
    const st = await call('GET', '/instagram');
    expect(st.json).toMatchObject({ connected: true, username: 'matlab_lab' });
    // 화면 응답과 DB 어디에도 토큰 원문이 없다
    expect(st.text).not.toContain(LONG_TOKEN);
    const row = JSON.stringify(repo.db.prepare('SELECT * FROM instagram_account').all());
    expect(row).not.toContain(LONG_TOKEN);
    expect(row).toContain('1789');
    // 같은 state는 다시 쓸 수 없다
    expect((await fetch(`${studio}/api/instagram/callback?code=GOOD-CODE&state=${url.searchParams.get('state')}`)).status).toBe(400);
  });
});

describe('인스타그램 릴스 게시 (가짜 Meta 서버)', () => {
  it('승인 전 영상은 올릴 수 없고, 확인 없이는 올리지 않는다', async () => {
    const pid = Number((await call('POST', '/projects', { recipe: SAMPLE_RECIPES[1] })).json.id);
    await call('POST', `/projects/${pid}/script/template`);
    const renderId = repo.createRender(pid, 1);
    repo.updateRender(renderId, { status: 'done', outputDir: os.tmpdir(), finished: true });
    expect((await call('POST', `/renders/${renderId}/instagram`, { confirm: true, caption: 'x' })).status).toBe(409);
    const { renderId: ok } = await approvedProject();
    expect((await call('POST', `/renders/${ok}/instagram`, { caption: '맛 연구소' })).status).toBe(400);
  });

  it('승인된 영상: 컨테이너 → 처리 완료 → 게시 → 게시 이력에 주소 기록, 임시 영상 주소는 게시 후 닫힌다', async () => {
    const { pid, renderId } = await approvedProject();
    const pre = await call('GET', `/renders/${renderId}/instagram`);
    expect(pre.status).toBe(200);
    const caption = String(pre.json.caption);
    expect(caption.length).toBeGreaterThan(10);
    const started = await call('POST', `/renders/${renderId}/instagram`, { confirm: true, caption });
    expect(started.status).toBe(202);
    const done = await waitJob(String(started.json.id));
    expect(done).toMatchObject({ status: 'published', permalink: 'https://www.instagram.com/reel/ABC123/' });
    expect(meta.fetchedVideo).toBe(1);
    expect(meta.videoBytes).toBe(4096);
    expect(meta.published).toBe(1);
    expect(meta.lastCaption).toBe(caption);
    expect(meta.lastAuth).toBe(`Bearer ${LONG_TOKEN}`);
    const pubs = repo.listPublications(pid);
    expect(pubs[0]).toMatchObject({ platform: 'instagram', status: 'published', url: 'https://www.instagram.com/reel/ABC123/', renderId });
    // 같은 콘텐츠를 다시 올리려면 따로 확인해야 한다
    const again = await call('POST', `/renders/${renderId}/instagram`, { confirm: true, caption });
    expect(again.status).toBe(409);
    expect(again.text).toContain('이미 인스타그램에 올렸어요');
    expect(meta.published).toBe(1);
  });

  it('설명 글에 원본에 없는 분량을 넣으면 올릴 수 없다', async () => {
    const { renderId } = await approvedProject();
    const r = await call('POST', `/renders/${renderId}/instagram`, { confirm: true, caption: '오늘은 설탕 999g을 넣었어요 #요리' });
    expect(r.status).toBe(409);
    expect(r.text).toContain('999g');
  });

  it('인스타그램이 처리하는 동안 대본이 바뀌면(승인 풀림) 게시하지 않는다', async () => {
    const { pid, renderId } = await approvedProject();
    meta.containerStatus = ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED'];
    const before = meta.published;
    const started = await call('POST', `/renders/${renderId}/instagram`, { confirm: true, caption: '맛 연구소 실험 #요리' });
    expect(started.status).toBe(202);
    // 처리 중에 새 대본 버전을 만든다 → 승인이 풀린다
    await call('POST', `/projects/${pid}/script/template`);
    const done = await waitJob(String(started.json.id));
    expect(done.status).toBe('failed');
    expect(String(done.message)).toContain('대본이 바뀌었어요');
    expect(meta.published).toBe(before);
    expect(repo.listPublications(pid)).toHaveLength(0);
  });

  it('인스타그램이 처리에 실패하면 게시하지 않고 실패로 알린다', async () => {
    const { pid, renderId } = await approvedProject();
    meta.containerStatus = ['IN_PROGRESS', 'ERROR'];
    const before = meta.published;
    const started = await call('POST', `/renders/${renderId}/instagram`, { confirm: true, caption: '맛 연구소 실험 #요리' });
    const done = await waitJob(String(started.json.id));
    expect(done.status).toBe('failed');
    expect(String(done.message)).toContain('ERROR');
    expect(meta.published).toBe(before);
    expect(repo.listPublications(pid)).toHaveLength(0);
  });

  it('연결을 끊으면 게시할 수 없다', async () => {
    await call('POST', '/instagram/disconnect');
    const { renderId } = await approvedProject();
    const r = await call('POST', `/renders/${renderId}/instagram`, { confirm: true, caption: '맛 연구소' });
    expect(r.status).toBe(409);
    expect(r.text).toContain('연결');
  });
});
