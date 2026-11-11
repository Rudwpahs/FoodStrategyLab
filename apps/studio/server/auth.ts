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
  /** researcher = 연구자 계정. 연구자 계정이 하나라도 있으면 승인은 연구자 계정만 할 수 있다 */
  role: Role;
}

export type Role = 'member' | 'researcher';
const toRole = (v: unknown): Role => (v === 'researcher' ? 'researcher' : 'member');

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

/** 클라우드(Modal 등) 앞단 프록시가 붙인 주소·호스트 정보를 믿을지 (TRUST_PROXY=1) */
const trustProxy = () => process.env.TRUST_PROXY === '1';

/** 로그인 실패 횟수를 셀 사람 구분: 터널·Tailscale·클라우드 프록시 뒤에서는 전달된 실제 주소를 쓴다 */
export function clientIp(req: Request): string {
  const remote = req.socket.remoteAddress ?? '';
  // 맨 오른쪽 값 = 바로 앞의 믿는 프록시가 붙인 실제 접속 주소. 맨 앞 값은 접속자가 마음대로 넣을 수 있다.
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map((x) => x.trim()).filter(Boolean).at(-1) ?? '';
  return (LOOPBACK.has(remote) || trustProxy()) && fwd ? fwd : remote;
}

/** 설정 코드는 정상 사용자가 딱 한 번 쓰는 값: 서버가 켜져 있는 동안 전체에서 이만큼 틀리면 막는다 */
const SETUP_MAX_FAILS_TOTAL = 30;

/** 이 스튜디오의 공개 주소(클라우드). PUBLIC_URL이 없으면 요청 헤더로 짐작한다. */
export function publicOrigin(req: Request): string {
  const fixed = process.env.PUBLIC_URL?.replace(/\/$/, '');
  if (fixed) return fixed;
  const host = (trustProxy() && String(req.headers['x-forwarded-host'] ?? '').split(',')[0]!.trim()) || req.headers.host || '';
  const proto = (trustProxy() && String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]!.trim()) || (req.secure ? 'https' : 'http');
  return `${proto}://${host}`;
}

/** 이 스튜디오의 주소로 인정하는 호스트들 (다른 사이트에서 보낸 변경 요청을 막는 데 쓴다) */
function ownHosts(req: Request): Set<string> {
  const hosts = new Set<string>();
  if (req.headers.host) hosts.add(req.headers.host);
  if (trustProxy()) {
    const fwd = String(req.headers['x-forwarded-host'] ?? '').split(',')[0]!.trim();
    if (fwd) hosts.add(fwd);
  }
  if (process.env.PUBLIC_URL) {
    try {
      hosts.add(new URL(process.env.PUBLIC_URL).host);
    } catch {
      /* 잘못된 주소는 무시 */
    }
  }
  return hosts;
}

/**
 * 처음 계정 만들기용 설정 코드 (클라우드 서버처럼 명령창이 없는 곳에서 쓴다).
 * 8자 미만이면 쓰지 않는다 (추측당하기 쉬움).
 */
export function setupCode(): string | null {
  const code = process.env.STUDIO_SETUP_CODE ?? '';
  return code.length >= 8 ? code : null;
}

export class Auth {
  private fails = new Map<string, { count: number; first: number }>();

  constructor(private db: Db) {}

