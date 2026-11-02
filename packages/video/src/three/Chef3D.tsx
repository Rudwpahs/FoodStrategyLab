import React from 'react';
import type { Emotion } from '@mat-lab/recipe-core';
import { COLORS } from '../theme.ts';
import type { ChefAction } from './shots.ts';

/**
 * 3D 맛조수: 2D 캐릭터와 같은 디자인(찐빵 몸통·조리모·고글·토마토색 앞치마)을
 * 기본 도형으로 옮겼다. 원점 = 발바닥.
 */
const BODY = { rx: 0.3, ry: 0.33, rz: 0.28, cy: 0.35 };
const INK = COLORS.ink;
const CREAM = '#FFF7EC';
const MOUTH = '#7A2A22';

/** 몸통 앞면 위의 점 (얼굴 부품 배치용) */
function onFace(x: number, y: number, lift = 0.004): [number, number, number] {
  const dy = (y - BODY.cy) / BODY.ry;
  const dx = x / BODY.rx;
  const z = BODY.rz * Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
  return [x, y, z + lift];
}

const Mat: React.FC<{ color: string; rough?: number; emissive?: string }> = ({ color, rough = 0.7, emissive }) => (
  <meshStandardMaterial color={color} roughness={rough} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 0.5 : 0} flatShading />
);

interface Props {
  emotion: Emotion;
  frame: number;
  talking: boolean;
  action: ChefAction;
  /** y축 회전 (0 = 카메라 쪽 +z) */
  facing: number;
  position: [number, number, number];
  /** 등장 애니메이션 (0~1) */
  pop?: number;
}

/** 2D 캐릭터와 같은 팔 자세 (도 단위, 2D 기준) */
const ARM_POSES: Record<Emotion, [number, number]> = {
  joy: [35, -150],
  embarrassed: [160, -25],
  curious: [25, -125],
  confident: [60, -165],
  surprised: [140, -140],
  disappointed: [8, -8],
};

