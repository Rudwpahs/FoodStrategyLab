/**
 * 주간 게시 계획 (규칙·순수 함수). 서버의 planSlots.ts가 DB에 저장하고, 화면이 같은 이름표를 쓴다.
 * 시간은 모두 한국 시간(Asia/Seoul, UTC+9, 서머타임 없음)으로 다룬다. 저장 형식: '2026-11-24T18:00:00+09:00'.
 * 계획 칸은 '언제 올릴지'만 정한다. 올릴 수 있는지는 올리는 순간 승인된 최신 버전인지로 다시 확인한다 (원칙 2).
 */

/** 계획 칸 상태 */
export const SLOT_STATUSES = ['planned', 'waiting', 'approved', 'change-requested', 'posted', 'skipped'] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const SLOT_STATUS_LABELS: Record<SlotStatus, string> = {
  planned: '준비 중',
  waiting: '승인 대기',
  approved: '승인됨',
  'change-requested': '고치는 중',
  posted: '올림',
  skipped: '건너뜀',
};

/** 사람이나 자동 게시가 정해서, 콘텐츠 상태로 다시 계산하지 않는 상태 */
export const FINAL_SLOT_STATUSES: readonly SlotStatus[] = ['posted', 'skipped'];

export const isSlotStatus = (v: unknown): v is SlotStatus => (SLOT_STATUSES as readonly unknown[]).includes(v);

/** 요일(0 = 일요일)과 시각 */
export interface SlotTime {
  weekday: number;
  hour: number;
  minute: number;
}

/** 지표가 쌓이기 전 기본 게시 시간: 화 18:00 · 목 12:30 · 토 10:00 */
export const DEFAULT_SLOT_TIMES: readonly SlotTime[] = [
  { weekday: 2, hour: 18, minute: 0 },
  { weekday: 4, hour: 12, minute: 30 },
  { weekday: 6, hour: 10, minute: 0 },
];

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const KST_MS = 9 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 한국 시간으로 본 날짜(YYYY-MM-DD)·요일·시각 */
export function kstParts(t: string | number | Date): { date: string; weekday: number; hour: number; minute: number } {
  const d = new Date(new Date(t).getTime() + KST_MS);
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** 한국 시간 날짜·시각 → 저장 형식 */
export const kstIso = (date: string, hour: number, minute: number) => `${date}T${pad(hour)}:${pad(minute)}:00+09:00`;

/**
 * 받은 시각을 저장 형식으로. 시간대가 없는 값('2026-11-24T18:00', 화면의 날짜·시간 칸)은 한국 시간으로 본다.
 * 읽을 수 없으면 null.
 */
export function toKstIso(input: string): string | null {
  const s = input.trim();
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s);
  const ms = local ? Date.parse(`${local[1]}T${local[2]}:${local[3]}:00+09:00`) : Date.parse(s);
  if (Number.isNaN(ms)) return null;
  const p = kstParts(ms);
  return kstIso(p.date, p.hour, p.minute);
}

/** 날짜에 며칠 더하기 (YYYY-MM-DD) */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 그 시각이 든 주의 월요일 (한국 시간) */
export function weekStartOf(t: string | number | Date): string {
  const p = kstParts(t);
  return addDays(p.date, -((p.weekday + 6) % 7));
}

/** 다음 주 월요일 */
export const nextWeekStart = (now: string | number | Date = Date.now()) => addDays(weekStartOf(now), 7);

/** 월요일부터 일요일까지 7일 */
export const weekDates = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/** 올바른 날짜이고 월요일인지 (주 고르기 값 검사) */
export function isWeekStart(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && d.getUTCDay() === 1;
}

/** 요일·시각을 그 주의 실제 시각으로 (월요일 먼저 순서) */
export function slotsForWeek(weekStart: string, times: readonly SlotTime[]): string[] {
  return times.map((t) => kstIso(addDays(weekStart, (t.weekday + 6) % 7), t.hour, t.minute)).sort();
}

/** '화 18:00' */
export const slotTimeLabel = (t: SlotTime) => `${WEEKDAY_LABELS[t.weekday]} ${pad(t.hour)}:${pad(t.minute)}`;

/** 게시 기록 중 시간 고르기에 필요한 것 (서버의 Publication과 같은 이름) */
export interface PostedResult {
  status: string;
  platform: string;
  publishedAt: string;
  metrics: Record<string, number>;
}

/** 지표로 시간을 고르려면 반응을 입력한 게시물이 몇 편 있어야 하는지 */
export const MIN_POSTS_FOR_TIMES = 3;

