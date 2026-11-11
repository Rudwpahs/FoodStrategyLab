import type { RecipeInput } from '@mat-lab/recipe-core';

/**
 * 레시피 카드 묶음(인스타그램 캐러셀, 4:5). 사례: 요리 계정들은 영상과 따로 "넘겨 보는 레시피 카드"를 올려 저장을 받는다.
 * 재료·분량·순서는 원본 그대로 나누기만 한다 (빼거나 바꾸지 않는다). 인스타그램 캐러셀은 10장까지.
 */
export type CardPage =
  | { kind: 'ingredients'; items: { name: string; amount: string; group?: string }[]; part: number; parts: number }
  | { kind: 'steps'; start: number; items: string[]; part: number; parts: number }
  | { kind: 'note'; principle: string; tip: string };

export interface CardPlan {
  pages: CardPage[];
  /** 가장 촘촘하게 담아도 10장을 넘을 때 보여 줄 말. 이때도 pages에는 원본을 모두 담는다 */
  overflow?: string;
}

export const MAX_CAROUSEL = 10;
/**
 * 한 장에 담는 재료·단계 수. 앞에서부터 써 보고 10장에 들어가는 첫 단계를 쓴다.
 * 가장 촘촘한 단계(재료 16개·단계 6개)까지가 카드 글자를 줄여도 읽을 수 있는 양이다 (CarouselCard 글자 크기와 짝).
 */
const DENSITIES: { ingredients: number; steps: number }[] = [
  { ingredients: 12, steps: 4 },
  { ingredients: 12, steps: 5 },
  { ingredients: 16, steps: 5 },
  { ingredients: 16, steps: 6 },
];

const chunk = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

function pagesAt(recipe: RecipeInput, d: (typeof DENSITIES)[number]): CardPage[] {
  const pages: CardPage[] = [];
  const ing = chunk(recipe.ingredients, d.ingredients);
  ing.forEach((items, i) => pages.push({ kind: 'ingredients', items, part: i + 1, parts: ing.length }));
  const steps = chunk(recipe.steps, d.steps);
  steps.forEach((items, i) => pages.push({ kind: 'steps', start: i * d.steps + 1, items, part: i + 1, parts: steps.length }));
  if (recipe.principle.trim() || recipe.tips[0]) pages.push({ kind: 'note', principle: recipe.principle.trim(), tip: recipe.tips[0] ?? '' });
  return pages;
}

export function recipeCardPlan(recipe: RecipeInput): CardPlan {
  for (const d of DENSITIES) {
    const pages = pagesAt(recipe, d);
    if (pages.length <= MAX_CAROUSEL) return { pages };
  }
  const pages = pagesAt(recipe, DENSITIES.at(-1)!);
  return { pages, overflow: `레시피가 길어서 카드가 ${pages.length}장이에요. 인스타그램 레시피 카드는 10장까지라 그대로 올릴 수 없어요 (내용은 빼지 않았어요).` };
}

/** 카드 묶음 (원본을 모두 담는다. 10장을 넘는지는 recipeCardPlan의 overflow로 확인) */
export function recipeCardPages(recipe: RecipeInput): CardPage[] {
  return recipeCardPlan(recipe).pages;
}