export const Chef3D: React.FC<Props> = ({ emotion, frame, talking, action, facing, position, pop = 1 }) => {
  const bob = Math.sin(frame / 7) * (talking ? 0.012 : 0.007);
  const open = talking ? Math.max(0, (0.55 + 0.45 * Math.sin(frame * 1.25)) * (0.65 + 0.35 * Math.sin(frame * 0.41 + 1))) : 0;
  const blink = frame % 96 < 4;
  const squash = emotion === 'disappointed' ? 0.96 : 1;
  const rad = (d: number) => (d * Math.PI) / 180;

  let [leftDeg, rightDeg] = ARM_POSES[emotion];
  let rightForward = 0;
  let leftForward = 0;
  if (emotion === 'joy' && action === 'idle') rightDeg += Math.sin(frame / 3.5) * 14;
  if (action === 'cook') {
    // 오른손 뒤집개로 팬을 젓는다
    rightDeg = -40 + Math.sin(frame / 4) * 10;
    rightForward = -1.25 + Math.sin(frame / 4) * 0.18;
    leftDeg = 25;
  }
  if (action === 'present') {
    rightDeg = -70;
    leftDeg = 70;
    rightForward = -0.9;
    leftForward = -0.9;
  }
  if (action === 'point') {
    rightDeg = -120 + Math.sin(frame / 6) * 6;
  }

  return (
    <group position={position} rotation={[0, facing, 0]} scale={[pop, pop * squash, pop]}>
      <group position={[0, bob, 0]}>
        {/* 발 */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.11, 0.035, 0.05]} scale={[0.09, 0.05, 0.12]} castShadow>
            <sphereGeometry args={[1, 16, 10]} />
            <Mat color={COLORS.navy} />
          </mesh>
        ))}
        {/* 몸통 */}
        <mesh position={[0, BODY.cy, 0]} scale={[BODY.rx, BODY.ry, BODY.rz]} castShadow>
          <sphereGeometry args={[1, 22, 16]} />
          <Mat color={CREAM} rough={0.6} />
        </mesh>
        {/* 앞치마: 몸통 아래쪽 */}
        <mesh position={[0, BODY.cy, 0]} scale={[BODY.rx * 1.012, BODY.ry * 1.012, BODY.rz * 1.012]} castShadow>
          <sphereGeometry args={[1, 22, 16, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4]} />
          <Mat color={COLORS.red} />
        </mesh>
        {/* 앞치마 주머니 + 플라스크 */}
        <mesh position={onFace(0, 0.15, 0.012)} rotation={[-0.45, 0, 0]}>
          <boxGeometry args={[0.1, 0.07, 0.01]} />
          <Mat color={COLORS.redDark} />
        </mesh>
        <mesh position={onFace(0, 0.158, 0.02)} rotation={[-0.45, 0, 0]}>
          <coneGeometry args={[0.022, 0.04, 4]} />
          <Mat color={COLORS.mint} />
        </mesh>

        {/* 볼터치 */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={onFace(s * 0.17, 0.33, 0.002)} rotation={[0, s * 0.62, 0]} scale={[0.045, 0.026, 0.01]}>
            <sphereGeometry args={[1, 16, 8]} />
            <meshStandardMaterial color={COLORS.blush} transparent opacity={emotion === 'embarrassed' ? 0.95 : 0.7} />
          </mesh>
        ))}

        <Eyes emotion={emotion} blink={blink} />
        <Brows emotion={emotion} />
        <Mouth emotion={emotion} open={open} />

        {/* 조리모 */}
        <group position={[0, BODY.cy + BODY.ry - 0.035, 0]}>
          <mesh position={[0, 0.06, 0]} castShadow>
            <cylinderGeometry args={[0.17, 0.16, 0.13, 28]} />
            <Mat color="#FFFFFF" />
          </mesh>
          <mesh position={[0, 0.035, 0]}>
            <cylinderGeometry args={[0.172, 0.168, 0.03, 28]} />
            <Mat color={COLORS.red} />
          </mesh>
          {[
            [-0.09, 0.18, 0, 0.11],
            [0.09, 0.18, 0, 0.11],
            [0, 0.22, -0.02, 0.13],
            [0, 0.17, 0.06, 0.1],
          ].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x!, y!, z!]} castShadow>
              <sphereGeometry args={[r!, 12, 9]} />
              <Mat color="#FFFFFF" />
            </mesh>
          ))}
          {/* 고글 */}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.052, 0.085, 0.158]}>
              <mesh>
                <torusGeometry args={[0.038, 0.01, 8, 20]} />
                <Mat color={INK} />
              </mesh>
              <mesh>
                <circleGeometry args={[0.036, 20]} />
                <Mat color={COLORS.mint} rough={0.2} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.085, 0.16]}>
            <boxGeometry args={[0.03, 0.012, 0.01]} />
            <Mat color={INK} />
          </mesh>
        </group>

        {/* 팔 */}
        <Arm side={-1} raise={-rad(leftDeg)} forward={leftForward} />
        <Arm side={1} raise={-rad(rightDeg)} forward={rightForward} spatula={action === 'cook'} thumb={emotion === 'confident' && action === 'idle'} />

        <Effects emotion={emotion} frame={frame} />
      </group>
    </group>
  );
};

const Arm: React.FC<{ side: -1 | 1; raise: number; forward: number; spatula?: boolean; thumb?: boolean }> = ({ side, raise, forward, spatula, thumb }) => (
  <group position={[side * 0.26, BODY.cy + 0.02, 0.02]} rotation={[forward, 0, raise]}>
    <mesh position={[0, -0.08, 0]} castShadow>
      <capsuleGeometry args={[0.052, 0.1, 6, 12]} />
      <Mat color={CREAM} />
    </mesh>
    <mesh position={[0, -0.17, 0]} castShadow>
      <sphereGeometry args={[0.058, 16, 12]} />
      <Mat color={CREAM} />
    </mesh>
    {thumb && (
      <mesh position={[0, -0.24, 0]}>
        <capsuleGeometry args={[0.018, 0.04, 4, 8]} />
        <Mat color={CREAM} />
      </mesh>
    )}
    {spatula && (
      <group position={[0, -0.19, 0]} rotation={[-0.3, 0, 0]}>
        <mesh position={[0, -0.13, 0]} castShadow>
          <boxGeometry args={[0.022, 0.26, 0.018]} />
          <Mat color="#9C6640" />
        </mesh>
        <mesh position={[0, -0.29, 0.02]} rotation={[0.5, 0, 0]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.008]} />
          <Mat color="#C3C8CE" rough={0.35} />
        </mesh>
      </group>
    )}
  </group>
);

