import React, { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { CatmullRomCurve3, Color, Object3D, Vector3, type BufferGeometry, type InstancedMesh, type Texture } from 'three';
import type { FoodPiece, FoodProfile, IngredientProp, PieceShape } from '@mat-lab/recipe-core';
import { BURNER } from './layout.ts';
import { moundGeometry, pancakeGeometry, pieceGeometry, plateGeometry, sauceGeometry, seeded, steamTexture, wiltedGeometry } from './foodShapes.ts';

/**
 * 음식·그릇에만 비치는 주변 반사(코드로 만든 밝은 방, KitchenScene이 넣어 준다).
 * 윤기는 '비친 빛'이 있어야 보인다: 예전에는 반사할 주변이 없어 양념·유약이 광택 없이 칠한 색처럼 보였다.
 * 무대(벽·가구)에는 넣지 않는다 — 화면 전체가 뿌옇게 밝아지지 않게, 그리고 그리는 비용을 음식에만 쓰게.
 */
export const FoodEnv = createContext<Texture | null>(null);

function mix(a: string, b: string, t: number): string {
  return '#' + new Color(a).lerp(new Color(b), Math.max(0, Math.min(1, t))).getHexString();
}

const M: React.FC<{ color: string; rough?: number; opacity?: number; emissive?: string; metal?: number }> = ({ color, rough = 0.75, opacity, emissive, metal = 0 }) => (
  <meshStandardMaterial
    color={color}
    roughness={rough}
    metalness={metal}
    transparent={opacity !== undefined}
    opacity={opacity ?? 1}
    emissive={emissive ?? '#000000'}
    emissiveIntensity={emissive ? 0.9 : 0}
  />
);

/**
 * 윤기 있는 음식 표면 (양념·기름이 묻은 것처럼). gloss 0~1.
 * 윤기가 셀수록 겉면 막(클리어코트)이 매끈해져 반사 하이라이트가 또렷해진다. 너무 세면 기름져 보이므로 반사 세기는 절제한다.
 */
const Glossy: React.FC<{ color?: string; gloss: number; rough?: number; side?: 0 | 2; vertexColors?: boolean }> = ({ color = '#FFFFFF', gloss, rough = 0.62, side = 0, vertexColors = false }) => {
  const env = useContext(FoodEnv);
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={rough - gloss * 0.3}
      // 윤기가 거의 없으면 겉 막을 끈다 (겉 막 계산은 화소마다 반사를 한 번 더 계산해 소프트웨어 렌더에서 비싸다)
      clearcoat={gloss < 0.15 ? 0 : gloss}
      clearcoatRoughness={0.3 - gloss * 0.22}
      envMap={env}
      envMapIntensity={0.35 + gloss * 0.75}
      side={side}
      vertexColors={vertexColors}
    />
  );
};

/** 건더기 조각 위치 (원판 위에 흩뿌림) */
function useBits(count: number, radius: number, seed: number) {
  return useMemo(() => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, () => {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * radius;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, rot: rnd() * Math.PI, s: 0.6 + rnd() * 0.6, c: rnd() };
    });
  }, [count, radius, seed]);
}

// ---------- 같은 모양 여러 개를 한 번에 그리기 ----------

type V3 = [number, number, number];
interface Inst {
  p: V3;
  r: V3;
  s: V3;
  c: string;
}

/** 같은 모양 조각을 한 번에 그린다 (조각마다 위치·회전·크기·색이 다름) */
const Scatter: React.FC<{ geometry: BufferGeometry; items: Inst[]; gloss?: number; rough?: number; side?: 0 | 2; shadows?: boolean }> = ({ geometry, items, gloss = 0, rough, side, shadows = true }) => {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    const col = new Color();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.rotation.set(...it.r);
      o.scale.set(...it.s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    // 조각이 바뀔 때만 다시 쓴다 (밥알은 1500개라 매 프레임 쓰면 휴대폰 미리보기가 끊긴다)
  }, [items, geometry]);
  if (!items.length) return null;
  return (
    <instancedMesh key={`${geometry.uuid}:${items.length}`} ref={ref} args={[geometry, undefined, items.length]} castShadow={shadows} receiveShadow={shadows}>
      {/* 모양에 꼭짓점 색(틈 그늘·줄기 색)이 있으면 조각 색에 곱한다 */}
      <Glossy gloss={gloss} rough={rough} side={side} vertexColors={geometry.hasAttribute('color')} />
    </instancedMesh>
  );
};

// ---------- 건더기 배치 ----------

/** 모양별 크기(반지름 기준, 팬 크기 기준)와 개수 */
const PIECE_SPEC: Record<PieceShape, { size: number; count: number; flat: boolean; layer: number }> = {
  bean: { size: 0.0095, count: 120, flat: false, layer: 0 },
  leaf: { size: 0.04, count: 14, flat: true, layer: 0 },
  strip: { size: 0.055, count: 12, flat: true, layer: 1 },
  chunk: { size: 0.018, count: 16, flat: false, layer: 1 },
  nut: { size: 0.021, count: 18, flat: false, layer: 1 },
  cube: { size: 0.026, count: 9, flat: false, layer: 2 },
  slice: { size: 0.015, count: 10, flat: true, layer: 2 },
  curl: { size: 0.017, count: 6, flat: true, layer: 2 },
  ring: { size: 0.0085, count: 14, flat: true, layer: 3 },
  seed: { size: 0.0042, count: 36, flat: true, layer: 4 },
};

