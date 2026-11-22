import React from 'react';
import { SphereGeometry, type BufferGeometry } from 'three';
import type { Emotion } from '@mat-lab/recipe-core';
import { ARM_POSES, mouthOpen } from '../characterMotion.ts';
import type { GogglePose } from '../hostCues.ts';
import { COLORS } from '../theme.ts';
import { deform } from './foodShapes.ts';
import type { ChefAction } from './shots.ts';

/**
 * 3D 맛조수: 2D 캐릭터와 같은 디자인(찐빵 몸통·조리모·고글·토마토색 앞치마).
 * 귀엽게 보이도록: 말랑한 찐빵 몸통(아래가 살짝 퍼짐), 큰 눈과 반짝임, 작은 입,
 * 볼터치, 고글은 모자 위로 올려 쓴다(눈처럼 보이지 않게). 원점 = 발바닥.
 * 고정 동작(영상마다 한 번, 첫 노트 카드 장면): 고글을 눈앞으로 내려 들여다본 뒤 모자 위로 올린다 (goggles, hostCues.ts).
 */
const BODY = { rx: 0.3, ry: 0.31, rz: 0.285, cy: 0.33 };
/** 눈 높이(발바닥 기준). 자막이 피할 얼굴 범위(captionPlacement.ts FACE_SPAN)의 기준 */
export const EYE_Y = 0.41;
const EYE_X = 0.09;
/** 몸통 아래쪽을 눌러 퍼지게 (찐빵이 앉은 모양) */
const SQUAT = 0.82;
const SPREAD = 0.07;
const INK = '#2A1D19';
const CREAM = '#FFF4E3';
const MOUTH = '#8A2B25';
const TONGUE = '#FF8A7A';

/** 찐빵 모양 표면 일부 (같은 변형을 몸통·앞치마에 함께 써서 딱 맞게 겹친다) */
const bodyCache = new Map<string, BufferGeometry>();
function bodyGeometry(thetaStart = 0, thetaLength = Math.PI, phiStart = 0, phiLength = Math.PI * 2): BufferGeometry {
  const key = [thetaStart, thetaLength, phiStart, phiLength].join(':');
  let g = bodyCache.get(key);
  if (!g) {
    g = deform(new SphereGeometry(1, 56, 40, phiStart, phiLength, thetaStart, thetaLength), (v) => {
      if (v.y < 0) {
        const k = 1 + -v.y * SPREAD * 1.6;
        v.set(v.x * k, v.y * SQUAT, v.z * k);
      }
    });
    bodyCache.set(key, g);
  }
  return g;
}

/** 몸통 앞면 위의 점과, 그 자리에서 표면을 바라보는 회전 (얼굴 부품 배치용) */
function onFace(x: number, y: number, lift = 0.004): { p: [number, number, number]; r: [number, number, number] } {
  let ly = (y - BODY.cy) / BODY.ry;
  let k = 1;
  if (ly < 0) {
    ly /= SQUAT;
    k = 1 + -ly * SPREAD * 1.6;
  }
  const lx = x / (BODY.rx * k);
  const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
  const z = BODY.rz * k * lz;
  // 타원면 법선 → 부품이 표면에 붙어 보이게 돌린다
  const nx = lx / (BODY.rx * k);
  const ny = ly / BODY.ry;
  const nz = lz / (BODY.rz * k);
  const len = Math.hypot(nx, ny, nz) || 1;
  const rotY = Math.atan2(nx, nz);
  const rotX = -Math.asin(Math.max(-1, Math.min(1, ny / len)));
  return { p: [x + (nx / len) * lift, y + (ny / len) * lift, z + (nz / len) * lift], r: [rotX, rotY, 0] };
}

const Mat: React.FC<{ color: string; rough?: number; emissive?: string }> = ({ color, rough = 0.7, emissive }) => (
  <meshStandardMaterial color={color} roughness={rough} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 0.5 : 0} />
);

/** 말랑한 피부: 부드러운 광택(sheen) + 그늘이 회색으로 죽지 않게 아주 약한 자체 빛 */
const Skin: React.FC = () => (
  <meshPhysicalMaterial color={CREAM} roughness={0.55} sheen={0.6} sheenColor="#FFD3BC" sheenRoughness={0.5} emissive="#FFE2C8" emissiveIntensity={0.07} />
);

