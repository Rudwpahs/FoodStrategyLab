import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type Router } from 'express';
import { blogQuantityIssues } from '@mat-lab/publishing';
import { toJpeg } from '@mat-lab/video/audio';
import { publicOrigin } from './auth.ts';
import { cleanRules, dmMessage, matchRule, type CommentRule } from './commentRules.ts';
import { IG_COMMENT_SCOPES, IG_DAILY_LIMIT, Instagram, checkCaption, igConfig } from './instagram.ts';
import { approvedRender, instagramText, keepAwake } from './pipeline.ts';
import { HttpError, type Repo } from './repo.ts';
import { PlanStore } from './planSlots.ts';

/**
 * 자동 게시(예약) + 댓글 답장.
 * - 둘 다 기본은 꺼짐. 켜면 실제 인스타그램 계정에 올리고 답글을 단다 (AGENTS.md: 사용자 승인이 필요한 일).
 * - 예약 시각이 되면 승인된 최신 대본의 영상만 올린다 (원칙 2). 올리기 직전에 승인·대본 버전·설명 글을 다시 확인한다.
 * - 같은 예약을 두 번 올리지 않는다: 'scheduled → posting' 상태 바꾸기(조건부 UPDATE)로 한 번만 집어 가고,
 *   서버가 올리는 도중 꺼지면 다시 올리지 않고 '확인 필요'로 남긴다.
 * - 댓글 답장 문구는 사람이 써 둔 것만 보낸다 (AI가 쓰지 않는다).
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** 예약 시각이 이만큼 지나면(서버가 잠들어 있었거나 꺼져 있었음) 늦게 올리지 않는다 */
const graceMs = () => Number(process.env.AUTO_GRACE_MS) || 6 * HOUR;
const tickMs = () => Number(process.env.AUTO_TICK_MS) || 60_000;
const commentEveryMs = () => Number(process.env.AUTO_COMMENT_MS) || 5 * 60_000;
/** 비공개 답장은 댓글이 달린 지 7일 안에만 보낼 수 있다 (https://developers.facebook.com/docs/instagram-platform/private-replies) */
const REPLY_WINDOW_MS = 7 * DAY;
/** 한 번 돌 때 답글을 다는 최대 개수 (갑자기 댓글이 몰려도 API 한도를 넘지 않게) */
const MAX_REPLIES_PER_RUN = 30;
export const DEFAULT_DAILY_MAX = 3;
/** 사람이 정할 수 있는 자동 게시 하루 최대 (인스타그램 한도 50건보다 한참 낮게) */
export const MAX_DAILY = 10;
const CAROUSEL_NOTE = '레시피 카드 캐러셀';
export const AUTO_NOTE = '인스타그램 API로 자동 게시 (예약)';

export type AutoPostStatus = 'scheduled' | 'posting' | 'posted' | 'failed' | 'skipped' | 'canceled';
export interface AutoPost {
  id: number;
  projectId: number;
  title: string;
  /** 주간 계획 칸에서 온 예약이면 그 칸 번호 */
  slotId: number | null;
  at: string;
  notBefore: string;
  scriptVersion: number | null;
  /** 설명 글을 사람이 고쳐 두었는지 (아니면 올릴 때 승인된 대본으로 만든다) */
  customCaption: boolean;
  status: AutoPostStatus;
  reason: string;
  renderId: number | null;
  permalink: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutoReply {
  id: number;
  commentId: string;
  mediaPermalink: string;
  commenter: string;
  commentText: string;
  keyword: string;
  replyText: string;
  dmText: string;
  status: 'working' | 'done' | 'partial' | 'failed';
  reason: string;
  createdAt: string;
}

export interface AutoSettings {
  autoPost: boolean;
  commentReplies: boolean;
  /** 댓글 답장을 켠 시각: 그 뒤에 달린 댓글에만 답한다 (켜자마자 지난 댓글에 몰아서 답하지 않게) */
  commentRepliesSince: string;
  dailyMax: number;
  /** 마지막으로 스튜디오를 연 공개 주소 (Meta가 영상을 가져갈 주소. PUBLIC_URL이 있으면 그쪽을 쓴다) */
  origin: string;
}

/** 주간 계획 칸 (다른 작업이 만드는 plan_slots 표). 표가 아직 없으면 빈 목록 */
export interface PlanSlot {
  id: number;
  projectId: number;
  at: string;
  status: string;
}

export interface DryRunPost {
  when: string;
  projectId: number;
  title: string;
  source: 'manual' | 'plan';
  verdict: 'ok' | 'blocked' | 'wait';
  reason: string;
  caption: string;
}
export interface DryRun {
  at: string;
  /** 실제로 켜도 움직이지 않는 이유 (꺼짐·연결 안 됨 등) */
  blockers: string[];
  posts: DryRunPost[];
  comments: { blockers: string[]; rules: number };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS auto_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auto_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slot_id INTEGER UNIQUE,
  at TEXT NOT NULL,
  not_before TEXT NOT NULL DEFAULT '',
  script_version INTEGER,
  caption TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'posting', 'posted', 'failed', 'skipped', 'canceled')),
  reason TEXT NOT NULL DEFAULT '',
  render_id INTEGER,
  permalink TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auto_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id TEXT NOT NULL UNIQUE,
  media_id TEXT NOT NULL DEFAULT '',
  media_permalink TEXT NOT NULL DEFAULT '',
  commenter TEXT NOT NULL DEFAULT '',
  comment_text TEXT NOT NULL DEFAULT '',
  rule_id TEXT NOT NULL DEFAULT '',
  keyword TEXT NOT NULL DEFAULT '',
  reply_text TEXT NOT NULL DEFAULT '',
  dm_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('working', 'done', 'partial', 'failed')),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