/** 익힘 정도에 따라 살짝 갈색으로 */
function cookedTone(color: string, cook: number, glazed = false): string {
  // 조청·설탕 시럽에 조린 견과는 갈색이 아니라 투명한 호박색(앰버)으로 진해진다
  return glazed ? mix(color, '#B0661C', cook * 0.4) : mix(color, '#6B3A1A', cook * 0.22);
}

/** 조각 색에 자연스러운 얼룩 */
function jitter(color: string, t: number): string {
  return t < 0.5 ? mix(color, '#FFFFFF', (0.5 - t) * 0.16) : mix(color, '#2A1A0E', (t - 0.5) * 0.18);
}

interface LayoutOpts {
  radius: number;
  /** 가운데가 볼록한 높이 */
  mound: number;
  cook: number;
  /** 조각 수 배율 */
  amount?: number;
  /** 조각 크기 배율 */
  size?: number;
  seed?: number;
  /** 깨 같은 고명을 올릴지 */
  garnish?: boolean;
}

/** 레시피 재료로 건더기 조각들을 만든다. 모양별로 묶어서 돌려준다. */
function layoutPieces(pieces: FoodPiece[], o: LayoutOpts): { shape: PieceShape; variant: number; items: Inst[] }[] {
  const rnd = seeded(o.seed ?? 3);
  const groups: { shape: PieceShape; variant: number; items: Inst[] }[] = [];
  const amount = o.amount ?? 1;
  const size = o.size ?? 1;
  for (const piece of pieces) {
    if (piece.shape === 'seed' && !o.garnish) continue;
    const spec = PIECE_SPEC[piece.shape];
    const count = Math.max(2, Math.round(spec.count * amount * (pieces.length > 3 ? 0.8 : 1)));
    // 같은 재료도 모양 3가지를 섞는다
    const byVariant: Inst[][] = [[], [], []];
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * o.radius * 0.92;
      const h = o.mound * Math.max(0, 1 - (rr / o.radius) ** 2);
      const s = spec.size * size * (0.75 + rnd() * 0.5);
      const y = h + spec.layer * 0.003 + s * (spec.flat ? 0.3 : 0.55);
      const r: V3 = spec.flat
        ? [(piece.shape === 'ring' || piece.shape === 'curl' ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.7, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5]
        : [rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI];
      const sc: V3 = [s, s, s];
      const leafFix: V3 = piece.shape === 'leaf' ? [-Math.PI / 2 + (rnd() - 0.5) * 0.6, r[1], 0] : r;
      byVariant[i % 3]!.push({ p: [Math.cos(a) * rr, y, Math.sin(a) * rr], r: leafFix, s: sc, c: jitter(cookedTone(piece.color, o.cook, piece.shape === 'nut'), rnd()) });
    }
    byVariant.forEach((items, variant) => items.length && groups.push({ shape: piece.shape, variant, items }));
  }
  return groups;
}

/** 재료 모양 정보가 없을 때: 익은 색 덩어리 + 재료 색 */
function piecesOf(food: FoodProfile): FoodPiece[] {
  if (food.pieces?.length) return food.pieces;
  const colors = [food.cookedColor, ...food.bits];
  return colors.slice(0, 3).map((color) => ({ shape: 'chunk' as const, color }));
}

/** 볶음·고명·국 건더기: 윤기 나는 양념 위에 실제 썬 모양 조각들 */
const Medley: React.FC<{ food: FoodProfile; cook: number; jiggle?: number; radius?: number; mound?: number; sauce?: boolean; garnish?: boolean; size?: number; amount?: number }> = ({
  food,
  cook,
  jiggle = 0,
  radius = 0.15,
  mound = 0.035,
  sauce = true,
  garnish = false,
  size = 1,
  amount = 1,
}) => {
  const pieces = useMemo(() => piecesOf(food), [food]);
  // 익힘은 20단계로만 반영한다: 조리 장면에서 매 프레임 조각을 다시 배치하지 않게
  const cookStep = Math.round(cook * 20) / 20;
  const groups = useMemo(() => layoutPieces(pieces, { radius, mound, cook: cookStep, garnish, size, amount }), [pieces, radius, mound, cookStep, garnish, size, amount]);
  const nutty = pieces[0]?.shape === 'nut';
  const sauceColor = mix(food.rawColor, food.cookedColor, cook);
  return (
    // 볶을 때 조각이 들썩인다
    <group position={[Math.sin(jiggle) * 0.006, Math.abs(Math.sin(jiggle * 1.3)) * 0.008, Math.cos(jiggle * 0.8) * 0.005]}>
      {/* 견과(호두정과)는 시럽 판을 깔지 않는다: 알맹이 윤기만으로 조린 느낌을 내고, 판은 팬 가득 주황 원판처럼 보였다 (2026-11-20 견본) */}
      {sauce && !nutty && (
        // 양념은 익을수록 넓게 퍼지고 진해진다 (처음엔 기름만 살짝)
        <mesh geometry={sauceGeometry(7)} scale={[radius * (0.55 + 0.45 * cook), Math.max(0.004, mound * 0.8 * (0.3 + 0.7 * cook)), radius * (0.55 + 0.45 * cook)]} receiveShadow>
          <Glossy color={sauceColor} gloss={0.35 + 0.55 * cook} rough={0.55} />
        </mesh>
      )}
      {groups.map((g) => (
        <Scatter
          key={`${g.shape}${g.variant}`}
          geometry={pieceGeometry(g.shape, g.variant)}
          items={g.items}
          gloss={g.shape === 'seed' ? 0.1 : (nutty ? 0.9 : 0.25) + 0.45 * cook}
          side={g.shape === 'leaf' || g.shape === 'curl' ? 2 : 0}
        />
      ))}
    </group>
  );
};

