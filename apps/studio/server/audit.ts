import { STYLE_IDS, STYLE_INFO, estimateSpeechSeconds, isStyleId, styleScores, type ProjectStatus, type RecipeInput, type Script, type StyleId } from '@mat-lab/recipe-core';
import { formatInsights, type FormatInsight } from './insights.ts';
import type { Publication, Repo } from './repo.ts';

/**
 * 계정 진단: 게시 기록·성과 숫자·대본으로 "잘하고 있는 점 / 발목 잡는 점 / 다음에 만들 영상 3개"를 규칙으로 센다 (0원).
 * 숫자는 모두 이 계정의 기록에서만 나온다. 기록이 적으면 비교하지 않고 그렇다고 말한 뒤 시작 요령을 준다.
 * buildAudit는 순수 함수다 (같은 입력이면 같은 결과). 저장소에서 입력을 모으는 일은 collectAuditInput이 한다.
 */

/** 게시 간격을 보는 기간 (일) */
export const AUDIT_WINDOW_DAYS = 30;
/** 성과를 비교하려면 성과를 적은 영상이 이만큼은 있어야 한다 */
export const MIN_POSTS_FOR_STATS = 3;
/** 첫 장면(훅) 대사가 이 시간(예상)보다 길면 길다고 본다 */
export const HOOK_MAX_SECONDS = 3.5;
/** 성과가 내 중앙값보다 이만큼(비율) 넘게 차이 나야 '좋아짐/나빠짐'으로 본다 */
export const METRIC_CHANGE = 0.15;
/** 일주일에 이만큼 올리면 꾸준하다고 본다 */
export const GOOD_POSTS_PER_WEEK = 2;
/** 마지막 영상에서 이만큼 지나면 간격이 길다고 본다 (일) */
export const LONG_GAP_DAYS = 10;
/** 영상 끝에서 시청자에게 할 일을 부탁하는 말 (저장·공유·댓글·팔로우 등) */
export const CTA_PATTERN = /저장|팔로우|구독|댓글|공유|보내\s?주|친구에게|태그/;

export interface AuditNumber {
  label: string;
  value: string;
}

export interface AuditFinding {
  id: string;
  kind: 'good' | 'hold-back';
  title: string;
  detail: string;
  /** 판단에 쓴 숫자 */
  numbers: AuditNumber[];
}

export interface AuditSuggestion {
  projectId: number;
  topic: string;
  dishName: string;
  status: ProjectStatus;
  style: StyleId;
  styleLabel: string;
  reason: string;
}

export interface AuditProject {
  id: number;
  topic: string;
  dishName: string;
  status: ProjectStatus;
  updatedAt: string;
  recipe: RecipeInput;
  latestScript: Script | null;
}

export interface AuditInput {
  projects: AuditProject[];
  publications: Publication[];
  /** 게시한 영상의 대본 (`${projectId}:${scriptVersion}` → 대본) */
  scripts: Record<string, Script>;
}

export interface AuditResult {
  generatedAt: string;
  /** 성과를 비교할 만큼 기록이 있는지 */
  enoughData: boolean;
  counts: {
    projects: number;
    /** 최근 30일 영상 게시 수 (인스타그램·유튜브) */
    posts30: number;
    /** 성과 숫자를 적은 영상 수 */
    postsWithMetrics: number;
    recipesWithoutVideo: number;
  };
  good: AuditFinding[];
  holdBack: AuditFinding[];
  /** 기록이 적을 때의 시작 요령 (기록이 충분하면 빈 목록) */
  starter: string[];
  next: AuditSuggestion[];
}

const DAY = 86_400_000;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => String(round1(n));

/** 영상 게시 (블로그는 빼고 센다) */
const isVideoPost = (p: Publication) => p.status === 'published' && p.platform !== 'naver' && !Number.isNaN(Date.parse(p.publishedAt));
const hasMetrics = (p: Publication) => Object.keys(p.metrics).length > 0;
const scriptKey = (projectId: number, version: number) => `${projectId}:${version}`;

/** 첫 장면(훅) 대사 */
export const hookLine = (script: Script) => (script.scenes.find((s) => s.hook) ?? script.scenes[0])?.line ?? '';
/** 영상 끝(마지막 두 장면)에 저장·공유 같은 부탁이 있는지 */
export const hasCallToAction = (script: Script) => script.scenes.slice(-2).some((s) => CTA_PATTERN.test(s.line));

