import { describe, expect, it } from 'vitest';
import { Color, SRGBColorSpace, type BufferGeometry } from 'three';
import { SAMPLE_RECIPES, foodProfile, type PieceShape } from '@mat-lab/recipe-core';
import { PANCAKE_TONES, lacyEdge, noodleGeometry, pancakeGeometry, pancakeShade, pieceGeometry, plateGeometry, spinachGeometry } from './foodShapes.ts';

const SHAPES: PieceShape[] = ['bean', 'leaf', 'kimchi', 'strip', 'stalk', 'chunk', 'nut', 'cube', 'slice', 'curl', 'ring', 'seed', 'mince'];

/** 꼭짓점 좌표·색이 모두 숫자다 (NaN이면 그 부분이 검게 깨져 보인다) */
function finite(g: BufferGeometry): boolean {
  for (const name of ['position', 'color'] as const) {
    const a = g.getAttribute(name);
    if (!a) continue;
    for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) return false;
  }
  return true;
}

/** 꼭짓점 색 목록 [r,g,b] */
const colorsOf = (g: BufferGeometry) => {
  const c = g.getAttribute('color');
  expect(c, '꼭짓점 색').toBeTruthy();
  return Array.from({ length: c.count }, (_, i) => [c.getX(i), c.getY(i), c.getZ(i)] as [number, number, number]);
};
const range = (g: BufferGeometry, axis: 'x' | 'y' | 'z') => {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return b.max[axis] - b.min[axis];
};

describe('음식 3D 모양', () => {
  it('모든 조각·시금치 잎·전·면·접시 모양의 좌표와 색이 깨지지 않는다', () => {
    for (const shape of SHAPES) for (const v of [0, 1, 2]) expect(finite(pieceGeometry(shape, v)), `${shape}:${v}`).toBe(true);
    for (const palette of ['fresh', 'cooked', 'mushy'] as const) for (const v of [0, 1, 2]) expect(finite(spinachGeometry(v, palette)), `spinach:${palette}:${v}`).toBe(true);
    expect(finite(pancakeGeometry(3))).toBe(true);
    expect(finite(pancakeGeometry(3, false))).toBe(true);
    expect(finite(plateGeometry())).toBe(true);
    expect(finite(noodleGeometry({ radius: 0.085, height: 0.05, nest: true }))).toBe(true);
    expect(finite(noodleGeometry({ radius: 0.125, height: 0.032, nest: false }))).toBe(true);
  });

  it('호두·전·김치는 꼭짓점 색(주름 그늘·노릇한 가장자리·잎과 줄기)이 있어 한 가지 색 덩어리가 아니다', () => {
    const spread = (g: BufferGeometry) => {
      const r = colorsOf(g).map((c) => c[0]);
      return Math.max(...r) - Math.min(...r);
    };
    expect(spread(pieceGeometry('nut', 0))).toBeGreaterThan(0.3);
    expect(spread(pancakeGeometry(3))).toBeGreaterThan(0.4);
  });

  it('호두 반쪽: 긴 쪽이 있는 납작한 타원 (길이 > 폭 > 높이), 아래가 평평하다', () => {
    const g = pieceGeometry('nut', 1);
    expect(range(g, 'z')).toBeGreaterThan(range(g, 'x'));
    expect(range(g, 'x')).toBeGreaterThan(range(g, 'y') * 1.5);
    g.computeBoundingBox();
    expect(-g.boundingBox!.min.y).toBeLessThan(g.boundingBox!.max.y * 0.6);
  });

  it('김치 조각: 납작하고 물결치는 빨간 잎(0번), 연한 배추 줄기 띠(1번), 잎 한쪽에 줄기가 붙은 조각(2번). 깍둑 썬 덩어리가 아니다', () => {
    const red = (c: [number, number, number]) => c[0] > c[1] * 3 && c[0] > 0.2;
    const pale = (c: [number, number, number]) => c[1] > 0.4 && c[0] > 0.7;
    const leaf = colorsOf(pieceGeometry('kimchi', 0));
    expect(leaf.some(red)).toBe(true);
    expect(leaf.some(pale)).toBe(false);
    const rib = colorsOf(pieceGeometry('kimchi', 1));
    expect(rib.filter(pale).length / rib.length).toBeGreaterThan(0.3);
    const mixed = colorsOf(pieceGeometry('kimchi', 2));
    expect(mixed.some(red) && mixed.some(pale)).toBe(true);
    // 납작하다: 물결을 넣어도 높이가 길이의 3분의 1보다 작다 (예전 도톰한 네모는 토마토·페퍼로니처럼 보였다)
    for (const v of [0, 1, 2]) {
      const g = pieceGeometry('kimchi', v);
      expect(range(g, 'y'), `kimchi:${v}`).toBeLessThan(range(g, 'x') * 0.34);
    }
  });

  it('시금치 잎: 짙은 초록 잎 + 연두 줄기 (0번은 분홍 뿌리 끝). 무친 잎은 끓는 물 속 잎보다 짙고, 실패작은 누렇다', () => {
    const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const avg = (g: BufferGeometry) => {
      const cs = colorsOf(g);
      return cs.reduce((s, c) => s + lum(c), 0) / cs.length;
    };
    const cooked = colorsOf(spinachGeometry(0, 'cooked'));
    expect(cooked.some((c) => c[1] > c[0] * 2 && lum(c) < 0.15)).toBe(true); // 짙은 초록 잎
    expect(cooked.some((c) => lum(c) > 0.3 && c[1] > c[0])).toBe(true); // 연두 줄기
    expect(cooked.some((c) => c[0] > c[1] * 1.5)).toBe(true); // 분홍 뿌리 끝
    expect(avg(spinachGeometry(1, 'cooked'))).toBeLessThan(avg(spinachGeometry(1, 'fresh')));
    const mushy = colorsOf(spinachGeometry(1, 'mushy'));
    const green = colorsOf(spinachGeometry(1, 'cooked'));
    const yellowish = (cs: [number, number, number][]) => cs.reduce((s, c) => s + c[0] / Math.max(0.01, c[1]), 0) / cs.length;
    expect(yellowish(mushy)).toBeGreaterThan(yellowish(green));
    // 숟가락 모양: 폭이 길이의 0.4~0.7 (예전 뾰족한 띠는 0.26)
    const g = spinachGeometry(0, 'cooked');
    const ratio = range(g, 'z') / range(g, 'x');
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.7);
  });

  it('고사리: 가늘고 긴 줄기 (길이가 굵기의 8배 이상), 0번은 끝이 말려 있다', () => {
    const straight = pieceGeometry('stalk', 1);
    expect(range(straight, 'x')).toBeGreaterThan(range(straight, 'y') * 8);
    // 말린 머리는 줄기 끝에서 옆으로 돌아 나온다 (폭이 더 넓다)
    expect(range(pieceGeometry('stalk', 0), 'z')).toBeGreaterThan(range(straight, 'z'));
  });
});