type Row = Record<string, unknown>;
const iso = (d: Date | number = new Date()) => new Date(d).toISOString();
const ms = (s: string) => (s ? Date.parse(s) : NaN);
const kst = (s: string) => new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 승인된 최신 대본으로 만든 영상 (없거나 승인이 풀렸으면 쉬운 말로 거절) — 원칙 2 */
export function latestApprovedRender(repo: Repo, projectId: number) {
  const state = repo.versionState(projectId);
  if (state.latestScriptVersion === null) throw new HttpError(409, '대본이 아직 없어요.');
  if (state.approvedScriptVersion !== state.latestScriptVersion) throw new HttpError(409, '최신 대본이 아직 연구자 승인을 받지 않았어요. 대본을 바꾸면 승인이 풀려요.');
  const r = repo.getProject(projectId).renders.find((x) => x.status === 'done' && x.scriptVersion === state.latestScriptVersion);
  if (!r) throw new HttpError(409, '승인된 최신 대본으로 만든 영상이 없어요. 영상을 먼저 만들어 주세요.');
  return approvedRender(repo, r.id);
}

async function coverJpeg(dir: string): Promise<string | undefined> {
  const jpg = path.join(dir, 'cover.jpg');
  if (fs.existsSync(jpg)) return jpg;
  const png = path.join(dir, 'cover.png');
  if (!fs.existsSync(png)) return undefined;
  return toJpeg(png, jpg).then(
    () => jpg,
    () => undefined,
  );
}

export class AutoPilot {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastCommentsRun = 0;
  private stopAwake: (() => void) | null = null;
  /** 마지막으로 돈 결과 (화면에 보여 준다) */
  last: { posts: { at: string; message: string } | null; comments: { at: string; message: string } | null } = { posts: null, comments: null };

  constructor(
    private repo: Repo,
    private ig: Instagram,
  ) {
    repo.db.exec(SCHEMA);
  }

  private get db() {
    return this.repo.db;
  }

  // ───────────── 설정 ─────────────

  settings(): AutoSettings {
    const rows = this.db.prepare('SELECT key, value FROM auto_settings').all() as { key: string; value: string }[];
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const daily = Number(m.get('dailyMax'));
    return {
      autoPost: m.get('autoPost') === '1',
      commentReplies: m.get('commentReplies') === '1',
      commentRepliesSince: m.get('commentRepliesSince') ?? '',
      dailyMax: Number.isInteger(daily) && daily >= 1 && daily <= MAX_DAILY ? daily : DEFAULT_DAILY_MAX,
      origin: m.get('origin') ?? '',
    };
  }

