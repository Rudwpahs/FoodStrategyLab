import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { SAMPLE_RECIPES, foodProfile, type PieceShape } from '@mat-lab/recipe-core';
import { PANCAKE_TONES, noodleGeometry, pancakeGeometry, pancakeShade, pieceGeometry, plateGeometry, wiltedGeometry } from './foodShapes.ts';

const SHAPES: PieceShape[] = ['bean', 'leaf', 'strip', 'chunk', 'nut', 'cube', 'slice', 'curl', 'ring', 'seed'];

/** 꼭짓점 좌표·색이 모두 숫자다 (NaN이면 그 부분이 검게 깨져 보인다) */
function finite(g: BufferGeometry): boolean {
  for (const name of ['position', 'color'] as const) {
    const a = g.getAttribute(name);
    if (!a) continue;
    for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) return false;
  }
  return true;
}

describe('음식 3D 모양', () => {
  it('모든 조각·나물 가닥·전·접시 모양의 좌표와 색이 깨지지 않는다', () => {
    for (const shape of SHAPES) for (const v of [0, 1, 2]) expect(finite(pieceGeometry(shape, v)), `${shape}:${v}`).toBe(true);
    for (const v of [0, 1, 2]) expect(finite(wiltedGeometry(v)), `wilted:${v}`).toBe(true);
    expect(finite(pancakeGeometry(3))).toBe(true);
    expect(finite(plateGeometry())).toBe(true);
    expect(finite(noodleGeometry({ radius: 0.085, height: 0.05, nest: true }))).toBe(true);
    expect(finite(noodleGeometry({ radius: 0.12, height: 0.012, nest: false }))).toBe(true);
  });

  it('호두·나물·전은 꼭짓점 색(주름 그늘·줄기 색·노릇한 가장자리)이 있어 한 가지 색 덩어리가 아니다', () => {
    const spread = (g: BufferGeometry) => {
      const c = g.getAttribute('color');
      expect(c, '꼭짓점 색').toBeTruthy();
      const r = Array.from({ length: c.count }, (_, i) => c.getX(i));
      return Math.max(...r) - Math.min(...r);
    };
    expect(spread(pieceGeometry('nut', 0))).toBeGreaterThan(0.2);
    expect(spread(wiltedGeometry(0))).toBeGreaterThan(0.3);
    expect(spread(pancakeGeometry(3))).toBeGreaterThan(0.25);
  });
});

describe('만화풍 전 색 단계', () => {
  it('가장자리는 바삭한 갈색, 노릇한 얼룩은 그 사이, 가운데 반죽이 가장 밝고 아랫면은 노릇하다', () => {
    const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;
    const center = pancakeShade(0.2, -1, true);
    const patch = pancakeShade(0.2, 1, true);
    const rim = pancakeShade(0.98, -1, true);
    expect(center).toEqual(PANCAKE_TONES.base);
    expect(sum(patch)).toBeLessThan(sum(center));
    expect(sum(rim)).toBeLessThan(sum(patch));
    expect(pancakeShade(0.2, -1, false)).toEqual(PANCAKE_TONES.golden);
  });

  it('단계는 또렷하다: 얼룩 경계를 조금만 넘으면 색이 거의 다 바뀐다 (사실풍 잔무늬처럼 번지지 않게)', () => {
    const r = (f: number) => pancakeShade(0.2, f, true)[2];
    expect(r(0.3)).toBeCloseTo(1, 5);
    expect(r(0.4)).toBeCloseTo(PANCAKE_TONES.golden[2], 5);
  });
});

describe('그릇 고르기 (음식과 그릇의 밝기 대비)', () => {
  it('밝은 음식(달걀·크림 파스타)은 짙은 그릇, 진한 색 음식(전·나물·정과)은 흰 그릇', async () => {
    const { tablewareFor } = await import('./Food3D.tsx');
    const ware = (name: string) => tablewareFor(foodProfile(SAMPLE_RECIPES.find((r) => r.dishName === name)!));
    expect(ware('반숙 달걀')).toBe('stone');
    expect(ware('들깨고사리파스타')).toBe('stone');
    expect(ware('바삭한 김치전')).toBe('white');
    expect(ware('시금치나물')).toBe('white');
    expect(ware('호두정과')).toBe('white');
  });
});
