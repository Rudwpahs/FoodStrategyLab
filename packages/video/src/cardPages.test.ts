import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '@mat-lab/recipe-core';
import { MAX_CAROUSEL, recipeCardPages } from './cardPages.ts';

describe('레시피 카드 묶음 (캐러셀)', () => {
  it('재료·순서를 원본 순서 그대로 나누기만 하고, 마지막에 원리·팁 카드를 둔다', () => {
    for (const r of SAMPLE_RECIPES) {
      const pages = recipeCardPages(r);
      expect(pages.length).toBeLessThanOrEqual(MAX_CAROUSEL);
      const ing = pages.flatMap((p) => (p.kind === 'ingredients' ? p.items : []));
      expect(ing).toEqual(r.ingredients);
      const steps = pages.flatMap((p) => (p.kind === 'steps' ? p.items : []));
      expect(steps).toEqual(r.steps);
      expect(pages.at(-1)!.kind).toBe('note');
    }
  });
  it('긴 레시피는 여러 장으로 나누고 번호를 이어 간다', () => {
    const pasta = SAMPLE_RECIPES.find((r) => r.steps.length >= 10)!;
    const steps = recipeCardPages(pasta).filter((p) => p.kind === 'steps');
    expect(steps.length).toBeGreaterThan(1);
    expect(steps.map((p) => (p.kind === 'steps' ? p.start : 0))).toEqual([1, 5, 9]);
  });
});