// ---------- 조리 도구 ----------

export const Pan: React.FC<{ children?: React.ReactNode; shake?: number }> = ({ children, shake = 0 }) => (
  <group position={[BURNER[0], BURNER[1] + 0.03, BURNER[2]]} rotation={[0, 0, shake]}>
    <mesh castShadow receiveShadow>
      <cylinderGeometry args={[0.2, 0.17, 0.045, 64]} />
      <M color="#2E3036" rough={0.45} metal={0.3} />
    </mesh>
    <mesh position={[0, 0.0235, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[0.185, 48]} />
      <meshPhysicalMaterial color="#33363D" roughness={0.38} metalness={0.25} clearcoat={0.4} clearcoatRoughness={0.4} />
    </mesh>
    <mesh position={[0, 0.0225, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.2, 0.006, 8, 64]} />
      <M color="#45484F" rough={0.35} metal={0.4} />
    </mesh>
    <mesh position={[0.33, 0.02, 0.06]} rotation={[0, -0.2, 0.08]} castShadow>
      <boxGeometry args={[0.28, 0.025, 0.04]} />
      <M color="#3B2A20" />
    </mesh>
    <group position={[0, 0.025, 0]}>{children}</group>
  </group>
);

/** 맑은 물(데치기·삶기)인지: 파르스름한 색 */
function isWater(color: string): boolean {
  const c = new Color(color);
  return c.b > c.r && c.b > 0.7;
}

/** 국물 표면: 윤기 + 기름 방울 */
const Broth: React.FC<{ color: string; radius: number; y?: number; oil?: boolean }> = ({ color, radius, y = 0, oil = true }) => {
  const drops = useBits(14, radius * 0.8, 41);
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[radius, 48]} />
        {/* 맑은 물은 투명하게(냄비 바닥이 비친다), 국물은 진하게 */}
        <meshPhysicalMaterial color={color} roughness={0.2} clearcoat={oil ? 0.7 : 0.35} clearcoatRoughness={0.12} transparent opacity={oil ? 0.94 : 0.45} depthWrite={oil} />
      </mesh>
      {oil &&
        drops.map((d, i) => (
          <mesh key={i} position={[d.x, 0.0008, d.z]} rotation={[-Math.PI / 2, 0, 0]} scale={0.006 + d.s * 0.007}>
            <circleGeometry args={[1, 16]} />
            <meshPhysicalMaterial color={mix(color, '#F2B23A', 0.45)} roughness={0.05} clearcoat={1} transparent opacity={0.55} depthWrite={false} />
          </mesh>
        ))}
    </group>
  );
};

export const Pot: React.FC<{ children?: React.ReactNode; liquid?: string }> = ({ children, liquid }) => (
  <group position={[BURNER[0], BURNER[1] + 0.03, BURNER[2]]}>
    <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[0.17, 0.16, 0.17, 64, 1, true]} />
      <meshStandardMaterial color="#C7CCD3" roughness={0.3} metalness={0.55} side={2} />
    </mesh>
    <mesh position={[0, 0.165, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.17, 0.006, 8, 64]} />
      <M color="#D5D9DF" rough={0.25} metal={0.6} />
    </mesh>
    <mesh position={[0, 0.005, 0]} receiveShadow>
      <cylinderGeometry args={[0.16, 0.16, 0.01, 64]} />
      <M color="#AEB3BA" />
    </mesh>
    {[-1, 1].map((s) => (
      <mesh key={s} position={[s * 0.2, 0.13, 0]} castShadow>
        <boxGeometry args={[0.06, 0.02, 0.05]} />
        <M color="#26272B" />
      </mesh>
    ))}
    {liquid && <Broth color={liquid} radius={0.165} y={0.13} oil={!isWater(liquid)} />}
    <group position={[0, 0.13, 0]}>{children}</group>
  </group>
);

// ---------- 그릇 ----------

/**
 * 그릇 종류: 흰 백자 · 짙은 돌그릇 · 놋그릇(유기).
 * 음식과 그릇의 밝기 대비가 커야 음식이 또렷하다(흰 달걀을 흰 접시에 두면 밋밋하다) → tablewareFor가 음식 색으로 고른다.
 */
export type Ware = 'white' | 'stone' | 'brass';
const WARE: Record<Ware, { color: string; rim: string; rough: number; clearcoat: number; metal: number }> = {
  white: { color: '#F7F4EE', rim: '#E9E4DA', rough: 0.3, clearcoat: 0.8, metal: 0 },
  stone: { color: '#34302D', rim: '#4A4440', rough: 0.45, clearcoat: 0.45, metal: 0 },
  brass: { color: '#C99A4E', rim: '#B98A40', rough: 0.32, clearcoat: 0.2, metal: 0.85 },
};