export interface SlotTimesResult {
  times: SlotTime[];
  source: 'default' | 'metrics';
  /** 화면에 보여 줄 한 줄 설명 */
  reason: string;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * 게시 시간 고르기. 도달·저장·보내기를 입력한 영상 게시물이 3편 이상이면,
 * 게시한 요일·시(한국 시간)별로 '도달 1,000명당 저장+보내기' 중앙값이 높은 순으로 요일이 겹치지 않게 고른다.
 * 모자라는 칸은 기본 시간(요일이 겹치지 않는 것)으로 채운다. 결과는 월요일부터 순서대로.
 */
export function bestSlotTimes(pubs: readonly PostedResult[], count = DEFAULT_SLOT_TIMES.length, defaults: readonly SlotTime[] = DEFAULT_SLOT_TIMES): SlotTimesResult {
  const scored = pubs
    .filter((p) => p.status === 'published' && p.platform !== 'naver' && !Number.isNaN(Date.parse(p.publishedAt)) && (p.metrics.reach ?? 0) > 0)
    .map((p) => ({ ...kstParts(p.publishedAt), score: (((p.metrics.saves ?? 0) + (p.metrics.shares ?? 0)) / p.metrics.reach!) * 1000 }));
  const byMonday = (a: SlotTime, b: SlotTime) => (a.weekday + 6) % 7 - (b.weekday + 6) % 7 || a.hour - b.hour || a.minute - b.minute;
  if (scored.length < MIN_POSTS_FOR_TIMES) {
    return { times: [...defaults].slice(0, count).sort(byMonday), source: 'default', reason: `기본 시간이에요. 반응(도달·저장·보내기)을 입력한 게시물이 ${MIN_POSTS_FOR_TIMES}편 넘게 쌓이면 반응이 좋았던 요일·시간으로 바꿔요.` };
  }
  const groups = new Map<string, { weekday: number; hour: number; scores: number[] }>();
  for (const s of scored) {
    const key = `${s.weekday}-${s.hour}`;
    const g = groups.get(key) ?? { weekday: s.weekday, hour: s.hour, scores: [] };
    g.scores.push(s.score);
    groups.set(key, g);
  }
  const ranked = [...groups.values()]
    .map((g) => ({ ...g, median: median(g.scores) }))
    .sort((a, b) => b.median - a.median || b.scores.length - a.scores.length || a.weekday - b.weekday || a.hour - b.hour);
  const times: SlotTime[] = [];
  for (const g of ranked) {
    if (times.length >= count) break;
    if (!times.some((t) => t.weekday === g.weekday)) times.push({ weekday: g.weekday, hour: g.hour, minute: 0 });
  }
  for (const d of defaults) {
    if (times.length >= count) break;
    if (!times.some((t) => t.weekday === d.weekday)) times.push({ ...d });
  }
  return { times: times.sort(byMonday), source: 'metrics', reason: `반응을 입력한 게시물 ${scored.length}편 중 저장·보내기가 많았던 요일·시간이에요.` };
}

/** 콘텐츠가 계획에 넣기에 얼마나 준비됐는지 (계획·상태 계산에 쓰는 사실) */
export interface PlanFacts {
  latestVersion: number | null;
  approvedVersion: number | null;
  /** 최신 대본 버전으로 만든 영상이 완성됐는지 */
  renderedLatest: boolean;
  /** 최신 대본 버전의 마지막 검수 결과 */
  lastDecision: 'approved' | 'changes_requested' | null;
  /** 승인된 최신 버전의 영상을 인스타그램·유튜브에 올렸는지 */
  postedLatest: boolean;
}

/** 준비 정도: 4 승인+영상 · 3 영상 완성(승인 대기) 또는 승인만 · 1 대본만 · 0 대본 없음 */
export function planReadiness(f: Pick<PlanFacts, 'latestVersion' | 'approvedVersion' | 'renderedLatest'>): number {
  if (f.latestVersion === null) return 0;
  const approved = f.approvedVersion === f.latestVersion;
  if (approved && f.renderedLatest) return 4;
  if (approved || f.renderedLatest) return 3;
  return 1;
}

/**
 * 계획 칸 상태를 콘텐츠 상태로 다시 계산한다. 올림·건너뜀은 그대로 둔다.
 * '고치는 중'은 수정 요청으로 만든 새 버전의 영상이 완성될 때까지 남는다.
 */
export function deriveSlotStatus(stored: SlotStatus, f: PlanFacts): SlotStatus {
  if (FINAL_SLOT_STATUSES.includes(stored)) return stored;
  if (f.postedLatest) return 'posted';
  const approved = f.latestVersion !== null && f.approvedVersion === f.latestVersion;
  if (approved && f.renderedLatest) return 'approved';
  if (!approved && f.lastDecision === 'changes_requested') return 'change-requested';
  if (stored === 'change-requested' && !f.renderedLatest) return 'change-requested';
  if (f.renderedLatest && !approved) return 'waiting';
  return 'planned';
}

/** 계획에 넣을 수 있는 콘텐츠 후보 */
export interface PlanCandidate {
  id: number;
  createdAt: string;
  readiness: number;
  /** 승인된 영상을 이미 올렸으면 true (계획에 넣지 않는다) */
  done: boolean;
}

export interface ExistingSlot {
  projectId: number;
  at: string;
  status: SlotStatus;
}

/**
 * 한 주 계획 세우기. 정한 요일·시간 중 이미 칸이 있는 날과 지난 시각은 비워 두고(있는 칸은 그대로),
 * 아직 올리지 않았고 다른 칸이 없는 콘텐츠를 준비된 것 → 오래된 것 순서로 이른 시간부터 넣는다.
 * 한 콘텐츠는 한 칸에만 (올림·건너뜀 칸은 끝난 것으로 본다).
 */
export function planWeek(input: { weekStart: string; times: readonly SlotTime[]; projects: readonly PlanCandidate[]; slots: readonly ExistingSlot[]; now?: number }): { projectId: number; at: string }[] {
  const now = input.now ?? Date.now();
  const live = input.slots.filter((s) => s.status !== 'skipped');
  const busyProjects = new Set(live.filter((s) => s.status !== 'posted').map((s) => s.projectId));
  const busyDays = new Set(live.map((s) => kstParts(s.at).date));
  const free = slotsForWeek(input.weekStart, input.times).filter((at) => !busyDays.has(kstParts(at).date) && Date.parse(at) > now);
  const queue = input.projects
    .filter((p) => !p.done && !busyProjects.has(p.id))
    .sort((a, b) => b.readiness - a.readiness || a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  return free.slice(0, queue.length).map((at, i) => ({ projectId: queue[i]!.id, at }));
}
