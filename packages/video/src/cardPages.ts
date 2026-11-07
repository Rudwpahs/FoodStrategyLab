import type { RecipeInput } from '@mat-lab/recipe-core';

/**
 * 레시피 카드 묶음(인스타그램 캐러셀, 4:5). 사례: 요리 계정들은 영상과 따로 "넘겨 보는 레시피 카드"를 올려 저장을 받는다.
 * 재료·분량·순서는 원본 그대로 나누기만 한다. 인스타그램 캐러셀은 10장까지.
 */
export type CardPage =
  | { kind: 'ingredients'; items: { name: string; amount: string; group?: string }[]; part: number; parts: number }
  | { kind: 'steps'; start: number; items: string[]; part: number; parts: number }
  | { kind: 'note'; principle: string; tip: string };

export const MAX_CAROUSEL = 10;
const ING_PER_PAGE = 12;
const STEPS_PER_PAGE = 4;

const chunk = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

export function recipeCardPages(recipe: RecipeInput): CardPage[] {
  const pages: CardPage[] = [];
  const ing = chunk(recipe.ingredients, ING_PER_PAGE);
  ing.forEach((items, i) => pages.push({ kind: 'ingredients', items, part: i + 1, parts: ing.length }));
  const steps = chunk(recipe.steps, STEPS_PER_PAGE);
  steps.forEach((items, i) => pages.push({ kind: 'steps', start: i * STEPS_PER_PAGE + 1, items, part: i + 1, parts: steps.length }));
  if (recipe.principle.trim() || recipe.tips[0]) pages.push({ kind: 'note', principle: recipe.principle.trim(), tip: recipe.tips[0] ?? '' });
  return pages.slice(0, MAX_CAROUSEL);
}