// ── 게시 간격 ──
function postingFinding(posts: Publication[], now: Date): AuditFinding {
  const since = now.getTime() - AUDIT_WINDOW_DAYS * DAY;
  const times = posts.map((p) => Date.parse(p.publishedAt)).filter((t) => t <= now.getTime());
  const recent = times.filter((t) => t >= since).sort((a, b) => a - b);
  const last = times.length ? Math.max(...times) : null;
  const daysSince = last === null ? null : Math.floor((now.getTime() - last) / DAY);
  const perWeek = round1(recent.length / (AUDIT_WINDOW_DAYS / 7));
  const gaps = recent.map((t, i) => ((i ? t - recent[i - 1]! : 0) / DAY)).slice(1);
  if (last !== null && recent.length) gaps.push((now.getTime() - recent.at(-1)!) / DAY);
  const longest = gaps.length ? Math.floor(Math.max(...gaps)) : null;
  const numbers: AuditNumber[] = [
    { label: `최근 ${AUDIT_WINDOW_DAYS}일 영상 게시`, value: `${recent.length}편` },
    { label: '일주일 평균', value: `${perWeek}편` },
    ...(daysSince !== null ? [{ label: '마지막 게시', value: daysSince === 0 ? '오늘' : `${daysSince}일 전` }] : []),
    ...(longest !== null ? [{ label: '가장 긴 쉬는 기간', value: `${longest}일` }] : []),
  ];
  if (!recent.length) {
    return {
      id: 'posting',
      kind: 'hold-back',
      title: `최근 ${AUDIT_WINDOW_DAYS}일 동안 올린 영상이 없어요`,
      detail:
        daysSince === null
          ? '아직 영상 게시 기록이 없어요. 승인한 영상을 올리고 [게시 기록]에 남기면 간격을 세어 드려요.'
          : `마지막 영상은 ${daysSince}일 전이에요. 쉬는 기간이 길면 새 영상이 덜 퍼져요. 요일을 정해 다시 올려 보세요.`,
      numbers,
    };
  }
  if (perWeek >= GOOD_POSTS_PER_WEEK && daysSince !== null && daysSince <= 7) {
    return { id: 'posting', kind: 'good', title: '꾸준히 올리고 있어요', detail: `최근 ${AUDIT_WINDOW_DAYS}일 동안 일주일에 ${perWeek}편꼴로 올렸어요. 이 속도를 지켜 주세요.`, numbers };
  }
  const longNow = daysSince !== null && daysSince > LONG_GAP_DAYS;
  return {
    id: 'posting',
    kind: 'hold-back',
    title: longNow ? `${daysSince}일째 새 영상이 없어요` : `일주일에 ${perWeek}편꼴이에요`,
    detail: `최근 ${AUDIT_WINDOW_DAYS}일 동안 ${recent.length}편을 올렸어요. 요일을 정해 일주일에 ${GOOD_POSTS_PER_WEEK}편 이상 올리는 것을 목표로 해 보세요.`,
    numbers,
  };
}

// ── 성과: 최근 영상 vs 내 전체 중앙값 ──
interface MetricDef {
  id: string;
  label: string;
  unit: string;
  better: 'higher' | 'lower';
  value: (p: Publication) => number | undefined;
}
const perK = (key: 'saves' | 'shares' | 'follows') => (p: Publication) => (p.metrics.reach ? ((p.metrics[key] ?? 0) / p.metrics.reach) * 1000 : undefined);
const METRICS: MetricDef[] = [
  { id: 'skipRate', label: '건너뛰기 비율', unit: '%', better: 'lower', value: (p) => p.metrics.skipRate },
  { id: 'avgWatch', label: '평균 시청 시간', unit: '초', better: 'higher', value: (p) => p.metrics.avgWatchSeconds },
  { id: 'saves', label: '저장 (도달 1,000명당)', unit: '', better: 'higher', value: perK('saves') },
  { id: 'shares', label: '보내기 (도달 1,000명당)', unit: '', better: 'higher', value: perK('shares') },
  { id: 'follows', label: '팔로우 (도달 1,000명당)', unit: '', better: 'higher', value: perK('follows') },
];

