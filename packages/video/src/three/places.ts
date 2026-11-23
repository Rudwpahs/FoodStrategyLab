import { PLACES, gagPlan, type Place, type Scene, type Script } from '@mat-lab/recipe-core';
import { seeded } from '../random.ts';
import type { SceneTiming } from '../timeline.ts';

/**
 * 장면이 펼쳐지는 곳(3D 무대)과 영상마다 바뀌는 시간대 조명.
 * - 대본에 장소(scene.place)가 있으면 그대로 쓴다.
 * - 없으면 장면 종류·연출에 맞춰 고른다. 영상 제목으로 씨앗을 정해 미리보기와 렌더가 같다.
 * - 한 영상에 장소는 많아야 3곳. 장면마다 바꾸지 않고, 이어지는 장면은 앞 장면 장소를 따른다.
 *
 * 모든 무대는 맛조수·조리대 높이 작업대·접시·재료 자리를 같은 좌표(layout.ts)에 둔다.
 * 그래서 카메라 구도와 '자막이 얼굴을 가리지 않는다' 검사가 장소와 상관없이 그대로 맞는다.
 */

export type { Place };
export { PLACES };

/** 영상 한 편의 시간대 (조명 색·방향이 바뀐다) */
export const DAY_TIMES = ['morning', 'afternoon', 'evening'] as const;
export type DayTime = (typeof DAY_TIMES)[number];

/** 불(가스레인지·실험용 버너)이 있는 무대. 없는 곳에서는 팬·불을 그리지 않고 조리 화면을 다른 화면으로 바꾼다 */
export const PLACE_HAS_STOVE: Record<Place, boolean> = {
  kitchen: true,
  lab: true,
  market: false,
  dining: false,
  pantry: false,
};

/**
 * 식탁 차림 (영상마다 바뀐다): 빨간 체크 식탁보 · 흰 리넨 · 맨 나무 식탁 · 쪽빛 체크.
 * 엔딩·결과 장면은 거의 늘 식탁이라, 차림까지 같으면 영상끼리 같은 그림으로 끝나 보였다.
 */
export const TABLE_DRESSES = ['gingham', 'linen', 'wood', 'indigo'] as const;
export type TableDress = (typeof TABLE_DRESSES)[number];

/** 한 영상에 쓰는 장소 수 상한 */
export const MAX_PLACES = 3;

