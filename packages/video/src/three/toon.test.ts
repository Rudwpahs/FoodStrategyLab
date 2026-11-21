import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { SAMPLE_RECIPES, foodProfile } from '@mat-lab/recipe-core';
import { FOOD_RAMP, inkColor, inkMaterial, toonMaterial, toonRamp, vivid } from './toon.ts';

const hsl = (hex: string) => {
  const o = { h: 0, s: 0, l: 0 };
  new Color(hex).getHSL(o);
  return o;
};

describe('만화풍 단계 음영표', () => {
  it('어두운 쪽에서 밝은 쪽으로만 올라가고, 양 끝은 첫·마지막 단계 밝기다', () => {
    const r = toonRamp(FOOD_RAMP.levels, FOOD_RAMP.edges, FOOD_RAMP.soft);
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeGreaterThanOrEqual(r[i - 1]!);
    expect(r[0]).toBe(Math.round(FOOD_RAMP.levels[0]! * 255));
    expect(r[r.length - 1]).toBe(Math.round(FOOD_RAMP.levels.at(-1)! * 255));
  });

  it('경계 폭이 0이면 정확히 정한 단계 밝기만 나온다 (2~3단 음영)', () => {
    const r = toonRamp([0.4, 0.7, 1], [0.4, 0.7], 0);
    expect([...new Set(r)].sort((a, b) => a - b)).toEqual([102, 179, 255]);
  });

  it('경계는 좁다: 음영표 대부분이 평평한 단계다 (부드러운 그라데이션이 아니다)', () => {
    const r = toonRamp(FOOD_RAMP.levels, FOOD_RAMP.edges, FOOD_RAMP.soft);
    let flat = 0;
    for (let i = 1; i < r.length; i++) if (Math.abs(r[i]! - r[i - 1]!) <= 1) flat++;
    expect(flat / (r.length - 1)).toBeGreaterThan(0.75);
  });

  it('경계 수가 맞지 않으면 알린다', () => {
    expect(() => toonRamp([0.5, 1], [0.3, 0.6])).toThrow();
  });
});

describe('만화풍 색', () => {
  it('선명하게: 색상·밝기는 그대로, 채도만 조금 올린다. 흰색·회색은 그대로', () => {
    const before = hsl('#A9733F');
    const after = hsl(vivid('#A9733F'));
    expect(after.h).toBeCloseTo(before.h, 2);
    expect(after.l).toBeCloseTo(before.l, 2);
    expect(after.s).toBeGreaterThan(before.s);
    expect(after.s - before.s).toBeLessThan(0.2); // 지나친 채도는 인공적으로 보인다
    expect(vivid('#FFFFFF')).toBe('#ffffff');
    expect(vivid('#808080')).toBe('#808080');
  });

  it('외곽선은 검정이 아니라 그 음식 색의 짙은 톤', () => {
    for (const c of ['#D9963A', '#4E9A3A', '#F2D68A']) {
      const ink = hsl(inkColor(c));
      expect(ink.l).toBeLessThanOrEqual(0.2);
      expect(ink.l).toBeGreaterThan(0.02);
      expect(Math.abs(ink.h - hsl(c).h)).toBeLessThan(0.02);
    }
  });
});

describe('만화풍 재질', () => {
  it('같은 설정이면 같은 재질을 다시 쓰고, 모든 음식 재질이 셰이더 하나를 함께 쓴다', () => {
    const a = toonMaterial({ color: '#D9963A', gloss: 0.5 });
    expect(toonMaterial({ color: '#D9963A', gloss: 0.5 })).toBe(a);
    const b = toonMaterial({ color: '#D9963A', gloss: 0.9 });
    expect(b).not.toBe(a);
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    expect(inkMaterial('#3A2418')).toBe(inkMaterial('#3A2418'));
    expect(inkMaterial('#3A2418').side).toBe(1); // 뒷면만 (뒤집은 껍데기)
  });
});

describe('김은 뜨거운 음식에만', () => {
  it('김치전·파스타는 김이 오르고, 나물·얼음물에 식힌 달걀·정과·실패작은 김이 없다', async () => {
    const { plateSteams } = await import('./Food3D.tsx');
    const steams = (name: string, failed = false) => plateSteams(foodProfile(SAMPLE_RECIPES.find((r) => r.dishName === name)!), failed);
    expect(steams('바삭한 김치전')).toBe(true);
    expect(steams('들깨고사리파스타')).toBe(true);
    expect(steams('시금치나물')).toBe(false);
    expect(steams('반숙 달걀')).toBe(false);
    expect(steams('호두정과')).toBe(false);
    expect(steams('바삭한 김치전', true)).toBe(false);
  });
});