/** 반짝이는 부분 (눈·렌즈·입속) */
const Gloss: React.FC<{ color: string; rough?: number; opacity?: number }> = ({ color, rough = 0.25, opacity }) => (
  <meshPhysicalMaterial color={color} roughness={rough} clearcoat={1} clearcoatRoughness={0.08} transparent={opacity !== undefined} opacity={opacity ?? 1} />
);

interface Props {
  emotion: Emotion;
  frame: number;
  talking: boolean;
  /** 입 벌림 (0~1, 실제 목소리 크기). 없으면 talking일 때 일정한 파형으로 */
  mouth?: number;
  action: ChefAction;
  /** y축 회전 (0 = 카메라 쪽 +z) */
  facing: number;
  position: [number, number, number];
  /** 등장 애니메이션 (0~1) */
  pop?: number;
  /** 고글 동작 자세 (없으면 평소 모습) */
  goggles?: GogglePose;
}

/** 고정 난수 (프레임마다 같은 값) */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 눈 깜빡임: 2.5~4초에 한 번, 가끔 두 번 연속. 1 = 뜬 눈, 0 = 감은 눈.
 * (매번 같은 간격이면 기계처럼 보인다)
 */
export function eyeOpenness(frame: number): number {
  const PERIOD = 100;
  const k = Math.floor(frame / PERIOD);
  const start = k * PERIOD + Math.floor(hash(k) * 30);
  const close = (t: number) => (t >= 0 && t < 7 ? Math.abs(t - 3) / 3 : 1);
  const twice = hash(k + 99) > 0.7 ? close(frame - start - 9) : 1;
  return Math.max(0.06, Math.min(close(frame - start), twice));
}

