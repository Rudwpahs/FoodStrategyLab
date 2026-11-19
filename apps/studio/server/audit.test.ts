import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, contentCandidates, type RecipeInput, type Script } from '@mat-lab/recipe-core';
import { HOOK_MAX_SECONDS, auditFacts, buildAudit, hasCallToAction, type AuditInput, type AuditProject } from './audit.ts';
import type { Publication } from './repo.ts';

const NOW = new Date('2026-11-19T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const recipe = (i: number): RecipeInput => SAMPLE_RECIPES[i % SAMPLE_RECIPES.length]!;

const script = (title: string, first: string, last: string, style = 'problem'): Script => ({
  title,
  style,
  hookType: 'mistake',
  scenes: [
    { id: 's1', type: 'intro', emotion: 'surprised', line: first, hook: true },
    { id: 's2', type: 'explain', emotion: 'curious', line: '원리는 이래요.' },
    { id: 's3', type: 'outro', emotion: 'joy', line: last },
  ],
});
const SHORT_CTA = script('짧은 훅', '잠깐! 이러면 안 돼요!', '저장해 두세요! 오늘의 실험 끝!');

let nextId = 1;
const project = (over: Partial<AuditProject> = {}): AuditProject => {
  const id = over.id ?? nextId++;
  return { id, topic: `주제 ${id}`, dishName: `요리 ${id}`, status: 'draft', updatedAt: daysAgo(id), recipe: recipe(id), latestScript: null, ...over };
};

let pubId = 1;
const pub = (projectId: number, publishedAt: string, over: Partial<Publication> = {}): Publication => ({
  id: pubId++,
  projectId,
  renderId: 1,
  scriptVersion: 1,
  platform: 'instagram',
  status: 'published',
  url: 'https://www.instagram.com/reel/x',
  scheduledAt: '',
  publishedAt,
  style: 'problem',
  hookType: 'mistake',
  metrics: {},
  note: '',
  createdAt: publishedAt,
  ...over,
});

const input = (projects: AuditProject[], publications: Publication[], scripts: Record<string, Script> = {}): AuditInput => ({ projects, publications, scripts });

describe('계정 진단 규칙', () => {
  it('기록이 없으면 지어낸 숫자 없이 시작 요령과 다음 영상 3개를 준다', () => {
    const projects = [project(), project(), project(), project()];
    const a = buildAudit(input(projects, []), NOW);
    expect(a.enoughData).toBe(false);
    expect(a.starter.length).toBeGreaterThan(2);
    expect(a.starter[0]).toContain('0편');
    // 성과 비교 항목은 없다 (숫자를 만들어 내지 않는다)
    expect([...a.good, ...a.holdBack].some((f) => f.id.startsWith('metric-') || f.id.endsWith('-best'))).toBe(false);
    const posting = a.holdBack.find((f) => f.id === 'posting')!;
    expect(posting.title).toContain('없어요');
    expect(a.holdBack.find((f) => f.id === 'no-video')!.title).toBe('영상이 아직 없는 레시피 4개');
    expect(a.next).toHaveLength(3);
    for (const s of a.next) expect(s.reason.length).toBeGreaterThan(10);
    // 같은 입력이면 같은 결과
    expect(buildAudit(input(projects, []), NOW)).toEqual(a);
  });

  it('게시 간격: 일주일에 2편 넘게 꾸준하면 잘하는 점, 오래 쉬면 발목 잡는 점', () => {
    const p = project({ status: 'rendered' });
    const steady = [2, 5, 9, 12, 16, 19, 23, 27, 29].map((d) => pub(p.id, daysAgo(d)));
    const good = buildAudit(input([p], steady), NOW).good.find((f) => f.id === 'posting')!;
    expect(good.title).toBe('꾸준히 올리고 있어요');
    expect(good.numbers.find((n) => n.label.includes('영상 게시'))!.value).toBe('9편');

    const stale = buildAudit(input([p], [pub(p.id, daysAgo(14)), pub(p.id, daysAgo(20))]), NOW).holdBack.find((f) => f.id === 'posting')!;
    expect(stale.title).toBe('14일째 새 영상이 없어요');
    expect(stale.numbers.find((n) => n.label === '가장 긴 쉬는 기간')!.value).toBe('14일');
    // 블로그 게시는 영상 간격에 넣지 않는다
    const blogOnly = buildAudit(input([p], [pub(p.id, daysAgo(1), { platform: 'naver' })]), NOW);
    expect(blogOnly.counts.posts30).toBe(0);
  });

  it('성과: 최근 영상을 내 중앙값과 비교한다 (나빠지면 발목 잡는 점)', () => {
    const p = project({ status: 'rendered' });
    const rows = [
      { d: 25, skipRate: 40, avgWatchSeconds: 12, reach: 1000, saves: 20, shares: 10 },
      { d: 20, skipRate: 42, avgWatchSeconds: 11, reach: 1000, saves: 22, shares: 9 },
      { d: 15, skipRate: 41, avgWatchSeconds: 12, reach: 1000, saves: 21, shares: 11 },
      { d: 10, skipRate: 39, avgWatchSeconds: 13, reach: 1000, saves: 19, shares: 10 },
      { d: 5, skipRate: 43, avgWatchSeconds: 12, reach: 1000, saves: 20, shares: 10 },
      { d: 1, skipRate: 65, avgWatchSeconds: 6, reach: 1000, saves: 5, shares: 2 },
    ];
    const pubs = rows.map(({ d, ...m }) => pub(p.id, daysAgo(d), { metrics: m }));
    const a = buildAudit(input([p], pubs), NOW);
    expect(a.enoughData).toBe(true);
    expect(a.starter).toEqual([]);
    const skip = a.holdBack.find((f) => f.id === 'metric-skipRate')!;
    // 6편이면 최근 2편의 중앙값(54%)을 6편 중앙값(41.5%)과 비교한다
    expect(skip.numbers).toEqual([
      { label: '최근 2편', value: '54%' },
      { label: '내 중앙값 (6편)', value: '41.5%' },
    ]);
    expect(a.holdBack.some((f) => f.id === 'metric-avgWatch')).toBe(true);
    expect(a.holdBack.some((f) => f.id === 'metric-saves')).toBe(true);
    expect(a.good.some((f) => f.id.startsWith('metric-'))).toBe(false);
  });

  it('연출: 같은 연출 3편 이상끼리 비교하고, 다음 영상은 잘 된 연출을 고른다', () => {
    const done = project({ status: 'rendered' });
    const strong = { reach: 1000, saves: 30, shares: 10, skipRate: 35 };
    const weak = { reach: 1000, saves: 5, shares: 1, skipRate: 55 };
    const pubs = [
      ...[3, 6, 9].map((d) => pub(done.id, daysAgo(d), { style: 'comedy', hookType: 'skit', metrics: strong })),
      ...[12, 15, 18].map((d) => pub(done.id, daysAgo(d), { style: 'problem', hookType: 'mistake', metrics: weak })),
    ];
    const waiting = [project({ id: 101, updatedAt: daysAgo(3) }), project({ id: 102, updatedAt: daysAgo(1) }), project({ id: 103, updatedAt: daysAgo(2), status: 'review', latestScript: SHORT_CTA })];
    const a = buildAudit(input([done, ...waiting], pubs), NOW);
    const best = a.good.find((f) => f.id === 'style-best')!;
    expect(best.title).toBe("'캐릭터 코미디형' 연출이 가장 잘 됐어요");
    expect(best.numbers).toContainEqual({ label: '저장+보내기 (도달 1,000명당)', value: '40' });
    expect(a.holdBack.find((f) => f.id === 'style-worst')!.title).toContain('문제 해결형');
    expect(a.good.some((f) => f.id === 'hook-best')).toBe(true);
    // 승인·게시된 영상이 없는 레시피만, 잘 된 연출(코미디)을 앞세워 고른다
    expect(a.next.map((s) => s.projectId).sort()).toEqual([101, 102, 103]);
    const fresh = a.next.find((s) => s.projectId === 102)!;
    expect(fresh.style).toBe('comedy');
    expect(fresh.reason).toContain('반응이 가장 좋았어요');
    // 대본이 이미 있으면 그 연출을 두고, 더 잘 된 연출을 알려 준다
    const inReview = a.next.find((s) => s.projectId === 103)!;
    expect(inReview.style).toBe('problem');
    expect(inReview.reason).toContain('검수·승인만 남았어요');
    expect(inReview.reason).toContain("'캐릭터 코미디형'이 더 좋았어요");
  });

  it('대본: 첫 장면이 길거나 끝에 부탁하는 말이 없으면 발목 잡는 점', () => {
    const p1 = project({ status: 'rendered' });
    const p2 = project({ status: 'rendered' });
    const long = script('긴 훅', '바쁜 날엔 이렇게! 들깨소스는 한 번에 만들어 네 통으로 나눠 냉동해 두면 편해요.', '오늘의 실험 끝!');
    const a = buildAudit(input([p1, p2], [pub(p1.id, daysAgo(2)), pub(p2.id, daysAgo(4))], { [`${p1.id}:1`]: SHORT_CTA, [`${p2.id}:1`]: long }), NOW);
    const cta = a.holdBack.find((f) => f.id === 'cta')!;
    expect(cta.title).toBe('1편은 끝에 저장·공유를 부탁하지 않아요');
    expect(cta.detail).toContain('"긴 훅"');
    const hook = a.holdBack.find((f) => f.id === 'hook-length')!;
    expect(hook.detail).toContain(`${HOOK_MAX_SECONDS}초`);
    expect(a.good.find((f) => f.id === 'no-video')!.title).toBe('모든 레시피가 영상이 됐어요');

    const allGood = buildAudit(input([p1], [pub(p1.id, daysAgo(2))], { [`${p1.id}:1`]: SHORT_CTA }), NOW);
    expect(allGood.good.map((f) => f.id)).toEqual(expect.arrayContaining(['cta', 'hook-length']));
  });

  it('올린 영상이 없으면 만들어 둔 대본으로 본다, 템플릿 대본의 끝맺음 규칙과 맞다', () => {
    const r = SAMPLE_RECIPES[0]!;
    const problem = contentCandidates(r, { count: 5 }).candidates.find((c) => c.style === 'problem')!.script;
    expect(hasCallToAction(problem)).toBe(true);
    const a = buildAudit(input([project({ status: 'review', latestScript: problem, recipe: r })], []), NOW);
    expect(a.good.find((f) => f.id === 'cta')!.detail).toContain('만들어 둔 대본');
  });

  it('요약에 넘길 사실 글에는 진단 숫자만 들어간다', () => {
    const a = buildAudit(input([project(), project()], []), NOW);
    const facts = auditFacts(a);
    expect(facts).toContain('성과 비교: 성과를 적은 영상이 3편보다 적어 하지 않음.');
    expect(facts).toContain('다음에 만들 영상 2개:');
    expect(facts).not.toMatch(/https?:/);
  });
});
