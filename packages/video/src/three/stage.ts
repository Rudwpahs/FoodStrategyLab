import { PerspectiveCamera, Vector3 } from 'three';
import type { FoodKind, Scene, Script } from '@mat-lab/recipe-core';
import type { SceneTiming } from '../timeline.ts';
import type { StageState } from './KitchenScene.tsx';
import type { Vec3 } from './layout.ts';
import { PLACE_HAS_STOVE, placePlan, videoLook } from './places.ts';
import { beatAt, cameraAt, compareFailShot, insightShot, shotPlan } from './shots.ts';
import { mouthAt } from '../lipSync.ts';
import { GOGGLE_LEAD, goggleSceneIndex, gogglePose, insightFrames } from '../hostCues.ts';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
/** 살짝 튀어오르는 등장 */
const popIn = (v: number) => {
  const t = clamp01(v);
  return t < 1 ? 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.18 : 1;
};

export interface SceneAt {
  index: number;
  scene: Scene;
  timing: SceneTiming;
  local: number;
  progress: number;
}

export function sceneAt(script: Script, timings: SceneTiming[], frame: number): SceneAt | null {
  for (let i = 0; i < timings.length; i++) {
    const t = timings[i]!;
    const scene = script.scenes.find((s) => s.id === t.sceneId);
    if (!scene) continue;
    const isLast = i === timings.length - 1;
    if (frame >= t.from && (frame < t.from + t.durationInFrames || isLast)) {
      const local = frame - t.from;
      return { index: i, scene, timing: t, local, progress: clamp01(local / Math.max(1, t.durationInFrames - 1)) };
    }
  }
  return null;
}

/**
 * 첫 장면은 이미 움직이는 중에서 시작한다: 0프레임이 멈춘 접시 화면이 되지 않게 카메라 움직임과 맛조수 등장을 이만큼 앞당긴다.
 * (카메라 이동은 처음과 끝이 느린 곡선이라, 앞당기지 않으면 첫 몇 프레임이 거의 멈춰 있다)
 */
export const OPENING_HEAD_START = 8;
/**
 * 첫 장면 시작에는 카메라가 조금 먼 곳에서 빠르게 다가오며 멈춘다 (처음이 가장 빠름 → 0프레임부터 움직임이 보인다).
 * OPENING_PUSH만큼 더 먼 거리에서 시작해 OPENING_PUSH_FRAMES 동안 원래 구도로 들어온다.
 */
export const OPENING_PUSH = 0.22;
export const OPENING_PUSH_FRAMES = 40;
/** 첫 장면 local 프레임에서 카메라 거리 배율 (1 = 원래 구도) */
export function openingPush(local: number): number {
  const rest = Math.max(0, 1 - local / OPENING_PUSH_FRAMES);
  return 1 + OPENING_PUSH * rest * rest;
}

/**
 * 재료 이름 (라벨 → 말에서 찾을 이름): 분량을 떼고 마지막 낱말("잘 익은 김치 200g" → 김치, "다진 마늘" → 마늘),
 * 붙여 쓴 이름은 그대로("다진마늘 2t" → 다진마늘). 분량 숫자가 없는 라벨("소금 약간", "물 달걀이 잠길 만큼")은 첫 낱말.
 */
export function propName(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const amountAt = words.findIndex((w) => /\d/.test(w));
  const name = amountAt > 0 ? words.slice(0, amountAt) : words.slice(0, 1);
  return name[name.length - 1] ?? '';
}

