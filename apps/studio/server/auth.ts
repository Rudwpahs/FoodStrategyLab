import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Db } from './db.ts';
import { HttpError } from './repo.ts';

/**
 * 로그인. 다른 PC·휴대폰에서 접속하려면 계정이 있어야 한다.
 * - 계정이 하나도 없으면 '이 컴퓨터 전용' 모드: 이 PC에서 직접 연 요청만 받는다 (터널·프록시를 거친 요청은 거절)
 * - 계정이 있으면 모든 API·미디어에 로그인이 필요하다
 */
export interface User {
  id: number;
  username: string;
  displayName: string;
}

const COOKIE = 'matlab_session';
const SESSION_DAYS = 30;
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, n, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: 8, p: 1 });
  return crypto.timingSafeEqual(got, expected);
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * 영상 렌더러(이 서버 안의 크롬)가 목소리·사진 파일을 가져갈 때 쓰는 비밀 열쇠.
 * 서버를 켤 때마다 새로 만들고, 렌더러에 넘기는 주소에만 붙는다 (사람 화면에는 쓰이지 않음).
 */
export const RENDER_TOKEN = crypto.randomBytes(24).toString('hex');

export function withRenderToken(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}k=${RENDER_TOKEN}`;
}

function hasRenderToken(req: Request): boolean {
  const k = typeof req.query.k === 'string' ? req.query.k : '';
  return k.length === RENDER_TOKEN.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(RENDER_TOKEN));
}

/** 로그인 실패 횟수를 셀 사람 구분: 터널·Tailscale 뒤에서는 전달된 실제 주소를 쓴다 */
export function clientIp(req: Request): string {
  const remote = req.socket.remoteAddress ?? '';
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]!.trim();
  return LOOPBACK.has(remote) && fwd ? fwd : remote;
}

export class Auth {
  private fails = new Map<string, { count: number; first: number }>();

  constructor(private db: Db) {}

  userCount(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n);
  }

  addUser(username: string, displayName: string, password: string): User {
    const name = username.trim();
    if (!/^[\w.-]{3,32}$/.test(name)) throw new Error('아이디는 영문·숫자 3~32자로 정해 주세요.');
    if (password.length < 10) throw new Error('비밀번호는 10자 이상으로 정해 주세요.');
    this.db
      .prepare('INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(name, displayName.trim() || name, hashPassword(password), new Date().toISOString());
    const u = this.findUser(name)!;
    return { id: u.id, username: u.username, displayName: u.displayName };
  }

  /** 비밀번호를 바꾸면 그 계정의 모든 로그인(세션)을 끊는다 */
  setPassword(username: string, password: string) {
    if (password.length < 10) throw new Error('비밀번호는 10자 이상으로 정해 주세요.');
    const r = this.db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hashPassword(password), username);
    if (!r.changes) throw new Error('없는 아이디입니다.');
    this.db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)').run(username);
  }

  private findUser(username: string): (User & { hash: string }) | null {
    const r = this.db.prepare('SELECT id, username, display_name, password_hash FROM users WHERE username = ?').get(username) as Record<string, unknown> | undefined;
    return r ? { id: Number(r.id), username: String(r.username), displayName: String(r.display_name), hash: String(r.password_hash) } : null;
  }

  /** 로그인 성공 시 세션 토큰 (DB에는 해시만 저장) */
  login(username: string, password: string, ip: string): { token: string; user: User } {
    const f = this.fails.get(ip);
    if (f && Date.now() - f.first < FAIL_WINDOW_MS && f.count >= MAX_FAILS) {
      throw new HttpError(429, '로그인을 너무 많이 실패했어요. 15분 뒤 다시 시도해 주세요.');
    }
    const u = this.findUser(username.trim());
    if (!u || !verifyPassword(password, u.hash)) {
      const cur = f && Date.now() - f.first < FAIL_WINDOW_MS ? f : { count: 0, first: Date.now() };
      this.fails.set(ip, { ...cur, count: cur.count + 1 });
      throw new HttpError(401, '아이디 또는 비밀번호가 맞지 않아요.');
    }
    this.fails.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(sha256(token), u.id, new Date(now).toISOString(), new Date(now + SESSION_DAYS * 864e5).toISOString());
    return { token, user: { id: u.id, username: u.username, displayName: u.displayName } };
  }

  sessionUser(token: string | undefined): User | null {
    if (!token) return null;
    const r = this.db
      .prepare('SELECT u.id, u.username, u.display_name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
      .get(sha256(token)) as Record<string, unknown> | undefined;
    if (!r || Date.parse(String(r.expires_at)) < Date.now()) return null;
    return { id: Number(r.id), username: String(r.username), displayName: String(r.display_name) };
  }

  logout(token: string | undefined) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }
}

export function readCookie(req: Request, name = COOKIE): string | undefined {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PROXY_HEADERS = ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded', 'x-forwarded-host'];

/** 이 PC에서 직접 연 요청인지 (터널·프록시를 거친 요청은 아님) */
export function isDirectLocal(req: Request): boolean {
  return LOOPBACK.has(req.socket.remoteAddress ?? '') && !PROXY_HEADERS.some((h) => req.headers[h]);
}

const isHttps = (req: Request) => req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1';

export function sessionCookie(req: Request, token: string, maxAgeSeconds = SESSION_DAYS * 86400): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isHttps(req) ? '; Secure' : ''}`;
}

/** 로그인 확인 + 다른 사이트에서 보낸 변경 요청 차단 */
export function authGuard(auth: Auth) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== 'null' && new URL(origin).host !== req.headers.host) {
        return next(new HttpError(403, '다른 사이트에서 보낸 요청은 받지 않아요.'));
      }
    }
    // 영상 렌더러의 미디어 요청 (비밀 열쇠가 맞을 때만)
    if (req.baseUrl === '/media' && hasRenderToken(req)) return next();
    if (auth.userCount() === 0) {
      if (isDirectLocal(req)) return next();
      return next(new HttpError(403, '아직 계정이 없어 이 컴퓨터에서만 쓸 수 있어요. 스튜디오 PC에서 "npm run user:add"로 계정을 만드세요.'));
    }
    const user = auth.sessionUser(readCookie(req));
    if (!user) return next(new HttpError(401, '로그인이 필요해요.'));
    res.locals.user = user;
    next();
  };
}