const EYE_Y = 0.405;
const EYE_X = 0.085;

const Eyes: React.FC<{ emotion: Emotion; blink: boolean }> = ({ emotion, blink }) => (
  <group>
    {[-1, 1].map((s) => {
      const p = onFace(s * EYE_X, EYE_Y);
      const tilt: [number, number, number] = [-0.25, s * 0.3, 0];
      if (blink && emotion !== 'joy' && emotion !== 'embarrassed') {
        return (
          <mesh key={s} position={p} rotation={tilt}>
            <boxGeometry args={[0.05, 0.008, 0.006]} />
            <Mat color={INK} />
          </mesh>
        );
      }
      switch (emotion) {
        case 'joy':
          return (
            <mesh key={s} position={p} rotation={tilt}>
              <torusGeometry args={[0.025, 0.007, 6, 16, Math.PI]} />
              <Mat color={INK} />
            </mesh>
          );
        case 'embarrassed':
          return (
            <group key={s} position={p} rotation={tilt}>
              <mesh position={[0, 0.01, 0]} rotation={[0, 0, s * -0.5]}>
                <boxGeometry args={[0.04, 0.01, 0.006]} />
                <Mat color={INK} />
              </mesh>
              <mesh position={[0, -0.01, 0]} rotation={[0, 0, s * 0.5]}>
                <boxGeometry args={[0.04, 0.01, 0.006]} />
                <Mat color={INK} />
              </mesh>
            </group>
          );
        case 'surprised':
          return (
            <group key={s} position={p} rotation={tilt}>
              <mesh>
                <circleGeometry args={[0.036, 20]} />
                <Mat color="#FFFFFF" />
              </mesh>
              <mesh position={[0, 0, 0.002]}>
                <torusGeometry args={[0.036, 0.005, 6, 24]} />
                <Mat color={INK} />
              </mesh>
              <mesh position={[0, -0.003, 0.003]}>
                <circleGeometry args={[0.015, 16]} />
                <Mat color={INK} />
              </mesh>
            </group>
          );
        default: {
          const scaleY = emotion === 'confident' ? 0.55 : 1;
          const r = emotion === 'curious' && s === 1 ? 0.03 : emotion === 'disappointed' ? 0.02 : 0.026;
          return (
            <group key={s} position={emotion === 'disappointed' ? onFace(s * EYE_X, EYE_Y - 0.012) : p} rotation={tilt}>
              <mesh scale={[1, scaleY, 0.35]}>
                <sphereGeometry args={[r, 16, 12]} />
                <Mat color={INK} rough={0.3} />
              </mesh>
              <mesh position={[0.008, 0.008 * scaleY, r * 0.35]}>
                <sphereGeometry args={[r * 0.3, 8, 6]} />
                <Mat color="#FFFFFF" />
              </mesh>
            </group>
          );
        }
      }
    })}
  </group>
);

const BROWS: Partial<Record<Emotion, [number, number]>> = {
  curious: [0.05, -0.2],
  confident: [-0.25, 0.25],
  surprised: [0.12, -0.12],
  disappointed: [0.3, -0.3],
  embarrassed: [-0.2, 0.2],
};
const BROW_LIFT: Partial<Record<Emotion, [number, number]>> = { curious: [0, 0.02], surprised: [0.025, 0.025] };

