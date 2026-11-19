import { describe, expect, it } from 'vitest';
import { SWIPE_THRESHOLD, dragOffset, swipeAction } from './swipe.ts';

describe('승인 대기열 카드 밀기', () => {
  it('오른쪽으로 충분히 밀면 승인, 왼쪽은 수정 요청', () => {
    expect(swipeAction(SWIPE_THRESHOLD, 0)).toBe('approve');
    expect(swipeAction(-SWIPE_THRESHOLD - 20, 10)).toBe('change');
  });

  it('조금 밀거나 세로로 더 움직이면 아무것도 하지 않는다 (화면 내리기)', () => {
    expect(swipeAction(SWIPE_THRESHOLD - 1, 0)).toBeNull();
    expect(swipeAction(120, 200)).toBeNull();
    expect(dragOffset(120, 200)).toBe(0);
  });

  it('끄는 동안 카드는 정한 거리까지만 따라온다', () => {
    expect(dragOffset(40, 5)).toBe(40);
    expect(dragOffset(500, 0)).toBe(160);
    expect(dragOffset(-500, 0)).toBe(-160);
  });
});
