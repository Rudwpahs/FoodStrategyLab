import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, type RecipeInput } from '@mat-lab/recipe-core';
import { MAX_CAROUSEL, recipeCardPages, recipeCardPlan } from './cardPages.ts';

const contents = (pages: ReturnType<typeof recipeCardPages>) => ({
  ing: pages.flatMap((p) => (p.kind === 'ingredients' ? p.items : [])),
  steps: pages.flatMap((p) => (p.kind === 'steps' ? p.items : [])),
});
const longRecipe = (ingredients: number, steps: number): RecipeInput => ({
  ...SAMPLE_RECIPES[0]!,
  ingredients: Array.from({ length: ingredients }, (_, i) => ({ name: `재료${i + 1}`, amount: `${i + 1}g`, group: i % 7 < 3 ? '양념' : undefined })),
  steps: Array.from({ length: steps }, (_, i) => `${i + 1}번째 단계: 재료를 넣고 중불에서 2분 볶는다.`),
});

describe('레시피 카드 묶음 (캐러셀)', () => {
  it('재료·순서를 원본 순서 그대로 나누기만 하고, 마지막에 원리·팁 카드를 둔다', () => {
    for (const r of SAMPLE_RECIPES) {
      const pages = recipeCardPages(r);
      expect(pages.length).toBeLessThanOrEqual(MAX_CAROUSEL);
      expect(contents(pages).ing).toEqual(r.ingredients);
      expect(contents(pages).steps).toEqual(r.steps);
      expect(pages.at(-1)!.kind).toBe('note');
    }
  });
  it('긴 레시피는 여러 장으로 나누고 번호를 이어 간다', () => {
    const pasta = SAMPLE_RECIPES.find((r) => r.steps.length >= 10)!;
    const steps = recipeCardPages(pasta).filter((p) => p.kind === 'steps');
    expect(steps.length).toBeGreaterThan(1);
    expect(steps.map((p) => (p.kind === 'steps' ? p.start : 0))).toEqual([1, 5, 9]);
  });
  it('10장이 넘을 만큼 길면 한 장에 더 많이 담아 10장 안에 넣는다 (아무것도 빼지 않는다)', () => {
    const r = longRecipe(25, 30);
    const plan = recipeCardPlan(r);
    expect(plan.pages.length).toBeLessThanOrEqual(MAX_CAROUSEL);
    expect(plan.overflow).toBeUndefined();
    expect(contents(plan.pages).ing).toEqual(r.ingredients);
    expect(contents(plan.pages).steps).toEqual(r.steps);
    expect(plan.pages.at(-1)!.kind).toBe('note');
    // 번호는 이어진다
    const starts = plan.pages.flatMap((p) => (p.kind === 'steps' ? [p.start] : []));
    expect(starts[0]).toBe(1);
    expect(starts.at(-1)! + (plan.pages.filter((p) => p.kind === 'steps').at(-1) as { items: string[] }).items.length - 1).toBe(30);
  });
  it('그래도 못 넣으면 빼지 않고 모두 담은 채 알린다', () => {
    const r = longRecipe(40, 70);
    const plan = recipeCardPlan(r);
    expect(plan.overflow).toMatch(/10장/);
    expect(contents(plan.pages).ing).toEqual(r.ingredients);
    expect(contents(plan.pages).steps).toEqual(r.steps);
  });
});
