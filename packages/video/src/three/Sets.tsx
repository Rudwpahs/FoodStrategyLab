import React from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { Box, Cyl, KitchenSet, windowColor } from './Kitchen.tsx';
import { CHEF_POS, COUNTER_FRONT, COUNTER_TOP, WALL_Z, type Vec3 } from './layout.ts';
import type { DayTime, Place, TableDress } from './places.ts';

/**
 * 주방 말고 네 무대: 시장 가판대 · 식탁 · 찬장·냉장고 앞 · 연구실 칠판.
 * 모두 상자·원기둥·공으로만 만든 같은 따뜻한 로우폴리 느낌이다 (밖에서 받은 3D 파일·그림 없음).
 *
 * 배치 약속 (layout.ts): 맛조수 발판(CHEF_POS), 조리대 높이(COUNTER_TOP)의 작업대(뒷벽 WALL_Z ~ 앞 COUNTER_FRONT),
 * 접시·재료·불 자리가 모든 무대에서 같다. 그래서 카메라 구도와 자막 자리 검사가 무대와 상관없이 맞는다.
 * 카메라는 대개 뒷벽의 x -1.8~1.0, 높이 2.8 아래를 보므로 무대 특징은 그 안에 둔다.
 * 렌더 속도: 무대마다 물체 수를 주방(약 110개)과 비슷하게, 작은 장식은 그림자를 만들지 않는다.
 */

type BallProps = { pos: Vec3; r: number; color: string; scale?: Vec3; seg?: number; shadow?: boolean; emissive?: string; emissiveIntensity?: number };

/** 공 (채소·과일·전구). 면을 적게 나눠 로우폴리 느낌 */
const Ball: React.FC<BallProps> = ({ pos, r, color, scale, seg = 10, shadow = false, emissive, emissiveIntensity = 0.9 }) => (
  <mesh position={pos} scale={scale} castShadow={shadow} receiveShadow>
    <sphereGeometry args={[r, seg, Math.max(6, Math.round(seg * 0.7))]} />
    <meshStandardMaterial color={color} roughness={0.7} flatShading emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? emissiveIntensity : 0} />
  </mesh>
);

/** 유리 (비커·컵·병). 투명하게, 그림자 없이 */
const Glass: React.FC<{ pos: Vec3; r: number; h: number; r2?: number; tint?: string }> = ({ pos, r, h, r2, tint = '#DDEFF7' }) => (
  <mesh position={pos}>
    <cylinderGeometry args={[r, r2 ?? r, h, 16, 1, true]} />
    <meshStandardMaterial color={tint} roughness={0.15} transparent opacity={0.38} depthWrite={false} side={2} />
  </mesh>
);

/** 빛나는 판 (창문·냉장고 안·간판 등) */
const Glow: React.FC<{ pos: Vec3; size: [number, number, number]; color: string; intensity?: number }> = ({ pos, size, color, intensity = 0.75 }) => (
  <mesh position={pos}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} roughness={1} />
  </mesh>
);

// ---------- 코드로 그린 무늬 (줄무늬·바둑판·체크 식탁보) ----------
// 상자를 여러 개 늘어놓는 대신 무늬 한 장을 입힌 상자 하나로 그린다 (물체 수가 줄어 렌더가 빠르다)

type Pattern = { kind: 'stripes' | 'check' | 'gingham'; a: string; b: string };
const patternCanvas = new Map<string, HTMLCanvasElement>();

