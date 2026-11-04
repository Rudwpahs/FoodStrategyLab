import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Db } from './db.ts';
import { HttpError } from './repo.ts';

/**
 * 인스타그램 공식 게시 (Instagram API with Instagram Login).
 * 근거: Meta 공식 문서 (2026-11-04 확인)
 * - 로그인: https://www.instagram.com/oauth/authorize → 코드(1시간, 1회용)
 * - 코드 교환: POST https://api.instagram.com/oauth/access_token → 짧은 토큰(1시간)
 * - 장기 토큰: GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token (60일)
 * - 갱신: GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token (24시간 지난 토큰, 다시 60일)
 * - 릴스: POST /<IG_ID>/media (media_type=REELS, video_url: Meta가 공개 주소에서 내려받음)
 *   → GET /<컨테이너>?fields=status_code (1분에 한 번 정도, FINISHED까지) → POST /<IG_ID>/media_publish
 * - Instagram Login 방식에서는 '재개 가능한 업로드'를 쓸 수 없어 공개 주소(video_url)가 꼭 필요하다.
 * - 계정당 24시간에 API 게시 100건.
 */

export const IG_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

export interface IgConfig {
  appId: string;
  appSecret: string;
  version: string;
  /** 시험용으로 바꿀 수 있는 주소들 */
  graph: string;
  oauth: string;
  authorize: string;
}

/** 환경 변수의 Meta 앱 정보. 없으면 인스타그램 자동 게시는 '설정 전' */
export function igConfig(): IgConfig | null {
  const e = process.env;
  if (!e.INSTAGRAM_APP_ID || !e.INSTAGRAM_APP_SECRET) return null;
  return {
    appId: e.INSTAGRAM_APP_ID,
    appSecret: e.INSTAGRAM_APP_SECRET,
    version: e.INSTAGRAM_API_VERSION || 'v26.0',
    graph: (e.INSTAGRAM_GRAPH_URL || 'https://graph.instagram.com').replace(/\/$/, ''),
    oauth: (e.INSTAGRAM_OAUTH_URL || 'https://api.instagram.com').replace(/\/$/, ''),
    authorize: (e.INSTAGRAM_AUTHORIZE_URL || 'https://www.instagram.com/oauth/authorize').replace(/\/$/, ''),
  };
}

// ───────────── 토큰 암호화 저장 (AES-256-GCM, 열쇠는 앱 비밀값에서 만든다) ─────────────

const keyFrom = (cfg: IgConfig) => crypto.createHash('sha256').update(`matlab-instagram-token:${cfg.appSecret}`).digest();

export function sealToken(cfg: IgConfig, token: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFrom(cfg), iv);
  const enc = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function openToken(cfg: IgConfig, sealed: string): string | null {
  const [v, iv, tag, enc] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !enc) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keyFrom(cfg), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null; // 앱 비밀값이 바뀌면 다시 연결해야 한다
  }
}

// ───────────── Meta가 내려받을 임시 공개 영상 주소 ─────────────

const links = new Map<string, { file: string; expires: number }>();

/** 추측할 수 없는 임시 주소 열쇠 (기본 2시간 뒤 만료) */
export function issuePublicLink(file: string, ttlMs = 2 * 3600_000): string {
  const token = crypto.randomBytes(24).toString('base64url');
  links.set(token, { file, expires: Date.now() + ttlMs });
  return token;
}

export function resolvePublicLink(token: string): string | null {
  const l = links.get(token);
  if (!l) return null;
  if (Date.now() > l.expires) {
    links.delete(token);
    return null;
  }
  return l.file;
}

export function revokePublicLink(token: string) {
  links.delete(token);
}

// ───────────── 게시 작업 상태 ─────────────

export type IgJobStatus = 'uploading' | 'processing' | 'publishing' | 'published' | 'failed';
export interface IgJob {
  id: string;
  projectId: number;
  renderId: number;
  status: IgJobStatus;
  message: string;
  permalink: string;
  startedAt: string;
}

const jobs = new Map<string, IgJob>();
export const getIgJob = (id: string) => jobs.get(id) ?? null;
export const activeIgJob = (projectId: number) => [...jobs.values()].find((j) => j.projectId === projectId && !['published', 'failed'].includes(j.status)) ?? null;

