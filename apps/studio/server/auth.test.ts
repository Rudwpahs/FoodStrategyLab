import './testDataDir.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '@mat-lab/recipe-core';
import { createApp } from './app.ts';
import { Auth, RENDER_TOKEN, hashPassword, verifyPassword } from './auth.ts';
import { openDb } from './db.ts';
import { Repo } from './repo.ts';

let base = '';
let close: () => void;
let auth: Auth;

beforeAll(async () => {
  const repo = new Repo(openDb(':memory:'));
  auth = new Auth(repo.db);
  const app = createApp(repo, { startRender: () => 0, auth });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());

const req = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers ?? {}) } });

describe('비밀번호', () => {
  it('해시로만 저장하고 맞는 비밀번호만 통과한다', () => {
    const h = hashPassword('correct horse battery');
    expect(h).not.toContain('correct');
    expect(verifyPassword('correct horse battery', h)).toBe(true);
    expect(verifyPassword('wrong password!!', h)).toBe(false);
  });
});

describe('계정이 없을 때 (이 컴퓨터 전용)', () => {
  it('이 PC에서 직접 연 요청은 되고, 터널·프록시를 거친 요청은 막는다', async () => {
    expect((await req('/api/projects')).status).toBe(200);
    expect((await req('/api/projects', { headers: { 'x-forwarded-for': '1.2.3.4' } })).status).toBe(403);
    expect((await req('/api/projects', { headers: { 'cf-connecting-ip': '1.2.3.4' } })).status).toBe(403);
    expect((await req('/media/x.png', { headers: { 'x-forwarded-for': '1.2.3.4' } })).status).toBe(403);
    const me = await (await req('/api/auth/me')).json();
    expect(me.mode).toBe('local');
  });

  it('다른 웹페이지가 보낸 요청은 막는다: Origin null(샌드박스 iframe 등), 다른 이름으로 접속(DNS 리바인딩)', async () => {
    const raw = (path: string, method: string, headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const r = http.request(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        r.on('error', reject);
        r.end(method === 'GET' ? undefined : '{}');
      });
    const port = new URL(base).port;
    expect(await raw('/api/instagram/disconnect', 'POST', { origin: 'null' })).toBe(403);
    expect(await raw('/api/projects', 'GET', { host: `evil.example:${port}` })).toBe(403);
    expect(await raw('/media/studio.db', 'GET', { host: `evil.example:${port}` })).toBe(403);
    expect(await raw('/api/projects', 'POST', { host: `evil.example:${port}`, origin: `http://evil.example:${port}` })).toBe(403);
    // 이 PC의 주소로 연 요청은 그대로 된다
    expect(await raw('/api/projects', 'GET', { host: `localhost:${port}` })).toBe(200);
    expect(await raw('/api/projects', 'GET', { host: `127.0.0.1:${port}` })).toBe(200);
  });

  it('너무 짧은 비밀번호로는 계정을 만들 수 없다', () => {
    expect(() => auth.addUser('heejae', '이희재', 'short')).toThrow(/10자/);
  });

  it('계정은 기본이 일반 계정이고, 만들 때 연구자로 정할 수 있다', () => {
    const repo = new Repo(openDb(':memory:'));
    const a = new Auth(repo.db);
    expect(a.addUser('helper', '도우미', 'a long password!').role).toBe('member');
    expect(a.researcherCount()).toBe(0);
    expect(a.addUser('heejae', '이희재', 'a long password!', 'researcher').role).toBe('researcher');
    expect(a.researcherCount()).toBe(1);
    expect(a.isResearcherName('이희재')).toBe(true);
    expect(a.isResearcherName('도우미')).toBe(false);
  });

  it('예전 DB(역할 열 없음)도 열리고, 기존 계정은 일반 계정이 된다', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'old-db-')), 'studio.db');
    const old = new DatabaseSync(file);
    old.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)');
    old.prepare('INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)').run('heejae', '이희재', hashPassword('a long password!'), new Date().toISOString());
    old.close();
    const a = new Auth(openDb(file));
    expect(a.researcherCount()).toBe(0);
    expect(a.login('heejae', 'a long password!', '1.1.1.1').user.role).toBe('member');
    a.setRole('heejae', 'researcher');
    expect(a.researcherCount()).toBe(1);
  });
});