/** 제목 → 씨앗 숫자 (FNV-1a). 같은 제목이면 언제나 같은 값 */
export function titleSeed(title: string): number {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** 영상마다 고정되는 고르기 (제목 씨앗) */
export interface VideoLook {
  /** 재료 장면 장소: 시장 가판대 또는 찬장·냉장고 앞 */
  ingredients: Place;
  /** 원리 설명 장소: 연구실 칠판 또는 주방 */
  explain: Place;
  dayTime: DayTime;
  /** 카메라 구도 고르기용 씨앗 */
  shotSeed: number;
  /** 식탁 차림 */
  table: TableDress;
}

export function videoLook(title: string): VideoLook {
  const rnd = seeded(titleSeed(title));
  // 처음 몇 개는 씨앗과 너무 비슷하게 나오므로 한 번 버린다
  rnd();
  return {
    ingredients: rnd() < 0.5 ? 'market' : 'pantry',
    explain: rnd() < 0.6 ? 'lab' : 'kitchen',
    dayTime: DAY_TIMES[Math.floor(rnd() * DAY_TIMES.length)]!,
    shotSeed: Math.floor(rnd() * 1_000_000),
    // 앞의 값들은 그대로 두고 뒤에 이어서 뽑는다 (예전 영상의 장소·구도가 바뀌지 않게)
    table: TABLE_DRESSES[Math.floor(rnd() * TABLE_DRESSES.length)]!,
  };
}

/** 장면 하나가 원하는 장소. 'follow'는 앞 장면 장소를 따른다 */
function wantedPlace(scene: Pick<Scene, 'type' | 'visual'>, look: VideoLook): Place | 'follow' {
  switch (scene.visual) {
    case 'result':
    case 'signature':
      return 'dining';
    case 'sizzle':
      return 'kitchen';
    case 'compare':
    case 'fail':
    case 'fail-closeup':
    case 'react':
      return 'follow';
    default:
      break;
  }
  switch (scene.type) {
    case 'ingredients':
      return look.ingredients;
    case 'explain':
      return look.explain;
    case 'steps':
    case 'tip':
      return 'kitchen';
    case 'outro':
      return 'dining';
    case 'intro':
    case 'question':
    case 'mistake':
    case 'gag':
      return 'follow';
  }
}

/** 장소·구도 고르기에 쓰는 대본 내용 (같은 대본 객체를 고쳐 쓰더라도 다시 계산하도록 비교한다) */
export function planKey(script: Script): string {
  return `${script.title}\u0000${script.scenes.map((s) => `${s.type}|${s.visual ?? ''}|${s.place ?? ''}`).join(',')}`;
}

const cache = new WeakMap<Script, { key: string; plan: Place[] }>();

/** 장면별 장소 (대본 순서대로). 같은 대본이면 언제나 같은 결과. 프레임마다 불리므로 대본별로 기억해 둔다 */
export function placePlan(script: Script): Place[] {
  const key = planKey(script);
  const hit = cache.get(script);
  if (hit && hit.key === key) return hit.plan;
  const plan = computePlan(script);
  cache.set(script, { key, plan });
  return plan;
}

function computePlan(script: Script): Place[] {
  const scenes = script.scenes;
  // 대본에 장소가 하나라도 적혀 있으면 적힌 대로 따르고, 빈 장면은 앞 장면(맨 앞이면 처음 적힌 장소)을 따른다
  const firstExplicit = scenes.find((s) => s.place)?.place;
  if (firstExplicit) {
    let current: Place = firstExplicit;
    return scenes.map((s) => (current = s.place ?? current));
  }

  const look = videoLook(script.title);
  const wants = scenes.map((s) => wantedPlace(s, look));
  // '따르기' 장면은 앞 장면 장소에 머문다 (맨 앞이면 주방). 결과 먼저 보여 준 훅 다음 인사는 식탁에 남는다
  let current: Place = 'kitchen';
  let plan = wants.map((w) => (current = w === 'follow' ? current : w));

  // 장소가 너무 많으면 (주방·식탁 말고) 가장 적게 나오는 곳을 주방으로 합친다
  for (;;) {
    const counts = new Map<Place, number>();
    for (const p of plan) counts.set(p, (counts.get(p) ?? 0) + 1);
    if (counts.size <= MAX_PLACES) break;
    const droppable = [...counts.entries()].filter(([p]) => p !== 'kitchen' && p !== 'dining');
    const pool = droppable.length ? droppable : [...counts.entries()].filter(([p]) => p !== 'kitchen');
    // 가장 적게 나오는 곳. 같으면 영상 씨앗으로 고른다
    pool.sort((a, b) => a[1] - b[1] || ((look.shotSeed >> PLACES.indexOf(a[0])) & 1) - ((look.shotSeed >> PLACES.indexOf(b[0])) & 1));
    const drop = pool[0]![0];
    plan = plan.map((p) => (p === drop ? 'kitchen' : p));
  }

  // 한 장면만 다른 곳에 다녀오는 왕복(주방 → 찬장 → 주방)은 정신없으니 앞뒤 장소로 합친다. 단, 장소가 2곳은 남긴다
  for (let i = 1; i < plan.length - 1; i++) {
    const [a, b, c] = [plan[i - 1]!, plan[i]!, plan[i + 1]!];
    if (a !== c || b === a) continue;
    const merged = plan.map((p, k) => (k === i ? a : p));
    if (new Set(merged).size >= 2) plan = merged;
  }
  return plan;
}

/** 이 장면의 장소 */
export function placeOf(script: Script, index: number): Place {
  return placePlan(script)[index] ?? 'kitchen';
}

/** 장소가 바뀌는 순간의 화면 휙 넘김 길이 (프레임, 바뀌는 순간 앞뒤로 각각) */
export const WHIP_FRAMES = 6;

/**
 * 장소가 바뀌는 장면 경계에서의 화면 넘김 정도.
 * amount: 0(넘김 없음)~1(경계 순간), side: -1 = 나가는 장면(왼쪽으로 밀려남), 1 = 들어오는 장면(오른쪽에서 들어옴)
 */
export function placeTransitionAt(script: Script, timings: SceneTiming[], frame: number): { amount: number; side: -1 | 1 } {
  // 농담 그림(gag)이 바뀌거나 시작·끝나는 경계도 장소가 바뀌는 것처럼 넘긴다 (그림 자체가 다른 곳이다)
  const gags = gagPlan(script.scenes);
  const places = placePlan(script);
  const plan = places.map((p, i) => (gags[i] ? `gag:${gags[i]}` : p));
  const index = (id: string) => script.scenes.findIndex((s) => s.id === id);
  for (let i = 1; i < timings.length; i++) {
    const cut = timings[i]!.from;
    const d = frame - cut;
    if (d < -WHIP_FRAMES || d >= WHIP_FRAMES) continue;
    const a = index(timings[i - 1]!.sceneId);
    const b = index(timings[i]!.sceneId);
    if (a < 0 || b < 0 || plan[a] === plan[b]) continue;
    // 경계에 가까울수록 크게 (나갈 때는 빨라지고, 들어올 때는 느려진다)
    const t = d < 0 ? (WHIP_FRAMES + d) / WHIP_FRAMES : 1 - d / WHIP_FRAMES;
    return { amount: t * t, side: d < 0 ? -1 : 1 };
  }
  return { amount: 0, side: 1 };
}