  userCount(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n);
  }

  addUser(username: string, displayName: string, password: string, role: Role = 'member'): User {
    const name = username.trim();
    if (!/^[\w.-]{3,32}$/.test(name)) throw new Error('아이디는 영문·숫자 3~32자로 정해 주세요.');
    if (password.length < 10) throw new Error('비밀번호는 10자 이상으로 정해 주세요.');
    this.db
      .prepare('INSERT INTO users (username, display_name, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)')
      .run(name, displayName.trim() || name, hashPassword(password), new Date().toISOString(), role);
    const u = this.findUser(name)!;
    return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
  }

  /** 계정 역할 바꾸기 (npm run user:add -- 아이디 --researcher) */
  setRole(username: string, role: Role) {
    const r = this.db.prepare('UPDATE users SET role = ? WHERE username = ?').run(role, username);
    if (!r.changes) throw new Error('없는 아이디입니다.');
  }

  researcherCount(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'researcher'").get() as { n: number }).n);
  }

  /** 이 이름(표시 이름)이 연구자 계정의 이름인지 (검수 기록의 승인자가 연구자였는지 확인할 때) */
  isResearcherName(displayName: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM users WHERE role = 'researcher' AND display_name = ?").get(displayName));
  }

  /** 비밀번호를 바꾸면 그 계정의 모든 로그인(세션)을 끊는다 */
  setPassword(username: string, password: string) {
    if (password.length < 10) throw new Error('비밀번호는 10자 이상으로 정해 주세요.');
    const r = this.db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hashPassword(password), username);
    if (!r.changes) throw new Error('없는 아이디입니다.');
    this.db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)').run(username);
  }

  private findUser(username: string): (User & { hash: string }) | null {
    const r = this.db.prepare('SELECT id, username, display_name, password_hash, role FROM users WHERE username = ?').get(username) as Record<string, unknown> | undefined;
    return r ? { id: Number(r.id), username: String(r.username), displayName: String(r.display_name), role: toRole(r.role), hash: String(r.password_hash) } : null;
  }

  private checkLocked(ip: string) {
    const f = this.fails.get(ip);
    if (f && Date.now() - f.first < FAIL_WINDOW_MS && f.count >= MAX_FAILS) {
      throw new HttpError(429, '너무 많이 실패했어요. 15분 뒤 다시 시도해 주세요.');
    }
  }

  private setupFailsTotal = 0;

  private countFail(ip: string) {
    // 기록이 끝없이 쌓이지 않게 오래된 것을 지운다
    if (this.fails.size > 5000) {
      for (const [k, v] of this.fails) if (Date.now() - v.first > FAIL_WINDOW_MS) this.fails.delete(k);
      if (this.fails.size > 5000) this.fails.clear();
    }
    const f = this.fails.get(ip);
    const cur = f && Date.now() - f.first < FAIL_WINDOW_MS ? f : { count: 0, first: Date.now() };
    this.fails.set(ip, { ...cur, count: cur.count + 1 });
  }

  /** 로그인 성공 시 세션 토큰 (DB에는 해시만 저장) */
  login(username: string, password: string, ip: string): { token: string; user: User } {
    this.checkLocked(ip);
    const u = this.findUser(username.trim());
    if (!u || !verifyPassword(password, u.hash)) {
      this.countFail(ip);
      throw new HttpError(401, '아이디 또는 비밀번호가 맞지 않아요.');
    }
    this.fails.delete(ip);
    return { token: this.newSession(u.id), user: { id: u.id, username: u.username, displayName: u.displayName, role: u.role } };
  }

  /**
   * 첫 계정 만들기 (계정이 하나도 없고 설정 코드가 있을 때만).
   * 설정 코드는 서버 관리자가 정한 값이며, 틀리면 로그인 실패처럼 횟수를 센다.
   */
  setupFirstUser(input: { code: string; username: string; displayName: string; password: string; researcher?: boolean }, ip: string): { token: string; user: User } {
    const expected = setupCode();
    if (!expected) throw new HttpError(404, '이 서버에서는 화면에서 계정을 만들 수 없어요.');
    if (this.userCount() > 0) throw new HttpError(409, '이미 계정이 있어요. 로그인해 주세요.');
    if (this.setupFailsTotal >= SETUP_MAX_FAILS_TOTAL) throw new HttpError(429, '설정 코드가 너무 많이 틀렸어요. 서버를 다시 배포한 뒤 시도해 주세요.');
    this.checkLocked(ip);
    const a = Buffer.from(sha256(input.code));
    const b = Buffer.from(sha256(expected));
    if (!crypto.timingSafeEqual(a, b)) {
      this.countFail(ip);
      this.setupFailsTotal++;
      throw new HttpError(401, '설정 코드가 맞지 않아요.');
    }
    let user: User;
    try {
      user = this.addUser(input.username, input.displayName, input.password, input.researcher ? 'researcher' : 'member');
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    this.fails.delete(ip);
    return { token: this.newSession(user.id), user };
  }

  private newSession(userId: number): string {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(sha256(token), userId, new Date(now).toISOString(), new Date(now + SESSION_DAYS * 864e5).toISOString());
    return token;
  }

  sessionUser(token: string | undefined): User | null {
    if (!token) return null;
    const r = this.db
      .prepare('SELECT u.id, u.username, u.display_name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
      .get(sha256(token)) as Record<string, unknown> | undefined;
    if (!r || Date.parse(String(r.expires_at)) < Date.now()) return null;
    return { id: Number(r.id), username: String(r.username), displayName: String(r.display_name), role: toRole(r.role) };
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

/**
 * 주소창의 이름(Host)이 이 PC(localhost·127.0.0.1·::1) 또는 정해 둔 공개 주소인지.
 * 악성 웹페이지가 자기 도메인을 127.0.0.1로 바꿔 부르는 경우(DNS 리바인딩)를 막는다.
 */
function localHostName(req: Request): boolean {
  const host = req.headers.host ?? '';
  try {
    if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${host}`).hostname)) return true;
    return Boolean(process.env.PUBLIC_URL) && new URL(process.env.PUBLIC_URL!).host === host;
  } catch {
    return false;
  }
}

/** 이 PC에서 직접 연 요청인지 (터널·프록시를 거친 요청, 다른 이름으로 들어온 요청은 아님) */
export function isDirectLocal(req: Request): boolean {
  return LOOPBACK.has(req.socket.remoteAddress ?? '') && !PROXY_HEADERS.some((h) => req.headers[h]) && localHostName(req);
}

const foreignOrigin = (req: Request, origin: string) => {
  try {
    return !ownHosts(req).has(new URL(origin).host);
  } catch {
    return true;
  }
};

const isHttps = (req: Request) => req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1';

export function sessionCookie(req: Request, token: string, maxAgeSeconds = SESSION_DAYS * 86400): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isHttps(req) ? '; Secure' : ''}`;
}

/** 로그인 확인 + 다른 사이트에서 보낸 변경 요청 차단 */
export function authGuard(auth: Auth) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      // Origin 'null'(샌드박스 iframe·data: 페이지)은 어느 사이트인지 알 수 없다: 계정 없는 모드에서는 막는다
      // (계정이 있으면 SameSite 로그인 쿠키가 붙지 않아 어차피 막힌다)
      if (origin === 'null' ? auth.userCount() === 0 : origin && foreignOrigin(req, origin)) {
        return next(new HttpError(403, '다른 사이트에서 보낸 요청은 받지 않아요.'));
      }
    }
    // 영상 렌더러의 미디어 요청 (비밀 열쇠가 맞을 때만)
    if (req.baseUrl === '/media' && hasRenderToken(req)) return next();
    if (auth.userCount() === 0) {
      if (isDirectLocal(req)) return next();
      if (setupCode()) return next(new HttpError(403, '처음 계정을 먼저 만들어 주세요.'));
      return next(new HttpError(403, '아직 계정이 없어 이 컴퓨터에서만 쓸 수 있어요. 스튜디오 PC에서 "npm run user:add"로 계정을 만드세요.'));
    }
    const user = auth.sessionUser(readCookie(req));
    if (!user) return next(new HttpError(401, '로그인이 필요해요.'));
    res.locals.user = user;
    next();
  };
}
