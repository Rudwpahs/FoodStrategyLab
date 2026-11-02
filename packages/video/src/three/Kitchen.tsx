import React from 'react';
import { BURNER, CHEF_POS, COUNTER_TOP } from './layout.ts';

/** 로우폴리(블록) 스타일 연구소 주방. 모두 상자·원기둥으로 만든다. */

type BoxProps = { pos: [number, number, number]; size: [number, number, number]; color: string; rot?: [number, number, number]; shadow?: boolean; emissive?: string };

export const Box: React.FC<BoxProps> = ({ pos, size, color, rot, shadow = true, emissive }) => (
  <mesh position={pos} rotation={rot} castShadow={shadow} receiveShadow>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={0.85} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 0.6 : 0} />
  </mesh>
);

type CylProps = { pos: [number, number, number]; r: number; h: number; color: string; seg?: number; rot?: [number, number, number]; r2?: number; metal?: boolean };

export const Cyl: React.FC<CylProps> = ({ pos, r, h, color, seg = 20, rot, r2, metal }) => (
  <mesh position={pos} rotation={rot} castShadow receiveShadow>
    <cylinderGeometry args={[r, r2 ?? r, h, seg]} />
    <meshStandardMaterial color={color} roughness={metal ? 0.35 : 0.8} metalness={metal ? 0.5 : 0} />
  </mesh>
);

const WALL_Z = -1.62;
const LEFT_X = -2.3;
const C = {
  floorA: '#B9784A',
  floorB: '#A86B41',
  wainscot: '#F5F2EA',
  wall: '#FFF1DC',
  cabinet: '#9DBDB2',
  cabinetDark: '#86A89C',
  top: '#D9A468',
  steel: '#C3C8CE',
  black: '#26272B',
  wood: '#C08552',
};

const Floor: React.FC = () => (
  <group>
    {Array.from({ length: 16 }, (_, i) => (
      <Box key={i} pos={[-3 + i * 0.4 + 0.2, -0.025, 0.5]} size={[0.395, 0.05, 5]} color={i % 2 ? C.floorA : C.floorB} shadow={false} />
    ))}
  </group>
);

const Walls: React.FC = () => (
  <group>
    {/* 뒷벽: 아래 판넬 + 위 벽 */}
    <Box pos={[0, 1.9, WALL_Z - 0.05]} size={[6, 2.6, 0.1]} color={C.wall} shadow={false} />
    {Array.from({ length: 30 }, (_, i) => (
      <Box key={i} pos={[-3 + i * 0.2 + 0.1, 0.55, WALL_Z]} size={[0.185, 1.1, 0.04]} color={C.wainscot} shadow={false} />
    ))}
    {/* 왼쪽 벽 + 창문 */}
    <Box pos={[LEFT_X - 0.05, 1.6, 0]} size={[0.1, 3.2, 5]} color={C.wall} shadow={false} />
    <Box pos={[LEFT_X + 0.01, 1.55, 0.05]} size={[0.02, 0.9, 1.1]} color="#BFE3FF" emissive="#BFE3FF" shadow={false} />
    <Box pos={[LEFT_X + 0.03, 1.1, 0.05]} size={[0.08, 0.06, 1.2]} color="#FFFFFF" />
    <Box pos={[LEFT_X + 0.03, 2.0, 0.05]} size={[0.08, 0.06, 1.2]} color="#FFFFFF" />
    <Box pos={[LEFT_X + 0.03, 1.55, -0.52]} size={[0.08, 0.96, 0.06]} color="#FFFFFF" />
    <Box pos={[LEFT_X + 0.03, 1.55, 0.62]} size={[0.08, 0.96, 0.06]} color="#FFFFFF" />
    <Box pos={[LEFT_X + 0.03, 1.55, 0.05]} size={[0.06, 0.9, 0.04]} color="#FFFFFF" />
    <Box pos={[LEFT_X + 0.02, 1.4, 0.3]} size={[0.02, 0.12, 0.3]} color="#FFFFFF" emissive="#FFFFFF" shadow={false} />
  </group>
);

const Counter: React.FC = () => {
  const x0 = -2.25;
  const x1 = 1.5;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const depth = 0.66;
  const cz = WALL_Z + depth / 2;
  const front = WALL_Z + depth;
  return (
    <group>
      <Box pos={[cx, (COUNTER_TOP - 0.05) / 2, cz]} size={[w, COUNTER_TOP - 0.05, depth]} color={C.cabinet} />
      {/* 문짝·손잡이 */}
      {Array.from({ length: 6 }, (_, i) => {
        const dw = w / 6;
        const x = x0 + dw * i + dw / 2;
        return (
          <group key={i}>
            <Box pos={[x, 0.45, front + 0.012]} size={[dw - 0.05, 0.72, 0.02]} color={C.cabinetDark} />
            <Box pos={[x + dw / 2 - 0.1, 0.7, front + 0.035]} size={[0.025, 0.12, 0.03]} color={C.black} />
          </group>
        );
      })}
      {/* 조리대 상판 */}
      <Box pos={[cx, COUNTER_TOP - 0.025, cz + 0.02]} size={[w + 0.04, 0.05, depth + 0.06]} color={C.top} />
      {/* 가스레인지 */}
      <Box pos={[BURNER[0] + 0.12, COUNTER_TOP + 0.005, cz + 0.02]} size={[0.78, 0.02, 0.58]} color={C.steel} />
      <Cyl pos={[BURNER[0], COUNTER_TOP + 0.02, BURNER[2]]} r={0.07} h={0.015} color={C.black} />
      <Cyl pos={[BURNER[0] + 0.32, COUNTER_TOP + 0.02, BURNER[2] - 0.22]} r={0.06} h={0.015} color={C.black} />
      {[0, 1].map((k) => (
        <group key={k} position={[BURNER[0] + k * 0.32, COUNTER_TOP + 0.04, BURNER[2] - k * 0.22]}>
          <Box pos={[0, 0, 0]} size={[0.3, 0.02, 0.025]} color={C.black} />
          <Box pos={[0, 0, 0]} size={[0.025, 0.02, 0.3]} color={C.black} />
        </group>
      ))}
      {[0, 1, 2].map((k) => (
        <Cyl key={k} pos={[BURNER[0] - 0.12 + k * 0.14, 0.82, front + 0.03]} r={0.025} h={0.03} rot={[Math.PI / 2, 0, 0]} color={C.black} />
      ))}
      {/* 도마 */}
      <Box pos={[-0.32, COUNTER_TOP + 0.012, -1.3]} size={[0.36, 0.025, 0.24]} color="#E8C28E" />
    </group>
  );
};

