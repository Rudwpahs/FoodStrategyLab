import React from 'react';
import { SphereGeometry, type BufferGeometry } from 'three';
import type { Emotion } from '@mat-lab/recipe-core';
import { ARM_POSES, mouthOpen } from '../characterMotion.ts';
import { COLORS } from '../theme.ts';
import { deform } from './foodShapes.ts';
import type { ChefAction } from './shots.ts';

/**
 * 3D 맛조수: 2D 캐릭터와 같은 디자인(찐빵 몸통·조리모·고글·토마토색 앞치마).
 * 귀엽게 보이도록: 말랑한 찐빵 몸통(아래가 살짝 퍼짐), 큰 눈과 반짝임, 작은 입,
 * 볼터치, 고글은 모자 위로 올려 쓴다(눈처럼 보이지 않게). 원점 = 발바닥.
 */
const BODY = { rx: 0.3, ry: 0.31, rz: 0.285, cy: 0.33 };
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
  action: ChefAction;
  /** y축 회전 (0 = 카메라 쪽 +z) */
  facing: number;
  position: [number, number, number];
  /** 등장 애니메이션 (0~1) */
  pop?: number;
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

export const Chef3D: React.FC<Props> = ({ emotion, frame, talking, action, facing, position, pop = 1 }) => {
  const open = talking ? mouthOpen(frame) : 0;
  const lids = emotion === 'joy' || emotion === 'embarrassed' ? 1 : eyeOpenness(frame);
  const rad = (d: number) => (d * Math.PI) / 180;

  // 숨쉬기(늘었다 줄었다) + 말할 때 입 모양 따라 살짝 늘어남 + 몸 흔들림
  const breath = Math.sin(frame / 16);
  const stretch = 1 + breath * 0.012 + open * 0.018 - (emotion === 'disappointed' ? 0.04 : 0);
  const widen = 1 - breath * 0.008 - open * 0.009 + (emotion === 'disappointed' ? 0.02 : 0);
  const hop = emotion === 'joy' && action === 'idle' ? Math.max(0, Math.sin(frame / 5)) * 0.025 : 0;
  const bob = Math.sin(frame / 7) * (talking ? 0.008 : 0.004) + hop;
  const sway = Math.sin(frame / 29) * 0.025 + (emotion === 'curious' ? 0.12 : 0) + (emotion === 'embarrassed' ? -0.06 : 0);
  const look = Math.sin(frame / 37) * 0.05;
  // 모자는 몸보다 조금 늦게 따라 흔들린다
  const hatLag = Math.sin(frame / 7 - 1.1) * (talking ? 0.045 : 0.02) - sway * 0.3;

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

  return (
    <group position={position} rotation={[0, facing, 0]} scale={[pop, pop, pop]}>
      <group position={[0, bob, 0]} rotation={[0, look, sway * 0.35]} scale={[widen, stretch, widen]}>
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

        <Eyes emotion={emotion} lids={lids} />
        <Brows emotion={emotion} />
        <Mouth emotion={emotion} open={open} />

        {/* 조리모 (몸보다 조금 늦게 흔들림) + 이마 위로 올려 쓴 연구용 고글 */}
        <group position={[0, BODY.cy + BODY.ry - 0.04, 0]} rotation={[0.04, 0, hatLag]}>
          <Hat />
        </group>

        {/* 팔 */}
        <Arm side={-1} raise={-rad(leftDeg)} forward={leftForward} />
        <Arm side={1} raise={-rad(rightDeg)} forward={rightForward} spatula={action === 'cook'} thumb={emotion === 'confident' && action === 'idle'} />

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
    {/* 고글: 모자 앞에 걸쳐 위로 젖혀 쓴 모양 (끈 + 두 렌즈) */}
    <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.166, 0.008, 10, 64]} />
      <Mat color="#3A4150" rough={0.5} />
    </mesh>
    <group position={[0, 0.072, 0.178]} rotation={[-0.22, 0, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.045, 0, 0]}>
          <mesh>
            <torusGeometry args={[0.034, 0.01, 14, 40]} />
            <meshPhysicalMaterial color="#4A5262" roughness={0.3} metalness={0.5} clearcoat={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <circleGeometry args={[0.032, 32]} />
            <Gloss color="#7FD6B6" rough={0.1} />
          </mesh>
          {/* 렌즈 반짝임 */}
          <mesh position={[0.011, 0.011, 0.004]} rotation={[0, 0, -0.6]} scale={[0.013, 0.005, 1]}>
            <circleGeometry args={[1, 16]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.8} />
          </mesh>
        </group>
      ))}
      <mesh>
        <boxGeometry args={[0.024, 0.01, 0.01]} />
        <Mat color="#4A5262" rough={0.4} />
      </mesh>
    </group>
  </group>
);

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

/** 눈 높이(발바닥 기준). 자막이 피할 얼굴 범위(captionPlacement.ts FACE_SPAN)의 기준 */
export const EYE_Y = 0.41;
const EYE_X = 0.09;

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

const Eyes: React.FC<{ emotion: Emotion; lids: number }> = ({ emotion, lids }) => (
  <group>
    {[-1, 1].map((s) => {
      const y = emotion === 'disappointed' ? EYE_Y - 0.012 : EYE_Y;
      const f = onFace(s * EYE_X, y, 0.006);
      switch (emotion) {
        case 'joy':
          // 웃는 눈 ^ ^
          return (
            <mesh key={s} position={f.p} rotation={f.r}>
              <torusGeometry args={[0.03, 0.009, 14, 32, Math.PI]} />
              <Gloss color={INK} />
            </mesh>
          );
        case 'embarrassed':
          // > <
          return (
            <group key={s} position={f.p} rotation={f.r}>
              {[1, -1].map((k) => (
                <mesh key={k} position={[-s * 0.006, k * 0.011, 0]} rotation={[0, 0, k * s * 0.55]}>
                  <capsuleGeometry args={[0.0065, 0.036, 6, 12]} />
                  <Gloss color={INK} />
                </mesh>
              ))}
            </group>
          );
        case 'surprised':
          return (
            <group key={s} position={f.p} rotation={f.r}>
              <GlossyEye r={0.046} open={lids} />
            </group>
          );
        case 'curious':
          return (
            <group key={s} position={f.p} rotation={f.r}>
              <GlossyEye r={s === 1 ? 0.044 : 0.037} open={lids} />
            </group>
          );
        case 'confident':
          return (
            <group key={s} position={f.p} rotation={f.r}>
              <GlossyEye r={0.04} open={lids} squint={0.62} />
              {/* 윗눈꺼풀 */}
              <mesh position={[0, 0.026, 0.012]} rotation={[0, 0, -s * 0.12]}>
                <capsuleGeometry args={[0.006, 0.07, 6, 12]} />
                <Gloss color={INK} />
              </mesh>
            </group>
          );
        case 'disappointed':
          return (
            <group key={s} position={f.p} rotation={f.r}>
              <GlossyEye r={0.034} open={lids} squint={0.85} />
            </group>
          );
        default:
          return (
            <group key={s} position={f.p} rotation={f.r}>
              <GlossyEye r={0.04} open={lids} />
            </group>
          );
      }
    })}
  </group>
);

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