const lum = (hex: string) => {
  const c = new Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

/** 음식이 놓일 그릇: 밝은 음식(달걀·크림 파스타·흰밥)은 짙은 그릇(밥은 놋그릇), 진한 색 음식은 흰 백자 */
export function tablewareFor(food: FoodProfile): Ware {
  const main = food.kind === 'egg' ? '#FFFDF6' : food.kind === 'noodles' || food.kind === 'soup' ? (food.liquidColor ?? food.cookedColor) : food.kind === 'rice' && !food.topping ? '#FFFFFF' : food.cookedColor;
  if (lum(main) < 0.62) return 'white';
  return food.kind === 'rice' ? 'brass' : 'stone';
}

const WareMaterial: React.FC<{ ware: Ware; side?: 0 | 2; rim?: boolean }> = ({ ware, side = 0, rim }) => {
  const env = useContext(FoodEnv);
  const w = WARE[ware];
  return <meshPhysicalMaterial color={rim ? w.rim : w.color} roughness={w.rough} metalness={w.metal} clearcoat={w.clearcoat} clearcoatRoughness={0.15} envMap={env} envMapIntensity={ware === 'brass' ? 1.1 : 0.7} side={side} />;
};

/** 접시 (원점 = 접시 바닥). 굽·바닥·올라온 테두리가 있는 돌림판 모양 */
export const Plate: React.FC<{ ware?: Ware }> = ({ ware = 'white' }) => (
  <mesh geometry={plateGeometry()} castShadow receiveShadow>
    <WareMaterial ware={ware} side={2} />
  </mesh>
);

/** 그릇: 유약 윤기, 둥근 테두리, 굽 */
export const Bowl: React.FC<{ children?: React.ReactNode; liquid?: string; position?: [number, number, number]; ware?: Ware }> = ({ children, liquid, position = [0, 0.02, 0], ware = 'white' }) => (
  <group position={position}>
    <mesh position={[0, 0.07, 0]} rotation={[Math.PI, 0, 0]} castShadow receiveShadow>
      <sphereGeometry args={[0.14, 56, 28, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <WareMaterial ware={ware} side={2} />
    </mesh>
    <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.14, 0.005, 10, 64]} />
      <WareMaterial ware={ware} rim />
    </mesh>
    <mesh position={[0, -0.062, 0]}>
      <cylinderGeometry args={[0.055, 0.05, 0.016, 40]} />
      <WareMaterial ware={ware} rim />
    </mesh>
    {liquid && <Broth color={liquid} radius={0.13} y={0.05} oil={!isWater(liquid)} />}
    <group position={[0, 0.05, 0]}>{children}</group>
  </group>
);

// ---------- 음식 ----------

/**
 * 전 뒤집기 회전(라디안): 공중에서 한 바퀴 돌아 윗면(건더기·노릇한 자국)이 다시 위로 오게 착지한다.
 * (반 바퀴만 돌리면 뒤집힌 면을 따로 그려야 하고, 끝난 뒤 원래 면으로 되돌리면 한 프레임에 튀어 보였다)
 */
export const pancakeTurn = (flip: number) => flip * Math.PI * 2;

/** 전·부침개: 들쭉날쭉한 원판 + 건더기 + 노릇한 자국. flip(0~1)이면 뒤집는다. */
const Pancake: React.FC<{ food: FoodProfile; cook: number; flip?: number; soggy?: boolean }> = ({ food, cook, flip = 0, soggy }) => {
  const color = soggy ? mix(food.rawColor, '#B8A27A', 0.4) : mix(food.rawColor, food.cookedColor, cook);
  const cookStep = Math.round(cook * 10) / 10;
  const groups = useMemo(() => layoutPieces(piecesOf(food).filter((p) => p.shape !== 'seed'), { radius: 0.13, mound: 0, cook: cookStep, amount: 0.7, size: 0.8, seed: 9 }), [food, cookStep]);
  const lift = Math.sin(flip * Math.PI) * 0.16;
  return (
    <group position={[0, 0.012 + lift, 0]} rotation={[pancakeTurn(flip), 0, 0]} scale={[1, soggy ? 0.55 : 1, 1]}>
      {/* 꼭짓점 색으로 가장자리·자국이 노릇해진다: 익을수록 색이 진해지고, 눅눅한 실패작은 노릇함 없이 */}
      <mesh geometry={pancakeGeometry(3)} scale={[0.15, 0.022, 0.15]} castShadow receiveShadow>
        <Glossy color={color} gloss={soggy ? 0.9 : 0.3 + cook * 0.45} rough={soggy ? 0.3 : 0.7} vertexColors={!soggy && cook > 0.3} />
      </mesh>
      {/* 반죽 속에 반쯤 잠긴 건더기 */}
      <group position={[0, 0.004, 0]} scale={[1, 0.6, 1]}>
        {groups.map((g) => (
          <Scatter key={`${g.shape}${g.variant}`} geometry={pieceGeometry(g.shape, g.variant)} items={g.items} gloss={0.3} side={g.shape === 'leaf' ? 2 : 0} />
        ))}
      </group>
    </group>
  );
};

/**
 * 나물·잎채소: 데쳐서 무친 가닥(길쭉하고 비틀린 잎 + 연두색 줄기)을 가운데가 봉긋하게 소복이 쌓는다.
 * strands=false면 예전처럼 넓은 잎 조각 (생 잎채소 소품)
 */
const Leaves: React.FC<{ color: string; count?: number; radius?: number; mound?: number; seed?: number; gloss?: number; strands?: boolean }> = ({
  color,
  count = 12,
  radius = 0.11,
  mound = 0.05,
  seed = 5,
  gloss = 0.3,
  strands = false,
}) => {
  const groups = useMemo(
    () =>
      layoutPieces([{ shape: 'leaf', color }], { radius, mound, cook: 0, amount: count / 11, size: strands ? 1.9 : 1.1, seed }).map((g) => ({
        ...g,
        items: g.items.map((it) => ({ ...it, c: mix(it.c, '#1E5419', (it.p[0] * 31 + it.p[2] * 17) % 1 > 0.5 ? 0.3 : 0.08) })),
      })),
    [color, count, radius, mound, seed, strands],
  );
  return (
    <group>
      {groups.map((g) => (
        <Scatter key={g.variant} geometry={strands ? wiltedGeometry(g.variant) : pieceGeometry('leaf', g.variant)} items={g.items} gloss={gloss} side={2} />
      ))}
    </group>
  );
};

const Eggs: React.FC<{ count?: number; halved?: boolean }> = ({ count = 3, halved }) => (
  <group>
    {Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      const x = Math.cos(a) * 0.07;
      const z = Math.sin(a) * 0.07;
      return halved ? (
        <group key={i} position={[x, 0.045, z]} rotation={[0, a, 0]}>
          {/* 단면이 위를 보는 반쪽 달걀 */}
          <mesh scale={[0.045, 0.035, 0.06]} castShadow>
            <sphereGeometry args={[1, 32, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
            <Glossy color="#FFFEFA" gloss={0.7} rough={0.35} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.045, 0.06, 1]}>
            <circleGeometry args={[1, 32]} />
            <M color="#FBF8F0" rough={0.5} />
          </mesh>
          {/* 반숙 노른자: 진한 주황, 가운데가 촉촉하게 반짝인다 (테두리는 조금 더 익은 노랑) */}
          <mesh position={[0, 0.002, 0]} scale={[0.026, 0.006, 0.031]}>
            <sphereGeometry args={[1, 28, 16]} />
            <Glossy color="#F4B53A" gloss={0.3} rough={0.6} />
          </mesh>
          <mesh position={[0, 0.004, 0]} scale={[0.019, 0.008, 0.023]}>
            <sphereGeometry args={[1, 28, 16]} />
            <Glossy color="#E98A12" gloss={1} rough={0.3} />
          </mesh>
        </group>
      ) : (
        <mesh key={i} position={[x, 0, z]} rotation={[0.4, a, 0.3]} scale={[0.04, 0.052, 0.04]} castShadow>
          <sphereGeometry args={[1, 32, 24]} />
          <Glossy color="#FFF3E0" gloss={0.3} rough={0.5} />
        </mesh>
      );
    })}
  </group>
);