describe('면: 지문처럼 납작한 나선이 아니라 부피 있는 더미', () => {
  it('접시 둥지는 정한 높이까지 쌓이고, 위쪽 가닥이 아래쪽보다 밝다 (깊이 그늘)', () => {
    const g = noodleGeometry({ radius: 0.085, height: 0.05, nest: true });
    expect(range(g, 'y')).toBeGreaterThan(0.045);
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    let low = 0;
    let lowN = 0;
    let high = 0;
    let highN = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0.01) {
        low += col.getX(i);
        lowN++;
      } else if (pos.getY(i) > 0.04) {
        high += col.getX(i);
        highN++;
      }
    }
    expect(high / highN).toBeGreaterThan(low / lowN + 0.15);
  });

  it('냄비 면: 소스 위로 봉긋하고, 몇 가닥은 더미보다 높이 들려 있다', () => {
    const g = noodleGeometry({ radius: 0.125, height: 0.032, nest: false });
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeGreaterThan(0.032 * 1.1);
    expect(g.boundingBox!.min.y).toBeLessThan(0.002);
  });
});

describe('만화풍 전 색 단계', () => {
  it('가장자리는 바삭한 갈색 → 레이스 끝은 더 짙게, 노릇한 얼룩은 그 사이, 가운데 반죽이 가장 밝고 아랫면은 노릇하다', () => {
    const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;
    const crisp = { a: 0, speck: -1, seed: 0 };
    const center = pancakeShade(0.2, -1, true, crisp);
    const patch = pancakeShade(0.5, 1, true, crisp);
    const band = pancakeShade(0.91, -1, true, crisp);
    const lace = pancakeShade(0.99, -1, true, crisp);
    expect(center).toEqual(PANCAKE_TONES.base);
    expect(sum(patch)).toBeLessThan(sum(center));
    expect(sum(band)).toBeLessThan(sum(patch));
    expect(sum(lace)).toBeLessThan(sum(band));
    expect(pancakeShade(0.2, -1, false, crisp)).toEqual(PANCAKE_TONES.golden);
  });

  it('단계는 또렷하다: 얼룩 경계를 조금만 넘으면 색이 거의 다 바뀐다 (사실풍 잔무늬처럼 번지지 않게)', () => {
    const b = (f: number) => pancakeShade(0.5, f, true)[2];
    expect(b(0.45)).toBeCloseTo(1, 5);
    expect(b(0.6)).toBeCloseTo(PANCAKE_TONES.golden[2], 5);
  });

  it('잘 부친 전도 윗면 대부분은 노릇한 주황 반죽 색: 갈색은 얇은 가장자리와 몇 군데 얼룩뿐 (전체가 갈색이면 해시브라운·피자처럼 보였다)', () => {
    let base = 0;
    let brown = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      // 넓이가 고르게 퍼지도록 원 안의 점을 고른다
      const ring = Math.sqrt((i + 0.5) / n);
      const a = i * 2.399963;
      const x = Math.cos(a) * ring;
      const z = Math.sin(a) * ring;
      const field = Math.sin(x * 3.2 + 5.5) * Math.cos(z * 4.2 + 3.9) * 0.5 + Math.sin(z * 5.4 + 10.4) * Math.cos(x * 2.6 - 5.5) * 0.35;
      const c = pancakeShade(ring, field, true, { a, speck: Math.sin(x * 13 + 10) * Math.cos(z * 17 - 10), seed: 3 });
      if (c[0] + c[1] + c[2] > 2.95) base++;
      if (c[2] < 0.3) brown++;
    }
    expect(base / n).toBeGreaterThan(0.6);
    expect(brown / n).toBeLessThan(0.25);
  });

  it('바삭한 띠의 안쪽 경계는 둘레를 따라 들쭉날쭉하다 (둥근 띠면 오믈렛 테두리처럼 보인다)', () => {
    const at = (a: number) => pancakeShade(0.86, -1, true, { a, speck: -1, seed: 3 })[0];
    const values = Array.from({ length: 24 }, (_, i) => at((i / 24) * Math.PI * 2));
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.2);
  });

  it('눅눅한 실패작: 노릇한 얼룩·바삭한 띠가 없다 (윗면 전체가 같은 반죽 색)', () => {
    expect(pancakeShade(0.95, 1, true, null)).toEqual(PANCAKE_TONES.base);
    expect(pancakeShade(0.2, -1, true, null)).toEqual(PANCAKE_TONES.base);
  });

  it('바삭한 전 가장자리는 들쭉날쭉한 레이스, 눅눅한 전은 둥글게 매끈', () => {
    const r = Array.from({ length: 720 }, (_, i) => lacyEdge((i / 720) * Math.PI * 2, 3));
    expect(Math.max(...r) - Math.min(...r)).toBeGreaterThan(0.1);
    // 작게 파인 자리가 여러 군데 (지역 최솟값이 많다)
    let notches = 0;
    for (let i = 1; i < r.length - 1; i++) if (r[i]! < r[i - 1]! && r[i]! < r[i + 1]! && r[i]! < 0.99) notches++;
    expect(notches).toBeGreaterThan(8);
    const flat = (g: BufferGeometry) => {
      g.computeBoundingBox();
      return range(g, 'y') / range(g, 'x');
    };
    expect(flat(pancakeGeometry(3))).toBeLessThan(0.6);
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

describe('호두 색', () => {
  it('데친 생 호두는 연한 황갈색, 조린 호두는 더 짙은 호박색 갈색 — 형광 주황이 아니다', async () => {
    const { nutTone } = await import('./Food3D.tsx');
    // 화면에 보이는 색(sRGB) 기준
    const hsl = (hex: string) => {
      const o = { h: 0, s: 0, l: 0 };
      new Color(hex).getHSL(o, SRGBColorSpace);
      return o;
    };
    const raw = hsl(nutTone('#A9733F', 0));
    const glazed = hsl(nutTone('#A9733F', 1));
    expect(glazed.l).toBeLessThan(raw.l);
    for (const c of [raw, glazed]) {
      expect(c.h * 360).toBeGreaterThan(18);
      expect(c.h * 360).toBeLessThan(38);
    }
    expect(glazed.s).toBeLessThan(0.75);
  });
});