export const Chef3D: React.FC<Props> = ({ emotion, frame, talking, mouth, action, facing, position, pop = 1, goggles: g }) => {
  const open = mouth ?? (talking ? mouthOpen(frame) : 0);
  // 고글 너머로 들여다볼 때는 눈을 깜빡이지 않는다
  const lids = emotion === 'joy' || emotion === 'embarrassed' ? 1 : Math.max(eyeOpenness(frame), g?.peer ?? 0);
  const rad = (d: number) => (d * Math.PI) / 180;
  /** 고글이 내려온 정도 (0~1). 내려와 있는 동안은 모자 흔들림을 줄여 고글이 얼굴에 붙어 있게 */
  const goggleDown = Math.max(0, Math.min(1, g?.down ?? 0));

  // 숨쉬기(늘었다 줄었다) + 말할 때 입 모양 따라 살짝 늘어남 + 몸 흔들림
  const breath = Math.sin(frame / 16);
  const found = g?.pop ?? 0;
  const stretch = 1 + breath * 0.012 + open * 0.018 - (emotion === 'disappointed' ? 0.04 : 0) + found * 0.03;
  const widen = 1 - breath * 0.008 - open * 0.009 + (emotion === 'disappointed' ? 0.02 : 0) - found * 0.012;
  const hop = emotion === 'joy' && action === 'idle' ? Math.max(0, Math.sin(frame / 5)) * 0.025 : 0;
  const bob = Math.sin(frame / 7) * (talking ? 0.008 : 0.004) + hop + found * 0.022;
  const sway = Math.sin(frame / 29) * 0.025 + (emotion === 'curious' ? 0.12 : 0) + (emotion === 'embarrassed' ? -0.06 : 0);
  const look = Math.sin(frame / 37) * 0.05;
  // 모자는 몸보다 조금 늦게 따라 흔들린다
  const hatLag = (Math.sin(frame / 7 - 1.1) * (talking ? 0.045 : 0.02) - sway * 0.3) * (1 - goggleDown);

  let [leftDeg, rightDeg] = ARM_POSES[emotion];
  let rightForward = 0;
  let leftForward = 0;
  // 팔은 쉬고 있을 때도 아주 조금 움직인다
  leftDeg += Math.sin(frame / 11) * 4;
  rightDeg += Math.sin(frame / 13 + 1) * 4;
  if (emotion === 'joy' && action === 'idle') rightDeg += Math.sin(frame / 3.5) * 14;
  if (action === 'cook') {
    // 오른손 뒤집개로 팬을 젓는다
    rightDeg = -40 + Math.sin(frame / 4) * 10;
    rightForward = -1.25 + Math.sin(frame / 4) * 0.18;
    leftDeg = 25;
  }
  if (action === 'present') {
    // 접시를 몸 앞 낮게 받쳐 든다 (얼굴을 가리지 않게)
    rightDeg = -38;
    leftDeg = 38;
    rightForward = -1.05;
    leftForward = -1.05;
  }
  if (action === 'point') {
    rightDeg = -120 + Math.sin(frame / 6) * 6;
  }
  // 고글 동작: 오른손을 관자놀이 앞 고글 끈에 댔다가(1), 고글을 위로 밀어 올리며 더 높이(1.3) 든 뒤 내린다.
  // 팔이 짧은 장난감 몸이라 손은 머리 옆(눈높이)까지만 닿는다. 접시를 든 장면은 손을 쓰지 않고 고글만 움직인다
  const hand = g && action !== 'present' ? g.hand : 0;
  if (hand > 0) {
    const w = Math.min(1, hand);
    const push = Math.max(0, hand - 1) / 0.3;
    rightDeg += (-169 - 9 * push - rightDeg) * w;
    rightForward += (0.82 - 0.27 * push - rightForward) * w;
  }

  return (
    <group position={position} rotation={[0, facing, 0]} scale={[pop, pop, pop]}>
      {/* 고글로 들여다볼 때 몸을 살짝 앞으로 (발바닥 기준으로 기울인다) */}
      <group position={[0, bob, 0]} rotation={[(g?.lean ?? 0) * 0.08, look, sway * 0.35]} scale={[widen, stretch, widen]}>
        {/* 신발 */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.11, 0.032, 0.06]} rotation={[0, s * 0.25, 0]} scale={[0.085, 0.048, 0.115]} castShadow>
            <sphereGeometry args={[1, 32, 20]} />
            <meshPhysicalMaterial color={COLORS.navy} roughness={0.45} clearcoat={0.4} />
          </mesh>
        ))}
        {/* 몸통 */}
        <mesh geometry={bodyGeometry()} position={[0, BODY.cy, 0]} scale={[BODY.rx, BODY.ry, BODY.rz]} castShadow receiveShadow>
          <Skin />
        </mesh>
        {/* 앞치마: 몸 앞쪽 아래 (턱받이 모양) */}
        <mesh geometry={bodyGeometry(Math.PI * 0.6, Math.PI * 0.33, Math.PI / 2 - 0.95, 1.9)} position={[0, BODY.cy, 0]} scale={[BODY.rx * 1.015, BODY.ry * 1.015, BODY.rz * 1.015]} castShadow>
          <meshPhysicalMaterial color={COLORS.red} roughness={0.65} sheen={0.4} sheenColor="#FFB0A0" side={2} />
        </mesh>
        {/* 앞치마 끈 */}
        <mesh position={[0, BODY.cy + BODY.ry * Math.cos(Math.PI * 0.6) * SQUAT, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1.02, 1]}>
          <torusGeometry args={[BODY.rx * Math.sin(Math.PI * 0.6) * (1 + Math.cos(Math.PI * 0.4) * SPREAD * 1.6) * 1.01, 0.007, 10, 64]} />
          <Mat color={COLORS.redDark} rough={0.6} />
        </mesh>
        {/* 주머니 + 플라스크 무늬 */}
        <Pocket />

        {/* 볼터치: 크고 부드럽게 */}
        {[-1, 1].map((s) => {
          const f = onFace(s * 0.165, EYE_Y - 0.06, 0.003);
          return (
            <mesh key={s} position={f.p} rotation={f.r} scale={[0.052, 0.032, 0.008]}>
              <sphereGeometry args={[1, 32, 16]} />
              <meshStandardMaterial color={COLORS.blush} transparent opacity={emotion === 'embarrassed' ? 0.9 : 0.55} roughness={0.8} depthWrite={false} />
            </mesh>
          );
        })}

        {/* 렌즈 너머로 들여다볼 때 눈이 커 보인다 (돋보기처럼) */}
        <Eyes emotion={emotion} lids={lids} zoom={1 + (g?.peer ?? 0) * 0.12} />
        <Brows emotion={emotion} />
        <Mouth emotion={emotion} open={open} />

        {/* 조리모 (몸보다 조금 늦게 흔들림) + 이마 위로 올려 쓴 연구용 고글 */}
        <group position={[0, HAT_Y, 0]} rotation={[0.04 * (1 - goggleDown), 0, hatLag]}>
          <Hat />
          <Goggles down={g?.down ?? 0} glint={g?.glint ?? 0} />
        </group>

        {/* 팔 */}
        <Arm side={-1} raise={-rad(leftDeg)} forward={leftForward} />
        <Arm side={1} raise={-rad(rightDeg)} forward={rightForward} spatula={action === 'cook'} thumb={emotion === 'confident' && action === 'idle' && hand === 0} />

        <Effects emotion={emotion} frame={frame} />
      </group>
    </group>
  );
};

