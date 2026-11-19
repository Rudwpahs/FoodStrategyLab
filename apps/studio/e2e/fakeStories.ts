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
  const base = (title: string, storyType: StoryDraft['storyType'], audience: StoryDraft['audience'], hook: string, end: string): StoryDraft => ({
    title,
    storyType,
    audience,
    logline: `${dish}를 ${storyType} 형식으로 짚는 영상`,
    scenes: [
      { beat: 'hook', type: 'intro', emotion: 'curious', visual: 'sizzle', place: 'kitchen', line: hook },
      { beat: 'context', type: 'question', emotion: 'curious', place: 'pantry', line: '정석은 지켜야 할 순서가 있어요.' },
      { beat: 'point', type: 'explain', emotion: 'curious', place: 'lab', line: '선생님 노트를 보면 이유가 나와요.', cardTitle: BRAND.notePhrase, cardItems: [recipe.principle] },
      { beat: 'method', type: 'ingredients', emotion: 'confident', place: 'market', line: '재료는 이렇게 준비해요.', cardTitle: '재료', cardItems: ingredients },
      { beat: 'method', type: 'steps', emotion: 'confident', visual: 'sizzle', place: 'kitchen', line: '순서대로 차근차근 해요.', cardItems: steps },
      { beat: 'close', type: 'outro', emotion: 'joy', visual: 'result', place: 'dining', line: end },
    ],
  });
  const bad = base('분량을 지어낸 이야기', 'quick', 'young-home', `${dish}, 한눈에 정리해요.`, `${BRAND.labName}에서 다음에 또 봐요.`);
  bad.scenes[1] = { ...bad.scenes[1]!, line: '설탕을 99큰술이나 넣었거든요.' };
  return [
    base(`${dish}, 이 단계는 왜 할까`, 'why', 'hobby-learner', `${dish}, 이 단계는 왜 할까요?`, `이유를 알면 정석이 쉬워져요. ${BRAND.labName}였어요.`),
    base(`손님상에 낼 ${dish}`, 'occasion', 'young-home', `손님 오는 날, ${dish} 어때요?`, `차려 내기 좋은 요리, ${BRAND.labName}에서 짚어 봤어요.`),
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