/** 무늬 한 칸(64px: 줄 두 개 또는 칸 2×2)을 그린 그림. 같은 무늬는 한 번만 그린다 */
function patternTexture(p: Pattern, repeat: [number, number]): Texture | null {
  if (typeof document === 'undefined') return null;
  const key = `${p.kind}|${p.a}|${p.b}`;
  let c = patternCanvas.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = p.a;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = p.b;
    if (p.kind === 'stripes') g.fillRect(0, 0, 32, 64);
    if (p.kind === 'check') {
      g.fillRect(0, 0, 32, 32);
      g.fillRect(32, 32, 32, 32);
    }
    if (p.kind === 'gingham') {
      // 반투명 색을 가로·세로로 겹쳐 칠하면 겹친 칸이 더 진해진다
      g.fillRect(0, 0, 32, 64);
      g.fillRect(0, 0, 64, 32);
    }
    patternCanvas.set(key, c);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 무늬를 입힌 상자. repeat = 상자 한 면에 무늬 칸(64px 그림)이 몇 번 들어가는지 */
const Patterned: React.FC<{ pos: Vec3; size: [number, number, number]; pattern: Pattern; repeat: [number, number]; rot?: Vec3; shadow?: boolean }> = ({ pos, size, pattern, repeat, rot, shadow = false }) => {
  const map = React.useMemo(() => patternTexture(pattern, repeat), [pattern.kind, pattern.a, pattern.b, repeat[0], repeat[1]]);
  return (
    <mesh position={pos} rotation={rot} castShadow={shadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#FFFFFF" map={map} roughness={0.88} />
    </mesh>
  );
};

/** 바닥: 판자 줄무늬(stripes) 또는 바둑판(check). cell = 판자 폭·타일 한 변 (m) */
const Floor: React.FC<{ pattern: Pattern; cell: number }> = ({ pattern, cell }) => (
  <Patterned pos={[0, -0.025, 0.4]} size={[6.5, 0.05, 5.2]} pattern={pattern} repeat={[6.5 / (cell * 2), pattern.kind === 'stripes' ? 1 : 5.2 / (cell * 2)]} />
);

/** 가격표: 글씨 없는 흰 카드 (글자는 영상 위 카드가 맡는다) */
const PriceTag: React.FC<{ pos: Vec3; tilt?: number }> = ({ pos, tilt = 0 }) => (
  <group position={pos} rotation={[-0.25, tilt, 0]}>
    <Box pos={[0, -0.06, 0]} size={[0.01, 0.12, 0.01]} color="#8C5A35" shadow={false} />
    <Box pos={[0, 0.02, 0]} size={[0.13, 0.085, 0.008]} color="#FFFDF5" shadow={false} />
    <Box pos={[0, 0.045, 0.005]} size={[0.13, 0.016, 0.002]} color="#E8553A" shadow={false} />
  </group>
);

type Produce = 'cabbage' | 'tomato' | 'carrot' | 'onion' | 'pepper' | 'eggplant' | 'radish';

/** 채소 한 개 (원점 = 바닥) */
const Veg: React.FC<{ kind: Produce; pos: Vec3; rot?: number }> = ({ kind, pos, rot = 0 }) => {
  const [x, y, z] = pos;
  switch (kind) {
    case 'cabbage':
      return <Ball pos={[x, y + 0.07, z]} r={0.085} color="#8CC46A" scale={[1, 0.85, 1]} />;
    case 'tomato':
      return <Ball pos={[x, y + 0.045, z]} r={0.05} color="#E5492F" seg={9} />;
    case 'onion':
      return <Ball pos={[x, y + 0.045, z]} r={0.05} color="#E9C58A" scale={[1, 0.9, 1]} seg={9} />;
    case 'pepper':
      return <Ball pos={[x, y + 0.04, z]} r={0.045} color="#3E9B4A" scale={[0.8, 1.3, 0.8]} seg={8} />;
    case 'eggplant':
      return (
        <group position={[x, y + 0.04, z]} rotation={[0, rot, Math.PI / 2]}>
          <Ball pos={[0, 0, 0]} r={0.045} color="#6B3C7A" scale={[1, 2, 1]} seg={9} />
        </group>
      );
    case 'radish':
      return <Ball pos={[x, y + 0.06, z]} r={0.055} color="#F4F0E6" scale={[0.9, 1.4, 0.9]} seg={9} />;
    case 'carrot':
      return (
        <mesh position={[x, y + 0.035, z]} rotation={[0, rot, Math.PI / 2]}>
          <coneGeometry args={[0.03, 0.2, 7]} />
          <meshStandardMaterial color="#F08A2C" roughness={0.7} flatShading />
        </mesh>
      );
  }
};

/** 나무 상자 + 안에 담긴 채소 (원점 = 상자 바닥 가운데) */
const Crate: React.FC<{ pos: Vec3; w?: number; d?: number; h?: number; fill: Produce; tag?: boolean; color?: string; rows?: number; shadow?: boolean }> = ({
  pos,
  w = 0.46,
  d = 0.3,
  h = 0.16,
  fill,
  tag = true,
  color = '#D4A066',
  rows: wantRows = 2,
  shadow = true,
}) => {
  const cols = Math.max(2, Math.round(w / 0.12));
  const rows = fill === 'cabbage' ? 1 : wantRows;
  const items: Vec3[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < (fill === 'cabbage' ? Math.max(2, cols - 1) : cols); c++) {
      const n = fill === 'cabbage' ? Math.max(2, cols - 1) : cols;
      items.push([-w / 2 + (w / n) * (c + 0.5) + (r % 2) * 0.02, h - 0.05, rows === 1 ? 0 : -d / 4 + (d / 2) * r]);
    }
  return (
    <group position={pos}>
      <Box pos={[0, h / 2, 0]} size={[w, h, d]} color={color} shadow={shadow} />
      {/* 앞 판자 줄무늬 */}
      <Box pos={[0, h * 0.68, d / 2 + 0.004]} size={[w + 0.004, 0.02, 0.008]} color="#B9844E" shadow={false} />
      <Box pos={[0, h * 0.28, d / 2 + 0.004]} size={[w + 0.004, 0.02, 0.008]} color="#B9844E" shadow={false} />
      {items.map((p, i) => (
        <Veg key={i} kind={fill} pos={p} rot={i * 0.7} />
      ))}
      {tag && <PriceTag pos={[w / 2 - 0.08, h + 0.08, d / 2 - 0.02]} tilt={-0.15} />}
    </group>
  );
};

// ---------- 시장 가판대 ----------

const MK = { ground: '#D6CBB8', groundB: '#CBBFAA', facade: '#F2D7AE', trim: '#C97B4A', table: '#C08552', tableDark: '#9A6538', awningA: '#E8553A', awningB: '#FFF4E2', pole: '#6B4A33', sign: '#2F6B57' };

const AWNING: Pattern = { kind: 'stripes', a: '#FFF4E2', b: '#E8553A' };
const AWNING_BACK: Vec3 = [0, 2.3, -1.78];
const AWNING_FRONT_Y = 1.97;
const AWNING_FRONT_Z = -0.6;

/** 전구 x 자리 */
const BULBS = Array.from({ length: 9 }, (_, i) => -1.8 + (i / 8) * 3.5);

export const MarketSet: React.FC = () => {
  const len = Math.hypot(AWNING_BACK[1] - AWNING_FRONT_Y, AWNING_FRONT_Z - AWNING_BACK[2]);
  const slope = Math.atan2(AWNING_BACK[1] - AWNING_FRONT_Y, AWNING_FRONT_Z - AWNING_BACK[2]);
  const midY = (AWNING_BACK[1] + AWNING_FRONT_Y) / 2;
  const midZ = (AWNING_BACK[2] + AWNING_FRONT_Z) / 2;
  const stripes = 10;
  const x0 = -2.05;
  const sw = 0.4;
  const tableX0 = -1.95;
  const tableX1 = 1.6;
  const tableZ0 = WALL_Z + 0.07;
  return (
    <group>
      <Floor pattern={{ kind: 'stripes', a: MK.ground, b: MK.groundB }} cell={0.6} />
      {/* 가게 앞면 벽 + 덧댄 아래 판 + 빈 간판 */}
      <Box pos={[0, 1.7, WALL_Z - 0.32]} size={[6.5, 3.6, 0.1]} color={MK.facade} shadow={false} />
      <Box pos={[0, 0.45, WALL_Z - 0.26]} size={[6.5, 0.9, 0.04]} color="#E3B98A" shadow={false} />
      <Box pos={[-0.4, 2.62, WALL_Z - 0.24]} size={[2.7, 0.34, 0.06]} color={MK.sign} shadow={false} />
      <Box pos={[-0.4, 2.62, WALL_Z - 0.205]} size={[2.56, 0.22, 0.01]} color="#3F8A70" shadow={false} />
      {/* 뒤쪽 계단 선반 + 채소 상자 */}
      <Box pos={[-0.15, 0.6, WALL_Z - 0.1]} size={[3.7, 1.2, 0.3]} color={MK.tableDark} shadow={false} />
      <Crate pos={[-1.55, 1.2, WALL_Z - 0.1]} fill="carrot" rows={1} shadow={false} />
      <Crate pos={[-1.0, 1.2, WALL_Z - 0.1]} fill="pepper" w={0.42} rows={1} shadow={false} />
      <Crate pos={[-0.47, 1.2, WALL_Z - 0.1]} fill="onion" w={0.44} rows={1} shadow={false} />
      <Crate pos={[0.08, 1.2, WALL_Z - 0.1]} fill="eggplant" w={0.42} tag={false} rows={1} shadow={false} />
      <Crate pos={[0.62, 1.2, WALL_Z - 0.1]} fill="tomato" w={0.44} rows={1} shadow={false} />
      <Crate pos={[1.17, 1.2, WALL_Z - 0.1]} fill="radish" w={0.44} rows={1} shadow={false} />
      {/* 가판대 상판 + 앞 판자 */}
      <Box pos={[(tableX0 + tableX1) / 2, COUNTER_TOP - 0.03, (tableZ0 + COUNTER_FRONT) / 2]} size={[tableX1 - tableX0, 0.06, COUNTER_FRONT - tableZ0 + 0.04]} color={MK.table} />
      <Patterned
        pos={[(tableX0 + tableX1) / 2, (COUNTER_TOP - 0.06) / 2, COUNTER_FRONT + 0.01]}
        size={[tableX1 - tableX0, COUNTER_TOP - 0.06, 0.03]}
        pattern={{ kind: 'stripes', a: '#E2B27A', b: '#D49C62' }}
        repeat={[4.5, 1]}
        shadow
      />
      {/* 가판대 위 왼쪽 끝: 배추·토마토 상자 (재료·접시 자리는 비워 둔다) */}
      <Crate pos={[-1.62, COUNTER_TOP, -1.2]} fill="cabbage" w={0.4} d={0.34} />
      <Crate pos={[-1.12, COUNTER_TOP, -1.3]} fill="tomato" w={0.36} d={0.26} h={0.12} />
      {/* 차양: 줄무늬 천 + 앞 끝 드림 */}
      <Patterned pos={[x0 + (sw * stripes) / 2, midY, midZ]} rot={[slope, 0, 0]} size={[sw * stripes, 0.025, len]} pattern={AWNING} repeat={[stripes / 2, 1]} />
      <Patterned pos={[x0 + (sw * stripes) / 2, AWNING_FRONT_Y - 0.07, AWNING_FRONT_Z + 0.01]} size={[sw * stripes, 0.15, 0.02]} pattern={AWNING} repeat={[stripes / 2, 1]} />
      {/* 기둥 */}
      {[x0 + 0.06, x0 + sw * stripes - 0.06].map((x) => (
        <Cyl key={x} pos={[x, AWNING_FRONT_Y / 2, AWNING_FRONT_Z - 0.02]} r={0.03} h={AWNING_FRONT_Y} color={MK.pole} seg={8} />
      ))}
      {/* 줄 전구: 차양 앞 끝 전선에 매단 전구 */}
      <Box pos={[x0 + (sw * stripes) / 2, AWNING_FRONT_Y - 0.15, AWNING_FRONT_Z + 0.03]} size={[sw * stripes - 0.1, 0.008, 0.008]} color="#3A2C24" shadow={false} />
      {BULBS.map((x) => (
        <Ball key={x} pos={[x, AWNING_FRONT_Y - 0.19, AWNING_FRONT_Z + 0.03]} r={0.028} color="#FFE7A8" emissive="#FFD37A" seg={8} />
      ))}
      {/* 바닥에 쌓은 상자 (오른쪽) */}
      <Crate pos={[2.0, 0, -1.0]} fill="cabbage" w={0.5} d={0.4} h={0.22} tag={false} color="#C9955E" />
      <Crate pos={[2.0, 0.22, -1.0]} fill="onion" w={0.5} d={0.4} h={0.18} rows={1} />
      {/* 맛조수 발판: 엎어 놓은 나무 상자 */}
      <group position={[CHEF_POS[0], 0, CHEF_POS[2]]}>
        <Box pos={[0, CHEF_POS[1] / 2, 0]} size={[0.52, CHEF_POS[1], 0.4]} color="#D4A066" />
        {[0.12, 0.28].map((y) => (
          <Box key={y} pos={[0, y, 0.205]} size={[0.53, 0.025, 0.01]} color="#B9844E" shadow={false} />
        ))}
      </group>
    </group>
  );
};

// ---------- 식탁 ----------

/** 체크무늬 한 칸 크기 (m) */
const GINGHAM = 0.12;
const GINGHAM_PATTERN: Pattern = { kind: 'gingham', a: '#FFFDF7', b: 'rgba(226, 84, 60, 0.42)' };

/** 식탁 차림별 천 무늬 (맨 나무 식탁은 천 없이 나무 줄무늬) */
const DRESS: Record<TableDress, Pattern> = {
  gingham: GINGHAM_PATTERN,
  linen: { kind: 'stripes', a: '#FBF6EC', b: '#F2EBDD' },
  wood: { kind: 'stripes', a: '#B98454', b: '#AE7A4B' },
  indigo: { kind: 'gingham', a: '#F7F5F0', b: 'rgba(52, 78, 128, 0.36)' },
};

/** 식탁보 천 (코드로 그린 무늬) */
const Cloth: React.FC<{ pos: Vec3; size: [number, number, number]; repeat: [number, number]; dress?: TableDress }> = ({ pos, size, repeat, dress = 'gingham' }) => (
  <Patterned pos={pos} size={size} pattern={DRESS[dress]} repeat={dress === 'wood' ? [repeat[0] / 6, 1] : [repeat[0] / 2, repeat[1] / 2]} shadow />
);

const DN = { floorA: '#D9A46E', floorB: '#CC9661', wall: '#F4E3CC', wainscot: '#E7CFAF', rail: '#FFFFFF', curtain: '#8DC2A2', wood: '#B97A48', woodDark: '#8F5A33' };
const DINING_WALL_Z = WALL_Z - 0.3;

export const DiningSet: React.FC<{ dayTime: DayTime; table?: TableDress }> = ({ dayTime, table = 'gingham' }) => {
  const glow = windowColor(dayTime);
  const tx0 = -1.9;
  const tx1 = 1.6;
  const tz0 = WALL_Z + 0.06;
  const tz1 = COUNTER_FRONT + 0.12;
  const tw = tx1 - tx0;
  const tcx = (tx0 + tx1) / 2;
  const tcz = (tz0 + tz1) / 2;
  const win = { x: 0.45, y: 1.9, w: 1.2, h: 1.05 };
  return (
    <group>
      <Floor pattern={{ kind: 'stripes', a: DN.floorA, b: DN.floorB }} cell={0.38} />
      {/* 벽 + 아래 판넬 + 몰딩 */}
      <Box pos={[0, 1.7, DINING_WALL_Z - 0.05]} size={[6.5, 3.4, 0.1]} color={DN.wall} shadow={false} />
      <Box pos={[0, 0.5, DINING_WALL_Z]} size={[6.5, 1.0, 0.03]} color={DN.wainscot} shadow={false} />
      <Box pos={[0, 1.01, DINING_WALL_Z + 0.02]} size={[6.5, 0.04, 0.04]} color={DN.rail} shadow={false} />
      {/* 창문: 빛나는 유리 + 흰 창틀 + 커튼 */}
      <Glow pos={[win.x, win.y, DINING_WALL_Z + 0.005]} size={[win.w, win.h, 0.01]} color={glow} intensity={0.85} />
      {[
        [win.x, win.y + win.h / 2, win.w + 0.1, 0.06],
        [win.x, win.y - win.h / 2, win.w + 0.16, 0.07],
        [win.x, win.y, win.w, 0.035],
      ].map(([x, y, w, h], i) => (
        <Box key={i} pos={[x!, y!, DINING_WALL_Z + 0.03]} size={[w!, h!, 0.05]} color="#FFFFFF" shadow={false} />
      ))}
      {[-win.w / 2, 0, win.w / 2].map((dx) => (
        <Box key={dx} pos={[win.x + dx, win.y, DINING_WALL_Z + 0.03]} size={[dx === 0 ? 0.035 : 0.06, win.h, 0.05]} color="#FFFFFF" shadow={false} />
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          {[0, 1, 2].map((k) => (
            <Box key={k} pos={[win.x + s * (win.w / 2 + 0.04 + k * 0.1), win.y - 0.08, DINING_WALL_Z + 0.07 + (k % 2) * 0.02]} size={[0.11, win.h + 0.32, 0.03]} color={k % 2 ? '#7FB394' : DN.curtain} shadow={false} />
          ))}
        </group>
      ))}
      <Box pos={[win.x, win.y + win.h / 2 + 0.16, DINING_WALL_Z + 0.08]} size={[win.w + 0.7, 0.03, 0.03]} color={DN.woodDark} shadow={false} />
      {/* 액자 */}
      <Box pos={[-1.3, 1.8, DINING_WALL_Z + 0.02]} size={[0.5, 0.62, 0.03]} color={DN.woodDark} shadow={false} />
      <Box pos={[-1.3, 1.8, DINING_WALL_Z + 0.04]} size={[0.4, 0.52, 0.01]} color="#BFE0D0" shadow={false} />
      <Box pos={[-1.3, 1.66, DINING_WALL_Z + 0.05]} size={[0.4, 0.2, 0.01]} color="#7CC6A4" shadow={false} />
      <Cyl pos={[-1.22, 1.92, DINING_WALL_Z + 0.05]} r={0.06} h={0.01} rot={[Math.PI / 2, 0, 0]} color="#FFC94A" seg={16} />
      {/* 펜던트 등 */}
      <Cyl pos={[win.x - 0.2, 2.85, -1.1]} r={0.006} h={0.7} color="#3A2C24" seg={6} />
      <Cyl pos={[win.x - 0.2, 2.45, -1.1]} r={0.05} r2={0.22} h={0.17} color="#2F6B57" seg={16} />
      <Ball pos={[win.x - 0.2, 2.35, -1.1]} r={0.05} color="#FFF0C8" emissive="#FFE2A0" shadow={false} />
      {/* 식탁: 다리 + 체크무늬 식탁보(위·앞·옆으로 늘어진 천) */}
      {[tx0 + 0.12, tx1 - 0.12].flatMap((x) => [tz0 + 0.1, tz1 - 0.1].map((z) => <Box key={`${x}${z}`} pos={[x, 0.3, z]} size={[0.07, 0.6, 0.07]} color={DN.woodDark} />))}
      <Cloth dress={table} pos={[tcx, COUNTER_TOP - 0.02, tcz]} size={[tw, 0.04, tz1 - tz0]} repeat={[tw / GINGHAM, (tz1 - tz0) / GINGHAM]} />
      {/* 늘어진 천 (맨 나무 식탁은 상판 두께만) */}
      {table === 'wood' ? (
        <Box pos={[tcx, COUNTER_TOP - 0.06, tz1 - 0.004]} size={[tw, 0.07, 0.02]} color="#9A6538" />
      ) : (
        <>
          <Cloth dress={table} pos={[tcx, COUNTER_TOP - 0.2, tz1 + 0.01]} size={[tw, 0.36, 0.015]} repeat={[tw / GINGHAM, 0.36 / GINGHAM]} />
          {[tx0, tx1].map((x) => (
            <Cloth dress={table} key={x} pos={[x + (x < 0 ? -0.008 : 0.008), COUNTER_TOP - 0.2, tcz]} size={[0.015, 0.36, tz1 - tz0]} repeat={[(tz1 - tz0) / GINGHAM, 0.36 / GINGHAM]} />
          ))}
        </>
      )}
      {/* 꽃병 */}
      <Cyl pos={[-1.15, COUNTER_TOP + 0.09, -1.42]} r={0.05} r2={0.07} h={0.18} color="#7FB7C9" seg={12} />
      {[
        [-1.18, 0.33, -1.44, '#FF9C8A'],
        [-1.1, 0.3, -1.4, '#FFC94A'],
        [-1.15, 0.37, -1.4, '#FFFFFF'],
      ].map(([x, y, z, c], i) => (
        <group key={i}>
          <Box pos={[x as number, COUNTER_TOP + (y as number) / 2 + 0.04, z as number]} size={[0.008, (y as number) - 0.04, 0.008]} color="#4E8A45" shadow={false} />
          <Ball pos={[x as number, COUNTER_TOP + (y as number), z as number]} r={0.04} color={c as string} seg={8} shadow={false} />
        </group>
      ))}
      {/* 찻주전자 + 찻잔 */}
      <group position={[-1.55, COUNTER_TOP, -1.12]}>
        <Ball pos={[0, 0.09, 0]} r={0.1} color="#F2EEE4" scale={[1, 0.85, 1]} />
        <Cyl pos={[0.12, 0.1, 0]} r={0.012} r2={0.02} h={0.12} rot={[0, 0, -0.8]} color="#F2EEE4" seg={8} />
        <Cyl pos={[0, 0.18, 0]} r={0.035} h={0.03} color="#2F6B57" seg={10} />
        <Cyl pos={[0.2, 0.03, 0.18]} r={0.04} r2={0.03} h={0.06} color="#F2EEE4" seg={10} />
        <Cyl pos={[-0.12, 0.03, 0.22]} r={0.04} r2={0.03} h={0.06} color="#F2EEE4" seg={10} />
      </group>
      {/* 반찬 그릇 (뒤쪽 한 줄) */}
      {[
        [-0.2, '#E8553A'],
        [0.18, '#7DBA5A'],
        [0.56, '#E9C58A'],
      ].map(([x, c]) => (
        <group key={x as number} position={[x as number, COUNTER_TOP, -1.49]}>
          <Cyl pos={[0, 0.025, 0]} r={0.065} r2={0.045} h={0.05} color="#FFFFFF" seg={12} />
          <Ball pos={[0, 0.045, 0]} r={0.045} color={c as string} scale={[1, 0.45, 1]} seg={8} shadow={false} />
        </group>
      ))}
      {/* 수저 (접시 오른쪽) + 물컵 */}
      <group position={[1.43, COUNTER_TOP + 0.008, -1.08]} rotation={[0, -0.08, 0]}>
        <Box pos={[0, 0, 0]} size={[0.012, 0.01, 0.26]} color={DN.woodDark} shadow={false} />
        <Box pos={[0.025, 0, 0]} size={[0.012, 0.01, 0.26]} color={DN.woodDark} shadow={false} />
        <Box pos={[0.07, 0, 0.03]} size={[0.014, 0.008, 0.2]} color="#C3C8CE" shadow={false} />
        <Ball pos={[0.07, 0.004, -0.09]} r={0.03} color="#C3C8CE" scale={[1, 0.25, 1.3]} seg={8} shadow={false} />
      </group>
      <Glass pos={[1.42, COUNTER_TOP + 0.07, -1.42]} r={0.045} r2={0.04} h={0.14} />
      <Cyl pos={[1.42, COUNTER_TOP + 0.045, -1.42]} r={0.039} h={0.08} color="#CFE9F5" seg={12} />
      {/* 의자 (식탁 오른쪽 끝) */}
      <group position={[2.0, 0, -1.15]} rotation={[0, -Math.PI / 2, 0]}>
        <Box pos={[0, 0.46, 0]} size={[0.44, 0.05, 0.42]} color={DN.wood} />
        {[-0.18, 0.18].flatMap((x) => [-0.17, 0.17].map((z) => <Box key={`${x}${z}`} pos={[x, 0.22, z]} size={[0.04, 0.44, 0.04]} color={DN.woodDark} />))}
        <Box pos={[0, 0.8, -0.19]} size={[0.44, 0.3, 0.04]} color={DN.wood} />
      </group>
      {/* 맛조수 발판: 등받이 없는 나무 벤치 */}
      <group position={[CHEF_POS[0], 0, CHEF_POS[2]]}>
        <Box pos={[0, CHEF_POS[1] - 0.03, 0]} size={[0.9, 0.06, 0.36]} color={DN.wood} />
        {[-0.36, 0.36].map((x) => (
          <Box key={x} pos={[x, (CHEF_POS[1] - 0.06) / 2, 0]} size={[0.06, CHEF_POS[1] - 0.06, 0.3]} color={DN.woodDark} />
        ))}
      </group>
    </group>
  );
};

// ---------- 찬장·냉장고 앞 ----------

const PN = { floorA: '#F3E8D2', floorB: '#CFE0CF', wall: '#FBE6B4', shelf: '#B07A4C', back: '#9A6A43', cabinet: '#C99561', top: '#E5B985', drawer: '#B98352', knob: '#6B4A33', fridge: '#F3F1EC', fridgeIn: '#EEF8FF' };

/** 찬장 선반 위 물건 하나 (원점 = 선반 위) */
const ShelfItem: React.FC<{ kind: 'jar' | 'tall' | 'sack' | 'bottle' | 'bowls' | 'tin'; x: number; y: number; color: string }> = ({ kind, x, y, color }) => {
  const z = WALL_Z + 0.16;
  switch (kind) {
    case 'jar':
      return (
        <group>
          <Cyl pos={[x, y + 0.08, z]} r={0.07} h={0.16} color={color} seg={12} shadow={false} />
          <Cyl pos={[x, y + 0.175, z]} r={0.072} h={0.03} color="#E8553A" seg={12} shadow={false} />
        </group>
      );
    case 'tall':
      return (
        <group>
          <Cyl pos={[x, y + 0.12, z]} r={0.06} h={0.24} color={color} seg={12} shadow={false} />
          <Cyl pos={[x, y + 0.255, z]} r={0.062} h={0.03} color="#8C5A35" seg={12} shadow={false} />
        </group>
      );
    case 'sack':
      return (
        <group>
          <Box pos={[x, y + 0.11, z]} size={[0.2, 0.22, 0.16]} color={color} shadow={false} />
          <Box pos={[x, y + 0.11, z + 0.081]} size={[0.12, 0.08, 0.004]} color="#FFFDF5" shadow={false} />
        </group>
      );
    case 'bottle':
      return (
        <group>
          <Cyl pos={[x, y + 0.1, z]} r={0.04} h={0.2} color={color} seg={10} shadow={false} />
          <Cyl pos={[x, y + 0.23, z]} r={0.015} r2={0.035} h={0.06} color={color} seg={10} shadow={false} />
        </group>
      );
    case 'bowls':
      return (
        <group>
          {[0, 1, 2].map((k) => (
            <Cyl key={k} pos={[x, y + 0.025 + k * 0.035, z]} r={0.1} r2={0.07} h={0.035} color={k % 2 ? '#FFFFFF' : color} seg={14} shadow={false} />
          ))}
        </group>
      );
    case 'tin':
      return <Cyl pos={[x, y + 0.07, z]} r={0.065} h={0.14} color={color} seg={12} metal shadow={false} />;
  }
};

const SHELF_ROWS: { y: number; items: [Parameters<typeof ShelfItem>[0]['kind'], number, string][] }[] = [
  { y: 1.3, items: [['jar', -1.15, '#E4C68F'], ['jar', -0.95, '#A3683D'], ['sack', -0.62, '#D8C29A'], ['tall', -0.25, '#F5F0E6'], ['bottle', -0.02, '#4A2C1C'], ['jar', 0.3, '#E8553A'], ['jar', 0.5, '#FFC94A'], ['tin', 0.85, '#C3C8CE'], ['jar', 1.15, '#9DBDB2']] },
  { y: 1.78, items: [['bowls', -1.0, '#7FB7C9'], ['tall', -0.6, '#E4C68F'], ['tall', -0.42, '#7DBA5A'], ['sack', -0.05, '#E7D6B4'], ['jar', 0.35, '#A3683D'], ['bottle', 0.6, '#2F6B57'], ['bottle', 0.72, '#7A3B22'], ['jar', 1.05, '#F5F0E6']] },
  { y: 2.26, items: [['tin', -1.1, '#E8553A'], ['jar', -0.75, '#FFC94A'], ['jar', -0.55, '#E4C68F'], ['bowls', -0.1, '#FFFFFF'], ['tall', 0.4, '#A3683D'], ['sack', 0.8, '#D8C29A'], ['jar', 1.15, '#7DBA5A']] },
];

const FRIDGE = { x: -1.68, w: 0.74, d: 0.68, h: 2.0 };

export const PantrySet: React.FC = () => {
  const sx0 = -1.25;
  const sx1 = 1.4;
  const cx0 = FRIDGE.x + FRIDGE.w / 2 + 0.02;
  const cx1 = 1.6;
  const depth = COUNTER_FRONT - WALL_Z;
  const cz = WALL_Z + depth / 2;
  const fz = WALL_Z + FRIDGE.d / 2 + 0.02;
  const fFront = fz + FRIDGE.d / 2;
  return (
    <group>
      {/* 바닥: 크림·연두 바둑판 */}
      <Floor pattern={{ kind: 'check', a: PN.floorA, b: PN.floorB }} cell={0.5} />
      <Box pos={[0, 1.7, WALL_Z - 0.05]} size={[6.5, 3.4, 0.1]} color={PN.wall} shadow={false} />
      {/* 찬장: 뒤판·옆판·선반 */}
      <Box pos={[(sx0 + sx1) / 2, 1.98, WALL_Z + 0.01]} size={[sx1 - sx0, 1.5, 0.02]} color={PN.back} shadow={false} />
      {[sx0, (sx0 + sx1) / 2 + 0.05, sx1].map((x) => (
        <Box key={x} pos={[x, 1.98, WALL_Z + 0.16]} size={[0.045, 1.5, 0.3]} color={PN.shelf} />
      ))}
      {[1.28, 1.76, 2.24, 2.72].map((y) => (
        <Box key={y} pos={[(sx0 + sx1) / 2, y, WALL_Z + 0.16]} size={[sx1 - sx0 + 0.1, 0.04, 0.32]} color={PN.shelf} />
      ))}
      {SHELF_ROWS.flatMap((row) => row.items.map(([kind, x, color], i) => <ShelfItem key={`${row.y}-${i}`} kind={kind} x={x} y={row.y + 0.02} color={color} />))}
      {/* 조리대: 서랍장 + 나무 상판 */}
      <Box pos={[(cx0 + cx1) / 2, (COUNTER_TOP - 0.05) / 2, cz]} size={[cx1 - cx0, COUNTER_TOP - 0.05, depth]} color={PN.cabinet} />
      {Array.from({ length: 5 }, (_, i) => {
        const dw = (cx1 - cx0) / 5;
        const x = cx0 + dw * (i + 0.5);
        return (
          <group key={i}>
            <Box pos={[x, 0.72, COUNTER_FRONT + 0.012]} size={[dw - 0.05, 0.22, 0.02]} color={PN.drawer} />
            <Box pos={[x, 0.32, COUNTER_FRONT + 0.012]} size={[dw - 0.05, 0.48, 0.02]} color={PN.drawer} />
            <Cyl pos={[x, 0.72, COUNTER_FRONT + 0.03]} r={0.022} h={0.02} rot={[Math.PI / 2, 0, 0]} color={PN.knob} seg={10} />
          </group>
        );
      })}
      <Box pos={[(cx0 + cx1) / 2, COUNTER_TOP - 0.025, cz + 0.02]} size={[cx1 - cx0 + 0.04, 0.05, depth + 0.06]} color={PN.top} />
      {/* 조리대 왼쪽: 옹기 항아리 두 개 */}
      <Cyl pos={[-1.12, COUNTER_TOP + 0.13, -1.36]} r={0.12} r2={0.1} h={0.26} color="#7A4A2E" seg={14} />
      <Cyl pos={[-1.12, COUNTER_TOP + 0.27, -1.36]} r={0.1} h={0.03} color="#5E3822" seg={14} />
      <Cyl pos={[-0.86, COUNTER_TOP + 0.08, -1.42]} r={0.08} r2={0.065} h={0.16} color="#8A5636" seg={12} />
      <Cyl pos={[-0.86, COUNTER_TOP + 0.17, -1.42]} r={0.065} h={0.025} color="#5E3822" seg={12} />
      {/* 열린 냉장고 (왼쪽): 몸통 껍데기 + 빛나는 안쪽 + 칸 + 열린 문 */}
      <group position={[FRIDGE.x, 0, fz]}>
        <Box pos={[0, FRIDGE.h / 2, -FRIDGE.d / 2 + 0.02]} size={[FRIDGE.w, FRIDGE.h, 0.04]} color={PN.fridge} />
        {[-1, 1].map((s) => (
          <Box key={s} pos={[s * (FRIDGE.w / 2 - 0.02), FRIDGE.h / 2, 0]} size={[0.04, FRIDGE.h, FRIDGE.d]} color={PN.fridge} />
        ))}
        <Box pos={[0, FRIDGE.h - 0.02, 0]} size={[FRIDGE.w, 0.04, FRIDGE.d]} color={PN.fridge} />
        <Box pos={[0, 0.06, 0]} size={[FRIDGE.w, 0.12, FRIDGE.d]} color={PN.fridge} />
        <Glow pos={[0, 1.05, -FRIDGE.d / 2 + 0.045]} size={[FRIDGE.w - 0.08, 1.85, 0.01]} color={PN.fridgeIn} intensity={0.9} />
        {[0.55, 0.95, 1.35].map((y) => (
          <Box key={y} pos={[0, y, 0]} size={[FRIDGE.w - 0.08, 0.02, FRIDGE.d - 0.06]} color="#D8EEF8" shadow={false} />
        ))}
        <Box pos={[0, 1.72, 0]} size={[FRIDGE.w - 0.06, 0.03, FRIDGE.d]} color="#E2E0DA" shadow={false} />
        {/* 칸마다 음식 */}
        <Cyl pos={[-0.18, 0.66, 0.02]} r={0.06} h={0.2} color="#FFFFFF" seg={10} shadow={false} />
        <Cyl pos={[-0.05, 0.64, 0.05]} r={0.05} h={0.16} color="#7DBA5A" seg={10} shadow={false} />
        <Box pos={[0.15, 0.62, 0.04]} size={[0.24, 0.12, 0.18]} color="#FFC94A" shadow={false} />
        <Ball pos={[-0.12, 1.02, 0.06]} r={0.07} color="#8CC46A" seg={9} />
        <Box pos={[0.14, 1.01, 0.05]} size={[0.22, 0.1, 0.2]} color="#F6EEDC" shadow={false} />
        {[-0.05, 0.03, 0.11, 0.19].map((x) => (
          <Ball key={x} pos={[x, 1.08, 0.05]} r={0.024} color="#F4E1C1" scale={[1, 1.25, 1]} seg={8} shadow={false} />
        ))}
        <Cyl pos={[-0.15, 1.44, 0.05]} r={0.07} h={0.1} color="#E8553A" seg={12} shadow={false} />
        <Cyl pos={[0.12, 1.45, 0.05]} r={0.06} h={0.12} color="#9DBDB2" seg={12} shadow={false} />
      </group>
      {/* 냉장고 안 불빛이 바닥에 번진 자리 (조명을 더하지 않고 빛나는 판으로: 렌더가 느려지지 않게) */}
      <mesh position={[FRIDGE.x + 0.05, 0.003, fFront + 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.45, 20]} />
        <meshBasicMaterial color="#EAF6FF" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* 열린 문: 왼쪽 경첩에서 앞으로 활짝 */}
      <group position={[FRIDGE.x - FRIDGE.w / 2, 0, fFront]} rotation={[0, -1.95, 0]}>
        <Box pos={[FRIDGE.w / 2, FRIDGE.h / 2 + 0.03, 0.04]} size={[FRIDGE.w, FRIDGE.h - 0.1, 0.07]} color={PN.fridge} />
        {[0.6, 1.1, 1.55].map((y) => (
          <Box key={y} pos={[FRIDGE.w / 2, y, -0.03]} size={[FRIDGE.w - 0.12, 0.08, 0.06]} color="#E6EEF2" shadow={false} />
        ))}
        <Cyl pos={[0.25, 0.75, -0.04]} r={0.03} h={0.2} color="#2F6B57" seg={8} />
        <Cyl pos={[0.38, 0.75, -0.04]} r={0.03} h={0.22} color="#FFFFFF" seg={8} />
        <Cyl pos={[0.52, 0.73, -0.04]} r={0.03} h={0.18} color="#E8553A" seg={8} />
      </group>
      {/* 바닥의 쌀자루 (오른쪽) */}
      <Box pos={[1.95, 0.22, -1.25]} size={[0.42, 0.44, 0.32]} color="#E7D6B4" />
      <Box pos={[1.95, 0.25, -1.088]} size={[0.24, 0.14, 0.004]} color="#E8553A" shadow={false} />
      {/* 맛조수 발판: 두 칸 계단 의자 */}
      <group position={[CHEF_POS[0], 0, CHEF_POS[2]]}>
        <Box pos={[0, CHEF_POS[1] - 0.025, -0.04]} size={[0.5, 0.05, 0.34]} color="#7CC6A4" />
        <Box pos={[0, 0.2, 0.17]} size={[0.5, 0.04, 0.16]} color="#7CC6A4" />
        {[-0.23, 0.23].map((x) => (
          <Box key={x} pos={[x, (CHEF_POS[1] - 0.05) / 2, 0]} size={[0.04, CHEF_POS[1] - 0.05, 0.42]} color="#5FA886" />
        ))}
      </group>
    </group>
  );
};

// ---------- 연구실 칠판 ----------

const LB = { floorA: '#DADDE0', floorB: '#CDD1D5', wall: '#DCEBE6', board: '#2F5A47', frame: '#B07A4C', chalk: '#F4F1E8', cabinet: '#F4F2EE', top: '#3A4048', steel: '#C3C8CE' };

/** 칠판 분필 선 하나 */
const Chalk: React.FC<{ pos: Vec3; len: number; rot?: number; thick?: number }> = ({ pos, len, rot = 0, thick = 0.014 }) => (
  <mesh position={pos} rotation={[0, 0, rot]}>
    <boxGeometry args={[len, thick, 0.004]} />
    <meshStandardMaterial color={LB.chalk} emissive={LB.chalk} emissiveIntensity={0.15} roughness={1} transparent opacity={0.85} />
  </mesh>
);

const BOARD = { x0: -1.85, x1: 0.8, y0: 1.18, y1: 2.42 };

export const LabSet: React.FC = () => {
  const bz = WALL_Z + 0.02;
  const bcx = (BOARD.x0 + BOARD.x1) / 2;
  const bcy = (BOARD.y0 + BOARD.y1) / 2;
  const depth = COUNTER_FRONT - WALL_Z;
  const cz = WALL_Z + depth / 2;
  const x0 = -2.25;
  const x1 = 1.6;
  return (
    <group>
      <Floor pattern={{ kind: 'check', a: LB.floorA, b: LB.floorB }} cell={0.6} />
      <Box pos={[0, 1.7, WALL_Z - 0.05]} size={[6.5, 3.4, 0.1]} color={LB.wall} shadow={false} />
      <Box pos={[0, 0.06, WALL_Z - 0.01]} size={[6.5, 0.12, 0.02]} color="#9FB5AE" shadow={false} />
      {/* 칠판 + 나무 테 + 분필 받침 */}
      <Box pos={[bcx, bcy, bz]} size={[BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0, 0.03]} color={LB.board} shadow={false} />
      {[BOARD.y0, BOARD.y1].map((y) => (
        <Box key={y} pos={[bcx, y, bz + 0.02]} size={[BOARD.x1 - BOARD.x0 + 0.1, 0.05, 0.05]} color={LB.frame} shadow={false} />
      ))}
      {[BOARD.x0, BOARD.x1].map((x) => (
        <Box key={x} pos={[x, bcy, bz + 0.02]} size={[0.05, BOARD.y1 - BOARD.y0 + 0.05, 0.05]} color={LB.frame} shadow={false} />
      ))}
      <Box pos={[bcx, BOARD.y0 + 0.01, bz + 0.07]} size={[BOARD.x1 - BOARD.x0, 0.025, 0.08]} color={LB.frame} shadow={false} />
      <Box pos={[-0.2, BOARD.y0 + 0.035, bz + 0.07]} size={[0.07, 0.012, 0.012]} color={LB.chalk} shadow={false} />
      <Box pos={[-0.08, BOARD.y0 + 0.035, bz + 0.07]} size={[0.06, 0.012, 0.012]} color="#FFC94A" shadow={false} />
      <Box pos={[0.35, BOARD.y0 + 0.05, bz + 0.07]} size={[0.16, 0.04, 0.06]} color="#4A3A33" shadow={false} />
      {/* 분필 낙서 (글씨 없이 간단한 그림만: 분자 모양 · 불꽃 · 밑줄) — 칠판 가장자리에만 */}
      <group position={[-1.45, 2.12, bz + 0.018]}>
        <Chalk pos={[0.09, 0.045, 0]} len={0.2} rot={0.45} />
        <Chalk pos={[0.1, -0.06, 0]} len={0.2} rot={-0.5} />
        {[
          [0, 0, 0.05],
          [0.19, 0.09, 0.035],
          [0.19, -0.12, 0.035],
        ].map(([x, y, r], i) => (
          <mesh key={i} position={[x!, y!, 0]}>
            <torusGeometry args={[r!, 0.007, 4, 18]} />
            <meshStandardMaterial color={LB.chalk} emissive={LB.chalk} emissiveIntensity={0.15} transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
      <group position={[0.45, 1.5, bz + 0.018]}>
        <Chalk pos={[-0.05, 0.08, 0]} len={0.2} rot={1.2} />
        <Chalk pos={[0.05, 0.08, 0]} len={0.2} rot={-1.2} />
        <Chalk pos={[0, -0.02, 0]} len={0.2} />
      </group>
      <Chalk pos={[0.32, 2.2, bz + 0.018]} len={0.5} />
      <Chalk pos={[0.27, 2.12, bz + 0.018]} len={0.36} />
      {/* 오른쪽 벽 선반: 플라스크·비커 */}
      {[1.3, 1.72].map((y) => (
        <Box key={y} pos={[1.3, y, WALL_Z + 0.12]} size={[0.75, 0.035, 0.24]} color={LB.frame} />
      ))}
      <Glass pos={[1.08, 1.4, WALL_Z + 0.12]} r={0.06} h={0.17} />
      <Cyl pos={[1.08, 1.365, WALL_Z + 0.12]} r={0.054} h={0.09} color="#7CC6A4" seg={12} />
      <mesh position={[1.32, 1.39, WALL_Z + 0.12]}>
        <coneGeometry args={[0.08, 0.15, 12, 1, true]} />
        <meshStandardMaterial color="#DDEFF7" transparent opacity={0.4} depthWrite={false} side={2} />
      </mesh>
      <mesh position={[1.32, 1.35, WALL_Z + 0.12]}>
        <coneGeometry args={[0.058, 0.08, 12]} />
        <meshStandardMaterial color="#FFC94A" roughness={0.4} />
      </mesh>
      <Glass pos={[1.32, 1.5, WALL_Z + 0.12]} r={0.02} h={0.08} />
      <Glass pos={[1.55, 1.39, WALL_Z + 0.12]} r={0.045} h={0.15} />
      <Cyl pos={[1.55, 1.35, WALL_Z + 0.12]} r={0.04} h={0.07} color="#E8553A" seg={12} />
      <Cyl pos={[1.1, 1.82, WALL_Z + 0.12]} r={0.07} h={0.16} color="#F5F0E6" seg={12} />
      <Cyl pos={[1.1, 1.915, WALL_Z + 0.12]} r={0.072} h={0.03} color="#2F6B57" seg={12} />
      <Box pos={[1.42, 1.83, WALL_Z + 0.12]} size={[0.3, 0.2, 0.16]} color="#7FB7C9" />
      {/* 실험대: 흰 서랍장 + 짙은 상판 */}
      <Box pos={[(x0 + x1) / 2, (COUNTER_TOP - 0.05) / 2, cz]} size={[x1 - x0, COUNTER_TOP - 0.05, depth]} color={LB.cabinet} />
      {Array.from({ length: 6 }, (_, i) => {
        const dw = (x1 - x0) / 6;
        const x = x0 + dw * (i + 0.5);
        return (
          <group key={i}>
            <Box pos={[x, 0.45, COUNTER_FRONT + 0.012]} size={[dw - 0.05, 0.72, 0.02]} color="#E6E3DD" />
            <Box pos={[x, 0.76, COUNTER_FRONT + 0.03]} size={[0.14, 0.022, 0.025]} color={LB.steel} />
          </group>
        );
      })}
      <Box pos={[(x0 + x1) / 2, COUNTER_TOP - 0.025, cz + 0.02]} size={[x1 - x0 + 0.04, 0.05, depth + 0.06]} color={LB.top} />
      {/* 실험용 버너 판 (팬이 놓이는 곳) */}
      <Box pos={[-1.0, COUNTER_TOP + 0.006, -1.16]} size={[0.5, 0.012, 0.44]} color="#C3C8CE" />
      <Cyl pos={[-1.08, COUNTER_TOP + 0.014, -1.14]} r={0.1} h={0.01} color="#26272B" seg={20} />
      {/* 실험대 왼쪽 끝: 시험관 꽂이 */}
      <group position={[-1.72, COUNTER_TOP, -1.25]}>
        <Box pos={[0, 0.06, 0]} size={[0.34, 0.02, 0.1]} color={LB.frame} />
        <Box pos={[0, 0.005, 0]} size={[0.34, 0.01, 0.1]} color={LB.frame} />
        {[
          [-0.12, '#E8553A'],
          [-0.04, '#7CC6A4'],
          [0.04, '#FFC94A'],
          [0.12, '#7FB7C9'],
        ].map(([x, c]) => (
          <group key={x as number}>
            <Glass pos={[x as number, 0.09, 0]} r={0.016} h={0.17} />
            <Cyl pos={[x as number, 0.05, 0]} r={0.014} h={0.08} color={c as string} seg={8} />
          </group>
        ))}
      </group>
      {/* 맛조수 발판: 둥근 실험실 의자 */}
      <group position={[CHEF_POS[0], 0, CHEF_POS[2]]}>
        <Cyl pos={[0, CHEF_POS[1] - 0.03, 0]} r={0.24} h={0.06} color="#E8553A" seg={20} />
        <Cyl pos={[0, (CHEF_POS[1] - 0.06) / 2, 0]} r={0.03} h={CHEF_POS[1] - 0.06} color={LB.steel} seg={10} metal />
        <Cyl pos={[0, 0.02, 0]} r={0.2} h={0.03} color={LB.steel} seg={16} metal />
      </group>
    </group>
  );
};

/** 장소별 무대 하나 */
export const PlaceSet: React.FC<{ place: Place; dayTime: DayTime; table?: TableDress }> = ({ place, dayTime, table }) => {
  switch (place) {
    case 'market':
      return <MarketSet />;
    case 'dining':
      return <DiningSet dayTime={dayTime} table={table} />;
    case 'pantry':
      return <PantrySet />;
    case 'lab':
      return <LabSet />;
    case 'kitchen':
      return <KitchenSet dayTime={dayTime} />;
  }
};