const Brows: React.FC<{ emotion: Emotion }> = ({ emotion }) => {
  const rot = BROWS[emotion];
  if (!rot) return null;
  const lift = BROW_LIFT[emotion] ?? [0, 0];
  return (
    <group>
      {[-1, 1].map((s, i) => (
        <mesh key={s} position={onFace(s * EYE_X, EYE_Y + 0.05 + lift[i]!)} rotation={[-0.35, s * 0.3, rot[i]!]}>
          <boxGeometry args={[0.045, 0.009, 0.006]} />
          <Mat color={INK} />
        </mesh>
      ))}
    </group>
  );
};

const Mouth: React.FC<{ emotion: Emotion; open: number }> = ({ emotion, open }) => {
  const p = onFace(0, 0.31);
  const rot: [number, number, number] = [-0.1, 0, 0];
  if (open > 0.12 || emotion === 'joy' || emotion === 'surprised') {
    const h = open > 0.12 ? 0.25 + open * 0.75 : emotion === 'surprised' ? 1 : 0.7;
    const w = emotion === 'surprised' && open <= 0.12 ? 0.022 : 0.035;
    return (
      <mesh position={p} rotation={rot} scale={[w, w * h * 1.3, 0.012]}>
        <sphereGeometry args={[1, 16, 12]} />
        <Mat color={MOUTH} rough={0.5} />
      </mesh>
    );
  }
  switch (emotion) {
    case 'curious':
      return (
        <mesh position={onFace(0.02, 0.305)} rotation={rot}>
          <torusGeometry args={[0.013, 0.006, 6, 14]} />
          <Mat color={MOUTH} />
        </mesh>
      );
    case 'confident':
      return (
        <mesh position={onFace(0.005, 0.315)} rotation={[-0.1, 0, Math.PI + 0.35]}>
          <torusGeometry args={[0.03, 0.007, 6, 16, Math.PI * 0.8]} />
          <Mat color={INK} />
        </mesh>
      );
    case 'disappointed':
      return (
        <mesh position={onFace(0, 0.29)} rotation={rot}>
          <torusGeometry args={[0.026, 0.007, 6, 16, Math.PI]} />
          <Mat color={INK} />
        </mesh>
      );
    case 'embarrassed':
    default:
      return (
        <group position={p} rotation={rot}>
          {[-1, 0, 1].map((k) => (
            <mesh key={k} position={[k * 0.018, 0, 0]} rotation={[0, 0, k % 2 ? 0 : Math.PI]}>
              <torusGeometry args={[0.009, 0.005, 6, 10, Math.PI]} />
              <Mat color={INK} />
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
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color="#8FD3F4" roughness={0.2} />
        </mesh>
      );
    case 'surprised':
      return (
        <group position={[0.3, top + Math.sin(frame / 3) * 0.01, 0.05]} rotation={[0, 0, Math.sin(frame / 2) * 0.1]}>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.035, 0.1, 0.03]} />
            <Mat color={COLORS.yellow} emissive={COLORS.yellow} />
          </mesh>
          <mesh position={[0, -0.03, 0]}>
            <sphereGeometry args={[0.02, 10, 8]} />
            <Mat color={COLORS.yellow} emissive={COLORS.yellow} />
          </mesh>
        </group>
      );
    case 'curious':
      return (
        <group position={[0.3, top + Math.sin(frame / 6) * 0.015, 0.05]}>
          <mesh position={[0, 0.06, 0]} rotation={[0, 0, -0.6]}>
            <torusGeometry args={[0.035, 0.012, 8, 16, Math.PI * 1.4]} />
            <Mat color={COLORS.red} emissive={COLORS.red} />
          </mesh>
          <mesh position={[0, -0.015, 0]}>
            <boxGeometry args={[0.022, 0.035, 0.02]} />
            <Mat color={COLORS.red} emissive={COLORS.red} />
          </mesh>
          <mesh position={[0, -0.06, 0]}>
            <sphereGeometry args={[0.015, 10, 8]} />
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
