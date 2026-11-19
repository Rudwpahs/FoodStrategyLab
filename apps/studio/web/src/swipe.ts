/**
 * 승인 대기열 카드 밀기: 오른쪽 = 승인(확인창으로), 왼쪽 = 수정 요청.
 * 세로로 더 많이 움직였으면 화면을 내리는 것으로 보고 아무것도 하지 않는다.
 */
export const SWIPE_THRESHOLD = 90;

export type SwipeAction = 'approve' | 'change' | null;

export function swipeAction(dx: number, dy: number, threshold = SWIPE_THRESHOLD): SwipeAction {
  if (Math.abs(dy) > Math.abs(dx)) return null;
  if (dx >= threshold) return 'approve';
  if (dx <= -threshold) return 'change';
  return null;
}

/** 끄는 동안 카드가 따라 움직일 거리 (가로로 끌 때만, 너무 멀리 가지 않게) */
export function dragOffset(dx: number, dy: number, limit = 160): number {
  if (Math.abs(dy) > Math.abs(dx)) return 0;
  return Math.max(-limit, Math.min(limit, dx));
}