/**
 * 면: 서로 엉킨 가는 가닥. nest면 접시에 돌돌 말아 올린 둥지 모양(파스타를 담는 흔한 방식)으로,
 * 가닥이 가운데로 갈수록 높이 감겨 올라간다. (예전: 짧고 굵은 가닥이 흩어져 감자튀김처럼 보였다)
 */
const Noodles: React.FC<{ color: string; radius?: number; height?: number; nest?: boolean }> = ({ color, radius = 0.08, height = 0.03, nest = false }) => {
  const curves = useMemo(() => {
    const rnd = seeded(11);
    if (nest) {
      return Array.from({ length: 34 }, (_, k) => {
        const start = rnd() * Math.PI * 2;
        const turns = 1.2 + rnd() * 0.9;
        const pts = Array.from({ length: 16 }, (_, i) => {
          const t = i / 15;
          const a = start + t * turns * Math.PI * 2;
          // 바깥(아래)에서 시작해 안쪽(위)으로 감긴다
          const r = radius * (1 - t * 0.78) * (0.85 + rnd() * 0.25);
          const y = height * (0.15 + t * 0.95) * (1 - (r / radius) ** 2 * 0.4) + (rnd() - 0.5) * 0.006 + (k % 3) * 0.002;
          return new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        });
        return new CatmullRomCurve3(pts);
      });
    }
    return Array.from({ length: 30 }, () => {
      const pts = Array.from({ length: 10 }, (_, k) => {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * radius;
        return new Vector3(Math.cos(a) * r, (k % 2) * height * rnd() + rnd() * height * 0.5, Math.sin(a) * r);
      });
      return new CatmullRomCurve3(pts);
    });
  }, [radius, height, nest]);
  return (
    <group>
      {curves.map((c, i) => (
        <mesh key={i} castShadow>
          <tubeGeometry args={[c, nest ? 96 : 80, nest ? 0.0032 : 0.0034, 6, false]} />
          <Glossy color={mix(color, '#FFFFFF', (i % 3) * 0.05)} gloss={0.6} rough={0.45} />
        </mesh>
      ))}
    </group>
  );
};