describe('계정이 있을 때', () => {
  let cookie = '';

  beforeAll(() => {
    auth.addUser('heejae', '이희재', 'correct horse battery');
    auth.addUser('family', '가족', 'another long password');
  });

  it('로그인 전에는 API·미디어가 막히고, 로그인하면 열린다', async () => {
    expect((await req('/api/projects')).status).toBe(401);
    expect((await req('/media/x.png')).status).toBe(401);
    const bad = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'heejae', password: 'nope nope nope' }) });
    expect(bad.status).toBe(401);
    const ok = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'heejae', password: 'correct horse battery' }) });
    expect(ok.status).toBe(200);
    const set = ok.headers.get('set-cookie')!;
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=Lax');
    cookie = set.split(';')[0]!;
    expect((await req('/api/projects', { cookie })).status).toBe(200);
    const me = await (await req('/api/auth/me', { cookie })).json();
    expect(me.user.displayName).toBe('이희재');
  });

  it('다른 사이트에서 보낸 변경 요청은 막는다', async () => {
    const r = await req('/api/projects', { method: 'POST', cookie, headers: { origin: 'https://evil.example' }, body: JSON.stringify({ recipe: SAMPLE_RECIPES[0] }) });
    expect(r.status).toBe(403);
  });

  it('승인자는 로그인한 사람 이름으로 기록된다 (다른 이름을 적어도)', async () => {
    const login = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'family', password: 'another long password' }) });
    const fam = login.headers.get('set-cookie')!.split(';')[0]!;
    const pid = (await (await req('/api/projects', { method: 'POST', cookie: fam, body: JSON.stringify({ recipe: SAMPLE_RECIPES[1] }) })).json()).id;
    await req(`/api/projects/${pid}/script/template`, { method: 'POST', cookie: fam });
    const checklist = { ingredients: true, safety: true, noFakeClaims: true, expression: true };
    const r = await (await req(`/api/projects/${pid}/reviews`, { method: 'POST', cookie: fam, body: JSON.stringify({ version: 1, reviewer: '이희재', checklist, decision: 'approved' }) })).json();
    expect(r.approval.reviewer).toBe('가족');
    // 연구자 계정이 아닌 승인: 공개 문구에 연구자 이름을 쓰지 않는다
    expect(r.approval.byResearcher).toBe(false);
    // 연구자 계정이 아직 없으면 누구나 승인할 수 있지만, 화면에 알릴 경고를 함께 준다
    expect(r.warning).toContain('연구자 계정');
  });

  it('연구자 계정이 없을 때만 화면에서 한 번 연구자 계정을 정할 수 있다 (정한 뒤에는 다른 계정이 가로챌 수 없음)', async () => {
    const loginAs = async (username: string, password: string) =>
      (await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })).headers.get('set-cookie')!.split(';')[0]!;
    const hee = await loginAs('heejae', 'correct horse battery');
    const fam = await loginAs('family', 'another long password');
    expect((await (await req('/api/auth/me', { cookie: hee })).json()).researcherSet).toBe(false);
    const claimed = await req('/api/auth/claim-researcher', { method: 'POST', cookie: hee });
    expect(claimed.status).toBe(200);
    expect((await claimed.json()).user.role).toBe('researcher');
    expect((await (await req('/api/auth/me', { cookie: hee })).json()).researcherSet).toBe(true);
    expect((await req('/api/auth/claim-researcher', { method: 'POST', cookie: fam })).status).toBe(409);
    expect((await (await req('/api/auth/me', { cookie: fam })).json()).user.role).toBe('member');
  });

  it('연구자 계정이 정해지면 연구자 계정만 승인할 수 있다 (수정 요청은 누구나)', async () => {
    const loginAs = async (username: string, password: string) =>
      (await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })).headers.get('set-cookie')!.split(';')[0]!;
    expect(() => auth.setRole('nobody', 'researcher')).toThrow();
    auth.setRole('heejae', 'researcher');
    const fam = await loginAs('family', 'another long password');
    const hee = await loginAs('heejae', 'correct horse battery');
    expect((await (await req('/api/auth/me', { cookie: hee })).json()).user.role).toBe('researcher');
    expect((await (await req('/api/auth/me', { cookie: fam })).json()).user.role).toBe('member');
    const pid = (await (await req('/api/projects', { method: 'POST', cookie: fam, body: JSON.stringify({ recipe: SAMPLE_RECIPES[1] }) })).json()).id;
    await req(`/api/projects/${pid}/script/template`, { method: 'POST', cookie: fam });
    const checklist = { ingredients: true, safety: true, noFakeClaims: true, expression: true };
    const review = (cookie: string, decision: string) => req(`/api/projects/${pid}/reviews`, { method: 'POST', cookie, body: JSON.stringify({ version: 1, reviewer: '이희재', checklist, decision, note: '확인' }) });
    const denied = await review(fam, 'approved');
    expect(denied.status).toBe(403);
    expect(await denied.text()).toContain('연구자 계정');
    expect((await review(fam, 'changes_requested')).status).toBe(200);
    const ok = await review(hee, 'approved');
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.approval.reviewer).toBe('이희재');
    expect(body.approval.byResearcher).toBe(true);
    expect(body.warning).toBeUndefined();
  });

  it('영상 렌더러는 비밀 열쇠로만 미디어를 받을 수 있다 (로그인 없이)', async () => {
    expect((await req('/media/audio/none.mp3?k=wrong')).status).toBe(401);
    // 열쇠가 맞으면 로그인 확인을 통과한다 (파일이 없어서 404)
    expect((await req(`/media/audio/none.mp3?k=${RENDER_TOKEN}`)).status).toBe(404);
    // 열쇠로 API는 열리지 않는다
    expect((await req(`/api/projects?k=${RENDER_TOKEN}`)).status).toBe(401);
  });

  it('로그아웃하면 그 세션은 더 이상 쓸 수 없다', async () => {
    await req('/api/auth/logout', { method: 'POST', cookie });
    expect((await req('/api/projects', { cookie })).status).toBe(401);
  });

  it('비밀번호를 여러 번 틀리면 잠시 막는다 (Tailscale 뒤에서는 실제 접속 주소별로)', async () => {
    const h = (ip: string) => ({ 'x-forwarded-for': ip });
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await req('/api/auth/login', { method: 'POST', headers: h('100.64.0.9'), body: JSON.stringify({ username: 'heejae', password: `wrong-${i}-xxxxxxxx` }) })).status;
    expect(last).toBe(429);
    // 다른 기기(다른 주소)는 막히지 않는다
    const other = await req('/api/auth/login', { method: 'POST', headers: h('100.64.0.10'), body: JSON.stringify({ username: 'heejae', password: 'correct horse battery' }) });
    expect(other.status).toBe(200);
  });
});
