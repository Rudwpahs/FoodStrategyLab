import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { CircleGeometry, Color, ConeGeometry, CylinderGeometry, Object3D, SphereGeometry, TorusGeometry, type BufferGeometry, type InstancedMesh } from 'three';
import type { FoodPiece, FoodProfile, IngredientProp, PieceShape } from '@mat-lab/recipe-core';
import { BURNER } from './layout.ts';
import { moundGeometry, noodleGeometry, pancakeGeometry, pieceGeometry, plateGeometry, sauceGeometry, seeded, steamTexture, wiltedGeometry } from './foodShapes.ts';
import { inkColor, inkMaterial, toonMaterial, vivid, type ToonLook } from './toon.ts';

/*
 * 음식·그릇·재료 소품은 모두 '확실한 만화풍' 한 가지로 그린다 (toon.ts):
 * 단계 음영 · 화면 기준 반짝이는 점(윤기) · 음식 색의 짙은 외곽선 · 단순한 모양 · 조금 선명한 색.
 * 어설픈 사실풍(반사 환경·잔무늬)은 가장 거부감이 큰 구간이라 쓰지 않는다 — 근거: docs/research/content-strategy/food-toon-2026-11.md
 */

function mix(a: string, b: string, t: number): string {
  return '#' + new Color(a).lerp(new Color(b), Math.max(0, Math.min(1, t))).getHexString();
}

// ---------- 모양 캐시 (같은 모양은 한 번만 만든다) ----------

const geoCache = new Map<string, BufferGeometry>();
function geo<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}
const sphere = (w = 24, h = 16) => geo(`sphere:${w}:${h}`, () => new SphereGeometry(1, w, h));
const dome = (w = 24, h = 10) => geo(`dome:${w}:${h}`, () => new SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2));
const disc = (seg = 32) => geo(`disc:${seg}`, () => new CircleGeometry(1, seg).rotateX(-Math.PI / 2));
const cyl = (top: number, bottom: number, h: number, seg = 24, open = false) => geo(`cyl:${top}:${bottom}:${h}:${seg}:${open}`, () => new CylinderGeometry(top, bottom, h, seg, 1, open));

type V3 = [number, number, number];

/**
 * 만화풍 한 덩어리: 모양 + 단계 음영 재질, ink면 같은 모양의 외곽선 껍데기도 그린다.
 * (외곽선은 부피가 있는 모양에만. 얇은 판(잎)에는 껍데기가 뜬 판처럼 보여 쓰지 않는다)
 */