/** 인스타그램 설명 글 한도 (2,200자, 해시태그 30개) */
export function checkCaption(caption: string): string | null {
  if (!caption.trim()) return '설명 글을 넣어 주세요.';
  if (caption.length > 2200) return `설명 글은 2,200자까지예요 (지금 ${caption.length}자).`;
  const tags = caption.match(/#[^\s#]+/g) ?? [];
  if (tags.length > 30) return `해시태그는 30개까지예요 (지금 ${tags.length}개).`;
  return null;
}

// ───────────── 연결·게시 ─────────────

interface Account {
  igUserId: string;
  username: string;
  token: string;
  expiresAt: string;
  refreshedAt: string;
}

export interface IgStatus {
  configured: boolean;
  connected: boolean;
  username: string;
  expiresAt: string;
  /** 연결이 끊겼다면 이유 */
  problem: string;
}

type Fetch = typeof fetch;

export class Instagram {
  private states = new Map<string, { expires: number; redirectUri: string }>();

  constructor(
    private db: Db,
    private http: Fetch = fetch,
  ) {}

  private cfg(): IgConfig {
    const c = igConfig();
    if (!c) throw new HttpError(409, '인스타그램 앱 정보가 아직 설정되지 않았어요. docs/INSTAGRAM_SETUP.md를 보세요.');
    return c;
  }

  private account(): Account | null {
    const cfg = igConfig();
    const r = this.db.prepare('SELECT * FROM instagram_account WHERE id = 1').get() as Record<string, unknown> | undefined;
    if (!cfg || !r) return null;
    const token = openToken(cfg, String(r.token_sealed));
    if (!token) return null;
    return { igUserId: String(r.ig_user_id), username: String(r.username), token, expiresAt: String(r.expires_at), refreshedAt: String(r.refreshed_at) };
  }

  private save(a: Account) {
    const cfg = this.cfg();
    this.db
      .prepare(
        `INSERT INTO instagram_account (id, ig_user_id, username, token_sealed, expires_at, refreshed_at, connected_at) VALUES (1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET ig_user_id = excluded.ig_user_id, username = excluded.username, token_sealed = excluded.token_sealed,
           expires_at = excluded.expires_at, refreshed_at = excluded.refreshed_at`,
      )
      .run(a.igUserId, a.username, sealToken(cfg, a.token), a.expiresAt, a.refreshedAt, new Date().toISOString());
  }

  disconnect() {
    this.db.prepare('DELETE FROM instagram_account WHERE id = 1').run();
  }

  async status(): Promise<IgStatus> {
    const configured = igConfig() !== null;
    let a = this.account();
    let problem = '';
    if (a && Date.parse(a.expiresAt) < Date.now()) {
      problem = '연결 기간(60일)이 지났어요. 다시 연결해 주세요.';
      a = null;
    } else if (a) {
      const current = a;
      a = await this.refreshIfNeeded(current).catch(() => this.account());
    }
    return { configured, connected: Boolean(a), username: a?.username ?? '', expiresAt: a?.expiresAt ?? '', problem };
  }

  /** 로그인 창 주소. state는 10분 동안 한 번만 쓸 수 있다 (다른 사이트의 위조 요청 방지) */
  authorizeUrl(redirectUri: string): string {
    const cfg = this.cfg();
    const state = crypto.randomBytes(18).toString('base64url');
    this.states.set(state, { expires: Date.now() + 10 * 60_000, redirectUri });
    const q = new URLSearchParams({ client_id: cfg.appId, redirect_uri: redirectUri, response_type: 'code', scope: IG_SCOPES.join(','), state });
    return `${cfg.authorize}?${q}`;
  }

  /** 로그인 창에서 돌아온 코드로 장기 토큰을 받아 저장한다 */
  async completeLogin(code: string, state: string): Promise<{ username: string }> {
    const cfg = this.cfg();
    const s = this.states.get(state);
    this.states.delete(state);
    if (!s || Date.now() > s.expires) throw new HttpError(400, '연결 요청이 만료됐어요. 스튜디오에서 다시 "인스타그램 연결"을 눌러 주세요.');
    const form = new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, grant_type: 'authorization_code', redirect_uri: s.redirectUri, code: code.replace(/#_$/, '') });
    const short = await this.json(`${cfg.oauth}/oauth/access_token`, { method: 'POST', body: form });
    // 문서 예시는 { data: [ { access_token, user_id, permissions } ] }, 실제로는 평평한 형태도 있다
    const first = (Array.isArray(short.data) ? short.data[0] : short) as Record<string, unknown>;
    const shortToken = String(first?.access_token ?? '');
    if (!shortToken) throw new Error('인스타그램이 토큰을 주지 않았어요.');
    const perms = String(first.permissions ?? '');
    if (perms && !perms.includes('instagram_business_content_publish')) throw new HttpError(400, '게시 권한을 허용하지 않았어요. 다시 연결하면서 "콘텐츠 게시"를 허용해 주세요.');
    const long = await this.json(`${cfg.graph}/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: cfg.appSecret, access_token: shortToken })}`);
    const token = String(long.access_token ?? '');
    if (!token) throw new Error('인스타그램 장기 토큰을 받지 못했어요.');
    const me = await this.json(`${cfg.graph}/${cfg.version}/me?fields=user_id,username`, { headers: { authorization: `Bearer ${token}` } });
    const igUserId = String(me.user_id ?? me.id ?? first.user_id ?? '');
    if (!igUserId) throw new Error('인스타그램 계정 번호를 알 수 없어요.');
    const now = new Date();
    this.save({ igUserId, username: String(me.username ?? ''), token, expiresAt: new Date(now.getTime() + Number(long.expires_in ?? 5_184_000) * 1000).toISOString(), refreshedAt: now.toISOString() });
    return { username: String(me.username ?? '') };
  }

  /** 받은 지 24시간 넘었고 만료 10일 전이면 다시 60일로 늘린다 */
  private async refreshIfNeeded(a: Account): Promise<Account> {
    const age = Date.now() - Date.parse(a.refreshedAt);
    const left = Date.parse(a.expiresAt) - Date.now();
    if (age < 24 * 3600_000 || left > 10 * 86400_000) return a;
    const cfg = this.cfg();
    const r = await this.json(`${cfg.graph}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: a.token })}`, {}, true);
    if (!r.access_token) return a;
    const next = { ...a, token: String(r.access_token), expiresAt: new Date(Date.now() + Number(r.expires_in ?? 5_184_000) * 1000).toISOString(), refreshedAt: new Date().toISOString() };
    this.save(next);
    return next;
  }

  /**
   * 릴스 게시 작업을 시작한다 (승인·중복 확인은 부르는 쪽에서 끝낸 뒤).
   * - 작업은 기다림 없이 바로 등록한다: 두 번 눌러도 하나만 진행된다.
   * - 실제 게시 직전에 beforePublish()로 승인 상태를 다시 확인한다 (그사이 대본이 바뀌면 멈춤).
   * - media_publish는 자동으로 다시 시도하지 않는다. 응답이 불확실하면 컨테이너 상태로 실제 게시 여부를 확인한다.
   */
  async startReel(input: {
    projectId: number;
    renderId: number;
    videoFile: string;
    caption: string;
    publicOrigin: string;
    beforePublish: () => void;
    onPublished: (permalink: string) => void;
    onFailed?: (message: string) => void;
  }): Promise<IgJob> {
    if (activeIgJob(input.projectId)) throw new HttpError(409, '이미 올리고 있어요. 끝날 때까지 기다려 주세요.');
    const job: IgJob = { id: crypto.randomUUID(), projectId: input.projectId, renderId: input.renderId, status: 'uploading', message: '인스타그램에 영상을 보내는 중', permalink: '', startedAt: new Date().toISOString() };
    jobs.set(job.id, job);
    let a: Account;
    let cfg: IgConfig;
    try {
      cfg = this.cfg();
      const status = await this.status();
      if (!status.connected) throw new HttpError(409, status.problem || '인스타그램 계정을 먼저 연결해 주세요.');
      const acc = this.account();
      if (!acc) throw new HttpError(409, '인스타그램 계정을 먼저 연결해 주세요.');
      a = acc;
      if (!fs.existsSync(input.videoFile)) throw new HttpError(404, '영상 파일을 찾을 수 없어요. 영상을 다시 만들어 주세요.');
    } catch (e) {
      jobs.delete(job.id);
      throw e;
    }
    const link = issuePublicLink(input.videoFile);
    const auth = { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' };
    const api = (p: string) => `${cfg.graph}/${cfg.version}/${p}`;
    const pollMs = Number(process.env.IG_POLL_MS) || 30_000;
    const tries = Number(process.env.IG_POLL_TRIES) || 10;
    const set = (s: IgJobStatus, message: string) => Object.assign(job, { status: s, message });
    const published = (permalink: string, message = '게시했어요') => {
      job.permalink = permalink;
      set('published', message);
      // 기록이 실패해도 '게시됨' 상태는 바꾸지 않는다 (다시 올리는 일을 막기 위해)
      try {
        input.onPublished(permalink);
      } catch (e) {
        job.message = `게시는 됐지만 기록하지 못했어요: ${(e as Error).message}. 게시 이력에 주소를 직접 기록해 주세요.`;
      }
    };

    void (async () => {
      let containerId = '';
      let publishing = false;
      try {
        const created = await this.json(api(`${a.igUserId}/media`), {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ media_type: 'REELS', video_url: `${input.publicOrigin}/public/reels/${link}.mp4`, caption: input.caption, share_to_feed: true }),
        }, true);
        containerId = String(created.id ?? '');
        if (!containerId) throw new Error('인스타그램이 업로드 번호를 주지 않았어요.');
        set('processing', '인스타그램이 영상을 처리하는 중 (보통 1~3분)');
        let code = 'IN_PROGRESS';
        for (let i = 0; i < tries && code === 'IN_PROGRESS'; i++) {
          await new Promise((r) => setTimeout(r, pollMs));
          const st = await this.json(`${api(containerId)}?fields=status_code,status`, { headers: auth }, true);
          code = String(st.status_code ?? 'IN_PROGRESS');
          if (code === 'ERROR' || code === 'EXPIRED') throw new Error(`인스타그램이 영상을 처리하지 못했어요 (${code}${st.status ? `: ${String(st.status)}` : ''}).`);
        }
        if (code !== 'FINISHED') throw new Error('인스타그램 처리가 오래 걸려요. 몇 분 뒤 인스타그램 앱에서 올라갔는지 확인하고, 안 올라갔으면 다시 시도해 주세요.');
        // 처리를 기다리는 동안 대본이 바뀌었거나 승인이 풀렸으면 올리지 않는다
        input.beforePublish();
        set('publishing', '게시하는 중');
        publishing = true;
        const pub = await this.json(api(`${a.igUserId}/media_publish`), { method: 'POST', headers: auth, body: JSON.stringify({ creation_id: containerId }) }, true);
        const mediaId = String(pub.id ?? '');
        const info = mediaId ? await this.json(`${api(mediaId)}?fields=permalink`, { headers: auth }, true).catch(() => ({}) as Record<string, unknown>) : {};
        published(String((info as Record<string, unknown>).permalink ?? ''));
      } catch (e) {
        const message = (e as Error).message || '인스타그램 게시에 실패했어요.';
        // 게시 요청이 끝을 모르게 실패했으면, 실제로 올라갔는지 먼저 확인한다 (두 번 올리지 않게)
        if (publishing && containerId) {
          const st = await this.json(`${api(containerId)}?fields=status_code`, { headers: auth }, true).catch(() => null);
          if (st?.status_code === 'PUBLISHED') {
            published('', '게시됐어요. 릴스 주소는 인스타그램 앱에서 확인해 게시 이력에 기록해 주세요.');
            return;
          }
        }
        set('failed', message);
        input.onFailed?.(message);
      } finally {
        revokePublicLink(link);
      }
    })();
    return job;
  }

  /**
   * Meta API 호출: 오류는 쉬운 문장으로 바꾼다 (토큰은 메시지에 넣지 않는다).
   * stored=true(저장된 토큰을 쓰는 호출)일 때만, 토큰이 무효하면 연결을 지운다.
   */
  private async json(url: string, init: RequestInit = {}, stored = false): Promise<Record<string, unknown>> {
    const res = await this.http(url, { ...init, signal: AbortSignal.timeout(60_000) });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (body.error ?? {}) as Record<string, unknown>;
      const msg = String(err.message ?? body.error_message ?? `HTTP ${res.status}`);
      if (stored && (res.status === 401 || err.code === 190)) {
        this.disconnect();
        throw new HttpError(409, '인스타그램 연결이 끊겼어요. 다시 연결해 주세요.');
      }
      throw new HttpError(502, `인스타그램 오류: ${msg.slice(0, 200)}`);
    }
    return body;
  }
}
