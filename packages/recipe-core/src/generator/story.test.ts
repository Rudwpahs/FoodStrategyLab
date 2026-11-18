import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '../samples.ts';
import { formatIngredient } from '../format.ts';
import { BRAND } from '../brand.ts';
import { AI_STORY_STYLE, STORY_BANNED_PHRASES, StoryOutputSchema, availableStoryTypes, finalizeStory, storyBlocked, storySystem, storyUser, type StoryDraft } from './story.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

function draft(over: Partial<StoryDraft> = {}): StoryDraft {
  return {
    title: '떫은 호두의 범인을 찾아라',
    storyType: 'mystery',
    logline: '떫은 호두정과에 놀란 맛조수가 선생님 노트에서 범인을 찾는다',
    scenes: [
      { beat: 'hook', type: 'intro', emotion: 'surprised', visual: 'fail-closeup', place: 'dining', line: '으악, 호두정과가 왜 이렇게 떫죠?' },
      { beat: 'conflict', type: 'mistake', emotion: 'embarrassed', place: 'pantry', line: '저 그냥 호두를 바로 조렸거든요. 그게 문제였을까요?' },
      { beat: 'turn', type: 'explain', emotion: 'curious', place: 'lab', line: '선생님 노트에 답이 있었어요. 끓는 물에 데친 뒤 찬물에 헹구면 떫은맛이 줄어든대요!', cardTitle: BRAND.notePhrase, cardItems: [walnut.principle] },
      { beat: 'solve', type: 'ingredients', emotion: 'confident', place: 'market', line: '호두 500g이랑 설탕, 물엿, 꿀까지 다시 준비!', cardTitle: '재료', cardItems: walnut.ingredients.map(formatIngredient) },
      { beat: 'solve', type: 'steps', emotion: 'confident', visual: 'sizzle', place: 'kitchen', line: '데치고, 말리고, 조리고, 140도 정도에서 튀겨요.', cardItems: walnut.steps.slice(0, 5) },
      { beat: 'payoff', type: 'outro', emotion: 'joy', visual: 'result', place: 'dining', line: '이번엔 바삭하고 고소해요! 범인은 데치기를 건너뛴 저였네요. 이희재의 맛 연구소 사건 해결!' },
    ],
    ...over,
  };
}

describe('AI 이야기 대본', () => {
  it('프롬프트에 원본 자료·규칙·반복 금지 문구가 들어간다', () => {
    const sys = storySystem();
    expect(sys).toContain(BRAND.labName);
    for (const p of STORY_BANNED_PHRASES) expect(sys).toContain(p.trim());
    const user = storyUser(walnut, { count: 3, avoidTitles: ['예전 제목'] });
    expect(user).toContain('호두 500g');
    expect(user).toContain(walnut.steps[0]);
    expect(user).toContain('예전 제목');
    // 이야기·오해가 없는 레시피는 추억·오해 깨기 갈래를 고르지 않는다
    expect(availableStoryTypes(walnut)).not.toContain('memory');
    expect(availableStoryTypes(walnut)).not.toContain('myth');
    expect(availableStoryTypes({ ...walnut, story: '어릴 적 명절마다 만든 간식' })).toContain('memory');
  });

  it('구조화 출력 형식으로 받은 이야기를 대본으로 바꾼다 (첫 장면이 훅, 무대·연출 유지)', () => {
    const out = StoryOutputSchema.parse({ stories: [draft()] });
    const c = finalizeStory(walnut, out.stories[0]!, 'story-1');
    if ('error' in c) throw new Error(c.error);
    expect(c.script.style).toBe(AI_STORY_STYLE);
    expect(c.script.hookType).toBe('mystery');
    expect(c.script.scenes[0]!.hook).toBe(true);
    expect(c.script.scenes.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
    expect(new Set(c.script.scenes.map((s) => s.place)).size).toBeGreaterThanOrEqual(3);
    expect(c.warnings).toEqual([]);
    expect(storyBlocked(c)).toBe(false);
    expect(c.seconds).toBeGreaterThan(15);
  });

  it('재료·순서 카드는 원본으로 되돌린다 (AI가 분량을 바꿔도)', () => {
    const d = draft();
    d.scenes[3] = { ...d.scenes[3]!, cardItems: ['호두 300g', '설탕 1컵'] };
    d.scenes[4] = { ...d.scenes[4]!, cardItems: [walnut.steps[2]!, walnut.steps[0]!] };
    const c = finalizeStory(walnut, d, 'story-1');
    if ('error' in c) throw new Error(c.error);
    expect(c.script.scenes[3]!.cardItems).toEqual(walnut.ingredients.map(formatIngredient));
    expect(c.script.scenes[4]!.cardItems).toEqual(walnut.steps.slice(0, 5));
    expect(c.notes.length).toBe(2);
  });

  it('원본에 없는 분량을 대사에 쓰면 만들 수 없는 대본으로 표시한다', () => {
    const d = draft();
    d.scenes[1] = { ...d.scenes[1]!, line: '설탕을 5큰술이나 넣었거든요!' };
    const c = finalizeStory(walnut, d, 'story-1');
    if ('error' in c) throw new Error(c.error);
    expect(storyBlocked(c)).toBe(true);
  });

  it('재료 장면이 없으면 버린다', () => {
    const d = draft();
    d.scenes = d.scenes.filter((s) => s.type !== 'ingredients');
    const c = finalizeStory(walnut, d, 'story-2');
    expect('error' in c && c.error).toContain('재료');
  });

  it('반복되던 말·연구소 이름 누락·한 곳뿐인 무대를 경고한다, 서명 카드는 마지막 장면에만', () => {
    const d = draft();
    d.scenes = d.scenes.map((s) => ({ ...s, place: 'kitchen' as const }));
    d.scenes[0] = { ...d.scenes[0]!, line: '오늘의 실험! 호두정과예요.', visual: 'signature' };
    d.scenes[5] = { ...d.scenes[5]!, line: '이번엔 바삭하고 고소해요!' };
    const c = finalizeStory(walnut, d, 'story-3');
    if ('error' in c) throw new Error(c.error);
    expect(c.warnings.join(' ')).toContain('오늘의 실험');
    expect(c.warnings.join(' ')).toContain(BRAND.labName);
    expect(c.warnings.join(' ')).toContain('무대');
    expect(c.script.scenes[0]!.visual).toBeUndefined();
  });
});