const Pocket: React.FC = () => {
  const f = onFace(0, 0.16, 0.012);
  return (
    <group position={f.p} rotation={f.r}>
      <mesh>
        <boxGeometry args={[0.1, 0.07, 0.012]} />
        <Mat color={COLORS.redDark} rough={0.7} />
      </mesh>
      {/* 플라스크: 둥근 몸 + 목 */}
      <mesh position={[0, -0.006, 0.01]} scale={[1, 1, 0.4]}>
        <sphereGeometry args={[0.018, 20, 14]} />
        <Gloss color={COLORS.mint} />
      </mesh>
      <mesh position={[0, 0.018, 0.01]}>
        <cylinderGeometry args={[0.006, 0.007, 0.018, 12]} />
        <Gloss color={COLORS.mint} />
      </mesh>
    </group>
  );
};

const Hat: React.FC = () => (
  <group>
    {/* 모자 띠 */}
    <mesh position={[0, 0.04, 0]} castShadow>
      <cylinderGeometry args={[0.165, 0.158, 0.09, 56]} />
      <meshPhysicalMaterial color="#FFFFFF" roughness={0.75} sheen={0.5} sheenColor="#E8EEF5" />
    </mesh>
    <mesh position={[0, 0.006, 0]}>
      <cylinderGeometry args={[0.167, 0.164, 0.022, 56]} />
      <Mat color={COLORS.red} rough={0.6} />
    </mesh>
    {/* 폭신한 윗부분: 겹친 구름 */}
    {(
      [
        [-0.1, 0.14, 0.02, 0.105],
        [0.1, 0.14, 0.02, 0.105],
        [0, 0.15, -0.07, 0.11],
        [0, 0.15, 0.06, 0.09],
        [-0.055, 0.2, -0.01, 0.11],
        [0.055, 0.2, -0.01, 0.11],
      ] as const
    ).map(([x, y, z, r], i) => (
      <mesh key={i} position={[x, y, z]} scale={[1, 0.9, 1]} castShadow>
        <sphereGeometry args={[r, 32, 24]} />
        <meshPhysicalMaterial color="#FFFFFF" roughness={0.8} sheen={0.6} sheenColor="#E3ECF7" />
      </mesh>
    ))}
  </group>
);

/** 모자(띠 아래 끝) 높이: 모자·고글 묶음의 원점 */
const HAT_Y = BODY.cy + BODY.ry - 0.04;
/** 몸통 가운데 (모자 묶음 기준). 고글은 이 점을 중심으로 이마를 따라 돌아 내려온다 */
const GOGGLE_CENTER_Y = BODY.cy - HAT_Y;
/** 고글 렌즈 묶음 자리 (모자 묶음 기준): 평소 = 모자 띠 앞에 젖혀 걸침, 내림 = 눈앞 (얼굴 앞면에서 2.4cm 띄움) */
const GOGGLE_REST = { y: 0.072, z: 0.178, tilt: -0.22, strapY: 0.07, strapR: 0.166 };
const GOGGLE_DOWN = {
  y: EYE_Y - HAT_Y + 0.004,
  z: BODY.rz * Math.sqrt(1 - ((EYE_Y - BODY.cy) / BODY.ry) ** 2) + 0.024,
  tilt: -0.24,
  strapY: EYE_Y + 0.01 - HAT_Y,
};
const polar = (y: number, z: number) => ({ r: Math.hypot(y - GOGGLE_CENTER_Y, z), phi: Math.atan2(y - GOGGLE_CENTER_Y, z) });
const GOGGLE_PATH = { rest: polar(GOGGLE_REST.y, GOGGLE_REST.z), down: polar(GOGGLE_DOWN.y, GOGGLE_DOWN.z) };
/** 몸통 단면 반지름 (몸통 가운데보다 위, 모자 묶음 기준 높이 y) */
const bodyRadiusAt = (y: number) => BODY.rx * Math.sqrt(Math.max(0, 1 - ((y + HAT_Y - BODY.cy) / BODY.ry) ** 2));