  private put(key: string, value: string) {
    this.db.prepare('INSERT INTO auto_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  /** 켜기·끄기. 켤 때는 confirm이 있어야 한다 (실제 계정에서 움직이므로) */
  setSettings(patch: { autoPost?: unknown; commentReplies?: unknown; dailyMax?: unknown; confirm?: unknown }, origin = ''): AutoSettings {
    const before = this.settings();
    const turningOn = (patch.autoPost === true && !before.autoPost) || (patch.commentReplies === true && !before.commentReplies);
    if (turningOn && patch.confirm !== true) throw new HttpError(400, '실제 인스타그램 계정에서 움직이는 기능이라, 켤지 한 번 더 확인이 필요해요.');
    if (patch.dailyMax !== undefined) {
      const n = Number(patch.dailyMax);
      if (!Number.isInteger(n) || n < 1 || n > MAX_DAILY) throw new HttpError(400, `하루 최대 게시 수는 1~${MAX_DAILY}건 사이로 정해 주세요.`);
      this.put('dailyMax', String(n));
    }
    if (typeof patch.autoPost === 'boolean') this.put('autoPost', patch.autoPost ? '1' : '0');
    if (typeof patch.commentReplies === 'boolean') {
      this.put('commentReplies', patch.commentReplies ? '1' : '0');
      if (patch.commentReplies && !before.commentReplies) this.put('commentRepliesSince', iso());
    }
    if (origin) this.put('origin', origin);
    return this.settings();
  }

  rules(): CommentRule[] {
    const r = this.db.prepare("SELECT value FROM auto_settings WHERE key = 'rules'").get() as { value?: string } | undefined;
    try {
      return r?.value ? (JSON.parse(r.value) as CommentRule[]) : [];
    } catch {
      return [];
    }
  }

  setRules(input: unknown): CommentRule[] {
    const rules = cleanRules(input);
    this.put('rules', JSON.stringify(rules));
    return rules;
  }

  rememberOrigin(origin: string) {
    if (origin && origin !== this.settings().origin) this.put('origin', origin);
  }

  // ───────────── 예약 ─────────────

  private title(projectId: number): string {
    try {
      const r = this.repo.getRecipe(projectId);
      return r.topic || r.dishName;
    } catch {
      return `콘텐츠 #${projectId}`;
    }
  }

  private toPost = (r: Row): AutoPost => ({
    id: Number(r.id),
    projectId: Number(r.project_id),
    title: this.title(Number(r.project_id)),
    slotId: r.slot_id === null ? null : Number(r.slot_id),
    at: String(r.at),
    notBefore: String(r.not_before),
    scriptVersion: r.script_version === null ? null : Number(r.script_version),
    customCaption: Boolean(r.caption),
    status: String(r.status) as AutoPostStatus,
    reason: String(r.reason),
    renderId: r.render_id === null ? null : Number(r.render_id),
    permalink: String(r.permalink),
    createdBy: String(r.created_by),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  });

  getPost(id: number): AutoPost {
    const r = this.db.prepare('SELECT * FROM auto_posts WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw new HttpError(404, '예약을 찾을 수 없어요.');
    return this.toPost(r);
  }

  /** 예약 게시 (게시 화면에서 날짜·시간을 골랐을 때). 지금 승인된 최신 대본 버전에 묶는다 */
  schedule(input: { projectId: number; at: string; caption?: string; origin?: string; by?: string }, now = new Date()): AutoPost {
    const when = ms(input.at);
    if (Number.isNaN(when)) throw new HttpError(400, '예약 날짜와 시간을 골라 주세요.');
    if (when < now.getTime() + 60_000) throw new HttpError(400, '예약 시각은 지금부터 1분 뒤 이후로 골라 주세요.');
    if (when > now.getTime() + 60 * DAY) throw new HttpError(400, '예약은 60일 안으로만 할 수 있어요.');
    const { render } = latestApprovedRender(this.repo, input.projectId);
    if (!fs.existsSync(path.join(render.outputDir, 'video.mp4'))) throw new HttpError(409, '영상 파일이 없어요. 영상을 다시 만들어 주세요.');
    const caption = String(input.caption ?? '').trim();
    if (caption) {
      const bad = checkCaption(caption);
      if (bad) throw new HttpError(400, bad);
      const wrong = blogQuantityIssues(this.repo.getRecipe(input.projectId), this.repo.getExpertNotes(input.projectId), caption);
      if (wrong.length) throw new HttpError(409, `설명 글에 ${wrong.join(', ')}이(가) 있어요. 원본 레시피의 분량만 쓸 수 있어요.`);
    }
    const t = iso(now);
    const res = this.db
      .prepare("INSERT INTO auto_posts (project_id, at, script_version, caption, origin, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)")
      .run(input.projectId, iso(when), render.scriptVersion, caption, input.origin ?? '', input.by ?? '', t, t);
    this.repo.logEvent(input.projectId, 'publish', `인스타그램 예약 게시 ${kst(iso(when))} (대본 v${render.scriptVersion})`);
    return this.getPost(Number(res.lastInsertRowid));
  }

  cancel(id: number): AutoPost {
    const ok = this.db.prepare("UPDATE auto_posts SET status = 'canceled', reason = '예약을 취소했어요.', updated_at = ? WHERE id = ? AND status = 'scheduled'").run(iso(), id).changes;
    if (!ok) throw new HttpError(409, '이미 올리고 있거나 끝난 예약이라 취소할 수 없어요.');
    return this.getPost(id);
  }

  /** 실패한 예약을 지금 다시 시도 (사람이 눌렀을 때만). 결과를 몰라 실패로 둔 것은 인스타그램 앱에서 확인한 뒤에 누른다 */
  retry(id: number, now = new Date()): AutoPost {
    const ok = this.db.prepare("UPDATE auto_posts SET status = 'scheduled', at = ?, not_before = '', reason = '', updated_at = ? WHERE id = ? AND status = 'failed'").run(iso(now), iso(now), id).changes;
    if (!ok) throw new HttpError(409, '실패한 예약만 다시 시도할 수 있어요.');
    return this.getPost(id);
  }

  upcoming(): AutoPost[] {
    return (this.db.prepare("SELECT * FROM auto_posts WHERE status IN ('scheduled', 'posting') ORDER BY at").all() as Row[]).map(this.toPost);
  }

  recentPosts(limit = 20): AutoPost[] {
    return (this.db.prepare("SELECT * FROM auto_posts WHERE status NOT IN ('scheduled', 'posting') ORDER BY updated_at DESC, id DESC LIMIT ?").all(limit) as Row[]).map(this.toPost);
  }

  projectPosts(projectId: number): AutoPost[] {
    return (this.db.prepare('SELECT * FROM auto_posts WHERE project_id = ? ORDER BY id DESC LIMIT 20').all(projectId) as Row[]).map(this.toPost);
  }

  recentReplies(limit = 30): AutoReply[] {
    return (this.db.prepare('SELECT * FROM auto_replies ORDER BY id DESC LIMIT ?').all(limit) as Row[]).map((r) => ({
      id: Number(r.id),
      commentId: String(r.comment_id),
      mediaPermalink: String(r.media_permalink),
      commenter: String(r.commenter),
      commentText: String(r.comment_text),
      keyword: String(r.keyword),
      replyText: String(r.reply_text),
      dmText: String(r.dm_text),
      status: String(r.status) as AutoReply['status'],
      reason: String(r.reason),
      createdAt: String(r.created_at),
    }));
  }

  /** 24시간 안에 자동으로 올렸거나 올리는 중인 수 */
  postedLast24h(now = new Date()): number {
    const since = iso(now.getTime() - DAY);
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM auto_posts WHERE status IN ('posted', 'posting') AND updated_at >= ?").get(since) as { n: number }).n);
  }

  // ───────────── 주간 계획 칸 (plan_slots, 다른 작업이 만든다) ─────────────

  private hasSlots(): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'plan_slots'").get());
  }

  /** 계획 칸 목록. 표가 아직 없으면(합치기 전) 빈 목록 */
  slots(statuses: string[]): PlanSlot[] {
    if (!this.hasSlots()) return [];
    try {
      const rows = this.db.prepare(`SELECT id, project_id, at, status FROM plan_slots WHERE status IN (${statuses.map(() => '?').join(',')})`).all(...statuses) as Row[];
      return rows.map((r) => ({ id: Number(r.id), projectId: Number(r.project_id), at: String(r.at), status: String(r.status) })).filter((s) => !Number.isNaN(ms(s.at)));
    } catch {
      return [];
    }
  }

  /** 시각이 된 승인 칸 (계획 화면에서 승인된 칸만 자동으로 올린다. 실제 승인은 올릴 때 다시 확인) */
  dueSlots(now = new Date()): PlanSlot[] {
    // 칸 상태(승인됨 등)는 계획 화면이 다시 계산한다: 읽기 전에 최신으로 맞춘다 (실제 승인은 올릴 때 approvedRender로 다시 확인)
    if (this.hasSlots()) {
      try {
        new PlanStore(this.repo).sync();
      } catch (e) {
        console.warn('[자동 게시] 계획 칸 상태를 맞추지 못했어요:', (e as Error).message);
      }
    }
    return this.slots(['approved']).filter((s) => ms(s.at) <= now.getTime());
  }

  private markSlotPosted(slotId: number | null) {
    if (slotId === null || !this.hasSlots()) return;
    try {
      this.db.prepare("UPDATE plan_slots SET status = 'posted', updated_at = ? WHERE id = ? AND status = 'approved'").run(new Date().toISOString(), slotId);
    } catch {
      /* 칸 표의 모양이 다르면 칸 상태는 계획 화면에서 고친다 */
    }
  }

  /** 시각이 된 칸을 예약 목록으로 옮긴다 (칸마다 한 번만: slot_id UNIQUE) */
  private importDueSlots(now: Date) {
    const t = iso(now);
    const ins = this.db.prepare("INSERT OR IGNORE INTO auto_posts (project_id, slot_id, at, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'scheduled', '주간 계획', ?, ?)");
    for (const s of this.dueSlots(now)) {
      try {
        ins.run(s.projectId, s.id, iso(ms(s.at)), t, t);
      } catch {
        /* 지워진 콘텐츠의 칸 */
      }
    }
  }

  // ───────────── 올리기 ─────────────

  /** 올려도 되는지 (승인·버전·설명 글·중복·주소). Meta는 부르지 않는다 */
  evaluate(row: AutoPost, now = new Date()): { ok: true; render: ReturnType<typeof approvedRender>['render']; caption: string; origin: string } | { ok: false; status: 'failed' | 'skipped'; reason: string } {
    const due = Math.max(ms(row.at), ms(row.notBefore) || 0);
    if (due + graceMs() < now.getTime()) {
      return { ok: false, status: 'failed', reason: `예약 시각(${kst(row.at)})이 ${Math.round(graceMs() / HOUR)}시간 넘게 지나서 올리지 않았어요. 그동안 서버가 잠들어 있었거나 자동 게시가 꺼져 있었어요. 다시 예약해 주세요.` };
    }
    let render: ReturnType<typeof approvedRender>['render'];
    try {
      render = latestApprovedRender(this.repo, row.projectId).render;
    } catch (e) {
      return { ok: false, status: 'failed', reason: (e as Error).message };
    }
    if (row.scriptVersion !== null && row.scriptVersion !== render.scriptVersion) {
      return { ok: false, status: 'failed', reason: `예약한 뒤 대본이 바뀌었어요 (v${row.scriptVersion} → v${render.scriptVersion}). 바뀐 대본으로 다시 예약해 주세요.` };
    }
    if (!fs.existsSync(path.join(render.outputDir, 'video.mp4'))) return { ok: false, status: 'failed', reason: '영상 파일이 없어요. 영상을 다시 만들어 주세요.' };
    const dup = this.repo.listPublications(row.projectId).find((p) => p.platform === 'instagram' && p.status === 'published' && p.scriptVersion === render.scriptVersion && !p.note.includes(CAROUSEL_NOTE));
    if (dup) return { ok: false, status: 'skipped', reason: `이미 인스타그램에 올린 콘텐츠예요${dup.url ? ` (${dup.url})` : ''}. 두 번 올리지 않았어요.` };
    const stored = this.db.prepare('SELECT caption, origin FROM auto_posts WHERE id = ?').get(row.id) as { caption?: string; origin?: string } | undefined;
    const caption = stored?.caption || instagramText(this.repo, render.id);
    const bad = checkCaption(caption);
    if (bad) return { ok: false, status: 'failed', reason: `설명 글 문제: ${bad}` };
    const wrong = blogQuantityIssues(this.repo.getRecipe(row.projectId), this.repo.getExpertNotes(row.projectId), caption);
    if (wrong.length) return { ok: false, status: 'failed', reason: `설명 글에 원본에 없는 분량(${wrong.join(', ')})이 있어요.` };
    const origin = (process.env.PUBLIC_URL || stored?.origin || this.settings().origin).replace(/\/$/, '');
    if (!origin || (!origin.startsWith('https://') && process.env.IG_ALLOW_HTTP !== '1')) {
      return { ok: false, status: 'failed', reason: '인스타그램이 영상을 가져갈 공개 https 주소를 몰라요. 클라우드(Modal) 주소로 스튜디오를 연 뒤 다시 예약해 주세요.' };
    }
    return { ok: true, render, caption, origin };
  }

  private setStatus(id: number, status: AutoPostStatus, reason: string, extra: { renderId?: number; permalink?: string } = {}) {
    this.db
      .prepare('UPDATE auto_posts SET status = ?, reason = ?, render_id = COALESCE(?, render_id), permalink = COALESCE(?, permalink), updated_at = ? WHERE id = ?')
      .run(status, reason.slice(0, 500), extra.renderId ?? null, extra.permalink ?? null, iso(), id);
  }

  /** 한도에 걸렸으면 이유 (우리 하루 최대 → 인스타그램 24시간 한도 순서로 본다) */
  private async limitReason(now: Date): Promise<string | null> {
    const s = this.settings();
    if (this.postedLast24h(now) >= s.dailyMax) return `자동 게시는 24시간에 ${s.dailyMax}건까지로 정해 두었어요. 시간이 지나면 이어서 올려요.`;
    try {
      const q = await this.ig.publishingQuota();
      if (q.usage >= q.total) return `인스타그램 24시간 게시 한도(${q.total}건)를 다 썼어요. 한도가 풀리면 이어서 올려요.`;
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) throw e; // 연결이 끊김
      // 한도를 읽지 못하면 스튜디오가 API로 올린 기록으로 센다 (공식 문서의 두 숫자 중 낮은 50건)
      const since = iso(now.getTime() - DAY);
      const n = Number((this.db.prepare("SELECT COUNT(*) AS n FROM publications WHERE platform = 'instagram' AND note LIKE '인스타그램 API%' AND published_at >= ?").get(since) as { n: number }).n);
      if (n >= IG_DAILY_LIMIT) return `인스타그램 24시간 게시 한도(${IG_DAILY_LIMIT}건)에 닿았을 수 있어요. 한 시간 뒤 다시 확인해요.`;
    }
    return null;
  }

  /** 시각이 된 예약 하나를 올린다 (한 번에 하나: 올리는 사이 간격도 둔다). 돌려주는 글은 화면의 '마지막 확인' */
  async postDue(now = new Date()): Promise<string> {
    this.importDueSlots(now);
    const due = (this.db.prepare("SELECT * FROM auto_posts WHERE status = 'scheduled' ORDER BY at, id").all() as Row[])
      .map(this.toPost)
      .filter((p) => ms(p.at) <= now.getTime() && (!p.notBefore || ms(p.notBefore) <= now.getTime()));
    if (!due.length) return '올릴 차례인 예약이 없어요.';
    const limit = await this.limitReason(now);
    if (limit) {
      const later = iso(now.getTime() + HOUR);
      for (const p of due) this.db.prepare("UPDATE auto_posts SET not_before = ?, reason = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'").run(later, limit, iso(now), p.id);
      return limit;
    }
    for (const p of due) {
      // 이 예약을 한 번만 집어 간다 (다른 돌기·다른 서버가 이미 집었으면 0)
      const claimed = this.db.prepare("UPDATE auto_posts SET status = 'posting', reason = '', updated_at = ? WHERE id = ? AND status = 'scheduled'").run(iso(now), p.id).changes;
      if (!claimed) continue;
      const v = this.evaluate(p, now);
      if (!v.ok) {
        this.setStatus(p.id, v.status, v.reason);
        this.repo.logEvent(p.projectId, v.status === 'skipped' ? 'publish' : 'error', `예약 게시 ${v.status === 'skipped' ? '건너뜀' : '실패'}: ${v.reason}`);
        continue;
      }
      const { render, caption, origin } = v;
      const script = this.repo.getScript(p.projectId, render.scriptVersion).script;
      try {
        await this.ig.startReel({
          projectId: p.projectId,
          renderId: render.id,
          videoFile: path.join(render.outputDir, 'video.mp4'),
          coverFile: await coverJpeg(render.outputDir),
          caption,
          publicOrigin: origin,
          // 인스타그램이 처리하는 동안 대본이 바뀌었거나 승인이 풀렸으면 올리지 않는다 (원칙 2)
          beforePublish: () => {
            const again = latestApprovedRender(this.repo, p.projectId).render;
            if (again.id !== render.id) throw new HttpError(409, '대본이 바뀌었어요. 최신 대본으로 영상을 다시 만들어 주세요.');
          },
          onPublished: (permalink) => {
            this.setStatus(p.id, 'posted', '', { renderId: render.id, permalink });
            this.markSlotPosted(p.slotId);
            this.repo.addPublication(p.projectId, {
              renderId: render.id,
              scriptVersion: render.scriptVersion,
              platform: 'instagram',
              status: 'published',
              url: permalink,
              scheduledAt: p.at,
              publishedAt: iso(),
              style: script.style ?? '',
              hookType: script.hookType ?? '',
              note: AUTO_NOTE,
            });
            this.repo.logEvent(p.projectId, 'publish', `인스타그램 예약 게시 완료 ${permalink}`);
          },
          onFailed: (message) => {
            this.setStatus(p.id, 'failed', message, { renderId: render.id });
            this.repo.logEvent(p.projectId, 'error', `인스타그램 예약 게시 실패: ${message.slice(0, 300)}`);
          },
        });
        return `예약 게시를 시작했어요: ${p.title}`;
      } catch (e) {
        const message = (e as Error).message;
        if (/이미 올리고 있어요/.test(message)) {
          // 같은 콘텐츠를 손으로 올리는 중: 끝난 뒤 다시 본다 (그때 이미 올렸으면 중복으로 건너뛴다)
          this.db.prepare("UPDATE auto_posts SET status = 'scheduled', not_before = ?, reason = ?, updated_at = ? WHERE id = ?").run(iso(now.getTime() + 10 * 60_000), '같은 콘텐츠를 올리는 중이라 10분 뒤 다시 확인해요.', iso(now), p.id);
          continue;
        }
        this.setStatus(p.id, 'failed', message);
        this.repo.logEvent(p.projectId, 'error', `인스타그램 예약 게시 실패: ${message.slice(0, 300)}`);
      }
    }
    return '올릴 수 있는 예약이 없었어요 (기록을 보세요).';
  }

  /** 서버가 올리는 도중 꺼졌던 예약: 결과를 모르니 다시 올리지 않고 확인을 부탁한다 */
  recoverInterrupted(): number {
    return Number(
      this.db
        .prepare("UPDATE auto_posts SET status = 'failed', reason = ?, updated_at = ? WHERE status = 'posting'")
        .run('올리는 도중 서버가 다시 켜져 결과를 확인하지 못했어요. 인스타그램 앱에서 올라갔는지 먼저 보고, 안 올라갔을 때만 [다시 시도]를 눌러 주세요.', iso()).changes,
    );
  }

  // ───────────── 댓글 답장 ─────────────

  /** 최근 게시물의 새 댓글에서 단어 규칙에 맞는 댓글을 찾아 답글·DM을 보낸다. 같은 댓글에는 한 번만 */
  async replyComments(now = new Date()): Promise<string> {
    const rules = this.rules().filter((r) => r.enabled);
    if (!rules.length) return '켜진 댓글 규칙이 없어요.';
    const me = this.ig.connectedAccount();
    if (!me) return '인스타그램 연결이 없어요.';
    const since = ms(this.settings().commentRepliesSince) || now.getTime();
    const media = (await this.ig.recentMedia(10)).filter((m) => m.commentsCount !== 0 && (!m.timestamp || ms(m.timestamp) >= now.getTime() - 30 * DAY));
    const claim = this.db.prepare(
      "INSERT OR IGNORE INTO auto_replies (comment_id, media_id, media_permalink, commenter, comment_text, rule_id, keyword, reply_text, dm_text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'working', ?, ?)",
    );
    const finish = this.db.prepare('UPDATE auto_replies SET status = ?, reason = ?, updated_at = ? WHERE comment_id = ?');
    let replied = 0;
    for (const m of media) {
      for (const c of await this.ig.mediaComments(m.id)) {
        if (replied >= MAX_REPLIES_PER_RUN) return `답글 ${replied}개 (한 번에 ${MAX_REPLIES_PER_RUN}개까지, 나머지는 다음에)`;
        if (!c.id || c.fromId === me.igUserId || (me.username && c.username === me.username)) continue; // 내 댓글(답글)에는 답하지 않는다
        const at = ms(c.timestamp);
        if (Number.isNaN(at) || at < since || at < now.getTime() - REPLY_WINDOW_MS) continue;
        const hit = matchRule(rules, c.text);
        if (!hit) continue;
        const dm = dmMessage(hit.rule);
        const t = iso(now);
        // 먼저 기록해서 집어 간다: 답글을 다는 도중 서버가 꺼져도 같은 댓글에 다시 답하지 않는다
        if (!claim.run(c.id, m.id, m.permalink, c.username.slice(0, 60), c.text.slice(0, 300), hit.rule.id, hit.keyword, hit.rule.reply, dm, t, t).changes) continue;
        replied++;
        try {
          await this.ig.replyToComment(c.id, hit.rule.reply);
        } catch (e) {
          finish.run('failed', `답글을 달지 못했어요: ${(e as Error).message}`.slice(0, 400), iso(), c.id);
          if (e instanceof HttpError && e.status === 409) throw e;
          continue;
        }
        if (!dm) {
          finish.run('done', '', iso(), c.id);
          continue;
        }
        try {
          await this.ig.privateReply(c.id, dm);
          finish.run('done', '', iso(), c.id);
        } catch (e) {
          finish.run('partial', `답글은 달았지만 DM은 보내지 못했어요: ${(e as Error).message}`.slice(0, 400), iso(), c.id);
          if (e instanceof HttpError && e.status === 409) throw e;
        }
      }
    }
    return replied ? `새 댓글 ${replied}개에 답했어요.` : '규칙에 맞는 새 댓글이 없어요.';
  }

  // ───────────── 돌기 ─────────────

  /** 한 번 돈다 (60초마다). 켜져 있고 인스타그램이 연결됐을 때만 움직인다 */
  async tick(now = new Date()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const s = this.settings();
      if (!s.autoPost && !s.commentReplies) return this.keepAwakeIfNeeded(false);
      const st = await this.ig.status().catch(() => null);
      if (!st?.connected) {
        const msg = st?.problem || '인스타그램이 연결되지 않아 쉬고 있어요.';
        if (s.autoPost) this.last.posts = { at: iso(now), message: msg };
        if (s.commentReplies) this.last.comments = { at: iso(now), message: msg };
        return this.keepAwakeIfNeeded(false);
      }
      if (s.autoPost) {
        const message = await this.postDue(now).catch((e: Error) => `확인하지 못했어요: ${e.message}`);
        this.last.posts = { at: iso(now), message };
      }
      if (s.commentReplies && now.getTime() - this.lastCommentsRun >= commentEveryMs()) {
        this.lastCommentsRun = now.getTime();
        const message = await this.replyComments(now).catch((e: Error) => `댓글을 확인하지 못했어요: ${e.message}`);
        this.last.comments = { at: iso(now), message };
      }
      this.keepAwakeIfNeeded(s.autoPost, now);
    } finally {
      this.busy = false;
    }
  }

