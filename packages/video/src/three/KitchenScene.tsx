import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { Object3D, PerspectiveCamera, Scene } from 'three';
import { foodProfile, type Emotion, type FoodProfile, type IngredientProp, type RecipeInput } from '@mat-lab/recipe-core';
import { Chef3D } from './Chef3D.tsx';
import { CookingFood, Flame, IngredientModel, PlatedFood, Steam } from './Food3D.tsx';
import { KitchenSet } from './Kitchen.tsx';
import { BURNER, CHEF_POS, PLATE, chefFacing, handPlate, propPositions, type Vec3 } from './layout.ts';
import type { ChefAction, Mood, Shot } from './shots.ts';

/** 3D 장면에 넣을 음식 */
export function foodFor(recipe: RecipeInput, photoColor?: string): FoodProfile {
  const food = foodProfile(recipe);
  // 완성 사진이 있으면 사진의 대표 색을 익은 색으로 쓴다
  return photoColor ? { ...food, cookedColor: photoColor } : food;
}

/** 한 프레임의 3D 장면 상태 */
export interface StageState {
  camera: { pos: Vec3; target: Vec3; fov: number };
  emotion: Emotion;
  talking: boolean;
  action: ChefAction;
  face: Shot['face'];
  burnerOn: boolean;
  showFoodInVessel: boolean;
  cook: number;
  flip: number;
  plated: Shot['plated'];
  /** 재료 소품별 등장 정도 (0~1) */
  propPop: number[];
  chefPop: number;
  mood: Mood;
}

/** 분위기별 조명: 은은한 바탕빛 + 창문 쪽 주광 + 피사체 뒤쪽의 색 테두리 조명 */
export const MOODS: Record<Mood, { bg: string; sky: string; ground: string; hemi: number; key: string; keyI: number; rim: string; rimI: number; fire: number }> = {
  morning: { bg: '#F4E2C6', sky: '#FFF4E4', ground: '#A9703F', hemi: 0.8, key: '#FFF0D6', keyI: 2.3, rim: '#8EC2FF', rimI: 1.6, fire: 0 },
  curious: { bg: '#D9D3C7', sky: '#E6F0F0', ground: '#6E5A48', hemi: 0.5, key: '#FFF2E2', keyI: 1.8, rim: '#2FD8C8', rimI: 3.4, fire: 0 },
  // 실패 장면: 살짝 어둡고 차분하게만 (예전 값은 빨강·파랑이 너무 세서 음식이 회색으로 보이고 렌더 오류처럼 보였다)
  gloom: { bg: '#B4ADA6', sky: '#DCE1EA', ground: '#5A4A40', hemi: 0.62, key: '#E2E6EE', keyI: 1.7, rim: '#A9B4CC', rimI: 1.3, fire: 0 },
  fire: { bg: '#E6D0B2', sky: '#FFF0DC', ground: '#8E5A34', hemi: 0.55, key: '#FFE5C2', keyI: 1.8, rim: '#FF7A2E', rimI: 2.6, fire: 1 },
  fresh: { bg: '#F2E9DB', sky: '#FFFFFF', ground: '#9C7A55', hemi: 0.85, key: '#FFFFFF', keyI: 2.3, rim: '#86E3BC', rimI: 1.7, fire: 0 },
  golden: { bg: '#F0D3A8', sky: '#FFE9C4', ground: '#9A6234', hemi: 0.7, key: '#FFD08A', keyI: 2.5, rim: '#FFA53A', rimI: 2.4, fire: 0 },
};

const MoodLights: React.FC<{ mood: Mood; camera: StageState['camera'] }> = ({ mood, camera }) => {
  const m = MOODS[mood];
  const rimTarget = useMemo(() => new Object3D(), []);
  // 카메라 반대편 위쪽에서 피사체를 비추는 테두리 조명
  const [px, py, pz] = camera.pos;
  const [tx, ty, tz] = camera.target;
  const dx = tx - px;
  const dz = tz - pz;
  const len = Math.hypot(dx, dz) || 1;
  const rimPos: Vec3 = [tx + (dx / len) * 2.2 - (dz / len) * 1.2, ty + 1.8, tz + (dz / len) * 2.2 + (dx / len) * 1.2];
  rimTarget.position.set(tx, ty, tz);
  rimTarget.updateMatrixWorld();
  return (
    <>
      <color attach="background" args={[m.bg]} />
      <hemisphereLight args={[m.sky, m.ground, m.hemi]} />
      <ambientLight intensity={0.15} />
      <directionalLight
        position={[-3.2, 4.2, 2.6]}
        intensity={m.keyI}
        color={m.key}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0008}
      />
      <primitive object={rimTarget} />
      <directionalLight position={rimPos} target={rimTarget} intensity={m.rimI} color={m.rim} />
      {m.fire > 0 && <pointLight position={[BURNER[0], BURNER[1] + 0.35, BURNER[2] + 0.25]} color="#FF8A3D" intensity={1.6 * m.fire} distance={2.2} decay={1.5} />}
    </>
  );
};

