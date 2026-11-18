import type { Scene, SceneType, Script, Visual } from '@mat-lab/recipe-core';
import { seeded } from '../random.ts';
import { BURNER, CHEF_FACE, PLATE, PROP_CENTER, type Vec3 } from './layout.ts';
import { PLACE_HAS_STOVE, placePlan, planKey, videoLook, type Place } from './places.ts';

/**
 * 장면 종류별 카메라·캐릭터 행동·음식 상태.
 * 같은 규칙으로 매 영상을 찍으므로 결과가 일정하다.
 */
export type ChefAction = 'idle' | 'cook' | 'present' | 'point';
/** 장면 분위기 조명 (참고 영상처럼 장면마다 색 조명을 바꾼다) */
export type Mood = 'morning' | 'curious' | 'gloom' | 'fire' | 'fresh' | 'golden';

export interface Shot {
  /** 구도 이름 (이어지는 장면이 같은 구도가 되지 않게 비교한다) */
  name: string;
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
  mood: Mood;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const PROPS_CENTER: Vec3 = [PROP_CENTER[0], 1.0, PROP_CENTER[2]];

const WIDE = {
  name: 'wide',
  from: { pos: [1.3, 1.85, 2.5] as Vec3, target: [-0.35, 1.18, -0.85] as Vec3 },
  to: { pos: [1.05, 1.78, 2.2] as Vec3, target: [-0.4, 1.18, -0.85] as Vec3 },
};
// 캐릭터 중간 샷: 얼굴이 화면 가운데보다 조금 아래(카드·자막을 피해서)에 오도록 위쪽을 본다
const CHEF_CLOSE = {
  name: 'chef-close',
  from: { pos: add(CHEF_FACE, [0.75, 0.3, 2.15]), target: add(CHEF_FACE, [0.05, 0.22, 0]) },
  to: { pos: add(CHEF_FACE, [0.55, 0.26, 1.9]), target: add(CHEF_FACE, [0.05, 0.22, 0]) },
};
// 가스레인지 앞쪽 왼편에서 팬을 내려다보는 시점.
// (예전에는 캐릭터 어깨 너머라 흐릿한 몸통이 화면 아래를 크게 가렸다)
const STOVE = {
  name: 'stove',
  from: { pos: add(BURNER, [-0.2, 1.08, 0.66]), target: add(BURNER, [0.03, 0.03, -0.04]) },
  to: { pos: add(BURNER, [-0.14, 1.0, 0.58]), target: add(BURNER, [0.03, 0.03, -0.04]) },
};
const COUNTER = {
  name: 'counter',
  from: { pos: add(PROPS_CENTER, [0.18, 0.78, 1.55]), target: add(PROPS_CENTER, [0.02, 0.2, -0.05]) },
  to: { pos: add(PROPS_CENTER, [0.04, 0.74, 1.4]), target: add(PROPS_CENTER, [0.02, 0.2, -0.05]) },
};
const PLATE_CLOSE = {
  name: 'plate-close',
  from: { pos: add(PLATE, [0.4, 0.72, 1.0]), target: add(PLATE, [0, 0.16, 0]) },
  to: { pos: add(PLATE, [-0.2, 0.68, 1.0]), target: add(PLATE, [0, 0.16, 0]) },
};
// 접시를 든 캐릭터 정면. 얼굴(아래)과 접시(그 밑)가 함께 보이고, 자막은 얼굴 위(모자 앞)에 들어가도록
// 조금 떨어져서 찍는다 (가까우면 얼굴+접시가 화면 가운데를 다 차지해 자막이 얼굴이나 접시를 가렸다)
const PRESENT = {
  name: 'present',
  from: { pos: add(CHEF_FACE, [0.45, 0.32, 3.0]), target: add(CHEF_FACE, [0.05, 0.23, 0]) },
  to: { pos: add(CHEF_FACE, [0.33, 0.26, 2.6]), target: add(CHEF_FACE, [0.05, 0.23, 0]) },
};

export function shotFor(type: SceneType, indexOfType: number): Shot {
  const base: Omit<Shot, 'from' | 'to' | 'name'> = {
    mood: 'morning',
    fov: 46,
    action: 'idle',
    face: 'camera',
    burnerOn: false,
    cook: [0, 0],
    plated: 'none',
  };
  switch (type) {
    case 'intro':
      return { ...base, ...WIDE };
    case 'mistake':
      return { ...base, ...PRESENT, mood: 'gloom', plated: 'failed', action: 'present' };
    case 'question':
      return { ...base, ...CHEF_CLOSE, mood: 'curious', fov: 42 };
    case 'explain':
      return indexOfType % 2 === 0
        ? { ...base, ...STOVE, mood: 'fire', action: 'cook', face: 'stove', burnerOn: true, cook: [0.15, 0.45] }
        : { ...base, ...CHEF_CLOSE, mood: 'curious', fov: 42, action: 'point', burnerOn: true, cook: [0.45, 0.5] };
    case 'ingredients':
      return { ...base, ...COUNTER, mood: 'fresh' };
    case 'steps':
      return { ...base, ...STOVE, mood: 'fire', action: 'cook', face: 'stove', burnerOn: true, cook: [0, 1] };
    case 'tip':
      return { ...base, ...PLATE_CLOSE, mood: 'golden', fov: 40, plated: 'done', cook: [1, 1] };
    case 'outro':
      return { ...base, ...PRESENT, mood: 'golden', plated: 'done', cook: [1, 1], action: 'present' };
  }
}

// 훅용 빠른 확대: 캐릭터 얼굴로 더 가까이 다가간다
const CHEF_PUNCH = {
  name: 'chef-punch',
  from: { pos: add(CHEF_FACE, [0.5, 0.24, 1.75]), target: add(CHEF_FACE, [0.04, 0.2, 0]) },
  to: { pos: add(CHEF_FACE, [0.3, 0.2, 1.35]), target: add(CHEF_FACE, [0.04, 0.2, 0]) },
};
// 팬 속 음식에 바짝 붙는 조리 클로즈업
const STOVE_CLOSE = {
  name: 'stove-close',
  from: { pos: add(BURNER, [0.32, 0.62, 0.5]), target: add(BURNER, [0.04, 0.16, 0.02]) },
  to: { pos: add(BURNER, [0.2, 0.52, 0.38]), target: add(BURNER, [0.04, 0.16, 0.02]) },
};

/**
 * 긴 장면을 한 화면으로 오래 두면 지루하다 (3초 넘게 같은 화면 → 넘김).
 * 장면이 길면 약 3초마다 다른 각도로 끊어 보여 준다. 첫 화면은 장면 종류의 기본 화면.
 */
export const BEAT_FRAMES = 96;

/** 장면 종류별로 번갈아 쓸 다른 각도 (기본 화면 다음에 차례로) */
function alternateShots(type: SceneType, base: Shot): Shot[] {
  switch (type) {
    case 'explain':
      return [
        { ...base, ...CHEF_CLOSE, mood: 'curious', fov: 42, action: 'point', face: 'camera' },
        { ...base, ...STOVE_CLOSE, fov: 40, action: 'cook', face: 'stove' },
      ];
    case 'steps':
      return [
        { ...base, ...STOVE_CLOSE, fov: 40 },
        { ...base, ...WIDE, action: 'cook', face: 'stove' },
      ];
    case 'ingredients':
      return [{ ...base, ...COUNTER_LOW }];
    case 'tip':
      return [{ ...base, ...PRESENT, action: 'present', face: 'camera' }];
    default:
      return [];
  }
}

// 재료를 낮은 각도로 훑는 화면
const COUNTER_LOW = {
  name: 'counter-low',
  from: { pos: add(PROPS_CENTER, [-0.45, 0.42, 1.05]), target: add(PROPS_CENTER, [0.1, 0.05, -0.05]) },
  to: { pos: add(PROPS_CENTER, [0.4, 0.42, 1.05]), target: add(PROPS_CENTER, [-0.05, 0.05, -0.05]) },
};

// ---------- 새 구도 (장면마다 골라 써서 영상이 덜 똑같아 보이게) ----------

// 넓은 화면을 왼쪽에서 오른쪽으로 살짝 돌며 (궤도)
const ORBIT_WIDE = {
  name: 'orbit-wide',
  from: { pos: [-0.25, 1.8, 2.55] as Vec3, target: [-0.3, 1.16, -0.85] as Vec3 },
  to: { pos: [0.75, 1.76, 2.35] as Vec3, target: [-0.4, 1.16, -0.85] as Vec3 },
};
// 캐릭터에게 천천히 다가가기 (CHEF_CLOSE보다 멀리서 시작해 더 길게 밀고 들어간다)
const PUSH_IN = {
  name: 'push-in',
  from: { pos: add(CHEF_FACE, [0.18, 0.34, 2.75]), target: add(CHEF_FACE, [0.03, 0.23, 0]) },
  to: { pos: add(CHEF_FACE, [0.1, 0.27, 1.85]), target: add(CHEF_FACE, [0.03, 0.22, 0]) },
};
// 완성 음식을 낮은 각도에서 올려다보는 '주인공' 화면 (뒤 배경이 함께 보인다)
const HERO_LOW = {
  name: 'hero-low',
  from: { pos: add(PLATE, [0.32, 0.26, 0.78]), target: add(PLATE, [0, 0.09, 0]) },
  to: { pos: add(PLATE, [0.08, 0.22, 0.64]), target: add(PLATE, [0, 0.09, 0]) },
};
// 팬을 바로 위에서 내려다보는 화면 (요리 숏폼에서 흔한 구도)
const TOP_DOWN = {
  name: 'top-down',
  from: { pos: add(BURNER, [0.02, 0.92, 0.16]), target: add(BURNER, [0.02, 0.03, 0]) },
  to: { pos: add(BURNER, [0.02, 0.78, 0.12]), target: add(BURNER, [0.02, 0.03, 0]) },
};
// 재료 위를 옆으로 천천히 돌며 보는 화면
const ORBIT_PROPS = {
  name: 'orbit-props',
  from: { pos: add(PROPS_CENTER, [-0.42, 0.8, 1.45]), target: add(PROPS_CENTER, [0.02, 0.18, -0.05]) },
  to: { pos: add(PROPS_CENTER, [0.38, 0.74, 1.4]), target: add(PROPS_CENTER, [0.02, 0.18, -0.05]) },
};
// 접시를 든 맛조수를 조금 낮은 곳에서 (엔딩·서명용)
const PRESENT_LOW = {
  name: 'present-low',
  from: { pos: add(CHEF_FACE, [-0.35, 0.12, 2.9]), target: add(CHEF_FACE, [0.02, 0.24, 0]) },
  to: { pos: add(CHEF_FACE, [-0.2, 0.1, 2.55]), target: add(CHEF_FACE, [0.02, 0.24, 0]) },
};

/** 장면 하나에 고를 수 있는 구도들. 첫째가 예전부터 쓰던 기본 구도 */
export function shotVariants(scene: Pick<Scene, 'type' | 'visual'>, indexOfType: number): Shot[] {
  const base = shotFor(scene.type, indexOfType);
  if (scene.visual) return VISUAL_SHOTS[scene.visual](base).map((v) => ({ ...base, ...v }));
  const alt = ((): Partial<Shot>[] => {
    switch (scene.type) {
      case 'intro':
        return [ORBIT_WIDE];
      case 'question':
        return [PUSH_IN];
      case 'explain':
        return indexOfType % 2 === 0 ? [{ ...TOP_DOWN, fov: 44 }] : [{ ...PUSH_IN, fov: 42 }];
      case 'ingredients':
        return [ORBIT_PROPS];
      case 'steps':
        return [{ ...TOP_DOWN, fov: 44 }];
      case 'tip':
        return [{ ...HERO_LOW, fov: 42 }];
      case 'outro':
        return [PRESENT_LOW];
      case 'mistake':
        return [];
    }
  })();
  return [base, ...alt.map((a) => ({ ...base, ...a }))];
}

/** 장면 연출(visual)이 있으면 그 화면을, 없으면 장면 종류의 화면을 쓴다. variant로 여러 구도 중 하나를 고른다. */
export function shotForScene(scene: Pick<Scene, 'type' | 'visual'>, indexOfType: number, variant = 0, place: Place = 'kitchen'): Shot {
  const all = shotVariants(scene, indexOfType);
  return fitPlace(all[variant % all.length]!, place);
}

/**
 * 불이 없는 장소(시장·식탁·찬장)에서는 팬·불을 보는 화면을 맛조수 화면으로 바꾼다.
 * (대본이 그런 장소에서 조리 장면을 적었을 때만 생긴다. 자동 고르기는 조리를 주방·연구실에 둔다)
 */
export function fitPlace(shot: Shot, place: Place): Shot {
  if (PLACE_HAS_STOVE[place]) return shot;
  const lookingAtStove = shot.face === 'stove' || shot.burnerOn || STOVE_SHOTS.has(shot.name);
  if (!lookingAtStove) return shot;
  const wide = shot.name === 'wide' || shot.name === 'orbit-wide';
  const view = wide ? {} : { ...CHEF_CLOSE, fov: 42 };
  return { ...shot, ...view, action: shot.action === 'cook' ? 'point' : shot.action, face: 'camera', burnerOn: false, mood: shot.mood === 'fire' ? 'golden' : shot.mood };
}

const STOVE_SHOTS = new Set(['stove', 'stove-close', 'top-down']);

/**
 * 장면 안의 지금 화면과 그 화면 안 진행률.
 * 짧은 장면이나 연출(visual)을 정한 장면은 한 화면 그대로.
 */
export function beatAt(
  scene: Pick<Scene, 'type' | 'visual'>,
  indexOfType: number,
  local: number,
  duration: number,
  opts: { variant?: number; place?: Place } = {},
): { shot: Shot; progress: number; beat: number } {
  const place = opts.place ?? 'kitchen';
  const base = shotForScene(scene, indexOfType, opts.variant ?? 0, place);
  // 기본 구도와 같은 이름의 대체 화면은 빼서 한 장면 안에서 같은 화면이 두 번 나오지 않게
  const alts = scene.visual ? [] : alternateShots(scene.type, base).map((s) => fitPlace(s, place)).filter((s) => s.name !== base.name);
  const count = alts.length ? Math.max(1, Math.min(alts.length + 1, Math.floor(duration / BEAT_FRAMES))) : 1;
  const len = Math.max(1, duration / count);
  const beat = Math.min(count - 1, Math.floor(local / len));
  const shot = beat === 0 ? base : alts[beat - 1]!;
  return { shot, progress: Math.min(1, Math.max(0, (local - beat * len) / Math.max(1, len - 1))), beat };
}

const shotPlanCache = new WeakMap<Script, { key: string; plan: number[] }>();

/**
 * 장면별 구도 번호. 영상 제목 씨앗으로 고르고, 바로 앞 장면과 같은 구도가 되면 다른 구도로 바꾼다.
 * 같은 대본이면 언제나 같은 결과 (미리보기 = 렌더).
 */
export function shotPlan(script: Script): number[] {
  const key = planKey(script);
  const hit = shotPlanCache.get(script);
  if (hit && hit.key === key) return hit.plan;
  const places = placePlan(script);
  const rnd = seeded(videoLook(script.title).shotSeed);
  const seen = new Map<SceneType, number>();
  let prev = '';
  const plan = script.scenes.map((scene, i) => {
    const k = seen.get(scene.type) ?? 0;
    seen.set(scene.type, k + 1);
    const all = shotVariants(scene, k);
    let v = Math.floor(rnd() * all.length);
    const name = (n: number) => fitPlace(all[n % all.length]!, places[i]!).name;
    if (all.length > 1 && name(v) === prev) v = (v + 1) % all.length;
    prev = name(v);
    return v;
  });
  shotPlanCache.set(script, { key, plan });
  return plan;
}

const VISUAL_SHOTS: Record<Visual, (base: Shot) => Partial<Shot>[]> = {
  result: () => [
    { ...PLATE_CLOSE, mood: 'golden', fov: 38, plated: 'done', cook: [1, 1], action: 'idle', burnerOn: false },
    { ...HERO_LOW, mood: 'golden', fov: 40, plated: 'done', cook: [1, 1], action: 'idle', burnerOn: false },
  ],
  fail: () => [{ ...PRESENT, mood: 'gloom', plated: 'failed', action: 'present', face: 'camera' }],
  'fail-closeup': () => [{ ...PLATE_CLOSE, mood: 'gloom', fov: 36, plated: 'failed', cook: [1, 1], action: 'idle', burnerOn: false }],
  // 비교 장면은 화면을 위아래로 나눠 두 접시를 보여 준다 (KitchenVideo). 기본 상태는 '노트대로 한' 쪽.
  compare: () => [{ ...PLATE_CLOSE, mood: 'golden', fov: 40, plated: 'done', cook: [1, 1], action: 'idle', burnerOn: false }],
  sizzle: (b) => [
    { ...STOVE_CLOSE, mood: 'fire', fov: 40, action: 'cook', face: 'stove', burnerOn: true, cook: b.cook[1] > 0 ? b.cook : [0.3, 0.6] },
    { ...TOP_DOWN, mood: 'fire', fov: 40, action: 'cook', face: 'stove', burnerOn: true, cook: b.cook[1] > 0 ? b.cook : [0.3, 0.6] },
  ],
  react: () => [{ ...CHEF_PUNCH, mood: 'curious', fov: 38, face: 'camera' }],
  signature: () => [
    { ...PRESENT, mood: 'golden', plated: 'done', cook: [1, 1], action: 'present', face: 'camera' },
    { ...PRESENT_LOW, mood: 'golden', plated: 'done', cook: [1, 1], action: 'present', face: 'camera' },
  ],
};

/** 비교 화면의 '건너뛴 쪽' 상태 */
export function compareFailShot(shot: Shot): Shot {
  return { ...shot, plated: 'failed', mood: 'gloom' };
}


/** 장면 진행률(0~1)에 따른 카메라 위치. 부드럽게 천천히 움직인다. */
export function cameraAt(shot: Shot, t: number): { pos: Vec3; target: Vec3 } {
  const e = t * t * (3 - 2 * t);
  const lerp = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
  return { pos: lerp(shot.from.pos, shot.to.pos), target: lerp(shot.from.target, shot.to.target) };
}
