import type { SceneType } from '@mat-lab/recipe-core';
import { BURNER, CHEF_POS, PLATE, PROP_CENTER, type Vec3 } from './layout.ts';

/**
 * 장면 종류별 카메라·캐릭터 행동·음식 상태.
 * 같은 규칙으로 매 영상을 찍으므로 결과가 일정하다.
 */
export type ChefAction = 'idle' | 'cook' | 'present' | 'point';
/** 장면 분위기 조명 (참고 영상처럼 장면마다 색 조명을 바꾼다) */
export type Mood = 'morning' | 'curious' | 'gloom' | 'fire' | 'fresh' | 'golden';

export interface Shot {
  from: { pos: Vec3; target: Vec3 };
  to: { pos: Vec3; target: Vec3 };
  fov: number;
  action: ChefAction;
  /** 캐릭터가 바라보는 곳: 카메라 또는 가스레인지 */
  face: 'camera' | 'stove';
  burnerOn: boolean;
  /** 팬·냄비 안 음식의 익힘 정도 (장면 시작 → 끝) */
  cook: [number, number];
  /** 접시 위 완성 음식 표시 */
  plated: 'none' | 'done' | 'failed';
  /** 재료 소품 표시: 숨김 / 차례로 등장 / 계속 표시 */
  props: 'hidden' | 'appear' | 'shown';
  mood: Mood;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const CHEF_FACE: Vec3 = add(CHEF_POS, [0, 0.42, 0]);
const PROPS_CENTER: Vec3 = [PROP_CENTER[0], 1.0, PROP_CENTER[2]];

const WIDE = {
  from: { pos: [1.3, 1.85, 2.5] as Vec3, target: [-0.35, 1.18, -0.85] as Vec3 },
  to: { pos: [1.05, 1.78, 2.2] as Vec3, target: [-0.4, 1.18, -0.85] as Vec3 },
};
// 캐릭터 중간 샷: 얼굴이 화면 가운데보다 조금 아래(카드·자막을 피해서)에 오도록 위쪽을 본다
const CHEF_CLOSE = {
  from: { pos: add(CHEF_FACE, [0.75, 0.3, 2.15]), target: add(CHEF_FACE, [0.05, 0.22, 0]) },
  to: { pos: add(CHEF_FACE, [0.55, 0.26, 1.9]), target: add(CHEF_FACE, [0.05, 0.22, 0]) },
};
// 참고 영상처럼 어깨 너머로 팬을 내려다보는 시점
const STOVE = {
  from: { pos: [0.2, 1.98, -0.2] as Vec3, target: add(BURNER, [0.06, 0.2, 0.02]) },
  to: { pos: [0.08, 1.9, -0.32] as Vec3, target: add(BURNER, [0.06, 0.2, 0.02]) },
};
const COUNTER = {
  from: { pos: add(PROPS_CENTER, [0.18, 0.78, 1.55]), target: add(PROPS_CENTER, [0.02, 0.2, -0.05]) },
  to: { pos: add(PROPS_CENTER, [0.04, 0.74, 1.4]), target: add(PROPS_CENTER, [0.02, 0.2, -0.05]) },
};
const PLATE_CLOSE = {
  from: { pos: add(PLATE, [0.4, 0.72, 1.0]), target: add(PLATE, [0, 0.16, 0]) },
  to: { pos: add(PLATE, [-0.2, 0.68, 1.0]), target: add(PLATE, [0, 0.16, 0]) },
};
// 접시를 든 캐릭터 정면
const PRESENT = {
  from: { pos: add(CHEF_FACE, [0.35, 0.25, 2.3]), target: add(CHEF_FACE, [0.05, 0.12, 0]) },
  to: { pos: add(CHEF_FACE, [0.25, 0.2, 2.0]), target: add(CHEF_FACE, [0.05, 0.12, 0]) },
};

export function shotFor(type: SceneType, indexOfType: number): Shot {
  const base: Omit<Shot, 'from' | 'to'> = {
    mood: 'morning',
    fov: 46,
    action: 'idle',
    face: 'camera',
    burnerOn: false,
    cook: [0, 0],
    plated: 'none',
    props: 'shown',
  };
  switch (type) {
    case 'intro':
      return { ...base, ...WIDE, props: 'hidden' };
    case 'mistake':
      return { ...base, ...PRESENT, mood: 'gloom', plated: 'failed', props: 'hidden', action: 'present' };
    case 'question':
      return { ...base, ...CHEF_CLOSE, mood: 'curious', fov: 42, props: 'hidden' };
    case 'explain':
      return indexOfType % 2 === 0
        ? { ...base, ...STOVE, mood: 'fire', action: 'cook', face: 'stove', burnerOn: true, cook: [0.15, 0.45], props: 'hidden' }
        : { ...base, ...CHEF_CLOSE, mood: 'curious', fov: 42, action: 'point', burnerOn: true, cook: [0.45, 0.5], props: 'hidden' };
    case 'ingredients':
      return { ...base, ...COUNTER, mood: 'fresh', props: 'appear' };
    case 'steps':
      return { ...base, ...STOVE, mood: 'fire', action: 'cook', face: 'stove', burnerOn: true, cook: [0, 1] };
    case 'tip':
      return { ...base, ...PLATE_CLOSE, mood: 'golden', fov: 40, plated: 'done', cook: [1, 1] };
    case 'outro':
      return { ...base, ...PRESENT, mood: 'golden', plated: 'done', cook: [1, 1], action: 'present' };
  }
}

/** 장면 진행률(0~1)에 따른 카메라 위치. 부드럽게 천천히 움직인다. */
export function cameraAt(shot: Shot, t: number): { pos: Vec3; target: Vec3 } {
  const e = t * t * (3 - 2 * t);
  const lerp = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
  return { pos: lerp(shot.from.pos, shot.to.pos), target: lerp(shot.from.target, shot.to.target) };
}