  /**
   * 클라우드 서버는 한동안 요청이 없으면 잠든다. 30분 안에 올릴 예약이 있으면(또는 올리는 중이면) 스스로 깨워 둔다.
   * 이미 잠든 서버는 스스로 깨지 못한다: 예약 30분 전에 누군가 스튜디오를 한 번 열어야 한다 (화면에 안내).
   */
  private keepAwakeIfNeeded(on: boolean, now = new Date()) {
    const origin = process.env.PUBLIC_URL?.replace(/\/$/, '');
    const soon =
      on &&
      process.env.KEEPALIVE === '1' &&
      Boolean(origin) &&
      this.upcoming().some((p) => p.status === 'posting' || ms(p.at) <= now.getTime() + 30 * 60_000);
    if (soon && !this.stopAwake) this.stopAwake = keepAwake(origin!);
    if (!soon && this.stopAwake) {
      this.stopAwake();
      this.stopAwake = null;
    }
  }

  start() {
    if (this.timer) return;
    const n = this.recoverInterrupted();
    if (n) console.log(`  올리는 도중 멈춘 예약 게시 ${n}개를 '확인 필요'로 표시했어요.`);
    this.timer = setInterval(() => void this.tick().catch((e) => console.error('자동 게시 확인 오류:', (e as Error).message)), tickMs());
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopAwake?.();
    this.stopAwake = null;
  }