/**
 * 연구용 고글 (끈 + 두 렌즈). down 0 = 모자 앞에 걸쳐 위로 젖혀 쓴 평소 모양 (예전과 같은 모양·자리),
 * 1 = 눈앞으로 내려 쓴 모양: 렌즈가 눈을 감싸도록 벌어지고 커지며(장난감처럼 늘어남), 반투명해져 눈이 비친다.
 * 끈은 머리둘레를 따라 눈높이로 내려오고, 얼굴 앞을 가로지르지 않게 앞쪽이 열린다. 음수 = 올린 뒤 모자 위에서 한 번 더 젖혀지는 튕김.
 */
const Goggles: React.FC<{ down: number; glint: number }> = ({ down, glint }) => {
  const d = Math.max(0, Math.min(1, down));
  const bounce = Math.min(0, down);
  // 렌즈 묶음: 몸 가운데를 중심으로 이마를 따라 돈다. 가운데쯤에서 이마 위로 3.5cm 떠서 지나가고, 이마 곡면을 따라 젖혀진다
  const phi = GOGGLE_PATH.rest.phi + (GOGGLE_PATH.down.phi - GOGGLE_PATH.rest.phi) * d;
  const r = GOGGLE_PATH.rest.r + (GOGGLE_PATH.down.r - GOGGLE_PATH.rest.r) * d + 0.035 * Math.sin(Math.PI * d);
  const lensY = GOGGLE_CENTER_Y + r * Math.sin(phi) - bounce * 0.02;
  const lensZ = r * Math.cos(phi);
  const tilt = GOGGLE_REST.tilt + (GOGGLE_DOWN.tilt - GOGGLE_REST.tilt) * d - 0.5 * Math.sin(Math.PI * d) + bounce * 1.5;
  const spread = 0.045 + 0.043 * d;
  const grow = 1 + 0.7 * d;
  // 끈: 눈높이로 내려오며 몸통 둘레보다 조금 크게, 앞쪽(렌즈 사이)은 열어 둔다
  const strapY = GOGGLE_REST.strapY + (GOGGLE_DOWN.strapY - GOGGLE_REST.strapY) * d;
  const strapR = Math.max(GOGGLE_REST.strapR + (bodyRadiusAt(GOGGLE_DOWN.strapY) + 0.012 - GOGGLE_REST.strapR) * d, d > 0 ? bodyRadiusAt(strapY) + 0.012 : 0);
  const gap = 1.0 * Math.min(1, d * 1.4);
  // 렌즈 반짝임: 들여다보는 동안 렌즈를 가로질러 지나간다
  const sweep = glint > 0 && glint < 1;
  return (
    <group>
      <mesh position={[0, strapY, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2 + gap / 2]} scale={[strapR / GOGGLE_REST.strapR, (strapR / GOGGLE_REST.strapR) * (1 - 0.05 * d), 1]}>
        <torusGeometry args={[GOGGLE_REST.strapR, 0.008, 10, 64, Math.PI * 2 - gap]} />
        <Mat color="#3A4150" rough={0.5} />
      </mesh>
      <group position={[0, lensY, lensZ]} rotation={[tilt, 0, 0]}>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * spread, 0, 0]} rotation={[0, s * 0.3 * d, 0]} scale={grow}>
            <mesh>
              <torusGeometry args={[0.034, 0.01, 14, 40]} />
              <meshPhysicalMaterial color="#4A5262" roughness={0.3} metalness={0.5} clearcoat={0.6} />
            </mesh>
            <mesh position={[0, 0, 0.002]}>
              <circleGeometry args={[0.032, 32]} />
              <meshPhysicalMaterial color="#7FD6B6" roughness={0.1} clearcoat={1} clearcoatRoughness={0.08} transparent opacity={1 - 0.62 * d} />
            </mesh>
            {/* 렌즈 반짝임 */}
            <mesh position={[sweep ? -0.022 + 0.044 * glint : 0.011, 0.011, 0.004]} rotation={[0, 0, -0.6]} scale={[0.013, 0.005, 1]}>
              <circleGeometry args={[1, 16]} />
              <meshBasicMaterial color="#FFFFFF" transparent opacity={sweep ? 0.95 : 0.8} />
            </mesh>
          </group>
        ))}
        <mesh scale={[1 + 1.6 * d, 1 + 0.3 * d, 1 + 0.3 * d]}>
          <boxGeometry args={[0.024, 0.01, 0.01]} />
          <Mat color="#4A5262" rough={0.4} />
        </mesh>
      </group>
    </group>
  );
};

