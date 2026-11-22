import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { SAMPLE_RECIPES, foodProfile } from '@mat-lab/recipe-core';
import { FOOD_RAMP, TOON_LIGHT, inkColor, inkMaterial, toonExposure, toonMaterial, toonRamp, vivid } from './toon.ts';

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

  it('빛을 등진 면(표의 앞쪽 절반)은 확실히 어둡다: 뒤쪽 테두리 조명이 음식 앞면을 환하게 비추지 않게', () => {
    const r = toonRamp(FOOD_RAMP.levels, FOOD_RAMP.edges, FOOD_RAMP.soft);
    // 0.5 = 빛과 직각. 그보다 조금이라도 등지면 첫 단계(그늘)
    expect(r[Math.floor(r.length * 0.4)]! / 255).toBeLessThan(0.4);
    expect(r[r.length - 1]! / r[Math.floor(r.length * 0.4)]!).toBeGreaterThan(2.5);
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

describe('빛 정리 (음식 색이 하얗게 날아가지 않게)', () => {
  it('그늘·중간 밝기는 거의 그대로, 밝은 쪽은 눌러서 아무리 센 조명에도 음식 색의 max배를 넘지 않는다', () => {
    expect(toonExposure(0.3)).toBeCloseTo(0.3 * TOON_LIGHT.exposure, 5);
    expect(toonExposure(0.5)).toBeCloseTo(0.5 * TOON_LIGHT.exposure, 5);
    let prev = 0;
    for (let l = 0; l <= 6; l += 0.05) {
      const t = toonExposure(l);
      expect(t).toBeGreaterThanOrEqual(prev); // 밝은 빛일수록 밝다 (순서는 지킨다)
      expect(t).toBeLessThan(TOON_LIGHT.max);
      prev = t;
    }
    // 2026-11 영상의 팬 속 전(주광 + 주황 테두리 조명 + 불빛 ≈ 음식 색의 1.9배)도 음식 색 근처에 머문다
    expect(toonExposure(1.9)).toBeLessThan(1.0);
    expect(toonExposure(1.9)).toBeGreaterThan(0.85);
    // 그늘(0.4)과 밝은 면(1.3)의 차이는 남는다 (단계 음영이 살아 있게)
    expect(toonExposure(1.3) / toonExposure(0.4)).toBeGreaterThan(2.2);
  });

  it('음식 재질은 화면 톤 매핑(ACES)을 쓰지 않는다: ACES는 밝은 주황을 노랑·흰색으로 튼다', () => {
    expect(toonMaterial({ color: '#E5A65C' }).toneMapped).toBe(false);
    expect(inkMaterial('#3A2418').toneMapped).toBe(false);
  });

  it('색 조명은 조금만 물든다 (음식 자기 색이 먼저)', () => {
    expect(TOON_LIGHT.tint).toBeGreaterThan(0);
    expect(TOON_LIGHT.tint).toBeLessThanOrEqual(0.35);
  });
});

describe('만화풍 재질', () => {
  it('같은 설정이면 같은 재질을 다시 쓰고, 모든 음식 재질이 셰이더 하나를 함께 쓴다', () => {
    const a = toonMaterial({ color: '#D9963A', gloss: 0.5 });
    expect(toonMaterial({ color: '#D9963A', gloss: 0.5 })).toBe(a);
    const b = toonMaterial({ color: '#D9963A', gloss: 0.9 });
    expect(b).not.toBe(a);
    // 젖은 윤기(눅눅한 실패작)도 값만 다른 같은 셰이더
    expect(toonMaterial({ color: '#D9963A', gloss: 0.5, wet: 1 })).not.toBe(a);
    expect(toonMaterial({ color: '#D9963A', gloss: 0.5, wet: 1 }).customProgramCacheKey()).toBe(a.customProgramCacheKey());
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
