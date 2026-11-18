import { BRAND, formatIngredient, type RecipeInput, type StoryDraft } from '@mat-lab/recipe-core';
import type { StoryCallFn } from '../server/storyWriter.ts';

/**
 * 시험용 가짜 이야기 작가 (실제 Claude를 부르지 않는다). 서버 단위 테스트와 E2E 시험 서버가 같이 쓴다.
 * 원본 레시피의 재료·순서를 그대로 써서, 원본 대조를 통과하는 이야기 2개 + 분량을 지어낸 이야기 1개를 돌려준다.
 */
export function fakeStoryDrafts(recipe: RecipeInput): StoryDraft[] {
  const dish = recipe.dishName || recipe.topic;
  const ingredients = recipe.ingredients.map(formatIngredient);
  const steps = recipe.steps.slice(0, 5);
  const base = (title: string, storyType: StoryDraft['storyType'], hook: string, end: string): StoryDraft => ({
    title,
    storyType,
    logline: `${dish}에 얽힌 맛조수의 ${storyType} 이야기`,
    scenes: [
      { beat: 'hook', type: 'intro', emotion: 'surprised', visual: 'fail-closeup', place: 'dining', line: hook },
      { beat: 'conflict', type: 'mistake', emotion: 'embarrassed', place: 'pantry', line: '제가 순서를 대충 건너뛰었거든요.' },
      { beat: 'turn', type: 'explain', emotion: 'curious', place: 'lab', line: '선생님 노트에 답이 있었어요!', cardTitle: BRAND.notePhrase, cardItems: [recipe.principle] },
      { beat: 'solve', type: 'ingredients', emotion: 'confident', place: 'market', line: '재료부터 다시 챙겨요.', cardTitle: '재료', cardItems: ingredients },
      { beat: 'solve', type: 'steps', emotion: 'confident', visual: 'sizzle', place: 'kitchen', line: '이번엔 순서대로 차근차근 해요.', cardItems: steps },
      { beat: 'payoff', type: 'outro', emotion: 'joy', visual: 'result', place: 'dining', line: end },
    ],
  });
  const bad = base('분량을 지어낸 이야기', 'race', `${dish}, 시간이 없어요!`, `${BRAND.labName}에서 다음에 또 봐요.`);
  bad.scenes[1] = { ...bad.scenes[1]!, line: '설탕을 99큰술이나 넣었거든요!' };
  return [
    base(`${dish}의 범인을 찾아라`, 'mystery', `으악, ${dish}가 왜 이렇죠?`, `이번엔 성공! 범인은 저였네요. ${BRAND.labName} 사건 해결!`),
    base(`할머니께 드릴 ${dish}`, 'gift', `할머니 생신에 ${dish}를 드리고 싶어요!`, `할머니가 웃으셨어요. ${BRAND.labName}에서 배운 덕분이에요.`),
    bad,
  ];
}

/** 가짜 이야기 작가 호출 (사용량은 작은 값으로) */
export const fakeStoryCall: StoryCallFn = async ({ user }) => {
  const recipe = JSON.parse(user.slice(user.indexOf('{'))) as Record<string, unknown>;
  const asRecipe = {
    topic: String(recipe['주제'] ?? ''),
    dishName: String(recipe['요리'] ?? ''),
    ingredients: (recipe['재료'] as string[]).map((line) => ({ line })),
    steps: recipe['조리순서'] as string[],
    principle: String(recipe['핵심원리'] ?? ''),
  };
  // 재료 문자열은 프롬프트에 이미 원본 형식으로 들어 있다
  const drafts = fakeStoryDrafts({ ...asRecipe, ingredients: [] } as unknown as RecipeInput).map((d) => ({
    ...d,
    scenes: d.scenes.map((s) => (s.type === 'ingredients' ? { ...s, cardItems: asRecipe.ingredients.map((i) => i.line) } : s)),
  }));
  return { drafts, usage: { inputTokens: 1200, outputTokens: 900, cacheWriteTokens: 0, cacheReadTokens: 0 }, stopReason: 'end_turn' };
};