function metricFindings(withMetrics: Publication[]): AuditFinding[] {
  const sorted = [...withMetrics].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const out: AuditFinding[] = [];
  for (const m of METRICS) {
    const rows = sorted.map((p) => m.value(p)).filter((v): v is number => v !== undefined && Number.isFinite(v));
    if (rows.length < MIN_POSTS_FOR_STATS) continue;
    const recentCount = Math.min(3, Math.ceil(rows.length / 3));
    const all = median(rows)!;
    const recent = median(rows.slice(-recentCount))!;
    const diff = recent - all;
    // 중앙값이 0이면 비율을 셀 수 없다: 그때는 차이가 있는지만 본다
    const rel = all === 0 ? (diff === 0 ? 0 : 1) : Math.abs(diff) / Math.abs(all);
    if (rel < METRIC_CHANGE) continue;
    const better = m.better === 'higher' ? diff > 0 : diff < 0;
    const u = m.unit;
    const lastWord = recentCount === 1 ? '최근 영상' : `최근 ${recentCount}편`;
    out.push({
      id: `metric-${m.id}`,
      kind: better ? 'good' : 'hold-back',
      title: `${lastWord} ${m.label}: 내 평소보다 ${better ? '좋아요' : '나빠요'}`,
      detail: `${lastWord} ${fmt(recent)}${u}, 내 영상 ${rows.length}편의 중앙값 ${fmt(all)}${u}이에요.${better ? ' 최근 영상의 방식을 이어 가 보세요.' : ' 최근에 바꾼 것(첫 장면·길이·연출)이 있다면 되돌려 비교해 보세요.'}`,
      numbers: [
        { label: lastWord, value: `${fmt(recent)}${u}` },
        { label: `내 중앙값 (${rows.length}편)`, value: `${fmt(all)}${u}` },
      ],
    });
  }
  return out;
}

// ── 연출·훅: 같은 조건 3편 이상끼리 비교 ──
/** 비교 점수: 도달 1,000명당 저장+보내기, 없으면 건너뛰기 비율이 낮을수록 */
const insightScore = (i: FormatInsight) => (i.medianSavesSharesPerK !== null ? i.medianSavesSharesPerK : i.medianSkipRate !== null ? -i.medianSkipRate : Number.NEGATIVE_INFINITY);
const insightNumbers = (i: FormatInsight): AuditNumber[] => [
  { label: '영상 수', value: `${i.posts}편` },
  ...(i.medianSavesSharesPerK !== null ? [{ label: '저장+보내기 (도달 1,000명당)', value: fmt(i.medianSavesSharesPerK) }] : []),
  ...(i.medianSkipRate !== null ? [{ label: '건너뛰기 비율', value: `${fmt(i.medianSkipRate)}%` }] : []),
  ...(i.medianAvgWatch !== null ? [{ label: '평균 시청 시간', value: `${fmt(i.medianAvgWatch)}초` }] : []),
];

/** 성과가 좋은 순서의 연출 (같은 연출 3편 이상인 것이 2개 이상일 때만) */
export function rankedStyles(insights: FormatInsight[]): FormatInsight[] {
  const styles = insights.filter((i) => i.kind === 'style' && i.enough && isStyleId(i.key) && Number.isFinite(insightScore(i)));
  if (styles.length < 2) return [];
  return [...styles].sort((a, b) => insightScore(b) - insightScore(a) || a.key.localeCompare(b.key));
}

function formatFindings(insights: FormatInsight[]): AuditFinding[] {
  const out: AuditFinding[] = [];
  for (const kind of ['style', 'hook'] as const) {
    const word = kind === 'style' ? '연출' : '훅';
    const groups = insights.filter((i) => i.kind === kind && i.enough && Number.isFinite(insightScore(i))).sort((a, b) => insightScore(b) - insightScore(a) || a.key.localeCompare(b.key));
    if (groups.length < 2) continue;
    const best = groups[0]!;
    const worst = groups.at(-1)!;
    const bySaves = best.medianSavesSharesPerK !== null;
    out.push({
      id: `${kind}-best`,
      kind: 'good',
      title: `'${best.label}' ${word}이 가장 잘 됐어요`,
      detail: bySaves
        ? `같은 ${word} 3편 이상인 것 ${groups.length}가지 중 도달 1,000명당 저장+보내기가 가장 많아요 (${fmt(best.medianSavesSharesPerK!)}).`
        : `같은 ${word} 3편 이상인 것 ${groups.length}가지 중 건너뛰기 비율이 가장 낮아요 (${fmt(best.medianSkipRate!)}%).`,
      numbers: insightNumbers(best),
    });
    const bestScore = insightScore(best);
    const worstScore = insightScore(worst);
    const clearlyWorse = bySaves && worst.medianSavesSharesPerK !== null ? worstScore < bestScore * 0.7 : worstScore < bestScore - 5;
    if (worst !== best && clearlyWorse) {
      out.push({
        id: `${kind}-worst`,
        kind: 'hold-back',
        title: `'${worst.label}' ${word}은 반응이 약해요`,
        detail: bySaves && worst.medianSavesSharesPerK !== null
          ? `도달 1,000명당 저장+보내기가 ${fmt(worst.medianSavesSharesPerK)}로 '${best.label}'(${fmt(best.medianSavesSharesPerK!)})보다 적어요. 당분간 '${best.label}' 쪽을 더 만들어 보세요.`
          : `건너뛰기 비율이 '${best.label}'보다 높아요. 당분간 '${best.label}' 쪽을 더 만들어 보세요.`,
        numbers: insightNumbers(worst),
      });
    }
  }
  return out;
}