/** 밥: 울퉁불퉁한 바탕 위에 밥알 수백 개 */
const RiceBed: React.FC<{ radius?: number; height?: number; grains?: number }> = ({ radius = 0.11, height = 0.07, grains = 1500 }) => {
  const items = useMemo(() => {
    const rnd = seeded(23);
    const shades = ['#FFFFFF', '#FBF8EF', '#F5F0E2', '#FFFEF8'];
    return Array.from({ length: grains }, (): Inst => {
      const a = rnd() * Math.PI * 2;
      const y = rnd() ** 0.85;
      const ring = Math.sqrt(1 - y * y);
      const lift = 1 + rnd() * 0.04;
      const s = 0.0082 * (0.85 + rnd() * 0.3);
      return { p: [Math.cos(a) * ring * radius * lift, y * height * lift, Math.sin(a) * ring * radius * lift], r: [rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI], s: [s, s, s], c: shades[Math.floor(rnd() * shades.length)]! };
    });
  }, [radius, height, grains]);
  return (
    <group>
      <mesh geometry={moundGeometry(5)} scale={[radius * 0.98, height * 0.97, radius * 0.98]} receiveShadow castShadow>
        <M color="#F6F2E7" rough={0.8} />
      </mesh>
      <Scatter geometry={pieceGeometry('grain')} items={items} gloss={0.3} rough={0.5} shadows={false} />
    </group>
  );
};

const Bubbles: React.FC<{ frame: number; on: boolean }> = ({ frame, on }) => {
  const pts = useBits(10, 0.12, 13);
  if (!on) return null;
  return (
    <group>
      {pts.map((p, i) => {
        const t = ((frame + i * 7) % 24) / 24;
        return (
          <mesh key={i} position={[p.x, 0.004, p.z]} scale={[0.012 * Math.sin(t * Math.PI), 0.007 * Math.sin(t * Math.PI), 0.012 * Math.sin(t * Math.PI)]}>
            <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial color="#FFFFFF" roughness={0.05} clearcoat={1} transparent opacity={0.55} />
          </mesh>
        );
      })}
    </group>
  );
};

/** 가스레인지 위 조리 중인 음식 */
export const CookingFood: React.FC<{ food: FoodProfile; cook: number; frame: number; stirring: boolean; flip: number; showFood: boolean }> = ({ food, cook, frame, stirring, flip, showFood }) => {
  const boiling = showFood && cook > 0.05;
  if (!showFood) return food.vessel === 'pan' ? <Pan /> : <Pot liquid={food.kind === 'rice' ? undefined : food.liquidColor} />;
  const jiggle = stirring ? frame / 3 : 0;
  // 덮밥 고명·볶음은 팬에서 볶는다
  if (food.topping || food.kind === 'stirfry' || food.kind === 'generic') {
    return (
      <Pan shake={stirring ? Math.sin(frame / 3) * 0.02 : 0}>
        <Medley food={food} cook={cook} jiggle={jiggle} />
      </Pan>
    );
  }
  switch (food.kind) {
    case 'pancake':
      return (
        <Pan shake={stirring ? Math.sin(frame / 3) * 0.015 : 0}>
          <Pancake food={food} cook={cook} flip={flip} />
        </Pan>
      );
    case 'egg':
      return (
        <Pot liquid={food.liquidColor}>
          <Eggs />
          <Bubbles frame={frame} on={boiling} />
        </Pot>
      );
    case 'greens':
      return (
        <Pot liquid={food.liquidColor}>
          <Leaves color={mix(food.rawColor, food.cookedColor, cook)} count={20} radius={0.12} mound={0.008} gloss={0.6} strands />
          <Bubbles frame={frame} on={boiling} />
        </Pot>
      );
    case 'noodles':
      return (
        <Pot liquid={food.liquidColor}>
          <Noodles color={mix(food.rawColor, food.cookedColor, cook)} radius={0.12} height={0.01} />
          <Bubbles frame={frame} on={boiling} />
        </Pot>
      );
    case 'rice':
      return (
        <Pot>
          <group position={[0, -0.09, 0]}>
            <RiceBed radius={0.155} height={0.06} grains={800} />
          </group>
        </Pot>
      );
    case 'soup':
    default:
      return (
        <Pot liquid={mix('#E9DCC0', food.liquidColor ?? food.cookedColor, cook)}>
          {/* 국물 위로 살짝 떠오른 건더기 */}
          <group position={[0, -0.008, 0]}>
            <Medley food={food} cook={cook} radius={0.13} mound={0.004} sauce={false} jiggle={frame / 6} amount={0.8} />
          </group>
          <Bubbles frame={frame} on={boiling} />
        </Pot>
      );
  }
};

/** 접시에 담은 완성 음식 (실패 버전 포함) */
export const PlatedFood: React.FC<{ food: FoodProfile | null; failed?: boolean; frame: number; origin: [number, number, number] }> = ({ food, failed, frame, origin }) => {
  const ware = food ? tablewareFor(food) : 'white';
  return (
    <group position={origin}>
      <Plate ware={ware} />
      {food && <PlateContent food={food} failed={failed} frame={frame} ware={ware} />}
    </group>
  );
};