/** 어절이 그 이름 + 조사(없어도 됨)인지: "설탕과" ○, "물엿," 은 "물"이 아니다 */
const PARTICLE = /^(은|는|이|가|을|를|과|와|에|에서|으로|로|도|만|이랑|랑|하고|이나|나|까지|의|이면|면|이에요|예요|이요|요|부터|에는)?$/;
const namesWord = (token: string, name: string) => {
  const t = token.replace(/[,.!?…~'"“”‘’()]/g, '');
  return t.startsWith(name) && PARTICLE.test(t.slice(name.length));
};

/**
 * 재료 소품이 나올 프레임 (재료 장면 시작 기준): 목소리가 그 재료 이름을 말하는 어절이 시작할 때.
 * 대사에 이름이 없거나 실제 목소리 어절 시간이 없으면 undefined (예전처럼 차례로 나온다).
 * 근거: 화면의 물건이 그 말을 하는 순간 나타나야 말과 그림이 이어진다 (2026-11-21, 사용자 지적 "싱크가 안 맞아").
 */
export function propCueFrames(line: string, words: [number, number][] | undefined, labels: string[]): (number | undefined)[] {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!words || words.length !== tokens.length) return labels.map(() => undefined);
  return labels.map((label) => {
    const name = propName(label);
    if (!name) return undefined;
    const k = tokens.findIndex((t) => namesWord(t, name));
    return k >= 0 ? Math.max(0, words[k]![0] - PROP_CUE_LEAD) : undefined;
  });
}
/** 말보다 조금 먼저 나와 말할 때 이미 보이게 (프레임) */
const PROP_CUE_LEAD = 3;

/**
 * 프레임 → 3D 장면 상태 (카메라·캐릭터·음식·소품). 순수 함수라 테스트할 수 있다.
 * props: 소품 수, 또는 소품 라벨 (라벨이 있으면 목소리가 이름을 말할 때 그 소품이 나온다)
 * opts.realScenes: 실제 촬영 영상·사진으로 시작하는 장면 id (그 장면은 3D가 가려지므로 고글 동작을 다음 노트 장면으로 넘긴다, hostCues.ts)
 */
export function stageAt(
  script: Script,
  timings: SceneTiming[],
  frame: number,
  foodKind: FoodKind,
  props: number | string[],
  variant: 'main' | 'compare-fail' = 'main',
  opts: { realScenes?: ReadonlySet<string> } = {},
): StageState | null {
  const propCount = typeof props === 'number' ? props : props.length;
  const at = sceneAt(script, timings, frame);
  if (!at) return null;
  const { scene, index, local, progress, timing } = at;
  const sameTypeBefore = script.scenes.slice(0, index).filter((s) => s.type === scene.type).length;
  // 긴 장면은 약 3초마다 다른 각도로 (음식 익힘은 장면 전체 진행률로 이어진다)
  // 장소와 구도는 대본 전체를 보고 한 번에 정한다 (이어지는 장면이 같은 구도가 되지 않게)
  const sceneIndex = script.scenes.indexOf(scene);
  const place = placePlan(script)[sceneIndex] ?? 'kitchen';
  const head = index === 0 ? OPENING_HEAD_START : 0;
  const plan = { variant: shotPlan(script)[sceneIndex] ?? 0, place };
  // 고글 장면: 첫머리는 맛조수를 비추며 고글 동작을 하고(insight), 나머지 시간에 장면 본래 화면들을 차례로 보여 준다
  const goggleScene = variant === 'main' && sceneIndex === goggleSceneIndex(script, opts.realScenes);
  const insight = goggleScene ? insightFrames(timing.durationInFrames) : 0;
  const beat =
    local < insight
      ? { shot: insightShot(beatAt(scene, sameTypeBefore, 0, timing.durationInFrames, plan).shot), progress: Math.min(1, local / Math.max(1, insight - 1)) }
      : beatAt(scene, sameTypeBefore, local - insight + head, timing.durationInFrames - insight + head, plan);
  const shot = variant === 'compare-fail' ? compareFailShot(beat.shot) : beat.shot;
  const raw = cameraAt(shot, beat.progress);
  const push = index === 0 ? openingPush(local) : 1;
  const cam = push === 1 ? raw : { target: raw.target, pos: raw.pos.map((v, k) => raw.target[k]! + (v - raw.target[k]!) * push) as Vec3 };

  const ingredientsIndex = script.scenes.findIndex((s) => s.type === 'ingredients');
  const cues =
    index === ingredientsIndex && typeof props !== 'number' ? propCueFrames(scene.line, timing.words, props) : [];
  const propPop = Array.from({ length: propCount }, (_, i) => {
    if (ingredientsIndex === -1) return index >= script.scenes.findIndex((s) => s.type === 'steps') && index > 0 ? 1 : 0;
    if (index > ingredientsIndex) return 1;
    if (index < ingredientsIndex) return 0;
    return popIn((local - (cues[i] ?? 6 + i * 7)) / 9);
  });

  const cookT = scene.type === 'steps' ? smooth(progress) : progress;
  const cook = shot.cook[0] + (shot.cook[1] - shot.cook[0]) * cookT;
  const flip = foodKind === 'pancake' && scene.type === 'steps' ? smooth((progress - 0.48) / 0.14) : 0;

  return {
    camera: { pos: cam.pos as Vec3, target: cam.target as Vec3, fov: shot.fov },
    // 실패한 음식이 나오는 화면에서 맛조수는 당황·실망하지 않고 차분히 살펴본다 (실수하지 않는 기록 담당, persona-2026-11.md)
    emotion: shot.plated === 'failed' ? 'curious' : scene.emotion,
    talking: local < timing.speechFrames,
    mouth: mouthAt(timing.mouth, local),
    action: shot.action,
    face: shot.face,
    burnerOn: shot.burnerOn,
    showFoodInVessel: PLACE_HAS_STOVE[place] && (scene.type === 'steps' || scene.visual === 'sizzle' || (scene.type === 'explain' && !scene.visual)),
    cook,
    flip,
    plated: shot.plated,
    plateAt: shot.plate,
    propPop,
    chefPop: index === 0 ? popIn((local + head) / 10) : 1,
    goggles: goggleScene ? gogglePose(local - GOGGLE_LEAD) : undefined,
    mood: shot.mood,
    place,
    dayTime: videoLook(script.title).dayTime,
    table: videoLook(script.title).table,
  };
}

/** 화면 좌표 계산용 카메라·벡터 하나를 계속 쓴다 (한 프레임에 이름표 수만큼 불리므로 매번 만들지 않는다) */
const projCam = new PerspectiveCamera();
const projVec = new Vector3();

/** 3D 좌표 → 화면 픽셀 (재료 이름표를 소품 위에 붙이기 위해) */
export function projectToScreen(point: Vec3, camera: StageState['camera'], width: number, height: number): { x: number; y: number; visible: boolean } {
  const cam = projCam;
  cam.fov = camera.fov;
  cam.aspect = width / height;
  cam.near = 0.05;
  cam.far = 30;
  cam.updateProjectionMatrix();
  cam.position.set(...camera.pos);
  cam.lookAt(...camera.target);
  cam.updateMatrixWorld();
  const v = projVec.set(...point).project(cam);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
}
