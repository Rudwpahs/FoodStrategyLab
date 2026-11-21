import fs from 'node:fs';
import path from 'node:path';
import {
  bestSlotTimes,
  checkScript,
  deriveSlotStatus,
  isSlotStatus,
  kstParts,
  planReadiness,
  planWeek,
  toKstIso,
  weekDates,
  addDays,
  type PlanFacts,
  type SlotStatus,
  type SlotTimesResult,
} from '@mat-lab/recipe-core';
import { HttpError, type Repo } from './repo.ts';

/** 계획 칸 한 줄 (표 설명은 planSchema.ts) */
export interface PlanSlot {
  id: number;
  projectId: number;
  /** 'YYYY-MM-DDTHH:MM:00+09:00' (한국 시간) */
  at: string;
  status: SlotStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 화면에 보여 줄 칸 */
export interface PlanSlotView extends PlanSlot {
  dishName: string;
  topic: string;
  latestVersion: number | null;
  /** 완성된 영상의 표지 (없으면 null) */
  coverUrl: string | null;
}

/** 승인 대기열 카드: 최신 대본 버전의 영상이 완성됐고 아직 승인되지 않은 칸 */
export interface QueueCard {
  slotId: number;
  projectId: number;
  at: string;
  dishName: string;
  topic: string;
  title: string;
  version: number;
  source: string;
  renderId: number;
  videoUrl: string;
  coverUrl: string | null;
  firstLine: string;
  /** 영상 자동 검사에서 나온 오류 (있으면 직접 보고 확인해야 승인할 수 있다) */
  qaErrors: string[];
  /** 원본 레시피와 다른 분량·재료·순서 (있으면 승인할 수 없다) */
  fidelityErrors: string[];
  /** 사진에서 읽은 레시피의 AI 제안 칸을 아직 확인하지 않았는지 (확인 전에는 승인할 수 없다) */
  aiPending: boolean;
  /** 생성 AI 클립이 들어갔는지 (승인할 때 클립을 직접 봤다는 확인을 더 받는다) */
  aiClips: boolean;
}

export interface PlanView {
  weekStart: string;
  days: string[];
  /** 오늘 날짜 (한국 시간) */
  today: string;
  times: SlotTimesResult;
  slots: PlanSlotView[];
  queue: QueueCard[];
  /** 아직 칸이 없고 올리지 않은 콘텐츠 수 (계획 세우기로 넣을 수 있는 것) */
  unplanned: number;
}

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();

const toSlot = (r: Row): PlanSlot => ({
  id: Number(r.id),
  projectId: Number(r.project_id),
  at: String(r.at),
  status: (isSlotStatus(r.status) ? r.status : 'planned') as SlotStatus,
  note: String(r.note ?? ''),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

/** 영상으로 올리는 곳 (블로그는 영상 게시로 치지 않는다) */
const VIDEO_PLATFORMS = new Set(['instagram', 'youtube']);

export class PlanStore {
  constructor(private repo: Repo) {}

  private get db() {
    return this.repo.db;
  }

  /** 칸 목록 (시간 순). from·to는 저장 형식 문자열 (to는 포함하지 않음) */
  list(range: { from?: string; to?: string } = {}): PlanSlot[] {
    const rows = this.db
      .prepare('SELECT * FROM plan_slots WHERE at >= ? AND at < ? ORDER BY at, id')
      .all(range.from ?? '', range.to ?? '￿') as Row[];
    return rows.map(toSlot);
  }

  get(id: number): PlanSlot {
    const r = this.db.prepare('SELECT * FROM plan_slots WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw new HttpError(404, '계획 칸을 찾을 수 없어요.');
    return toSlot(r);
  }

  add(projectId: number, at: string, status: SlotStatus = 'planned'): PlanSlot {
    const t = now();
    const res = this.db.prepare('INSERT INTO plan_slots (project_id, at, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(projectId, at, status, '', t, t);
    return this.get(Number(res.lastInsertRowid));
  }

  /** 다른 날·시간으로 옮기기. 같은 시각에 다른 칸이 있거나 이미 올린 칸이면 막는다 */
  move(id: number, input: string): PlanSlot {
    const slot = this.get(id);
    if (slot.status === 'posted') throw new HttpError(409, '이미 올린 칸은 옮길 수 없어요.');
    const at = toKstIso(input);
    if (!at) throw new HttpError(400, '날짜와 시간을 확인해 주세요.');
    const clash = this.list({ from: at, to: `${at}\u0000` }).find((s) => s.id !== id && s.status !== 'skipped');
    if (clash) throw new HttpError(409, '그 시간에는 이미 다른 콘텐츠가 있어요. 다른 시간을 골라 주세요.');
    this.db.prepare('UPDATE plan_slots SET at = ?, updated_at = ? WHERE id = ?').run(at, now(), id);
    const p = kstParts(at);
    this.repo.logEvent(slot.projectId, 'plan', `게시 계획을 ${p.date} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}로 옮김`);
    return this.get(id);
  }

  remove(id: number) {
    const slot = this.get(id);
    if (slot.status === 'posted') throw new HttpError(409, '이미 올린 칸은 지우지 않아요 (게시 기록으로 남겨 둬요).');
    this.db.prepare('DELETE FROM plan_slots WHERE id = ?').run(id);
    this.repo.logEvent(slot.projectId, 'plan', '게시 계획에서 뺌');
  }

  setStatus(id: number, status: SlotStatus, note?: string) {
    if (note === undefined) this.db.prepare('UPDATE plan_slots SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
    else this.db.prepare('UPDATE plan_slots SET status = ?, note = ?, updated_at = ? WHERE id = ?').run(status, note, now(), id);
  }

  /** 상태 계산에 쓰는 콘텐츠 사실 */
  facts(projectId: number): PlanFacts & { done: boolean } {
    const state = this.repo.versionState(projectId);
    const latest = state.latestScriptVersion;
    const review = latest === null ? null : this.repo.lastReview(projectId, latest);
    const pubs = this.repo.listPublications(projectId).filter((p) => p.status === 'published' && VIDEO_PLATFORMS.has(p.platform));
    return {
      latestVersion: latest,
      approvedVersion: state.approvedScriptVersion,
      renderedLatest: state.renderedScriptVersion !== null && state.renderedScriptVersion === latest,
      lastDecision: review?.decision ?? null,
      postedLatest: state.approvedScriptVersion !== null && pubs.some((p) => p.scriptVersion === state.approvedScriptVersion),
      done: pubs.length > 0,
    };
  }

  /** 칸 상태를 콘텐츠 상태로 다시 계산해 저장한다 (올림·건너뜀은 그대로). projectId가 있으면 그 콘텐츠만 */
  sync(projectId?: number) {
    const rows = (projectId === undefined
      ? this.db.prepare("SELECT * FROM plan_slots WHERE status NOT IN ('posted', 'skipped')").all()
      : this.db.prepare("SELECT * FROM plan_slots WHERE project_id = ? AND status NOT IN ('posted', 'skipped')").all(projectId)) as Row[];
    const cache = new Map<number, PlanFacts>();
    for (const slot of rows.map(toSlot)) {
      const f = cache.get(slot.projectId) ?? this.facts(slot.projectId);
      cache.set(slot.projectId, f);
      const next = deriveSlotStatus(slot.status, f);
      if (next !== slot.status) this.setStatus(slot.id, next);
    }
  }

  /** 수정 요청을 보낸 콘텐츠의 칸은 새 영상이 나올 때까지 '고치는 중' */
  markChangeRequested(projectId: number) {
    this.db.prepare("UPDATE plan_slots SET status = 'change-requested', updated_at = ? WHERE project_id = ? AND status NOT IN ('posted', 'skipped')").run(now(), projectId);
  }

  /** 지금 쓸 게시 시간 (지표가 쌓이면 반응이 좋았던 요일·시간) */
  times(): SlotTimesResult {
    return bestSlotTimes(this.repo.allPublications());
  }

  /** 한 주 계획 세우기: 비어 있는 날에 아직 올리지 않은 콘텐츠를 넣는다 (있는 칸은 그대로) */
  planWeek(weekStart: string, at = Date.now()): PlanSlot[] {
    this.sync();
    const rows = this.db.prepare('SELECT id, created_at FROM projects ORDER BY id').all() as Row[];
    const projects = rows.map((r) => {
      const id = Number(r.id);
      const f = this.facts(id);
      return { id, createdAt: String(r.created_at), readiness: planReadiness(f), done: f.done };
    });
    const plan = planWeek({ weekStart, times: this.times().times, projects, slots: this.list(), now: at });
    const created = plan.map((p) => this.add(p.projectId, p.at));
    for (const s of created) {
      const p = kstParts(s.at);
      this.repo.logEvent(s.projectId, 'plan', `게시 계획: ${p.date} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`);
    }
    this.sync();
    return created.map((s) => this.get(s.id));
  }

  private coverOf(renderId: number | undefined): string | null {
    if (!renderId) return null;
    try {
      const r = this.repo.getRender(renderId);
      return r.outputDir && fs.existsSync(path.join(r.outputDir, 'cover.png')) ? `/media/renders/${r.id}/cover.png` : null;
    } catch {
      return null;
    }
  }

  /** 계획 화면: 그 주의 칸 + 승인 대기열(모든 주) */
  view(weekStart: string, at = Date.now()): PlanView {
    this.sync();
    const days = weekDates(weekStart);
    const projectCache = new Map<number, ReturnType<Repo['getProject']>>();
    const project = (id: number) => {
      const hit = projectCache.get(id);
      if (hit) return hit;
      const p = this.repo.getProject(id);
      projectCache.set(id, p);
      return p;
    };
    const slots: PlanSlotView[] = this.list({ from: `${weekStart}T`, to: `${addDays(weekStart, 7)}T` }).map((s) => {
      const p = project(s.projectId);
      const done = p.renders.find((r) => r.status === 'done');
      return { ...s, dishName: p.recipe.dishName, topic: p.topic, latestVersion: p.latestVersion, coverUrl: this.coverOf(done?.id) };
    });
    const live = this.list().filter((s) => s.status === 'waiting');
    const seen = new Set<number>();
    const queue: QueueCard[] = [];
    for (const s of live) {
      if (seen.has(s.projectId)) continue;
      seen.add(s.projectId);
      const p = project(s.projectId);
      const latest = p.latest;
      const render = latest && p.renders.find((r) => r.status === 'done' && r.scriptVersion === latest.version);
      if (!latest || !render || p.versionState.approvedScriptVersion === latest.version) continue;
      queue.push({
        slotId: s.id,
        projectId: s.projectId,
        at: s.at,
        dishName: p.recipe.dishName,
        topic: p.topic,
        title: latest.script.title,
        version: latest.version,
        source: latest.source,
        renderId: render.id,
        videoUrl: `/media/renders/${render.id}/video.mp4`,
        coverUrl: this.coverOf(render.id),
        firstLine: latest.script.scenes[0]?.line ?? '',
        qaErrors: render.qa?.issues.filter((i) => i.level === 'error').map((i) => i.message) ?? [],
        fidelityErrors: checkScript(p.recipe, latest.script).filter((i) => i.level === 'error').map((i) => i.message),
        aiPending: Boolean(p.source?.aiFields.length && !p.source.aiConfirmedAt),
        aiClips: Object.values(p.sceneMedia ?? {}).some((m) => /\.ai\./.test(m.url)),
      });
    }
    const busy = new Set(this.list().filter((s) => s.status !== 'posted' && s.status !== 'skipped').map((s) => s.projectId));
    const ids = (this.db.prepare('SELECT id FROM projects').all() as Row[]).map((r) => Number(r.id));
    const unplanned = ids.filter((id) => !busy.has(id) && !this.facts(id).done).length;
    return { weekStart, days, today: kstParts(at).date, times: this.times(), slots, queue, unplanned };
  }
}
