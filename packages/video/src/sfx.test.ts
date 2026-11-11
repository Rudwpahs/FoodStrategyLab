import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, buildStyledScript, generateTemplateScript } from '@mat-lab/recipe-core';
import { sfxCues, sfxUrl, synthSfx } from './sfx.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

describe('효과음', () => {
  it('직접 합성한 소리는 짧고, 소리가 있고, 찢어지지 않는다', () => {
    for (const name of ['whoosh', 'ding', 'boing', 'pop'] as const) {
      const s = synthSfx(name);
      const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(s.length / 22050).toBeLessThan(1);
      expect(peak, name).toBeGreaterThan(0.05);
      expect(peak, name).toBeLessThanOrEqual(1);
    }
    expect(sfxUrl('ding')).toMatch(/^data:audio\/wav;base64,UklGR/);
  });

  it('훅·실패·공개·서명에만 넣고, 영상당 4개 이하다', () => {
    const comedy = buildStyledScript(walnut, { style: 'comedy' }).script;
    const cues = sfxCues(comedy);
    expect(cues[0]).toMatchObject({ sceneId: comedy.scenes[0]!.id, name: 'boing' });
    expect(cues.some((c) => c.name === 'pop')).toBe(true);
    expect(cues.length).toBeLessThanOrEqual(4);
    // 기존 템플릿 대본(연출 없음)에는 효과음이 없다 — 기존 영상은 그대로
    expect(sfxCues(generateTemplateScript(walnut))).toEqual([]);
    // 흔한 실수가 있는 템플릿(김치전 코미디형)도 기존과 같이 효과음 없음
    for (const r of SAMPLE_RECIPES) expect(sfxCues(generateTemplateScript(r)), r.dishName).toEqual([]);
  });
});