const PlateContent: React.FC<{ food: FoodProfile; failed?: boolean; frame: number; ware: Ware }> = ({ food, failed, frame, ware }) => {
  const top = [0, 0.018, 0] as [number, number, number];
  const seeds = useMemo(() => ({ ...food, pieces: food.pieces.filter((p) => p.shape === 'seed') }), [food]);
  // 깨 고명은 원본 재료에 깨가 있을 때만 (없는 재료를 그리지 않는다)
  const garnish = !failed;
  const content = (() => {
    switch (food.kind) {
      case 'pancake':
        return (
          <group position={top}>
            <Pancake food={food} cook={failed ? 0.25 : 1} soggy={failed} />
          </group>
        );
      case 'egg':
        return (
          <group position={top}>
            <Eggs count={4} halved />
          </group>
        );
      case 'greens':
        return (
          <group position={top}>
            {/* 소복하게: 가운데를 높게 쌓고 접시 가장자리는 비워 둔다. 참기름 윤기 */}
            <Leaves color={failed ? '#7C8A4A' : food.cookedColor} count={failed ? 18 : 30} radius={failed ? 0.1 : 0.085} mound={failed ? 0.015 : 0.065} gloss={failed ? 0.9 : 0.7} strands={!failed} />
            {/* 깨 고명은 원본 재료에 깨가 있을 때만 (없으면 아무것도 올리지 않는다 — 예전에는 빈 목록이 초록 덩어리로 그려졌다) */}
            {seeds.pieces.length > 0 && (
              <group position={[0, failed ? 0.015 : 0.065, 0]}>
                <Medley food={seeds} cook={0} radius={0.05} mound={0.01} sauce={false} garnish={garnish} />
              </group>
            )}
          </group>
        );
      case 'soup':
        return (
          <Bowl liquid={failed ? '#D8CBB0' : food.liquidColor ?? food.cookedColor} ware={ware}>
            <group position={[0, -0.006, 0]}>
              <Medley food={food} cook={1} radius={0.1} mound={0.004} sauce={false} size={0.8} amount={0.7} garnish={garnish} />
            </group>
          </Bowl>
        );
      case 'noodles':
        // 접시에 둥지처럼 말아 올린 면 + 소스 + 그 위에 원본 재료 건더기
        return (
          <group position={top}>
            <mesh geometry={sauceGeometry(11)} scale={[0.12, 0.006, 0.12]} receiveShadow>
              <Glossy color={food.liquidColor ?? food.cookedColor} gloss={0.75} rough={0.45} />
            </mesh>
            <Noodles color={failed ? mix(food.cookedColor, '#C9B892', 0.4) : food.cookedColor} radius={0.085} height={failed ? 0.02 : 0.05} nest />
            {!failed && (
              <group position={[0, 0.045, 0]}>
                <Medley food={food} cook={1} radius={0.045} mound={0.012} sauce={false} size={0.7} amount={0.5} garnish={garnish} />
              </group>
            )}
          </group>
        );
      case 'rice':
        return food.topping ? (
          <Bowl ware={ware}>
            <RiceBed />
            {/* 밥 한쪽 위에 볶은 고명 (밥이 보이게) */}
            <group position={[0.015, 0.048, 0.022]}>
              <Medley food={food} cook={failed ? 0.3 : 1} radius={0.075} mound={0.028} size={0.72} amount={0.75} garnish={garnish} />
            </group>
          </Bowl>
        ) : (
          <Bowl ware={ware}>
            <RiceBed />
          </Bowl>
        );
      default:
        return (
          <group position={top}>
            {/* 가지런히 소복하게: 가운데를 높이고 접시 테두리는 비운다(담음새 연구). 조청 견과는 시럽 웅덩이 없이 윤기만 */}
            <Medley food={food} cook={failed ? 0.3 : 1} radius={failed ? 0.12 : 0.09} mound={failed ? 0.03 : 0.07} amount={failed ? 1 : 1.5} garnish={garnish} sauce={failed || food.pieces[0]?.shape !== 'nut'} />
          </group>
        );
    }
  })();
  return (
    <group>
      {content}
      {!failed && <Steam origin={[0, 0.05, 0]} frame={frame} amount={7} />}
    </group>
  );
};


/**
 * 김: 흐릿한 연기 판(스프라이트)이 올라가며 커지고, 옆으로 살랑이며 흐려진다.
 * 움직이는 김은 음식을 더 뜨겁고 먹음직스럽게 보이게 한다(정지한 김 그림은 효과 없음 — Zhang 외 2024, 연구 문서 참고).
 * 예전에는 흰 공이 떠올라 회색 구슬처럼 보였다.
 */
export const Steam: React.FC<{ origin: [number, number, number]; frame: number; amount?: number }> = ({ origin, frame, amount = 6 }) => {
  const pts = useBits(amount, 0.06, 17);
  const map = steamTexture();
  const PERIOD = 84;
  return (
    <group position={origin}>
      {pts.map((p, i) => {
        const t = ((frame + (i * PERIOD) / amount) % PERIOD) / PERIOD;
        // 처음엔 빨리 나타나고 위에서 천천히 사라진다
        const alpha = Math.min(1, t * 5) * Math.pow(1 - t, 1.4);
        const sway = Math.sin(t * 5 + i * 1.7) * 0.025 * t + p.x * (1 + t);
        return (
          <sprite key={i} position={[sway, 0.01 + t * 0.3, p.z]} scale={[0.07 + t * 0.17, 0.09 + t * 0.2, 1]}>
            <spriteMaterial map={map} color="#FFFFFF" transparent opacity={0.42 * alpha} depthWrite={false} rotation={i * 1.3 + t * 0.9} toneMapped={false} />
          </sprite>
        );
      })}
    </group>
  );
};

