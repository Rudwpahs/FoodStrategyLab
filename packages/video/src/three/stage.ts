import { PerspectiveCamera, Vector3 } from 'three';
import type { FoodKind, Scene, Script } from '@mat-lab/recipe-core';
import type { SceneTiming } from '../timeline.ts';
import type { StageState } from './KitchenScene.tsx';
import type { Vec3 } from './layout.ts';
import { cameraAt, compareFailShot, shotForScene } from './shots.ts';

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

/** 프레임 → 3D 장면 상태 (카메라·캐릭터·음식·소품). 순수 함수라 테스트할 수 있다. */
export function stageAt(script: Script, timings: SceneTiming[], frame: number, foodKind: FoodKind, propCount: number, variant: 'main' | 'compare-fail' = 'main'): StageState | null {
  const at = sceneAt(script, timings, frame);
  if (!at) return null;
  const { scene, index, local, progress, timing } = at;
  const sameTypeBefore = script.scenes.slice(0, index).filter((s) => s.type === scene.type).length;
  const mainShot = shotForScene(scene, sameTypeBefore);
  const shot = variant === 'compare-fail' ? compareFailShot(mainShot) : mainShot;
  const cam = cameraAt(shot, progress);

  const ingredientsIndex = script.scenes.findIndex((s) => s.type === 'ingredients');
  const propPop = Array.from({ length: propCount }, (_, i) => {
    if (ingredientsIndex === -1) return index >= script.scenes.findIndex((s) => s.type === 'steps') && index > 0 ? 1 : 0;
    if (index > ingredientsIndex) return 1;
    if (index < ingredientsIndex) return 0;
    return popIn((local - 6 - i * 7) / 9);
  });

  const cookT = scene.type === 'steps' ? smooth(progress) : progress;
  const cook = shot.cook[0] + (shot.cook[1] - shot.cook[0]) * cookT;
  const flip = foodKind === 'pancake' && scene.type === 'steps' ? smooth((progress - 0.48) / 0.14) : 0;

  return {
    camera: { pos: cam.pos as Vec3, target: cam.target as Vec3, fov: shot.fov },
    emotion: scene.emotion,
    talking: local < timing.speechFrames,
    action: shot.action,
    face: shot.face,
    burnerOn: shot.burnerOn,
    showFoodInVessel: scene.type === 'steps' || scene.visual === 'sizzle' || (scene.type === 'explain' && !scene.visual),
    cook,
    flip: flip >= 1 ? 0 : flip,
    plated: shot.plated,
    propPop,
    chefPop: index === 0 ? popIn(local / 10) : 1,
    mood: shot.mood,
  };
}

/** 3D 좌표 → 화면 픽셀 (재료 이름표를 소품 위에 붙이기 위해) */
export function projectToScreen(point: Vec3, camera: StageState['camera'], width: number, height: number): { x: number; y: number; visible: boolean } {
  const cam = new PerspectiveCamera(camera.fov, width / height, 0.05, 30);
  cam.position.set(...camera.pos);
  cam.lookAt(...camera.target);
  cam.updateMatrixWorld();
  const v = new Vector3(...point).project(cam);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
}
