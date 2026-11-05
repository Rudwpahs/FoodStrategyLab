import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { CatmullRomCurve3, Color, Object3D, Vector3, type BufferGeometry, type InstancedMesh } from 'three';
import type { FoodPiece, FoodProfile, IngredientProp, PieceShape } from '@mat-lab/recipe-core';
import { Plate } from './Kitchen.tsx';
import { BURNER } from './layout.ts';
import { moundGeometry, pancakeGeometry, pieceGeometry, sauceGeometry, seeded } from './foodShapes.ts';

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

/** 윤기 있는 음식 표면 (양념·기름이 묻은 것처럼). gloss 0~1 */
const Glossy: React.FC<{ color?: string; gloss: number; rough?: number; side?: 0 | 2 }> = ({ color = '#FFFFFF', gloss, rough = 0.62, side = 0 }) => (
  <meshPhysicalMaterial color={color} roughness={rough - gloss * 0.3} clearcoat={gloss} clearcoatRoughness={0.28} side={side} />
);

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
  });
  if (!items.length) return null;
  return (
    <instancedMesh key={`${geometry.uuid}:${items.length}`} ref={ref} args={[geometry, undefined, items.length]} castShadow={shadows} receiveShadow={shadows}>
      <Glossy gloss={gloss} rough={rough} side={side} />
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
function cookedTone(color: string, cook: number): string {
  return mix(color, '#6B3A1A', cook * 0.22);
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
      byVariant[i % 3]!.push({ p: [Math.cos(a) * rr, y, Math.sin(a) * rr], r: leafFix, s: sc, c: jitter(cookedTone(piece.color, o.cook), rnd()) });
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
  const pieces = piecesOf(food);
  const groups = useMemo(() => layoutPieces(pieces, { radius, mound, cook: Math.round(cook * 20) / 20, garnish, size, amount }), [pieces, radius, mound, cook, garnish, size, amount]);
  const sauceColor = mix(food.rawColor, food.cookedColor, cook);
  const nutty = pieces[0]?.shape === 'nut';
  return (
    // 볶을 때 조각이 들썩인다
    <group position={[Math.sin(jiggle) * 0.006, Math.abs(Math.sin(jiggle * 1.3)) * 0.008, Math.cos(jiggle * 0.8) * 0.005]}>
      {sauce && (
        // 양념은 익을수록 넓게 퍼지고 진해진다 (처음엔 기름만 살짝)
        <mesh geometry={sauceGeometry(7)} scale={[radius * (0.55 + 0.45 * cook), Math.max(0.004, mound * (nutty ? 0.4 : 0.8) * (0.3 + 0.7 * cook)), radius * (0.55 + 0.45 * cook)]} receiveShadow>
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

/** 도자기 그릇: 유약 윤기, 둥근 테두리, 굽 */
export const Bowl: React.FC<{ children?: React.ReactNode; liquid?: string; position?: [number, number, number] }> = ({ children, liquid, position = [0, 0.02, 0] }) => (
  <group position={position}>
    <mesh position={[0, 0.07, 0]} rotation={[Math.PI, 0, 0]} castShadow receiveShadow>
      <sphereGeometry args={[0.14, 56, 28, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshPhysicalMaterial color="#F7F3EA" roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.15} side={2} />
    </mesh>
    <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.14, 0.005, 10, 64]} />
      <meshPhysicalMaterial color="#EFE9DD" roughness={0.3} clearcoat={0.8} />
    </mesh>
    <mesh position={[0, -0.062, 0]}>
      <cylinderGeometry args={[0.055, 0.05, 0.016, 40]} />
      <M color="#E9E2D3" rough={0.5} />
    </mesh>
    {liquid && <Broth color={liquid} radius={0.13} y={0.05} oil={!isWater(liquid)} />}
    <group position={[0, 0.05, 0]}>{children}</group>
  </group>
);

// ---------- 음식 ----------

/** 전·부침개: 들쭉날쭉한 원판 + 건더기 + 노릇한 자국. flip(0~1)이면 뒤집는다. */
const Pancake: React.FC<{ food: FoodProfile; cook: number; flip?: number; soggy?: boolean }> = ({ food, cook, flip = 0, soggy }) => {
  const spots = useBits(9, 0.11, 21);
  const color = soggy ? mix(food.rawColor, '#B8A27A', 0.4) : mix(food.rawColor, food.cookedColor, cook);
  const groups = useMemo(() => layoutPieces(piecesOf(food).filter((p) => p.shape !== 'seed'), { radius: 0.13, mound: 0, cook: Math.round(cook * 10) / 10, amount: 0.7, size: 0.8, seed: 9 }), [food, cook]);
  const lift = Math.sin(flip * Math.PI) * 0.16;
  return (
    <group position={[0, 0.012 + lift, 0]} rotation={[flip * Math.PI, 0, 0]} scale={[1, soggy ? 0.55 : 1, 1]}>
      <mesh geometry={pancakeGeometry(3)} scale={[0.15, 0.022, 0.15]} castShadow receiveShadow>
        <Glossy color={color} gloss={soggy ? 0.9 : 0.25 + cook * 0.4} rough={soggy ? 0.3 : 0.75} />
      </mesh>
      {/* 반죽 속에 반쯤 잠긴 건더기 */}
      <group position={[0, 0.004, 0]} scale={[1, 0.6, 1]}>
        {groups.map((g) => (
          <Scatter key={`${g.shape}${g.variant}`} geometry={pieceGeometry(g.shape, g.variant)} items={g.items} gloss={0.3} side={g.shape === 'leaf' ? 2 : 0} />
        ))}
      </group>
      {cook > 0.55 &&
        !soggy &&
        spots.map((b, i) => (
          <mesh key={i} position={[b.x, 0.0118, b.z]} rotation={[-Math.PI / 2, 0, b.rot]} scale={[b.s * 1.6, b.s, 1]}>
            <circleGeometry args={[0.014, 16]} />
            <meshStandardMaterial color={mix(food.cookedColor, '#7A4A1C', 0.35)} transparent opacity={Math.min(0.7, (cook - 0.55) * 2)} depthWrite={false} roughness={0.6} />
          </mesh>
        ))}
    </group>
  );
};

/** 나물·잎채소: 구겨진 잎 조각 더미 */
const Leaves: React.FC<{ color: string; count?: number; radius?: number; mound?: number; seed?: number; gloss?: number }> = ({ color, count = 12, radius = 0.11, mound = 0.05, seed = 5, gloss = 0.3 }) => {
  const groups = useMemo(() => layoutPieces([{ shape: 'leaf', color }], { radius, mound, cook: 0, amount: count / 11, size: 1.1, seed }), [color, count, radius, mound, seed]);
  return (
    <group>
      {groups.map((g) => (
        <Scatter key={g.variant} geometry={pieceGeometry('leaf', g.variant)} items={g.items.map((it) => ({ ...it, c: mix(it.c, '#2F6E2A', (it.p[0] * 31 + it.p[2] * 17) % 1 > 0.5 ? 0.25 : 0) }))} gloss={gloss} side={2} />
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
            <Glossy color="#FFFDF6" gloss={0.6} rough={0.4} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.045, 0.06, 1]}>
            <circleGeometry args={[1, 32]} />
            <M color="#FFFDF6" rough={0.45} />
          </mesh>
          <mesh position={[0, 0.003, 0]} scale={[0.024, 0.008, 0.028]}>
            <sphereGeometry args={[1, 28, 16]} />
            <Glossy color="#F6B526" gloss={0.4} rough={0.5} />
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

/** 면: 서로 엉킨 가는 가닥 */
const Noodles: React.FC<{ color: string; radius?: number; height?: number }> = ({ color, radius = 0.08, height = 0.03 }) => {
  const curves = useMemo(() => {
    const rnd = seeded(11);
    return Array.from({ length: 22 }, () => {
      const pts = Array.from({ length: 7 }, (_, k) => {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * radius;
        return new Vector3(Math.cos(a) * r, (k % 2) * height * rnd() + rnd() * height * 0.5, Math.sin(a) * r);
      });
      return new CatmullRomCurve3(pts);
    });
  }, [radius, height]);
  return (
    <group>
      {curves.map((c, i) => (
        <mesh key={i} castShadow>
          <tubeGeometry args={[c, 64, 0.0042, 6, false]} />
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
          <Leaves color={mix(food.rawColor, food.cookedColor, cook)} radius={0.12} mound={0.008} gloss={0.6} />
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
export const PlatedFood: React.FC<{ food: FoodProfile | null; failed?: boolean; frame: number; origin: [number, number, number] }> = ({ food, failed, frame, origin }) => (
  <group position={origin}>
    <Plate />
    {food && <PlateContent food={food} failed={failed} frame={frame} />}
  </group>
);

const PlateContent: React.FC<{ food: FoodProfile; failed?: boolean; frame: number }> = ({ food, failed, frame }) => {
  const top = [0, 0.022, 0] as [number, number, number];
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
            <Leaves color={failed ? '#7C8A4A' : food.cookedColor} count={18} radius={0.1} mound={failed ? 0.015 : 0.05} gloss={failed ? 0.9 : 0.45} />
            <group position={[0, failed ? 0.015 : 0.05, 0]}>
              <Medley food={{ ...food, pieces: food.pieces.filter((p) => p.shape === 'seed') }} cook={0} radius={0.05} mound={0.01} sauce={false} garnish={garnish} />
            </group>
          </group>
        );
      case 'soup':
        return (
          <Bowl liquid={failed ? '#D8CBB0' : food.liquidColor ?? food.cookedColor}>
            <group position={[0, -0.006, 0]}>
              <Medley food={food} cook={1} radius={0.1} mound={0.004} sauce={false} size={0.8} amount={0.7} garnish={garnish} />
            </group>
          </Bowl>
        );
      case 'noodles':
        return (
          <Bowl liquid={food.liquidColor}>
            <Noodles color={food.cookedColor} radius={0.09} height={0.035} />
          </Bowl>
        );
      case 'rice':
        return food.topping ? (
          <Bowl>
            <RiceBed />
            {/* 밥 한쪽 위에 볶은 고명 (밥이 보이게) */}
            <group position={[0.015, 0.048, 0.022]}>
              <Medley food={food} cook={failed ? 0.3 : 1} radius={0.075} mound={0.028} size={0.72} amount={0.75} garnish={garnish} />
            </group>
          </Bowl>
        ) : (
          <Bowl>
            <RiceBed />
          </Bowl>
        );
      default:
        return (
          <group position={top}>
            <Medley food={food} cook={failed ? 0.3 : 1} radius={0.12} mound={0.04} garnish={garnish} />
          </group>
        );
    }
  })();
  return (
    <group>
      {content}
      {!failed && <Steam origin={[0, 0.07, 0]} frame={frame} />}
    </group>
  );
};


/** 김: 반투명 구슬이 올라가며 사라진다 */
export const Steam: React.FC<{ origin: [number, number, number]; frame: number; amount?: number }> = ({ origin, frame, amount = 6 }) => {
  const pts = useBits(amount, 0.08, 17);
  return (
    <group position={origin}>
      {pts.map((p, i) => {
        const t = ((frame + i * 11) % 60) / 60;
        return (
          <mesh key={i} position={[p.x + Math.sin(t * 6 + i) * 0.02, t * 0.35, p.z]} scale={0.025 + t * 0.04}>
            <sphereGeometry args={[1, 24, 16]} />
            <meshStandardMaterial color="#FFFFFF" transparent opacity={0.35 * (1 - t)} depthWrite={false} />
          </mesh>
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