const Solid: React.FC<{ geometry: BufferGeometry; look: ToonLook; ink?: boolean | string; position?: V3; rotation?: V3; scale?: V3 | number; shadows?: boolean }> = ({
  geometry,
  look,
  ink,
  position,
  rotation,
  scale,
  shadows = true,
}) => (
  <group position={position} rotation={rotation} scale={scale}>
    <mesh geometry={geometry} material={toonMaterial(look)} castShadow={shadows} receiveShadow={shadows} />
    {ink && <mesh geometry={geometry} material={inkMaterial(typeof ink === 'string' ? ink : inkColor(look.color ?? '#7A5A3A'))} />}
  </group>
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

interface Inst {
  p: V3;
  r: V3;
  s: V3;
  c: string;
}

/** 외곽선을 그릴 수 있는(부피가 있는) 조각 모양 */
const INKABLE: Record<PieceShape | 'grain', boolean> = { nut: true, cube: true, bean: true, chunk: true, ring: true, strip: true, slice: true, seed: false, leaf: false, curl: false, grain: false };

/** 같은 모양 조각을 한 번에 그린다 (조각마다 위치·회전·크기·색이 다름). ink면 외곽선 껍데기도 한 번에 */
const Scatter: React.FC<{ geometry: BufferGeometry; items: Inst[]; gloss?: number; spot?: number; side?: 0 | 2; shadows?: boolean; ink?: boolean }> = ({ geometry, items, gloss = 0, spot, side, shadows = true, ink = false }) => {
  const ref = useRef<InstancedMesh>(null);
  const inkRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D();
    const col = new Color();
    for (const m of [ref.current, inkRef.current]) {
      if (!m) continue;
      items.forEach((it, i) => {
        o.position.set(...it.p);
        o.rotation.set(...it.r);
        o.scale.set(...it.s);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
        m.setColorAt(i, col.set(vivid(it.c)));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
    // 조각이 바뀔 때만 다시 쓴다 (밥알은 1500개라 매 프레임 쓰면 휴대폰 미리보기가 끊긴다)
  }, [items, geometry, ink]);
  if (!items.length) return null;
  // 조각 색은 조각마다(인스턴스 색) 곱해지므로 재질 색은 흰색. 모양에 꼭짓점 색(틈 그늘·줄기 색)이 있으면 그것도 곱한다
  const mat = toonMaterial({ color: '#FFFFFF', gloss, spot, side, vertexColors: geometry.hasAttribute('color') });
  return (
    <>
      <instancedMesh key={`${geometry.uuid}:${items.length}`} ref={ref} args={[geometry, undefined, items.length]} material={mat} castShadow={shadows} receiveShadow={shadows} />
      {/* 외곽선: 조각 색의 짙은 톤 (회색 배율 × 조각 색) */}
      {ink && <instancedMesh key={`ink:${geometry.uuid}:${items.length}`} ref={inkRef} args={[geometry, undefined, items.length]} material={inkMaterial('#3C3C3C')} />}
    </>
  );
};

// ---------- 건더기 배치 ----------

/** 모양별 크기(반지름 기준, 팬 크기 기준)와 개수 */
const PIECE_SPEC: Record<PieceShape, { size: number; count: number; flat: boolean; layer: number }> = {
  bean: { size: 0.0095, count: 120, flat: false, layer: 0 },
  leaf: { size: 0.04, count: 14, flat: true, layer: 0 },
  strip: { size: 0.055, count: 12, flat: true, layer: 1 },
  chunk: { size: 0.018, count: 16, flat: false, layer: 1 },
  nut: { size: 0.022, count: 16, flat: false, layer: 1 },
  cube: { size: 0.026, count: 9, flat: false, layer: 2 },
  slice: { size: 0.015, count: 10, flat: true, layer: 2 },
  curl: { size: 0.017, count: 6, flat: true, layer: 2 },
  ring: { size: 0.0085, count: 14, flat: true, layer: 3 },
  seed: { size: 0.0042, count: 36, flat: true, layer: 4 },
};

/** 익힘 정도에 따라 노릇하게 (만화풍: 탁한 갈색이 아니라 따뜻한 황금빛으로) */
function cookedTone(color: string, cook: number, glazed = false): string {
  // 조청·설탕 시럽에 조린 견과는 투명한 호박색(앰버)으로 진해진다
  return glazed ? mix(color, '#9C5418', cook * 0.4) : mix(color, '#9A5420', cook * 0.2);
}

/** 조각 색에 아주 약한 차이 (만화풍이라 얼룩은 작게: 같은 재료가 한 덩어리로 붙어 보이지 않을 만큼만) */
function jitter(color: string, t: number): string {
  return t < 0.5 ? mix(color, '#FFFFFF', (0.5 - t) * 0.1) : mix(color, '#3A2410', (t - 0.5) * 0.1);
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
        : // 호두는 평평한 아랫면이 대체로 아래로 (뒤집혀 굴러다니면 덩어리처럼 보인다)
          piece.shape === 'nut'
          ? [(rnd() - 0.5) * 0.9, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.9]
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

/** 조각 모양별 윤기: 시럽 견과는 반짝, 깨는 무광 */
function pieceGloss(shape: PieceShape, nutty: boolean, cook: number): number {
  if (shape === 'seed') return 0;
  if (nutty) return 0.75 + 0.25 * cook;
  return 0.2 + 0.4 * cook;
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
  const sauceColor = mix(food.rawColor, food.cookedColor, cookStep);
  const spread = 0.55 + 0.45 * cook;
  return (
    // 볶을 때 조각이 들썩인다
    <group position={[Math.sin(jiggle) * 0.006, Math.abs(Math.sin(jiggle * 1.3)) * 0.008, Math.cos(jiggle * 0.8) * 0.005]}>
      {/* 견과(호두정과)는 시럽 판을 깔지 않는다: 알맹이 윤기만으로 조린 느낌을 내고, 판은 팬 가득 주황 원판처럼 보였다 */}
      {sauce && !nutty && (
        // 양념은 익을수록 넓게 퍼지고 진해진다 (처음엔 기름만 살짝)
        <Solid geometry={sauceGeometry(7)} scale={[radius * spread, Math.max(0.004, mound * 0.8 * (0.3 + 0.7 * cook)), radius * spread]} look={{ color: sauceColor, gloss: 0.4 + 0.5 * cookStep, spot: 0.8 }} />
      )}
      {groups.map((g) => (
        <Scatter
          key={`${g.shape}${g.variant}`}
          geometry={pieceGeometry(g.shape, g.variant)}
          items={g.items}
          gloss={pieceGloss(g.shape, nutty, cookStep)}
          spot={nutty ? 0.15 : 0.4}
          side={g.shape === 'leaf' || g.shape === 'curl' ? 2 : 0}
          ink={INKABLE[g.shape]}
        />
      ))}
    </group>
  );
};

// ---------- 조리 도구 ----------

export const Pan: React.FC<{ children?: React.ReactNode; shake?: number }> = ({ children, shake = 0 }) => (
  <group position={[BURNER[0], BURNER[1] + 0.03, BURNER[2]]} rotation={[0, 0, shake]}>
    <mesh geometry={cyl(0.2, 0.17, 0.045, 48)} material={toonMaterial({ color: '#34373E', gloss: 0.4, spot: 0.7, plain: true })} castShadow receiveShadow />
    {/* 팬 바닥: 한 톤 밝은 짙은 회색 (만화 팬은 검정 한 덩어리가 아니라 바닥이 살짝 밝다) */}
    <mesh geometry={disc(48)} position={[0, 0.0235, 0]} scale={0.185} material={toonMaterial({ color: '#41454D', plain: true, rim: 0 })} receiveShadow />
    <mesh position={[0, 0.0225, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={geo('panrim', () => new TorusGeometry(0.2, 0.006, 8, 48))} material={toonMaterial({ color: '#5A5E66', gloss: 0.6, plain: true })} />
    <mesh position={[0.33, 0.02, 0.06]} rotation={[0, -0.2, 0.08]} castShadow geometry={geo('panhandle', () => new CylinderGeometry(0.018, 0.02, 0.28, 12).rotateZ(Math.PI / 2))} material={toonMaterial({ color: '#5B3B28', gloss: 0.3, plain: true })} />
    <group position={[0, 0.025, 0]}>{children}</group>
  </group>
);

/** 맑은 물(데치기·삶기)인지: 파르스름한 색 */
function isWater(color: string): boolean {
  const c = new Color(color);
  return c.b > c.r && c.b > 0.7;
}

/** 국물·물 표면: 평평한 색 + 만화식 반사 줄무늬(흰 타원 둘) + 기름 방울 */
const Broth: React.FC<{ color: string; radius: number; y?: number; oil?: boolean }> = ({ color, radius, y = 0, oil = true }) => {
  const drops = useBits(10, radius * 0.75, 41);
  return (
    <group position={[0, y, 0]}>
      {/* 맑은 물은 반투명(냄비 바닥이 비친다), 국물은 진하게 */}
      <mesh geometry={disc(48)} scale={radius} material={toonMaterial({ color: oil ? color : mix(color, '#2F95D6', 0.75), opacity: oil ? 0.96 : 0.85, rim: 0 })} receiveShadow />
      {/* 물·국물 윤기: 만화에서 액체를 그리는 흰 반사 자국 */}
      <mesh geometry={disc(24)} position={[-radius * 0.35, 0.0012, -radius * 0.3]} rotation={[0, 0.5, 0]} scale={[radius * 0.3, 1, radius * 0.07]} material={toonMaterial({ color: '#FFFFFF', opacity: 0.55, rim: 0, plain: true })} />
      <mesh geometry={disc(16)} position={[-radius * 0.02, 0.0012, -radius * 0.48]} rotation={[0, 0.5, 0]} scale={[radius * 0.1, 1, radius * 0.035]} material={toonMaterial({ color: '#FFFFFF', opacity: 0.55, rim: 0, plain: true })} />
      {oil &&
        drops.map((d, i) => (
          <mesh key={i} geometry={disc(16)} position={[d.x, 0.0008, d.z]} scale={0.006 + d.s * 0.006} material={toonMaterial({ color: mix(color, '#FFD25A', 0.5), opacity: 0.8, rim: 0 })} />
        ))}
    </group>
  );
};

export const Pot: React.FC<{ children?: React.ReactNode; liquid?: string }> = ({ children, liquid }) => (
  <group position={[BURNER[0], BURNER[1] + 0.03, BURNER[2]]}>
    <mesh position={[0, 0.08, 0]} geometry={cyl(0.17, 0.16, 0.17, 48, true)} material={toonMaterial({ color: '#AEB5BF', gloss: 0.4, spot: 0.3, side: 2, plain: true })} castShadow receiveShadow />
    <mesh position={[0, 0.165, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={geo('potrim', () => new TorusGeometry(0.17, 0.006, 8, 48))} material={toonMaterial({ color: '#E2E5EA', gloss: 0.6, plain: true })} />
    <mesh position={[0, 0.005, 0]} geometry={cyl(0.16, 0.16, 0.01, 48)} material={toonMaterial({ color: '#AEB3BA', plain: true })} receiveShadow />
    {[-1, 1].map((s) => (
      <mesh key={s} position={[s * 0.2, 0.13, 0]} castShadow geometry={geo('pothandle', () => new SphereGeometry(1, 12, 8))} scale={[0.032, 0.012, 0.026]} material={toonMaterial({ color: '#2B2C31', gloss: 0.4, plain: true })} />
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
const WARE: Record<Ware, { color: string; rim: string; gloss: number }> = {
  white: { color: '#FBF8F2', rim: '#EDE6DA', gloss: 0.55 },
  stone: { color: '#3A3532', rim: '#4E4743', gloss: 0.45 },
  brass: { color: '#D8A54E', rim: '#C08E3E', gloss: 0.8 },
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

/** 그릇 재질: 유약은 넓은 하이라이트 (만화 그릇의 흰 반사 자국) */
const wareLook = (ware: Ware, rim = false, side: 0 | 2 = 0): ToonLook => ({ color: rim ? WARE[ware].rim : WARE[ware].color, gloss: WARE[ware].gloss, spot: 0.85, side, plain: true, rim: 0.06 });

/** 접시 (원점 = 접시 바닥). 굽·바닥·올라온 테두리가 있는 돌림판 모양 */
export const Plate: React.FC<{ ware?: Ware }> = ({ ware = 'white' }) => <mesh geometry={plateGeometry()} material={toonMaterial(wareLook(ware, false, 2))} castShadow receiveShadow />;

/** 그릇: 유약 윤기, 둥근 테두리, 굽 */
export const Bowl: React.FC<{ children?: React.ReactNode; liquid?: string; position?: V3; ware?: Ware }> = ({ children, liquid, position = [0, 0.02, 0], ware = 'white' }) => (
  <group position={position}>
    <mesh position={[0, 0.07, 0]} rotation={[Math.PI, 0, 0]} scale={0.14} geometry={dome(40, 16)} material={toonMaterial(wareLook(ware, false, 2))} castShadow receiveShadow />
    <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={geo('bowlrim', () => new TorusGeometry(0.14, 0.005, 8, 48))} material={toonMaterial(wareLook(ware, true))} />
    <mesh position={[0, -0.062, 0]} geometry={cyl(0.055, 0.05, 0.016, 32)} material={toonMaterial(wareLook(ware, true))} />
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

/** 전·부침개: 물결 테두리 원판 + 건더기 + 노릇한 얼룩·바삭한 테두리. flip(0~1)이면 뒤집는다. */
const Pancake: React.FC<{ food: FoodProfile; cook: number; flip?: number; soggy?: boolean }> = ({ food, cook, flip = 0, soggy }) => {
  const cookStep = Math.round(cook * 10) / 10;
  const color = soggy ? mix(food.rawColor, '#B8A27A', 0.4) : mix(food.rawColor, food.cookedColor, cookStep * 0.8);
  const groups = useMemo(() => layoutPieces(piecesOf(food).filter((p) => p.shape !== 'seed'), { radius: 0.12, mound: 0, cook: cookStep, amount: 0.75, size: 1.1, seed: 9 }), [food, cookStep]);
  const lift = Math.sin(flip * Math.PI) * 0.16;
  return (
    <group position={[0, 0.012 + lift, 0]} rotation={[pancakeTurn(flip), 0, 0]} scale={[1, soggy ? 0.55 : 1, 1]}>
      {/* 꼭짓점 색으로 테두리·얼룩이 노릇해진다: 익을수록 진해지고, 눅눅한 실패작은 노릇함 없이 윤기만 번들 */}
      <Solid
        geometry={pancakeGeometry(3)}
        scale={[0.15, 0.022, 0.15]}
        look={{ color, gloss: soggy ? 0.9 : 0.25 + cookStep * 0.35, spot: soggy ? 0.9 : 0.6, vertexColors: !soggy && cookStep > 0.3 }}
        ink={soggy ? false : inkColor(food.cookedColor)}
      />
      {/* 반죽 속에 반쯤 잠긴 건더기 */}
      <group position={[0, 0.006, 0]} scale={[1, 0.6, 1]}>
        {groups.map((g) => (
          <Scatter key={`${g.shape}${g.variant}`} geometry={pieceGeometry(g.shape, g.variant)} items={g.items} gloss={0.35} side={g.shape === 'leaf' ? 2 : 0} ink={INKABLE[g.shape]} />
        ))}
      </group>
    </group>
  );
};

/**
 * 나물·잎채소: 데쳐서 무친 가닥(길쭉하고 비틀린 잎 + 연두색 줄기)을 가운데가 봉긋하게 소복이 쌓는다.
 * strands=false면 넓은 잎 조각 (생 잎채소 소품). 만화풍: 짙은 초록 두 가지 톤만 (얼룩 대신)
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
        items: g.items.map((it, i) => ({ ...it, c: mix(color, '#1E5A1C', i % 3 === 0 ? 0.28 : 0.05) })),
      })),
    [color, count, radius, mound, seed, strands],
  );
  return (
    <group>
      {groups.map((g) => (
        <Scatter key={g.variant} geometry={strands ? wiltedGeometry(g.variant) : pieceGeometry('leaf', g.variant)} items={g.items} gloss={gloss} spot={0.3} side={2} />
      ))}
    </group>
  );
};

/** 달걀. halved면 반으로 자른 반숙 달걀(노른자가 살짝 출렁인다), 아니면 껍질째 (물속에서 들썩인다) */
const Eggs: React.FC<{ count?: number; halved?: boolean; frame?: number; bob?: boolean }> = ({ count = 3, halved, frame = 0, bob = false }) => (
  <group>
    {Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      const x = Math.cos(a) * 0.07;
      const z = Math.sin(a) * 0.07;
      if (!halved) {
        const b = bob ? Math.sin(frame * 0.25 + i * 2.1) * 0.004 : 0;
        return <Solid key={i} geometry={sphere(24, 16)} position={[x, b, z]} rotation={[0.4, a, 0.3]} scale={[0.04, 0.052, 0.04]} look={{ color: '#F2D3AA', gloss: 0.45, spot: 0.5 }} ink="#5A4632" />;
      }
      // 반숙 노른자: 촉촉해서 아주 조금 출렁인다 (작은 움직임이 먹음직함을 더한다)
      const w = 1 + Math.sin(frame * 0.3 + i * 1.7) * 0.05;
      return (
        <group key={i} position={[x, 0.045, z]} rotation={[0, a, 0]}>
          {/* 단면이 위를 보는 반쪽 달걀 */}
          <Solid geometry={geo('eggHalf', () => new SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2))} scale={[0.045, 0.035, 0.06]} look={{ color: '#FFFDF7', gloss: 0.55, spot: 0.6, plain: true }} ink="#6A5A48" />
          <mesh geometry={disc(32)} scale={[0.045, 1, 0.06]} material={toonMaterial({ color: '#FFFBF2', plain: true, rim: 0 })} />
          {/* 노른자: 바깥은 노랑, 가운데는 진한 주황이 볼록 (반짝이는 점 하나) */}
          <Solid geometry={sphere(20, 12)} position={[0, 0.002, 0]} scale={[0.027 / Math.sqrt(w), 0.006 * w, 0.032 / Math.sqrt(w)]} look={{ color: '#FFC23A', gloss: 0.3 }} ink="#B8620E" shadows={false} />
          <Solid geometry={sphere(20, 12)} position={[0, 0.004, 0]} scale={[0.019 / Math.sqrt(w), 0.009 * w, 0.023 / Math.sqrt(w)]} look={{ color: '#F58A10', gloss: 1, spot: 0.3 }} shadows={false} />
        </group>
      );
    })}
  </group>
);

/**
 * 면: 가닥을 하나의 모양으로 합쳐 한 번에 그린다. nest면 접시에 돌돌 말아 올린 둥지 모양.
 * 만화풍: 조금 굵은 가닥 + 외곽선이 있어 가닥이 또렷하다.
 */
const Noodles: React.FC<{ color: string; radius?: number; height?: number; nest?: boolean }> = ({ color, radius = 0.08, height = 0.03, nest = false }) => (
  <Solid geometry={noodleGeometry({ radius, height, nest })} look={{ color, gloss: 0.5, spot: 0.5 }} ink={inkColor(mix(color, '#8A5A20', 0.3))} />
);

/** 밥: 바탕 언덕 위에 밥알 수백 개 */
const RiceBed: React.FC<{ radius?: number; height?: number; grains?: number }> = ({ radius = 0.11, height = 0.07, grains = 1500 }) => {
  const items = useMemo(() => {
    const rnd = seeded(23);
    const shades = ['#FFFFFF', '#FBF8EF', '#FFFEF8'];
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
      <Solid geometry={moundGeometry(5)} scale={[radius * 0.98, height * 0.97, radius * 0.98]} look={{ color: '#F8F4EA', plain: true }} ink="#8C7A5E" />
      <Scatter geometry={pieceGeometry('grain')} items={items} gloss={0.25} shadows={false} />
    </group>
  );
};

/**
 * 거품: boil이면 끓는 물 거품(냄비 전체), 아니면 전 둘레에서 기름이 지글지글 튀는 작은 방울(팬 가장자리).
 * 반짝이는 점이 있는 작은 반구가 부풀었다 터진다.
 */
const Bubbles: React.FC<{ frame: number; on: boolean; ring?: [number, number]; count?: number; period?: number; size?: number; color?: string }> = ({ frame, on, ring, count = 10, period = 24, size = 0.012, color = '#FFFFFF' }) => {
  const pts = useBits(count, 0.12, 13);
  if (!on) return null;
  return (
    <group>
      {pts.map((p, i) => {
        const t = ((frame + i * 7) % period) / period;
        const k = Math.sin(t * Math.PI);
        // 전 둘레: 각도는 그대로 두고 반지름만 둘레 띠 안으로
        const r = ring ? ring[0] + (ring[1] - ring[0]) * ((i * 0.37) % 1) : 1;
        const len = Math.hypot(p.x, p.z) || 1;
        const x = ring ? (p.x / len) * r : p.x;
        const z = ring ? (p.z / len) * r : p.z;
        return <mesh key={i} geometry={dome(12, 6)} position={[x, 0.004, z]} scale={[size * k, size * 0.6 * k, size * k]} material={toonMaterial({ color, gloss: 1, spot: 0.6, opacity: 0.75, plain: true })} />;
      })}
    </group>
  );
};

/** 가스레인지 위 조리 중인 음식 */
export const CookingFood: React.FC<{ food: FoodProfile; cook: number; frame: number; stirring: boolean; flip: number; showFood: boolean }> = ({ food, cook, frame, stirring, flip, showFood }) => {
  const boiling = showFood && cook > 0.05;
  if (!showFood) return food.vessel === 'pan' ? <Pan /> : <Pot liquid={food.kind === 'rice' ? undefined : food.liquidColor} />;
  const jiggle = stirring ? frame / 3 : 0;
  // 기름에 지지는 소리가 보이게: 팬 요리는 익는 동안 가장자리에서 기름 방울이 튄다
  const sizzle = <Bubbles frame={frame} on={boiling} ring={[0.15, 0.18]} count={12} period={9} size={0.006} color="#FFE9A8" />;
  // 덮밥 고명·볶음은 팬에서 볶는다
  if (food.topping || food.kind === 'stirfry' || food.kind === 'generic') {
    return (
      <Pan shake={stirring ? Math.sin(frame / 3) * 0.02 : 0}>
        <Medley food={food} cook={cook} jiggle={jiggle} />
        {sizzle}
      </Pan>
    );
  }
  switch (food.kind) {
    case 'pancake':
      return (
        <Pan shake={stirring ? Math.sin(frame / 3) * 0.015 : 0}>
          <Pancake food={food} cook={cook} flip={flip} />
          {flip <= 0 && sizzle}
        </Pan>
      );
    case 'egg':
      return (
        <Pot liquid={food.liquidColor}>
          <Eggs frame={frame} bob={boiling} />
          <Bubbles frame={frame} on={boiling} />
        </Pot>
      );
    case 'greens':
      return (
        <Pot liquid={food.liquidColor}>
          <Leaves color={mix(food.rawColor, food.cookedColor, cook)} count={20} radius={0.12} mound={0.008} gloss={0.5} strands />
          <Bubbles frame={frame} on={boiling} />
        </Pot>
      );
    case 'noodles':
      return (
        <Pot liquid={food.liquidColor}>
          <Noodles color={mix(food.rawColor, food.cookedColor, cook)} radius={0.12} height={0.012} />
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
export const PlatedFood: React.FC<{ food: FoodProfile | null; failed?: boolean; frame: number; origin: V3 }> = ({ food, failed, frame, origin }) => {
  const ware = food ? tablewareFor(food) : 'white';
  return (
    <group position={origin}>
      <Plate ware={ware} />
      {food && <PlateContent food={food} failed={failed} frame={frame} ware={ware} />}
    </group>
  );
};

/** 완성 접시에 김을 올릴지: 뜨겁게 먹는 음식(원본 조리 순서로 정한 food.hot)이고 실패작이 아닐 때만 */
export function plateSteams(food: FoodProfile, failed?: boolean): boolean {
  return !failed && food.hot !== false;
}

const PlateContent: React.FC<{ food: FoodProfile; failed?: boolean; frame: number; ware: Ware }> = ({ food, failed, frame, ware }) => {
  const top: V3 = [0, 0.018, 0];
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
            <Eggs count={4} halved frame={frame} />
          </group>
        );
      case 'greens':
        return (
          <group position={top}>
            {/* 소복하게: 가운데를 높게 쌓고 접시 가장자리는 비워 둔다. 참기름 윤기 */}
            <Leaves color={failed ? '#7C8A4A' : food.cookedColor} count={failed ? 18 : 30} radius={failed ? 0.1 : 0.085} mound={failed ? 0.015 : 0.065} gloss={failed ? 0.9 : 0.55} strands={!failed} />
            {/* 깨 고명은 원본 재료에 깨가 있을 때만 (없으면 아무것도 올리지 않는다) */}
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
            <Solid geometry={sauceGeometry(11)} scale={[0.12, 0.006, 0.12]} look={{ color: food.liquidColor ?? food.cookedColor, gloss: 0.6, spot: 0.8 }} />
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
      {plateSteams(food, failed) && <Steam origin={[0, 0.05, 0]} frame={frame} amount={3} />}
    </group>
  );
};

/**
 * 김: 만화식 S자 김 가닥(스프라이트)이 올라가며 커지고, 옆으로 살랑이며 흐려진다.
 * 움직이는 김은 음식을 더 뜨겁고 먹음직스럽게 보이게 한다(정지한 김 그림은 효과 없음 — Zhang 외 2024).
 * 뜨거운 음식에만 쓴다(plateSteams). 예전에는 흐릿한 연기 판이라 사실풍도 만화풍도 아닌 뿌연 얼룩이었다.
 */
export const Steam: React.FC<{ origin: V3; frame: number; amount?: number }> = ({ origin, frame, amount = 3 }) => {
  const map = steamTexture();
  const PERIOD = 60;
  return (
    <group position={origin}>
      {Array.from({ length: amount }, (_, i) => {
        const t = ((frame + (i * PERIOD) / amount) % PERIOD) / PERIOD;
        // 빨리 나타나고 위에서 천천히 사라진다
        const alpha = Math.min(1, t * 4) * Math.pow(1 - t, 1.2);
        const x = (i - (amount - 1) / 2) * 0.045 + Math.sin(t * 4 + i * 2.1) * 0.01;
        const flipX = i % 2 ? -1 : 1;
        return (
          <sprite key={i} position={[x, 0.05 + t * 0.14, 0]} scale={[0.05 * flipX, 0.12 + t * 0.05, 1]}>
            <spriteMaterial map={map} color="#FFFFFF" transparent opacity={0.85 * alpha} depthWrite={false} toneMapped={false} />
          </sprite>
        );
      })}
    </group>
  );
};

/** 가스 불꽃 (만화식: 파란 불꽃 몇 개가 일렁인다) */
export const Flame: React.FC<{ frame: number; on: boolean }> = ({ frame, on }) => {
  if (!on) return null;
  return (
    <group position={[BURNER[0], BURNER[1] + 0.012, BURNER[2]]}>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const h = 0.035 + Math.sin(frame * 0.9 + i * 1.7) * 0.01;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.075, h / 2, Math.sin(a) * 0.075]} scale={[1, h / 0.035, 1]} geometry={geo('flame', () => new ConeGeometry(0.012, 0.035, 6))}>
            <meshBasicMaterial color="#6BB4FF" transparent opacity={0.9} />
          </mesh>
        );
      })}
      <pointLight color="#FF9A4A" intensity={0.12} distance={0.5} position={[0, 0.02, 0.2]} />
    </group>
  );
};

// ---------- 재료 소품 ----------

/** 조리대 위 재료 소품: 음식과 같은 만화풍 (단계 음영·반짝이는 점·외곽선) */
export const IngredientModel: React.FC<{ prop: IngredientProp; position: V3; pop: number }> = ({ prop, position, pop }) => {
  if (pop <= 0.001) return null;
  const s = pop;
  const body = (() => {
    switch (prop.shape) {
      case 'egg':
        return (
          <group>
            {[-0.035, 0.035].map((x, i) => (
              <Solid key={i} geometry={sphere(24, 16)} position={[x, 0.045, i * 0.02]} scale={[0.038, 0.05, 0.038]} look={{ color: prop.color, gloss: 0.4, spot: 0.5 }} ink="#5A4632" />
            ))}
          </group>
        );
      case 'bottle':
        return (
          <group>
            <mesh position={[0, 0.09, 0]} geometry={cyl(0.045, 0.045, 0.18, 24)} material={toonMaterial({ color: prop.color, gloss: 0.7, spot: 0.9, opacity: 0.92 })} castShadow />
            <mesh position={[0, 0.2, 0]} geometry={cyl(0.018, 0.035, 0.05, 24)} material={toonMaterial({ color: prop.color, gloss: 0.6 })} castShadow />
            <mesh position={[0, 0.235, 0]} geometry={cyl(0.02, 0.02, 0.025, 16)} material={toonMaterial({ color: '#E8553A', gloss: 0.4 })} />
          </group>
        );
      case 'jar':
        return (
          <group>
            <mesh position={[0, 0.06, 0]} geometry={cyl(0.05, 0.05, 0.12, 24)} material={toonMaterial({ color: '#EAF2F4', gloss: 0.8, spot: 0.9, opacity: 0.7, plain: true })} castShadow />
            <mesh position={[0, 0.045, 0]} geometry={cyl(0.046, 0.046, 0.085, 24)} material={toonMaterial({ color: prop.color })} />
            <mesh position={[0, 0.13, 0]} geometry={cyl(0.052, 0.052, 0.025, 24)} material={toonMaterial({ color: '#9A643A', gloss: 0.3 })} />
          </group>
        );
      case 'cup':
        return (
          <group>
            <mesh position={[0, 0.055, 0]} geometry={cyl(0.05, 0.042, 0.11, 24, true)} material={toonMaterial({ color: '#E8F4F8', gloss: 0.8, spot: 0.9, opacity: 0.5, side: 2, plain: true })} castShadow />
            <mesh position={[0, 0.04, 0]} geometry={cyl(0.046, 0.042, 0.075, 24)} material={toonMaterial({ color: prop.color, opacity: 0.75 })} />
          </group>
        );
      case 'cloves':
        return (
          <group scale={0.7}>
            <Bowl position={[0, 0, 0]}>
              {[
                [-0.03, 0],
                [0.03, 0.01],
                [0, -0.03],
              ].map(([x, z], i) => (
                <Solid key={i} geometry={sphere(16, 12)} position={[x!, 0.012, z!]} scale={[0.022, 0.025, 0.02]} look={{ color: prop.color, gloss: 0.2 }} ink />
              ))}
            </Bowl>
          </group>
        );
      case 'leaves':
        return (
          <group position={[0, 0.005, 0]}>
            <Leaves color={prop.color} count={9} radius={0.06} mound={0.035} seed={prop.label.length} gloss={0.25} />
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
                <Solid geometry={dome(24, 10)} scale={[0.1, 0.04, 0.1]} look={{ color: prop.color, gloss: 0.35, spot: 0.7 }} ink />
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
        <Scatter key={`${g.shape}${g.variant}`} geometry={pieceGeometry(g.shape, g.variant)} items={g.items} gloss={piece.shape === 'bean' ? 0.5 : 0.25} side={g.shape === 'leaf' || g.shape === 'curl' ? 2 : 0} ink={INKABLE[g.shape]} />
      ))}
    </group>
  );
};
