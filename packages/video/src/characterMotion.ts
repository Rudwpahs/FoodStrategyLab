import type { Emotion } from '@mat-lab/recipe-core';

/** 2D 캐릭터와 3D 맛조수가 함께 쓰는 동작 (한쪽만 고쳐 둘이 달라지지 않게) */

/** 감정별 팔 자세 [왼팔, 오른팔] (도, 0 = 아래로 내림) */
export const ARM_POSES: Record<Emotion, [number, number]> = {
  joy: [35, -150],
  embarrassed: [160, -25],
  curious: [25, -125],
  confident: [60, -165],
  surprised: [140, -140],
  disappointed: [8, -8],
};

/** 말할 때 입 벌림 정도 (0~1). 음절처럼 불규칙하게 보이도록 두 파형을 섞는다. */
export function mouthOpen(frame: number): number {
  const v = (0.55 + 0.45 * Math.sin(frame * 1.25)) * (0.65 + 0.35 * Math.sin(frame * 0.41 + 1));
  return Math.max(0, Math.min(1, v));
}