/** 가스 불꽃 */
export const Flame: React.FC<{ frame: number; on: boolean }> = ({ frame, on }) => {
  if (!on) return null;
  return (
    <group position={[BURNER[0], BURNER[1] + 0.012, BURNER[2]]}>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const h = 0.035 + Math.sin(frame * 0.9 + i * 1.7) * 0.01;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.075, h / 2, Math.sin(a) * 0.075]}>
            <coneGeometry args={[0.012, h, 6]} />
            <M color="#5AA9FF" emissive="#3D8BFF" opacity={0.9} />
          </mesh>
        );
      })}
      <pointLight color="#FF9A4A" intensity={0.12} distance={0.5} position={[0, 0.02, 0.2]} />
    </group>
  );
};

// ---------- 재료 소품 ----------

export const IngredientModel: React.FC<{ prop: IngredientProp; position: [number, number, number]; pop: number }> = ({ prop, position, pop }) => {
  if (pop <= 0.001) return null;
  const s = pop;
  const body = (() => {
    switch (prop.shape) {
      case 'egg':
        return (
          <group>
            {[-0.035, 0.035].map((x, i) => (
              <mesh key={i} position={[x, 0.045, i * 0.02]} scale={[0.038, 0.05, 0.038]} castShadow>
                <sphereGeometry args={[1, 28, 20]} />
                <M color={prop.color} rough={0.5} />
              </mesh>
            ))}
          </group>
        );
      case 'bottle':
        return (
          <group>
            <mesh position={[0, 0.09, 0]} castShadow>
              <cylinderGeometry args={[0.045, 0.045, 0.18, 32]} />
              <M color={prop.color} rough={0.25} opacity={0.92} />
            </mesh>
            <mesh position={[0, 0.2, 0]} castShadow>
              <cylinderGeometry args={[0.018, 0.035, 0.05, 32]} />
              <M color={prop.color} rough={0.25} />
            </mesh>
            <mesh position={[0, 0.235, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.025, 32]} />
              <M color="#E8553A" />
            </mesh>
          </group>
        );
      case 'jar':
        return (
          <group>
            <mesh position={[0, 0.06, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.12, 32]} />
              <M color="#EAF2F4" rough={0.2} opacity={0.75} />
            </mesh>
            <mesh position={[0, 0.045, 0]}>
              <cylinderGeometry args={[0.046, 0.046, 0.085, 32]} />
              <M color={prop.color} />
            </mesh>
            <mesh position={[0, 0.13, 0]}>
              <cylinderGeometry args={[0.052, 0.052, 0.025, 32]} />
              <M color="#8C5A35" />
            </mesh>
          </group>
        );
      case 'cup':
        return (
          <group>
            <mesh position={[0, 0.055, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.042, 0.11, 36, 1, true]} />
              <meshStandardMaterial color="#E8F4F8" transparent opacity={0.5} side={2} />
            </mesh>
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.046, 0.042, 0.075, 36]} />
              <M color={prop.color} rough={0.15} opacity={0.7} />
            </mesh>
          </group>
        );
      case 'cloves':
        return (
          <group scale={0.7}>
          <Bowl position={[0, 0, 0]}>
            {[[-0.03, 0], [0.03, 0.01], [0, -0.03]].map(([x, z], i) => (
              <mesh key={i} position={[x!, 0.012, z!]} scale={[0.022, 0.025, 0.02]}>
                <sphereGeometry args={[1, 24, 16]} />
                <M color={prop.color} />
              </mesh>
            ))}
          </Bowl>
          </group>
        );
      case 'leaves':
        return (
          <group position={[0, 0.005, 0]}>
            <Leaves color={prop.color} count={9} radius={0.06} mound={0.035} seed={prop.label.length} gloss={0.15} />
          </group>
        );
      case 'bowl':
      default:
        return (
          <group scale={0.75}>
            {prop.piece ? (
              // 손질해 둔 재료: 썬 모양 그대로 작은 그릇에
              <Bowl position={[0, 0, 0]}>
                <group position={[0, -0.02, 0]}>
                  <PrepBowl piece={prop.piece} />
                </group>
              </Bowl>
            ) : (
              <Bowl position={[0, 0, 0]} liquid={prop.color}>
                <mesh scale={[0.1, 0.04, 0.1]}>
                  <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                  <Glossy color={prop.color} gloss={0.4} rough={0.6} />
                </mesh>
              </Bowl>
            )}
          </group>
        );
    }
  })();
  return (
    <group position={position} scale={[s, s, s]}>
      {body}
    </group>
  );
};

/** 조리대 그릇 속 손질한 재료 (예: 송송 썬 고추, 깍둑 썬 두부) */
const PrepBowl: React.FC<{ piece: FoodPiece }> = ({ piece }) => {
  const groups = useMemo(() => {
    const big = piece.shape === 'bean' || piece.shape === 'seed';
    return layoutPieces([piece], { radius: 0.1, mound: 0.035, cook: 0, amount: big ? 1.3 : 1.1, size: piece.shape === 'leaf' ? 0.9 : 1.15, seed: piece.color.length + piece.shape.length, garnish: true });
  }, [piece]);
  return (
    <group>
      {groups.map((g) => (
        <Scatter key={`${g.shape}${g.variant}`} geometry={pieceGeometry(g.shape, g.variant)} items={g.items} gloss={piece.shape === 'bean' ? 0.5 : 0.2} side={g.shape === 'leaf' || g.shape === 'curl' ? 2 : 0} />
      ))}
    </group>
  );
};