const CameraRig: React.FC<{ pos: Vec3; target: Vec3; fov: number }> = ({ pos, target, fov }) => {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.set(...pos);
    camera.fov = fov;
    camera.near = 0.05;
    camera.far = 30;
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, [camera, pos, target, fov]);
  return null;
};

/** 한 상태의 3D 장면 내용 (조명·주방·음식·소품·맛조수) */
const SceneContents: React.FC<{ frame: number; state: StageState; food: FoodProfile; props: IngredientProp[] }> = ({ frame, state, food, props }) => {
  const facing = chefFacing(state);
  const positions = propPositions(props.length);
  return (
    <>
      <MoodLights mood={state.mood} camera={state.camera} />
      <KitchenSet />
      <Flame frame={frame} on={state.burnerOn} />
      <CookingFood food={food} cook={state.cook} frame={frame} stirring={state.action === 'cook'} flip={state.flip} showFood={state.showFoodInVessel} />
      {state.showFoodInVessel && state.burnerOn && <Steam origin={[BURNER[0], BURNER[1] + 0.12, BURNER[2]]} frame={frame} amount={5} />}
      {state.action === 'present' ? (
        <PlatedFood food={state.plated === 'none' ? null : food} failed={state.plated === 'failed'} frame={frame} origin={handPlate(facing)} />
      ) : (
        <PlatedFood food={state.plated === 'none' ? null : food} failed={state.plated === 'failed'} frame={frame} origin={PLATE} />
      )}
      {props.map((p, i) => (
        <IngredientModel key={i} prop={p} position={positions[i]!} pop={state.propPop[i] ?? 0} />
      ))}
      <Chef3D emotion={state.emotion} frame={frame} talking={state.talking} action={state.action} facing={facing} position={CHEF_POS} pop={state.chefPop} />
    </>
  );
};

/**
 * 비교 장면: 같은 캔버스의 위쪽 절반에 다른 상태(건너뛴 쪽)를, 아래쪽 절반에 기본 장면을 그린다.
 * 캔버스(WebGL)를 하나 더 만들지 않는다 — 휴대폰 사파리는 캔버스가 여럿이거나 자주 새로 만들어지면 멈춘다.
 */
const SplitTop: React.FC<{ frame: number; state: StageState; food: FoodProfile }> = ({ frame, state, food }) => {
  const scene = useMemo(() => new Scene(), []);
  const cam = useMemo(() => new PerspectiveCamera(), []);
  const main = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const { pos, target, fov } = state.camera;
  useLayoutEffect(() => {
    cam.position.set(...pos);
    cam.fov = fov;
    cam.near = 0.05;
    cam.far = 30;
    cam.lookAt(...target);
  }, [cam, pos, target, fov]);
  // 비교 장면이 끝나면 기본 카메라 화면비를 캔버스 전체로 되돌린다
  useEffect(
    () => () => {
      main.aspect = size.width / size.height;
      main.updateProjectionMatrix();
    },
    [main, size],
  );
  // 우선순위 1: R3F 기본 그리기 대신 위·아래를 나눠 그린다
  useFrame(({ gl, scene: mainScene, camera, size }) => {
    const top = Math.round(size.height / 2);
    const draw = (s: Scene, c: PerspectiveCamera, y: number, h: number) => {
      gl.setViewport(0, y, size.width, h);
      gl.setScissor(0, y, size.width, h);
      c.aspect = size.width / h;
      c.updateProjectionMatrix();
      gl.render(s, c);
    };
    gl.setScissorTest(true);
    draw(scene, cam, size.height - top, top);
    draw(mainScene, camera as PerspectiveCamera, 0, size.height - top);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
  }, 1);
  return createPortal(<SceneContents frame={frame} state={state} food={food} props={[]} />, scene);
};

export const KitchenScene: React.FC<{
  width: number;
  height: number;
  frame: number;
  state: StageState;
  food: FoodProfile;
  props: IngredientProp[];
  /** 비교 장면: 위쪽 절반에 그릴 상태 (같은 캔버스 안에 그린다) */
  split?: StageState | null;
}> = ({ width, height, frame, state, food, props, split }) => (
  // dpr 1: 영상은 1080×1920 그대로 그린다. 휴대폰(화면 배율 3)에서 3배 크기로 그리면 메모리가 넘쳐 브라우저가 멈춘다
  <ThreeCanvas width={width} height={height} dpr={1} shadows gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ fov: state.camera.fov, position: state.camera.pos }}>
    <CameraRig {...state.camera} />
    <SceneContents frame={frame} state={state} food={food} props={props} />
    {split && <SplitTop frame={frame} state={split} food={food} />}
  </ThreeCanvas>
);