const Arm: React.FC<{ side: -1 | 1; raise: number; forward: number; spatula?: boolean; thumb?: boolean }> = ({ side, raise, forward, spatula, thumb }) => (
  <group position={[side * 0.265, BODY.cy - 0.02, 0.02]} rotation={[forward, 0, raise]}>
    <mesh position={[0, -0.07, 0]} castShadow>
      <capsuleGeometry args={[0.048, 0.08, 12, 24]} />
      <Skin />
    </mesh>
    {/* 동그란 손 */}
    <mesh position={[0, -0.15, 0]} scale={[1, 0.92, 0.9]} castShadow>
      <sphereGeometry args={[0.056, 32, 24]} />
      <Skin />
    </mesh>
    {thumb && (
      <mesh position={[0, -0.215, 0]}>
        <capsuleGeometry args={[0.018, 0.035, 8, 16]} />
        <Skin />
      </mesh>
    )}
    {spatula && (
      <group position={[0, -0.17, 0]} rotation={[-0.3, 0, 0]}>
        <mesh position={[0, -0.13, 0]} castShadow>
          <boxGeometry args={[0.022, 0.26, 0.018]} />
          <Mat color="#9C6640" />
        </mesh>
        <mesh position={[0, -0.29, 0.02]} rotation={[0.5, 0, 0]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.008]} />
          <meshPhysicalMaterial color="#C3C8CE" roughness={0.3} metalness={0.6} />
        </mesh>
      </group>
    )}
  </group>
);

