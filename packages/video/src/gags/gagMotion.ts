import type { Emotion } from '@mat-lab/recipe-core';

/**
 * 농담 그림의 움직임 (순수 함수: 미리보기 = 렌더, gagMotion.test.ts가 확인한다).
 * 모두 장면 안 프레임(f)과 장면 진행률(p, 0~1)만 쓴다.
 */

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 천천히 시작해 천천히 멈춤 */
export const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** 장면 진행률 (0~1). 길이가 0이어도 나뉘지 않게 */
export const progressOf = (frame: number, duration: number) => clamp01(frame / Math.max(1, duration - 1));

/** 그네 각도(도): 약 2.5초에 한 번 오가며 처음 0.5초 동안 커진다 */
export const SWING_MAX_DEG = 14;
export function swingAngle(f: number): number {
  const grow = clamp01(f / 15);
  return SWING_MAX_DEG * grow * Math.sin((2 * Math.PI * f) / 75);
}

/** 롤러코스터 선로 높이 (화면 y). 큰 언덕(x 420)과 작은 언덕(x 860) */
export function coasterY(x: number): number {
  return 1060 - 360 * Math.exp(-(((x - 420) / 190) ** 2)) - 150 * Math.exp(-(((x - 860) / 120) ** 2));
}
/** 선로 기울기(도) */
export function coasterAngle(x: number): number {
  const d = 2;
  return (Math.atan2(coasterY(x + d) - coasterY(x - d), 2 * d) * 180) / Math.PI;
}
/** 차가 장면 동안 왼쪽 밖에서 큰 언덕 꼭대기를 지나 오른쪽으로 (꼭대기에서 잠깐 느려진다) */
export function coasterX(p: number): number {
  const t = clamp01(p);
  // 꼭대기(x 420) 근처에서 느려지게: 앞 절반은 꼭대기까지 천천히 올라가고, 뒤 절반은 빠르게 내려간다
  return t < 0.55 ? -60 + (420 + 60) * ease(t / 0.55) : 420 + (1250 - 420) * ((t - 0.55) / 0.45) ** 1.6;
}

/** 위로 올라가는 양 (0~1): 크레인·로켓. 처음 0.15는 멈춰 있다가 올라간다 */
export const lift = (p: number) => ease((p - 0.12) / 0.8);

/**
 * 농담 장면의 맛조수 표정: 끝까지 태연하게 (차분한 기록 담당, 당황·놀람·실망 없이).
 * 기쁨·궁금함·자신감은 그대로 둔다.
 */
export function deadpanEmotion(e: Emotion): Emotion {
  return e === 'surprised' || e === 'embarrassed' || e === 'disappointed' ? 'confident' : e;
}

/** 0~1 사이 고정 난수 (그림의 별·눈송이 자리) */
export function hash01(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