  // ───────────── 먼저 시험 (Meta를 부르지 않는다) ─────────────

  dryRun(now = new Date()): DryRun {
    const s = this.settings();
    const blockers: string[] = [];
    const configured = igConfig() !== null;
    const connected = configured && this.ig.connectedAccount() !== null;
    if (!configured) blockers.push('인스타그램 앱 정보가 서버에 없어요 (관리자 설정 전).');
    else if (!connected) blockers.push('인스타그램 계정이 연결되지 않았어요.');
    if (!s.autoPost) blockers.push('자동 게시가 꺼져 있어요. 아래 결과는 켰을 때 일어날 일이에요.');
    const posts: DryRunPost[] = [];
    let budget = s.dailyMax - this.postedLast24h(now);
    const horizon = now.getTime() + 14 * DAY;
    const rows = this.upcoming().filter((p) => p.status === 'scheduled' && ms(p.at) <= horizon);
    const claimedSlots = new Set(rows.map((r) => r.slotId).filter((x) => x !== null));
    const imported = new Set((this.db.prepare('SELECT slot_id FROM auto_posts WHERE slot_id IS NOT NULL').all() as { slot_id: number }[]).map((r) => r.slot_id));
    const items: { row: AutoPost; source: 'manual' | 'plan'; slotStatus?: string }[] = rows.map((row) => ({ row, source: row.slotId === null ? 'manual' : 'plan' }));
    for (const sl of this.slots(['approved', 'waiting', 'planned'])) {
      if (claimedSlots.has(sl.id) || imported.has(sl.id) || ms(sl.at) > horizon || ms(sl.at) + graceMs() < now.getTime()) continue;
      const row: AutoPost = { id: 0, projectId: sl.projectId, title: this.title(sl.projectId), slotId: sl.id, at: iso(ms(sl.at)), notBefore: '', scriptVersion: null, customCaption: false, status: 'scheduled', reason: '', renderId: null, permalink: '', createdBy: '주간 계획', createdAt: '', updatedAt: '' };
      items.push({ row, source: 'plan', slotStatus: sl.status });
    }
    items.sort((a, b) => ms(a.row.at) - ms(b.row.at));
    for (const { row, source, slotStatus } of items) {
      const base = { when: row.at, projectId: row.projectId, title: row.title, source };
      if (slotStatus && slotStatus !== 'approved') {
        posts.push({ ...base, verdict: 'blocked', reason: '계획 칸이 아직 승인되지 않아 올리지 않아요.', caption: '' });
        continue;
      }
      // 미래 예약은 '지금 상태 그대로라면'으로 본다
      const v = this.evaluate(row, now);
      if (!v.ok) {
        posts.push({ ...base, verdict: 'blocked', reason: v.reason, caption: '' });
        continue;
      }
      const inDay = ms(row.at) <= now.getTime() + DAY;
      if (inDay && budget <= 0) {
        posts.push({ ...base, verdict: 'wait', reason: `24시간 최대(${s.dailyMax}건)를 넘어 다음 차례로 미뤄요.`, caption: v.caption });
        continue;
      }
      if (inDay) budget--;
      posts.push({ ...base, verdict: 'ok', reason: ms(row.at) <= now.getTime() ? '지금 올릴 차례예요.' : `${kst(row.at)}에 올려요.`, caption: v.caption });
    }
    const cBlockers: string[] = [];
    if (!s.commentReplies) cBlockers.push('댓글 답장이 꺼져 있어요.');
    const rules = this.rules().filter((r) => r.enabled);
    if (!rules.length) cBlockers.push('켜진 댓글 규칙이 없어요.');
    if (connected) {
      const g = this.ig.grantedScopes();
      if (g.length && !IG_COMMENT_SCOPES.every((x) => g.includes(x))) cBlockers.push('댓글·DM 권한 없이 연결돼 있어요. [댓글 권한까지 다시 연결]을 눌러 주세요.');
    }
    return { at: iso(now), blockers, posts, comments: { blockers: cBlockers, rules: rules.length } };
  }
}