/** 반짝이는 큰 눈 (검은 눈동자 + 아래쪽 갈색 + 큰·작은 반짝임) */
const GlossyEye: React.FC<{ r: number; open: number; squint?: number }> = ({ r, open, squint = 1 }) => {
  const sy = 1.22 * open * squint;
  return (
    <group scale={[1, Math.max(0.06, sy), 1]}>
      <mesh scale={[r, r, r * 0.38]}>
        <sphereGeometry args={[1, 32, 24]} />
        <Gloss color={INK} rough={0.2} />
      </mesh>
      <mesh position={[0, -r * 0.38, r * 0.3]} scale={[r * 0.62, r * 0.42, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#6B4532" transparent opacity={0.75} />
      </mesh>
      {open > 0.4 && (
        <>
          <mesh position={[r * 0.32, r * 0.38, r * 0.36]} scale={[r * 0.3, (r * 0.3) / Math.max(0.3, sy), 1]}>
            <circleGeometry args={[1, 24]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
          <mesh position={[-r * 0.3, -r * 0.3, r * 0.36]} scale={[r * 0.13, (r * 0.13) / Math.max(0.3, sy), 1]}>
            <circleGeometry args={[1, 16]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
        </>
      )}
    </group>
  );
};

/** 눈 한 쌍. zoom: 고글 렌즈 너머로 들여다볼 때 눈이 커 보이는 정도 (1 = 평소) */
const Eyes: React.FC<{ emotion: Emotion; lids: number; zoom?: number }> = ({ emotion, lids, zoom = 1 }) => (
  <group>
    {[-1, 1].map((s) => {
      const y = emotion === 'disappointed' ? EYE_Y - 0.012 : EYE_Y;
      const f = onFace(s * EYE_X, y, 0.006);
      return (
        <group key={s} position={f.p} rotation={f.r} scale={zoom}>
          <EyeShape emotion={emotion} side={s} lids={lids} />
        </group>
      );
    })}
  </group>
);

/** 감정별 눈 모양 (눈 자리 기준) */
const EyeShape: React.FC<{ emotion: Emotion; side: number; lids: number }> = ({ emotion, side: s, lids }) => {
  switch (emotion) {
    case 'joy':
      // 웃는 눈 ^ ^
      return (
        <mesh>
          <torusGeometry args={[0.03, 0.009, 14, 32, Math.PI]} />
          <Gloss color={INK} />
        </mesh>
      );
    case 'embarrassed':
      // > <
      return (
        <>
          {[1, -1].map((k) => (
            <mesh key={k} position={[-s * 0.006, k * 0.011, 0]} rotation={[0, 0, k * s * 0.55]}>
              <capsuleGeometry args={[0.0065, 0.036, 6, 12]} />
              <Gloss color={INK} />
            </mesh>
          ))}
        </>
      );
    case 'surprised':
      return <GlossyEye r={0.046} open={lids} />;
    case 'curious':
      return <GlossyEye r={s === 1 ? 0.044 : 0.037} open={lids} />;
    case 'confident':
      return (
        <>
          <GlossyEye r={0.04} open={lids} squint={0.62} />
          {/* 윗눈꺼풀 */}
          <mesh position={[0, 0.026, 0.012]} rotation={[0, 0, -s * 0.12]}>
            <capsuleGeometry args={[0.006, 0.07, 6, 12]} />
            <Gloss color={INK} />
          </mesh>
        </>
      );
    case 'disappointed':
      return <GlossyEye r={0.034} open={lids} squint={0.85} />;
    default:
      return <GlossyEye r={0.04} open={lids} />;
  }
};

const BROWS: Partial<Record<Emotion, [number, number]>> = {
  curious: [0.05, -0.25],
  confident: [-0.2, 0.2],
  surprised: [0.15, -0.15],
  disappointed: [0.32, -0.32],
  embarrassed: [-0.25, 0.25],
};
const BROW_LIFT: Partial<Record<Emotion, [number, number]>> = { curious: [0, 0.02], surprised: [0.02, 0.02] };

/** 눈썹: 짧고 둥근 막대 (감정이 있을 때만) */
const Brows: React.FC<{ emotion: Emotion }> = ({ emotion }) => {
  const rot = BROWS[emotion];
  if (!rot) return null;
  const lift = BROW_LIFT[emotion] ?? [0, 0];
  return (
    <group>
      {[-1, 1].map((s, i) => {
        const f = onFace(s * EYE_X, EYE_Y + 0.075 + lift[i]!, 0.004);
        return (
          <mesh key={s} position={f.p} rotation={[f.r[0], f.r[1], Math.PI / 2 + rot[i]!]}>
            <capsuleGeometry args={[0.0065, 0.03, 6, 12]} />
            <Gloss color={INK} />
          </mesh>
        );
      })}
    </group>
  );
};

/** 입 높이(발바닥 기준) */
export const MOUTH_Y = 0.335;

const Mouth: React.FC<{ emotion: Emotion; open: number }> = ({ emotion, open }) => {
  const f = onFace(0, MOUTH_Y, 0.008);
  // 말하거나 크게 웃을 때: 둥근 입 + 혀
  if (open > 0.12 || emotion === 'joy' || emotion === 'surprised') {
    const h = open > 0.12 ? 0.3 + open * 0.7 : emotion === 'surprised' ? 0.9 : 0.75;
    const w = emotion === 'surprised' && open <= 0.12 ? 0.02 : 0.03;
    // 웃는 입은 아래가 둥근 반달
    const smile = emotion === 'joy' && open <= 0.12;
    return (
      <group position={f.p} rotation={f.r}>
        <mesh scale={[w, w * h * 1.25, 0.01]} position={[0, smile ? -0.004 : 0, 0]}>
          <sphereGeometry args={smile ? [1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2] : [1, 32, 24]} />
          <Gloss color={MOUTH} rough={0.4} />
        </mesh>
        <mesh position={[0, -w * h * 0.6, 0.006]} scale={[w * 0.6, w * h * 0.42, 1]}>
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial color={TONGUE} />
        </mesh>
      </group>
    );
  }
  switch (emotion) {
    case 'curious':
      return (
        <mesh position={onFace(0.018, MOUTH_Y - 0.004, 0.009).p} rotation={f.r}>
          <torusGeometry args={[0.011, 0.005, 12, 28]} />
          <Gloss color={MOUTH} />
        </mesh>
      );
    case 'confident':
      return (
        <mesh position={onFace(0.006, MOUTH_Y + 0.004, 0.009).p} rotation={[f.r[0], f.r[1], Math.PI + 0.3]}>
          <torusGeometry args={[0.024, 0.0055, 12, 32, Math.PI * 0.8]} />
          <Gloss color={INK} />
        </mesh>
      );
    case 'disappointed':
      return (
        <mesh position={onFace(0, MOUTH_Y - 0.016, 0.009).p} rotation={f.r}>
          <torusGeometry args={[0.02, 0.0055, 12, 32, Math.PI]} />
          <Gloss color={INK} />
        </mesh>
      );
    case 'embarrassed':
      // 물결 입
      return (
        <group position={f.p} rotation={f.r}>
          {[-1, 0, 1].map((k) => (
            <mesh key={k} position={[k * 0.015, 0, 0]} rotation={[0, 0, k % 2 ? 0 : Math.PI]}>
              <torusGeometry args={[0.0075, 0.0045, 10, 20, Math.PI]} />
              <Gloss color={INK} />
            </mesh>
          ))}
        </group>
      );
    default:
      // 고양이 입 ω (기본 표정)
      return (
        <group position={f.p} rotation={f.r}>
          {[-1, 1].map((k) => (
            <mesh key={k} position={[k * 0.0095, 0.002, 0]} rotation={[0, 0, Math.PI]}>
              <torusGeometry args={[0.0095, 0.0045, 10, 20, Math.PI]} />
              <Gloss color={INK} />
            </mesh>
          ))}
        </group>
      );
  }
};

/** 감정 효과: 땀방울·물음표·느낌표·반짝이 */
const Effects: React.FC<{ emotion: Emotion; frame: number }> = ({ emotion, frame }) => {
  const top = BODY.cy + BODY.ry + 0.2;
  switch (emotion) {
    case 'embarrassed':
      return (
        <mesh position={[0.25, top - 0.15 - ((frame % 40) / 40) * 0.08, 0.1]} scale={[0.03, 0.045, 0.03]}>
          <sphereGeometry args={[1, 24, 20]} />
          <Gloss color="#8FD3F4" rough={0.1} opacity={0.9} />
        </mesh>
      );
    case 'surprised':
      return (
        <group position={[0.3, top + Math.sin(frame / 3) * 0.01, 0.05]} rotation={[0, 0, Math.sin(frame / 2) * 0.1]}>
          <mesh position={[0, 0.06, 0]}>
            <capsuleGeometry args={[0.017, 0.07, 8, 16]} />
            <Mat color={COLORS.yellow} emissive={COLORS.yellow} />
          </mesh>
          <mesh position={[0, -0.03, 0]}>
            <sphereGeometry args={[0.02, 24, 16]} />
            <Mat color={COLORS.yellow} emissive={COLORS.yellow} />
          </mesh>
        </group>
      );
    case 'curious':
      return (
        <group position={[0.3, top + Math.sin(frame / 6) * 0.015, 0.05]}>
          <mesh position={[0, 0.06, 0]} rotation={[0, 0, -0.6]}>
            <torusGeometry args={[0.035, 0.012, 16, 32, Math.PI * 1.4]} />
            <Mat color={COLORS.red} emissive={COLORS.red} />
          </mesh>
          <mesh position={[0, -0.015, 0]}>
            <capsuleGeometry args={[0.011, 0.02, 6, 12]} />
            <Mat color={COLORS.red} emissive={COLORS.red} />
          </mesh>
          <mesh position={[0, -0.06, 0]}>
            <sphereGeometry args={[0.015, 24, 16]} />
            <Mat color={COLORS.red} emissive={COLORS.red} />
          </mesh>
        </group>
      );
    case 'joy':
    case 'confident':
      return (
        <group>
          {[
            [0.33, top - 0.05, 0.05],
            [-0.32, top - 0.15, 0.05],
          ].map(([x, y, z], i) => (
            <mesh key={i} position={[x!, y!, z!]} rotation={[0, frame / 10, frame / 14]} scale={0.03 * (1 + Math.sin(frame / 5 + i) * 0.25)}>
              <octahedronGeometry args={[1, 0]} />
              <Mat color={COLORS.yellow} emissive={COLORS.yellow} />
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
};
