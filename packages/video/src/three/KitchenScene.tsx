import React, { useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { Object3D, type PerspectiveCamera } from 'three';
import type { Emotion, FoodProfile, IngredientProp } from '@mat-lab/recipe-core';
import { Chef3D } from './Chef3D.tsx';
import { CookingFood, Flame, IngredientModel, PlatedFood, Steam } from './Food3D.tsx';
import { KitchenSet } from './Kitchen.tsx';
import { BURNER, CHEF_POS, PLATE, handPlate, propPositions, type Vec3 } from './layout.ts';
import type { ChefAction, Mood, Shot } from './shots.ts';

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
  gloom: { bg: '#8E8AA0', sky: '#9FB0DA', ground: '#3E3240', hemi: 0.32, key: '#9DB2EA', keyI: 1.0, rim: '#FF3D55', rimI: 4.0, fire: 0 },
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

function faceAngle(from: Vec3, to: Vec3): number {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

export const KitchenScene: React.FC<{
  width: number;
  height: number;
  frame: number;
  state: StageState;
  food: FoodProfile;
  props: IngredientProp[];
}> = ({ width, height, frame, state, food, props }) => {
  const facing = state.face === 'stove' ? faceAngle(CHEF_POS, BURNER) : faceAngle(CHEF_POS, state.camera.pos) * 0.85;
  const positions = propPositions(props.length);
  return (
    <ThreeCanvas width={width} height={height} shadows gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ fov: state.camera.fov, position: state.camera.pos }}>
      <CameraRig {...state.camera} />
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
    </ThreeCanvas>
  );
};
