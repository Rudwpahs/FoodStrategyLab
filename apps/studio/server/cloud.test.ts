import './testDataDir.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '@mat-lab/recipe-core';
import { createApp } from './app.ts';
import { Auth } from './auth.ts';
import { openDb } from './db.ts';
import { readLease, restoreSnapshot, startSnapshots } from './dbSnapshot.ts';
import { keepAwake } from './pipeline.ts';
import { Repo } from './repo.ts';

// 클라우드(Modal) 설정: 화면에서 첫 계정 만들기 + 프록시 뒤 공개 주소
const ENV = { STUDIO_SETUP_CODE: 'kitchen-lab-2026', TRUST_PROXY: '1', PUBLIC_URL: 'https://lab--studio.modal.run' };

let base = '';
let close: () => void;
let auth: Auth;
const starts: (string | undefined)[] = [];

beforeAll(async () => {
  Object.assign(process.env, ENV, { KEEPALIVE: '1' });
  const repo = new Repo(openDb(':memory:'));
  auth = new Auth(repo.db);
  const app = createApp(repo, {
    startRender: (_repo, _pid, _origin, keepAlive) => {
      starts.push(keepAlive);
      return 1;
    },
    auth,
  });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => {
  close();
  for (const k of [...Object.keys(ENV), 'KEEPALIVE']) delete process.env[k];
});

// 클라우드 요청은 항상 프록시를 거친다
const proxied = { 'x-forwarded-for': '203.0.113.7', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'lab--studio.modal.run' };
const req = (p: string, init: RequestInit & { cookie?: string } = {}) =>
  fetch(base + p, { ...init, headers: { 'content-type': 'application/json', ...proxied, ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers ?? {}) } });
const setup = (body: Record<string, unknown>, headers: Record<string, string> = {}) => req('/api/auth/setup', { method: 'POST', headers, body: JSON.stringify(body) });
const goodSetup = { code: ENV.STUDIO_SETUP_CODE, username: 'heejae', displayName: '이희재', password: 'correct horse battery' };

describe('클라우드: 화면에서 첫 계정 만들기', () => {
  it('계정이 없으면 setup 모드이고, 계정 만들기 전에는 API가 막힌다', async () => {
    expect((await (await req('/api/auth/me')).json()).mode).toBe('setup');
    expect((await req('/api/projects')).status).toBe(403);
    expect((await req('/api/health')).status).toBe(200);
  });

  it('설정 코드가 틀리면 만들 수 없고, 여러 번 틀리면 잠시 막는다', async () => {
    expect((await setup({ ...goodSetup, code: 'wrong-code-123' })).status).toBe(401);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await setup({ ...goodSetup, code: `wrong-${i}-xxxx` }, { 'x-forwarded-for': '198.51.100.9' })).status;
    expect(last).toBe(429);
    expect(auth.userCount()).toBe(0);
  });

  it('X-Forwarded-For 맨 앞 값을 바꿔도 잠금을 피할 수 없다 (맨 오른쪽 = 프록시가 붙인 실제 주소)', async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await setup({ ...goodSetup, code: `nope-${i}-xxxx` }, { 'x-forwarded-for': `10.9.${i}.1, 198.51.100.77` })).status;
    }
    expect(last).toBe(429);
  });

  it('맞는 코드면 계정을 만들고 바로 로그인된다. 두 번째부터는 만들 수 없다', async () => {
    const short = await setup({ ...goodSetup, password: 'short' });
    expect(short.status).toBe(400);
    const ok = await setup({ ...goodSetup, researcher: true });
    expect(ok.status).toBe(200);
    const set = ok.headers.get('set-cookie')!;
    expect(set).toContain('Secure');
    const cookie = set.split(';')[0]!;
    expect((await req('/api/projects', { cookie })).status).toBe(200);
    const me = (await (await req('/api/auth/me', { cookie })).json()).user;
    expect(me.displayName).toBe('이희재');
    // 첫 계정을 만들 때 연구자 계정으로 정할 수 있다 (승인은 연구자 계정만)
    expect(me.role).toBe('researcher');
    expect((await setup({ ...goodSetup, username: 'intruder' })).status).toBe(409);
    expect(auth.userCount()).toBe(1);
  });

  it('공개 주소에서 보낸 변경 요청은 받고, 다른 사이트는 막는다. 제작에는 공개 주소를 넘긴다', async () => {
    const login = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'heejae', password: 'correct horse battery' }) });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const body = JSON.stringify({ recipe: SAMPLE_RECIPES[0] });
    const evil = await req('/api/projects', { method: 'POST', cookie, headers: { origin: 'https://evil.example' }, body });
    expect(evil.status).toBe(403);
    const created = await req('/api/projects', { method: 'POST', cookie, headers: { origin: ENV.PUBLIC_URL }, body });
    expect(created.status).toBe(201);
    const pid = (await created.json()).id;
    const r = await req(`/api/projects/${pid}/renders`, { method: 'POST', cookie, headers: { origin: ENV.PUBLIC_URL } });
    expect(r.status).toBe(202);
    expect(starts.at(-1)).toBe(ENV.PUBLIC_URL);
  });
});

describe('클라우드: DB 복사본', () => {
  it('바뀐 내용을 저장소에 복사하고, 새 서버는 복사본에서 이어서 쓴다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
    const local = path.join(dir, 'local', 'studio.db');
    const snap = path.join(dir, 'volume', 'studio.db');
    const repo = new Repo(openDb(local));
    const snaps = startSnapshots(repo.db, snap, 60_000);
    new Auth(repo.db).addUser('heejae', '이희재', 'correct horse battery');
    snaps.flush();
    snaps.stop();
    repo.db.close();

    // 컨테이너가 바뀌면 서버 안 디스크는 비어 있다
    const fresh = path.join(dir, 'fresh', 'studio.db');
    expect(restoreSnapshot(fresh, snap)).toBe(true);
    expect(new Auth(openDb(fresh)).userCount()).toBe(1);
    // 이미 DB가 있으면 덮어쓰지 않는다
    expect(restoreSnapshot(fresh, snap)).toBe(false);
  });

  it('쓰는 동안 임대 표시를 남기고, 끌 때 "다 썼음"으로 바꾼다 (다음 서버가 기다렸다 이어받게)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lease-'));
    const snap = path.join(dir, 'volume', 'studio.db');
    const repo = new Repo(openDb(path.join(dir, 'local', 'studio.db')));
    const snaps = startSnapshots(repo.db, snap, 60_000, 'container-a');
    expect(readLease(snap)).toMatchObject({ owner: 'container-a', released: false });
    new Auth(repo.db).addUser('heejae', '이희재', 'correct horse battery');
    snaps.release();
    expect(readLease(snap)).toMatchObject({ owner: 'container-a', released: true });
    // 끄기 직전 변경도 복사본에 들어 있다
    expect(new Auth(openDb(snap)).userCount()).toBe(1);
  });
});

describe('클라우드: 제작 중 깨워 두기', () => {
  it('공개 주소의 /api/health를 바로, 그리고 주기적으로 부른다', async () => {
    let hits = 0;
    const express = (await import('express')).default;
    const app = express();
    app.get('/api/health', (_req, res) => {
      hits++;
      res.json({ ok: true });
    });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const stop = keepAwake(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, 50);
    await new Promise((r) => setTimeout(r, 180));
    stop();
    const after = hits;
    await new Promise((r) => setTimeout(r, 120));
    server.close();
    expect(after).toBeGreaterThanOrEqual(3);
    expect(hits).toBe(after);
  });
});
