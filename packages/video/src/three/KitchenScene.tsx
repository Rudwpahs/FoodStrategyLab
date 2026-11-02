import React, { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import type { PerspectiveCamera } from 'three';
import type { Emotion, FoodProfile, IngredientProp } from '@mat-lab/recipe-core';
import { Chef3D } from './Chef3D.tsx';
import { CookingFood, Flame, IngredientModel, PlatedFood, Steam } from './Food3D.tsx';
import { KitchenSet } from './Kitchen.tsx';
import { BURNER, CHEF_POS, PLATE, handPlate, propPositions, type Vec3 } from './layout.ts';
import type { ChefAction, Shot } from './shots.ts';

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
}

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