// ── 대본: 첫 장면 길이·끝맺음 부탁 ──
function scriptFindings(scripts: Script[], source: 'published' | 'drafts'): AuditFinding[] {
  if (!scripts.length) return [];
  const what = source === 'published' ? '올린 영상' : '만들어 둔 대본';
  const out: AuditFinding[] = [];
  const noCta = scripts.filter((s) => !hasCallToAction(s));
  const ctaNumbers = [
    { label: source === 'published' ? '살펴본 영상' : '살펴본 대본', value: `${scripts.length}편` },
    { label: '끝에 부탁하는 말 없음', value: `${noCta.length}편` },
  ];
  out.push(
    noCta.length
      ? {
          id: 'cta',
          kind: 'hold-back',
          title: `${noCta.length}편은 끝에 저장·공유를 부탁하지 않아요`,
          detail: `${what} ${scripts.length}편 중 ${noCta.length}편은 마지막 장면에 "저장해 두세요" 같은 한마디가 없어요 (${noCta.slice(0, 3).map((s) => `"${s.title}"`).join(', ')}${noCta.length > 3 ? ' 등' : ''}). 끝에 할 일을 하나 부탁해 보세요.`,
          numbers: ctaNumbers,
        }
      : { id: 'cta', kind: 'good', title: '영상 끝에 저장·공유를 부탁하고 있어요', detail: `${what} ${scripts.length}편 모두 마지막 장면에 시청자에게 할 일을 부탁해요.`, numbers: ctaNumbers },
  );
  const secs = scripts.map((s) => ({ s, sec: estimateSpeechSeconds(hookLine(s)) }));
  const long = secs.filter((x) => x.sec > HOOK_MAX_SECONDS);
  const avg = secs.reduce((a, x) => a + x.sec, 0) / secs.length;
  const hookNumbers = [
    { label: '첫 장면 평균 (예상)', value: `${fmt(avg)}초` },
    { label: `${HOOK_MAX_SECONDS}초 넘는 첫 장면`, value: `${long.length}편` },
  ];
  out.push(
    long.length
      ? {
          id: 'hook-length',
          kind: 'hold-back',
          title: `첫 장면이 긴 영상이 ${long.length}편 있어요`,
          detail: `첫 장면 대사가 ${HOOK_MAX_SECONDS}초(예상)를 넘으면 앞부분에서 넘기기 쉬워요: ${long.slice(0, 3).map((x) => `"${x.s.title}" ${fmt(x.sec)}초`).join(', ')}. 첫 문장을 짧게 끊어 보세요.`,
          numbers: hookNumbers,
        }
      : { id: 'hook-length', kind: 'good', title: '첫 장면이 짧아요', detail: `${what} ${scripts.length}편 모두 첫 장면 대사가 ${HOOK_MAX_SECONDS}초(예상) 안에 끝나요.`, numbers: hookNumbers },
  );
  return out;
}

// ── 영상이 없는 레시피 ──
const STATUS_RANK: Record<ProjectStatus, number> = { approved: 0, review: 1, draft: 2, rendered: 3 };
const STATUS_NOTE: Record<ProjectStatus, string> = {
  approved: '승인된 대본이 있어 영상만 만들면 돼요',
  review: '대본이 있어 검수·승인만 남았어요',
  draft: '레시피가 들어와 있어요',
  rendered: '',
};