const JARS = [
  { x: -1.65, h: 0.22, color: '#A3683D' },
  { x: -1.42, h: 0.28, color: '#E4C68F' },
  { x: -1.2, h: 0.2, color: '#9DBDB2' },
  { x: -0.2, h: 0.24, color: '#E8553A' },
  { x: 0.02, h: 0.18, color: '#FFC94A' },
  { x: 0.8, h: 0.26, color: '#A3683D' },
  { x: 1.02, h: 0.2, color: '#E4C68F' },
];

const Shelf: React.FC = () => (
  <group>
    <Box pos={[-0.35, 1.78, WALL_Z + 0.13]} size={[3.2, 0.045, 0.26]} color={C.wood} />
    {[-1.7, 1.0].map((x) => (
      <Box key={x} pos={[x, 1.7, WALL_Z + 0.06]} size={[0.04, 0.14, 0.12]} color={C.wood} />
    ))}
    {JARS.map((j) => (
      <group key={j.x}>
        <Cyl pos={[j.x, 1.8 + j.h / 2, WALL_Z + 0.13]} r={0.075} h={j.h} color="#F7F4EE" seg={14} />
        <Cyl pos={[j.x, 1.8 + j.h * 0.38, WALL_Z + 0.13]} r={0.077} h={j.h * 0.7} color={j.color} seg={14} />
        <Cyl pos={[j.x, 1.8 + j.h + 0.025, WALL_Z + 0.13]} r={0.07} h={0.05} color="#8C5A35" seg={14} />
      </group>
    ))}
    {/* 벽걸이 조리도구 */}
    <Box pos={[0.45, 1.45, WALL_Z + 0.02]} size={[0.6, 0.03, 0.03]} color={C.black} />
    {[0.25, 0.45, 0.65].map((x, i) => (
      <group key={x}>
        <Box pos={[x, 1.33, WALL_Z + 0.04]} size={[0.025, 0.22, 0.015]} color={i === 1 ? C.wood : C.steel} />
        <Box pos={[x, 1.2, WALL_Z + 0.04]} size={[0.07, 0.07, 0.015]} color={i === 1 ? C.wood : C.steel} />
      </group>
    ))}
  </group>
);

const Fridge: React.FC = () => (
  <group>
    <Box pos={[1.95, 1.0, -1.25]} size={[0.75, 2.0, 0.72]} color="#F3F1EC" />
    <Box pos={[1.95, 1.32, -0.885]} size={[0.73, 0.01, 0.01]} color="#C9C6BE" />
    <Box pos={[1.65, 1.55, -0.86]} size={[0.03, 0.3, 0.04]} color={C.steel} />
    <Box pos={[1.65, 0.95, -0.86]} size={[0.03, 0.3, 0.04]} color={C.steel} />
  </group>
);

/** 캐릭터가 올라서는 나무 발판 */
const Stool: React.FC = () => (
  <group position={[CHEF_POS[0], 0, CHEF_POS[2]]}>
    <Box pos={[0, CHEF_POS[1] - 0.03, 0]} size={[0.5, 0.06, 0.4]} color={C.wood} />
    {[-1, 1].map((s) => (
      <Box key={s} pos={[s * 0.2, (CHEF_POS[1] - 0.06) / 2, 0]} size={[0.06, CHEF_POS[1] - 0.06, 0.36]} color="#A86F42" />
    ))}
  </group>
);

/** 접시 (원점 = 접시 바닥) */
export const Plate: React.FC = () => (
  <group>
    <Cyl pos={[0, 0.01, 0]} r={0.2} r2={0.15} h={0.02} color="#FFFFFF" seg={32} />
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <torusGeometry args={[0.185, 0.008, 6, 40]} />
      <meshStandardMaterial color="#F0ECE4" />
    </mesh>
  </group>
);

export const KitchenSet: React.FC = () => (
  <group>
    <color attach="background" args={['#FFF1DC']} />
    <hemisphereLight args={['#FFF7EA', '#B9784A', 1.15]} />
    <directionalLight
      position={[-3.2, 4.2, 2.6]}
      intensity={2.3}
      color="#FFF4E0"
      castShadow
      shadow-mapSize={[1024, 1024]}
      shadow-camera-left={-3}
      shadow-camera-right={3}
      shadow-camera-top={3}
      shadow-camera-bottom={-3}
      shadow-bias={-0.0008}
    />
    <ambientLight intensity={0.25} />
    <Floor />
    <Walls />
    <Counter />
    <Shelf />
    <Fridge />
    <Stool />
  </group>
);
