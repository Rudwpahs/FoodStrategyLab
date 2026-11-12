import { describe, expect, it } from 'vitest';
import { costText } from './cost.ts';

describe('비용 안내 문구', () => {
  it('실제 사용 기록이 있으면 최근 평균과 횟수를 보인다', () => {
    expect(costText({ count: 12, avgUsd: 0.0312 }, '약 $0.03')).toBe('최근 평균 $0.03 (12회)');
    expect(costText({ count: 3, avgUsd: 0.0042 }, '약 $0.03')).toBe('최근 평균 $0.004 (3회)');
  });

  it('기록이 없으면 추정값에 "추정"을 붙인다', () => {
    expect(costText(undefined, '약 $0.1')).toBe('약 $0.1, 추정');
    expect(costText({ count: 0, avgUsd: 0 }, '약 $0.1')).toBe('약 $0.1, 추정');
  });
});