function suggestions(waiting: AuditProject[], ranked: FormatInsight[]): AuditSuggestion[] {
  const chosen: { style: StyleId }[] = [];
  const picks = waiting.map((p) => {
    const scores = styleScores(p.recipe);
    const current = p.latestScript?.style && isStyleId(p.latestScript.style) && p.status !== 'draft' ? p.latestScript.style : null;
    const fitIndex = ranked.findIndex((r) => scores[r.key as StyleId]?.ready);
    return { p, current, fitIndex: fitIndex === -1 ? 99 : fitIndex };
  });
  // 잘 된 연출이 맞는 레시피 → 거의 다 된 것(승인·검수 대기) → 최근에 손댄 것
  picks.sort((a, b) => a.fitIndex - b.fitIndex || STATUS_RANK[a.p.status] - STATUS_RANK[b.p.status] || b.p.updatedAt.localeCompare(a.p.updatedAt) || b.p.id - a.p.id);
  // 같은 요리를 여러 번 만든 경우(같은 레시피로 콘텐츠를 또 만든 경우) 한 번만 고른다
  const seen = new Set<string>();
  const unique = picks.filter(({ p }) => {
    const key = (p.dishName || p.topic).trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.slice(0, 3).map(({ p, current, fitIndex }) => {
    const top = fitIndex < 99 ? ranked[fitIndex]! : null;
    let style: StyleId;
    const why: string[] = [STATUS_NOTE[p.status]];
    if (current) {
      style = current;
      why.push(`지금 대본은 '${STYLE_INFO[current].label}' 연출이에요`);
      if (top && top.key !== current) why.push(`성과로는 '${top.label}'이 더 좋았어요 — 후보에서 바꿔 볼 수 있어요`);
    } else if (top) {
      style = top.key as StyleId;
      why.push(`'${top.label}' 연출이 내 영상 중 반응이 가장 좋았어요${top.medianSavesSharesPerK !== null ? ` (도달 1,000명당 저장+보내기 ${fmt(top.medianSavesSharesPerK)}, ${top.posts}편)` : ` (${top.posts}편)`}`);
    } else {
      // 비교할 성과가 아직 없으면 레시피 자료에 맞는 연출 (앞에서 고른 연출은 반복을 줄인다)
      const again = styleScores(p.recipe, chosen.slice(-3).reverse().map((c) => ({ style: c.style })));
      style = [...STYLE_IDS].filter((s) => again[s].ready).sort((a, b) => again[b].score - again[a].score)[0] ?? 'comedy';
      why.push(`${again[style].reason.split(' · ')[0]} — '${STYLE_INFO[style].label}' 연출이 잘 맞아요`);
    }
    chosen.push({ style });
    return { projectId: p.id, topic: p.topic, dishName: p.dishName, status: p.status, style, styleLabel: STYLE_INFO[style].label, reason: `${why.filter(Boolean).join('. ')}.` };
  });
}

/** 기록이 적을 때의 시작 요령 (숫자를 지어내지 않는다) */
function starterTips(postsWithMetrics: number): string[] {
  return [
    `성과를 적은 영상이 ${postsWithMetrics}편이라 아직 숫자로 비교하지 않았어요. ${MIN_POSTS_FOR_STATS}편이 모이면 잘 된 연출·훅을 비교해 드려요.`,
    '올리고 하루이틀 뒤 인스타그램 인사이트의 도달·건너뛰기 비율·평균 시청 시간·저장·보내기·팔로우를 콘텐츠의 [게시 기록]에 적어 주세요.',
    '처음 몇 주는 연출을 바꿔 가며 올려 보세요. 같은 연출이 3편 쌓이면 무엇이 잘 맞는지 보여요.',
    `첫 장면은 ${HOOK_MAX_SECONDS}초 안에 끝나게 짧게, 마지막엔 저장·보내기를 부탁하는 한마디를 넣어 보세요.`,
    `요일을 정해 일주일에 ${GOOD_POSTS_PER_WEEK}~3편 꾸준히 올리는 것부터 시작해 보세요.`,
  ];
}

export function buildAudit(input: AuditInput, now = new Date()): AuditResult {
  const videoPosts = input.publications.filter(isVideoPost);
  const withMetrics = videoPosts.filter(hasMetrics);
  const enoughData = withMetrics.length >= MIN_POSTS_FOR_STATS;
  const findings: AuditFinding[] = [postingFinding(videoPosts, now)];

  const insights = formatInsights(input.publications);
  if (enoughData) findings.push(...metricFindings(withMetrics), ...formatFindings(insights));

  // 올린 영상의 대본 (같은 대본 버전은 한 번만). 올린 것이 없으면 만들어 둔 대본으로 본다
  const seen = new Set<string>();
  const published = videoPosts.flatMap((p) => {
    const key = scriptKey(p.projectId, p.scriptVersion);
    if (seen.has(key) || !input.scripts[key]) return [];
    seen.add(key);
    return [input.scripts[key]!];
  });
  const drafts = input.projects.map((p) => p.latestScript).filter((s): s is Script => Boolean(s));
  findings.push(...(published.length ? scriptFindings(published, 'published') : scriptFindings(drafts, 'drafts')));

  const postedProjects = new Set(input.publications.filter((p) => p.status === 'published').map((p) => p.projectId));
  const waiting = input.projects.filter((p) => p.status !== 'rendered' && !postedProjects.has(p.id));
  if (input.projects.length) {
    findings.push(
      waiting.length
        ? {
            id: 'no-video',
            kind: 'hold-back',
            title: `영상이 아직 없는 레시피 ${waiting.length}개`,
            detail: `승인된 영상이나 게시 기록이 없는 레시피예요. 아래 '다음에 만들 영상 3개'부터 하나씩 끝내 보세요.`,
            numbers: [
              { label: '전체 레시피', value: `${input.projects.length}개` },
              { label: '영상 없음', value: `${waiting.length}개` },
            ],
          }
        : { id: 'no-video', kind: 'good', title: '모든 레시피가 영상이 됐어요', detail: '새 레시피를 올리면 다음 영상을 골라 드려요.', numbers: [{ label: '전체 레시피', value: `${input.projects.length}개` }] },
    );
  }

  return {
    generatedAt: now.toISOString(),
    enoughData,
    counts: {
      projects: input.projects.length,
      posts30: videoPosts.filter((p) => Date.parse(p.publishedAt) >= now.getTime() - AUDIT_WINDOW_DAYS * DAY && Date.parse(p.publishedAt) <= now.getTime()).length,
      postsWithMetrics: withMetrics.length,
      recipesWithoutVideo: waiting.length,
    },
    good: findings.filter((f) => f.kind === 'good'),
    holdBack: findings.filter((f) => f.kind === 'hold-back'),
    starter: enoughData ? [] : starterTips(withMetrics.length),
    next: suggestions(waiting, enoughData ? rankedStyles(insights) : []),
  };
}

/** 저장소에서 진단 입력을 모은다 */
export function collectAuditInput(repo: Repo): AuditInput {
  const projects: AuditProject[] = repo.listProjects().map((p) => ({
    id: p.id,
    topic: p.topic,
    dishName: p.dishName,
    status: p.status,
    updatedAt: p.updatedAt,
    recipe: repo.getRecipe(p.id),
    latestScript: repo.latestScript(p.id)?.script ?? null,
  }));
  const publications = repo.allPublications();
  const scripts: Record<string, Script> = {};
  for (const p of publications) {
    const key = scriptKey(p.projectId, p.scriptVersion);
    if (scripts[key] || !isVideoPost(p)) continue;
    try {
      scripts[key] = repo.getScript(p.projectId, p.scriptVersion).script;
    } catch {
      /* 대본이 없으면 대본 검사에서 뺀다 */
    }
  }
  return { projects, publications, scripts };
}

/**
 * Claude 요약에 넘길 사실 목록 (진단 결과의 숫자만). 연구자 경험·이름·게시물 주소는 넣지 않는다.
 * 요약이 이 글에 없는 숫자를 쓰면 받지 않는다 (auditSummary.ts).
 */
export function auditFacts(a: AuditResult): string {
  const line = (f: AuditFinding) => `- ${f.title}: ${f.detail}${f.numbers.length ? ` [${f.numbers.map((n) => `${n.label} ${n.value}`).join(', ')}]` : ''}`;
  return [
    `레시피 ${a.counts.projects}개, 최근 ${AUDIT_WINDOW_DAYS}일 영상 게시 ${a.counts.posts30}편, 성과를 적은 영상 ${a.counts.postsWithMetrics}편, 영상이 없는 레시피 ${a.counts.recipesWithoutVideo}개.`,
    a.enoughData ? '성과 비교: 함.' : `성과 비교: 성과를 적은 영상이 ${MIN_POSTS_FOR_STATS}편보다 적어 하지 않음.`,
    '잘하고 있는 점:',
    ...(a.good.length ? a.good.map(line) : ['- 없음']),
    '발목 잡는 점:',
    ...(a.holdBack.length ? a.holdBack.map(line) : ['- 없음']),
    `다음에 만들 영상 ${a.next.length}개:`,
    ...(a.next.length ? a.next.map((s) => `- ${s.dishName || s.topic} (${s.styleLabel})`) : ['- 없음']),
  ].join('\n');
}
