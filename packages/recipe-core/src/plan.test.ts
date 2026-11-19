import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLOT_TIMES,
  addDays,
  bestSlotTimes,
  deriveSlotStatus,
  isWeekStart,
  kstParts,
  nextWeekStart,
  planReadiness,
  planWeek,
  slotTimeLabel,
  slotsForWeek,
  toKstIso,
  weekDates,
  weekStartOf,
  type PlanFacts,
  type PostedResult,
} from './index.ts';

describe('한국 시간 날짜 계산', () => {
  it('UTC 밤 시각도 한국 날짜·요일로 센다', () => {
    // 2026-11-23(월) 15:30 UTC = 2026-11-24(화) 00:30 KST
    expect(kstParts('2026-11-23T15:30:00Z')).toEqual({ date: '2026-11-24', weekday: 2, hour: 0, minute: 30 });
  });

  it('주의 시작은 월요일, 일요일은 그 주의 마지막 날', () => {
    expect(weekStartOf('2026-11-19T03:00:00Z')).toBe('2026-11-16'); // 목
    expect(weekStartOf('2026-11-22T10:00:00+09:00')).toBe('2026-11-16'); // 일
    expect(weekStartOf('2026-11-23T00:10:00+09:00')).toBe('2026-11-23'); // 월 새벽
    expect(nextWeekStart('2026-11-19T03:00:00Z')).toBe('2026-11-23');
    expect(weekDates('2026-11-23')).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('주 고르기 값은 월요일 날짜만 받는다', () => {
    expect(isWeekStart('2026-11-23')).toBe(true);
    expect(isWeekStart('2026-11-24')).toBe(false);
    expect(isWeekStart('2026-02-30')).toBe(false);
    expect(isWeekStart('../etc')).toBe(false);
    expect(isWeekStart(20261123)).toBe(false);
  });

  it('시간대 없는 날짜·시간 칸 값은 한국 시간으로 보고, 저장 형식으로 맞춘다', () => {
    expect(toKstIso('2026-11-24T19:30')).toBe('2026-11-24T19:30:00+09:00');
    expect(toKstIso('2026-11-24T10:30:00Z')).toBe('2026-11-24T19:30:00+09:00');
    expect(toKstIso('내일 저녁')).toBeNull();
  });

  it('기본 시간: 화 18:00 · 목 12:30 · 토 10:00', () => {
    expect(DEFAULT_SLOT_TIMES.map(slotTimeLabel)).toEqual(['화 18:00', '목 12:30', '토 10:00']);
    expect(slotsForWeek('2026-11-23', DEFAULT_SLOT_TIMES)).toEqual(['2026-11-24T18:00:00+09:00', '2026-11-26T12:30:00+09:00', '2026-11-28T10:00:00+09:00']);
  });
});

const pub = (at: string, reach: number, saves: number, shares = 0, extra: Partial<PostedResult> = {}): PostedResult => ({ status: 'published', platform: 'instagram', publishedAt: at, metrics: { reach, saves, shares }, ...extra });

describe('게시 시간 고르기', () => {
  it('반응을 입력한 게시물이 3편보다 적으면 기본 시간', () => {
    const r = bestSlotTimes([pub('2026-11-02T20:00:00+09:00', 1000, 90), pub('2026-11-04T20:00:00+09:00', 1000, 80)]);
    expect(r.source).toBe('default');
    expect(r.times).toEqual(DEFAULT_SLOT_TIMES);
  });

  it('도달 1,000명당 저장+보내기가 높은 요일·시를 고르고, 요일이 겹치지 않게, 모자라면 기본 시간으로 채운다', () => {
    const r = bestSlotTimes([
      pub('2026-11-01T21:10:00+09:00', 1000, 50, 30), // 일 21시: 80
      pub('2026-11-08T21:40:00+09:00', 2000, 100, 60), // 일 21시: 80
      pub('2026-11-01T09:00:00+09:00', 1000, 70), // 일 9시: 70 (같은 요일이라 빠짐)
      pub('2026-11-03T07:00:00+09:00', 1000, 60), // 화 7시: 60
      pub('2026-11-05T20:00:00+09:00', 1000, 5), // 목 20시: 5
      // 판단에 안 쓰는 것: 블로그, 예약만 한 것, 도달 없음
      pub('2026-11-06T12:00:00+09:00', 1000, 999, 0, { platform: 'naver' }),
      pub('2026-11-06T13:00:00+09:00', 1000, 999, 0, { status: 'scheduled' }),
      { status: 'published', platform: 'instagram', publishedAt: '2026-11-07T08:00:00+09:00', metrics: { saves: 999 } },
    ]);
    expect(r.source).toBe('metrics');
    expect(r.reason).toContain('5편');
    // 월요일부터 순서: 화 7시, 목 20시, 일 21시
    expect(r.times.map(slotTimeLabel)).toEqual(['화 07:00', '목 20:00', '일 21:00']);
  });

  it('잘 된 요일이 하나뿐이면 나머지는 그 요일이 아닌 기본 시간', () => {
    const r = bestSlotTimes([pub('2026-11-03T08:00:00+09:00', 1000, 50), pub('2026-11-10T08:30:00+09:00', 1000, 40), pub('2026-11-17T08:00:00+09:00', 1000, 60)]);
    expect(r.times.map(slotTimeLabel)).toEqual(['화 08:00', '목 12:30', '토 10:00']);
  });
});

const facts = (f: Partial<PlanFacts>): PlanFacts => ({ latestVersion: 1, approvedVersion: null, renderedLatest: false, lastDecision: null, postedLatest: false, ...f });

describe('준비 정도와 칸 상태', () => {
  it('준비 정도: 승인+영상 > 영상만 > 대본만 > 대본 없음', () => {
    expect(planReadiness(facts({ approvedVersion: 1, renderedLatest: true }))).toBe(4);
    expect(planReadiness(facts({ renderedLatest: true }))).toBe(3);
    expect(planReadiness(facts({}))).toBe(1);
    expect(planReadiness(facts({ latestVersion: null }))).toBe(0);
  });

  it('칸 상태는 콘텐츠 상태를 따른다', () => {
    expect(deriveSlotStatus('planned', facts({}))).toBe('planned');
    expect(deriveSlotStatus('planned', facts({ renderedLatest: true }))).toBe('waiting');
    expect(deriveSlotStatus('waiting', facts({ approvedVersion: 1, renderedLatest: true, lastDecision: 'approved' }))).toBe('approved');
    // 승인 뒤 대본을 고치면(새 버전) 승인이 풀리고 다시 준비 중 → 영상이 나오면 승인 대기
    expect(deriveSlotStatus('approved', facts({ latestVersion: 2, approvedVersion: null }))).toBe('planned');
    expect(deriveSlotStatus('approved', facts({ latestVersion: 2, renderedLatest: true }))).toBe('waiting');
    expect(deriveSlotStatus('approved', facts({ approvedVersion: 1, renderedLatest: true, postedLatest: true }))).toBe('posted');
  });

  it('수정 요청: 새 영상이 나올 때까지 고치는 중, 나오면 승인 대기. 검수 화면의 수정 요청도 같다', () => {
    expect(deriveSlotStatus('change-requested', facts({ latestVersion: 2 }))).toBe('change-requested');
    expect(deriveSlotStatus('change-requested', facts({ latestVersion: 2, renderedLatest: true }))).toBe('waiting');
    expect(deriveSlotStatus('waiting', facts({ renderedLatest: true, lastDecision: 'changes_requested' }))).toBe('change-requested');
  });

  it('올림·건너뜀은 사람이 정한 그대로', () => {
    expect(deriveSlotStatus('skipped', facts({ approvedVersion: 1, renderedLatest: true }))).toBe('skipped');
    expect(deriveSlotStatus('posted', facts({ latestVersion: 2 }))).toBe('posted');
  });
});

describe('한 주 계획 세우기', () => {
  const week = '2026-11-23';
  const before = Date.parse('2026-11-20T00:00:00+09:00');
  const p = (id: number, readiness: number, createdAt = `2026-11-0${id}T00:00:00Z`, done = false) => ({ id, readiness, createdAt, done });

  it('준비된 것 → 오래된 것 순서로 이른 시간부터, 올린 콘텐츠는 빼고', () => {
    const plan = planWeek({ weekStart: week, times: DEFAULT_SLOT_TIMES, now: before, slots: [], projects: [p(1, 1), p(2, 3), p(3, 4), p(4, 3, '2026-10-01T00:00:00Z'), p(5, 4, '2026-11-09T00:00:00Z', true)] });
    expect(plan).toEqual([
      { projectId: 3, at: '2026-11-24T18:00:00+09:00' },
      { projectId: 4, at: '2026-11-26T12:30:00+09:00' },
      { projectId: 2, at: '2026-11-28T10:00:00+09:00' },
    ]);
  });

  it('이미 칸이 있는 콘텐츠는 두 번 넣지 않고, 칸이 있는 날은 비워 둔 채 그대로 둔다', () => {
    const plan = planWeek({
      weekStart: week,
      times: DEFAULT_SLOT_TIMES,
      now: before,
      projects: [p(1, 4), p(2, 3), p(3, 1), p(4, 1)],
      slots: [
        { projectId: 1, at: '2026-12-01T18:00:00+09:00', status: 'approved' }, // 다른 주에 이미 있음
        { projectId: 2, at: '2026-11-24T20:00:00+09:00', status: 'waiting' }, // 화요일을 옮겨 둔 칸
        { projectId: 3, at: '2026-11-10T18:00:00+09:00', status: 'posted' }, // 올린 칸 (끝남)
        { projectId: 4, at: '2026-11-28T10:00:00+09:00', status: 'skipped' }, // 건너뛴 칸은 날을 막지 않는다
      ],
    });
    expect(plan).toEqual([
      { projectId: 3, at: '2026-11-26T12:30:00+09:00' },
      { projectId: 4, at: '2026-11-28T10:00:00+09:00' },
    ]);
  });

  it('지난 시각에는 넣지 않고, 콘텐츠가 모자라면 남는 칸은 비워 둔다', () => {
    const wed = Date.parse('2026-11-25T09:00:00+09:00');
    expect(planWeek({ weekStart: week, times: DEFAULT_SLOT_TIMES, now: wed, slots: [], projects: [p(1, 1)] })).toEqual([{ projectId: 1, at: '2026-11-26T12:30:00+09:00' }]);
    expect(planWeek({ weekStart: week, times: DEFAULT_SLOT_TIMES, now: before, slots: [], projects: [] })).toEqual([]);
  });
});