// ───────────── API (/api/auto) ─────────────

const num = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, '잘못된 번호입니다.');
  return n;
};

/**
 * canControl: 실제 계정에서 움직이는 설정(켜기·규칙)을 바꿀 수 있는지. 연구자 계정이 있으면 연구자 계정만.
 * 예약 걸기·취소는 승인된 콘텐츠에만 되므로 로그인한 누구나 할 수 있다.
 */
export function autoRoutes(auto: AutoPilot, ig: Instagram, canControl: (res: Response) => boolean): Router {
  const r = express.Router();
  const who = (res: Response) => (res.locals.user as { displayName?: string } | undefined)?.displayName ?? '';
  const control = (res: Response) => {
    if (!canControl(res)) throw new HttpError(403, '자동 게시·댓글 답장 설정은 연구자 계정만 바꿀 수 있어요.');
  };
  const overview = async (req: Request) => {
    auto.rememberOrigin(publicOrigin(req));
    const st = await ig.status();
    const granted = st.connected ? ig.grantedScopes() : [];
    const commentScopes = !st.connected ? 'no' : !granted.length ? 'unknown' : IG_COMMENT_SCOPES.every((x) => granted.includes(x)) ? 'yes' : 'no';
    const s = auto.settings();
    const claimed = new Set(auto.upcoming().map((p) => p.slotId));
    return {
      settings: { autoPost: s.autoPost, commentReplies: s.commentReplies, dailyMax: s.dailyMax },
      instagram: { configured: st.configured, connected: st.connected, username: st.username, problem: st.problem, commentScopes },
      rules: auto.rules(),
      scheduled: auto.upcoming(),
      planSlots: auto
        .slots(['approved'])
        .filter((x) => !claimed.has(x.id) && ms(x.at) >= Date.now() - graceMs())
        .sort((a, b) => ms(a.at) - ms(b.at))
        .slice(0, 20),
      recentPosts: auto.recentPosts(),
      recentReplies: auto.recentReplies(),
      last: auto.last,
      postedLast24h: auto.postedLast24h(),
      maxDaily: MAX_DAILY,
      publicUrl: Boolean(process.env.PUBLIC_URL),
    };
  };
  r.get('/', async (req, res) => {
    res.json(await overview(req));
  });
  r.put('/settings', async (req, res) => {
    control(res);
    auto.setSettings(req.body ?? {}, publicOrigin(req));
    res.json(await overview(req));
  });
  r.put('/rules', async (req, res) => {
    control(res);
    auto.setRules((req.body ?? {}).rules);
    res.json(await overview(req));
  });
  r.get('/projects/:id', (req, res) => {
    res.json({ posts: auto.projectPosts(num(req.params.id)), settings: auto.settings() });
  });
  r.post('/scheduled', (req, res) => {
    const b = req.body ?? {};
    res.status(201).json(auto.schedule({ projectId: num(b.projectId), at: String(b.at ?? ''), caption: typeof b.caption === 'string' ? b.caption : '', origin: publicOrigin(req), by: who(res) }));
  });
  r.delete('/scheduled/:id', (req, res) => {
    res.json(auto.cancel(num(req.params.id)));
  });
  r.post('/scheduled/:id/retry', (req, res) => {
    control(res);
    res.json(auto.retry(num(req.params.id)));
  });
  // 먼저 시험: 무엇이 일어날지 보여 주기만 한다 (Meta를 부르지 않는다)
  r.post('/dry-run', (_req, res) => {
    res.json(auto.dryRun());
  });
  r.post('/test-comment', (req, res) => {
    const b = req.body ?? {};
    const text = String(b.text ?? '').slice(0, 500);
    const rules = b.rules === undefined ? auto.rules() : cleanRules(b.rules);
    const hit = matchRule(rules, text);
    res.json(hit ? { matched: true, keyword: hit.keyword, reply: hit.rule.reply, dm: dmMessage(hit.rule) } : { matched: false });
  });
  // 댓글·DM 권한까지 받는 로그인 창 주소 (기본 연결에는 이 권한을 넣지 않는다)
  r.post('/connect', (req, res) => {
    control(res);
    res.json({ url: ig.authorizeUrl(`${publicOrigin(req)}/api/instagram/callback`, IG_COMMENT_SCOPES) });
  });
  return r;
}
