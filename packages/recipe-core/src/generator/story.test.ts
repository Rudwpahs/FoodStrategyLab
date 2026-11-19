import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '../samples.ts';
import { formatIngredient } from '../format.ts';
import { BRAND } from '../brand.ts';
import { CHILDISH_FRAMING, STORY_TYPE_INFO, findChildishFraming, overusedTypes, repeatedMotifs, storyTypeLabel, type RecentStory } from './story.ts';
import { AI_STORY_STYLE, STORY_BANNED_PHRASES, StoryOutputSchema, availableStoryTypes, finalizeStory, storyBlocked, storySystem, storyUser, type StoryDraft } from './story.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

function draft(over: Partial<StoryDraft> = {}): StoryDraft {
  return {
    title: '호두정과, 왜 굳이 데칠까',
    storyType: 'why',
    audience: 'hobby-learner',
    logline: '데치기 한 단계가 떫은맛을 잡는 이유를 선생님 노트로 짚는다',
    scenes: [
      { beat: 'hook', type: 'intro', emotion: 'curious', visual: 'sizzle', place: 'kitchen', line: '호두정과, 왜 굳이 데칠까요?' },
      { beat: 'context', type: 'question', emotion: 'curious', place: 'pantry', line: '바로 조리면 편할 텐데, 정석은 데치기부터 시작해요.' },
      { beat: 'point', type: 'explain', emotion: 'curious', place: 'lab', line: '선생님 노트를 보면, 끓는 물에 데친 뒤 찬물에 헹구면 떫은맛이 줄어든대요.', cardTitle: BRAND.notePhrase, cardItems: [walnut.principle] },
      { beat: 'method', type: 'ingredients', emotion: 'confident', place: 'market', line: '호두 500g에 설탕, 물엿, 꿀을 준비해요.', cardTitle: '재료', cardItems: walnut.ingredients.map(formatIngredient) },
      { beat: 'method', type: 'steps', emotion: 'confident', visual: 'sizzle', place: 'kitchen', line: '데치고, 말리고, 조리고, 140도 정도에서 튀겨요.', cardItems: walnut.steps.slice(0, 5) },
      { beat: 'close', type: 'outro', emotion: 'joy', visual: 'result', place: 'dining', line: '떫은맛은 데치는 단계에서 잡혀요. 이희재의 맛 연구소가 짚은 정석, 기억해 두세요.' },
    ],
    ...over,
  };
}

describe('AI 이야기 대본', () => {
  it('프롬프트에 원본 자료·규칙·반복 금지 문구가 들어간다', () => {
    const sys = storySystem();
    // 시청 대상 두 무리(2030 주부, 4050 요리 배우는 분)를 프롬프트에 넣고, 대본마다 하나를 고르게 한다
    expect(sys).toContain('2·30대 젊은 주부');
    expect(sys).toContain('4·50대 요리 취미');
    expect(sys).toContain('두 시청자가 모두');
    // 개수 말(한 장·한 알)로 대본이 버려지지 않게, 4050 대본에는 조리기능장 시선 훅을
    expect(sys).toContain('한 장·한 알');
    expect(sys).toContain('조리기능장의 방법·정석');
    expect(sys).toContain(BRAND.labName);
    for (const p of STORY_BANNED_PHRASES) expect(sys).toContain(p.trim());
    const user = storyUser(walnut, { count: 3, avoidTitles: ['예전 제목'] });
    expect(user).toContain('호두 500g');
    expect(user).toContain(walnut.steps[0]);
    expect(user).toContain('예전 제목');
    // 형식은 원본에 근거가 있을 때만 고를 수 있다 (형식 때문에 사실을 지어내지 않게)
    const types = availableStoryTypes(walnut);
    expect(availableStoryTypes(walnut, { realClips: 3 })).toContain('compare');
    expect(types).toEqual(expect.arrayContaining(['standard', 'why', 'quick', 'occasion', 'heritage']));
    expect(types).not.toContain('one-fix'); // 흔한 실수가 없다
    expect(types).not.toContain('qa'); // 연구자 답변이 없다
    expect(types).not.toContain('season'); // 계절 말이 없다
    expect(types).not.toContain('leftover'); // 보관·남은 재료 말이 없다
    expect(availableStoryTypes({ ...walnut, commonMistake: '데치지 않고 바로 조렸더니 떫었어요.' })).toContain('one-fix');
    expect(availableStoryTypes(walnut, { expertAnswers: ['수업에서는 데치는 물을 넉넉히 잡으라고 해요.'] })).toContain('qa');
    expect(availableStoryTypes({ ...walnut, tips: ['남은 정과는 밀폐해 보관해요.'] })).toContain('leftover');
    expect(availableStoryTypes({ ...walnut, story: '가을 햇호두가 나올 때 만들던 간식' })).toContain('season');
    // 두 방법 비교는 실제 촬영이 2개 이상일 때만 (3D 비교는 설득력이 약했다)
    expect(availableStoryTypes(walnut)).not.toContain('compare');
    expect(availableStoryTypes(walnut, { realClips: 2 })).toContain('compare');
    // 형식마다 구성이 달라야 한다 (모두 같은 흐름이면 레파토리가 똑같아진다)
    expect(new Set(Object.values(STORY_TYPE_INFO).map((i) => i.beats)).size).toBe(Object.keys(STORY_TYPE_INFO).length);
    // 사용자 프롬프트에 형식의 구성과 맞는 시청자가 들어간다
    expect(user).toContain(STORY_TYPE_INFO.why.beats);
    expect(user).toContain('4050 요리 배우는 분');
  });

  it('어른 시청자용 말투: 추리·내기 같은 유치한 구도를 금지하고, 걸리면 경고한다', () => {
    const sys = storySystem();
    expect(sys).toContain('시청자는 어른');
    expect(sys).toContain('해요체');
    expect(sys).toContain('실패 → 선생님 노트 → 해결 → 행복한 결말');
    for (const c of CHILDISH_FRAMING) expect(sys).toContain(`"${c.word}"`);
    // 예전 갈래는 고를 수 없다
    expect(storyUser(walnut, { count: 3 })).not.toMatch(/mystery|bet\(|rescue|gift\(/);
    const d = draft();
    d.title = '떫은 호두의 범인을 찾아라';
    d.scenes[1] = { ...d.scenes[1]!, line: '으악! 대충 해도 된다는 내기에 걸었는데요!' };
    d.scenes[5] = { ...d.scenes[5]!, line: '범인은 저였어요! 이희재의 맛 연구소 사건 해결! 성공!' };
    const c = finalizeStory(walnut, d, 'story-1');
    if ('error' in c) throw new Error(c.error);
    const w = c.warnings.join(' ');
    expect(w).toContain('유치하게');
    expect(w).toContain('"범인"');
    expect(w).toContain('"내기"');
    expect(w).toContain('"으악"');
    expect(w).toContain('느낌표');
    // 낱말 일부만 겹치는 말은 걸리지 않는다
    expect(findChildishFraming('냉장고에서 꺼내기 전에 시든 잎을 추리고 걸러내기')).toEqual([]);
    expect(findChildishFraming('추리해 볼까요')).toEqual(['추리']);
  });

  it('예전에 저장된 갈래도 이름표를 붙인다', () => {
    expect(storyTypeLabel('why')).toBe('이 단계는 왜?');
    expect(storyTypeLabel('mystery')).toBe('추리(예전)');
    expect(storyTypeLabel('모르는것')).toBe('모르는것');
  });

  it('구조화 출력 형식으로 받은 이야기를 대본으로 바꾼다 (첫 장면이 훅, 무대·연출 유지)', () => {
    const out = StoryOutputSchema.parse({ stories: [draft()] });
    const c = finalizeStory(walnut, out.stories[0]!, 'story-1');
    if ('error' in c) throw new Error(c.error);
    expect(c.script.style).toBe(AI_STORY_STYLE);
    expect(c.script.hookType).toBe('why');
    expect(c.audience).toBe('hobby-learner');
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

  it('조리 장면을 불이 없는 무대에 두면 주방으로 옮긴다', () => {
    const d = draft();
    d.scenes[4] = { ...d.scenes[4]!, place: 'market' };
    const c = finalizeStory(walnut, d, 'story-1');
    if ('error' in c) throw new Error(c.error);
    expect(c.script.scenes[4]!.place).toBe('kitchen');
  });

  it('첫 대사가 길면 경고한다 (첫 3초)', () => {
    const d = draft();
    d.scenes[0] = { ...d.scenes[0]!, line: '오늘 제가 아주 오래 고민하고 준비한 호두정과 이야기를 처음부터 하나하나 차근차근 들려 드릴게요' };
    const c = finalizeStory(walnut, d, 'story-1');
    if ('error' in c) throw new Error(c.error);
    expect(c.warnings.join(' ')).toContain('첫 대사');
    expect(storySystem()).toContain('친구한테 보내고 싶은');
  });

  it('연구자 이름이 붙는 팁·노트 카드는 원본 문장으로만 채운다 (맛조수 말이 연구자 팁처럼 보이지 않게)', () => {
    const d = draft();
    d.scenes.splice(5, 0, { beat: 'point', type: 'tip', emotion: 'joy', place: 'dining', line: '튀긴 뒤에는 기름부터 빼 주세요.' });
    d.scenes[2] = { ...d.scenes[2]!, cardItems: ['맛조수가 지어낸 원리'] };
    const c = finalizeStory(walnut, d, 'story-1');
    if ('error' in c) throw new Error(c.error);
    const tip = c.script.scenes.find((s) => s.type === 'tip')!;
    expect(tip.cardTitle).toBe(BRAND.tipPhrase);
    expect(tip.cardItems).toEqual([walnut.tips[0]]);
    const note = c.script.scenes.find((s) => s.type === 'explain')!;
    expect(walnut.principle).toContain(note.cardItems![0]!);
    // 원본에 팁이 없으면 팁 장면을 원리 노트로 바꾼다
    const noTips = finalizeStory({ ...walnut, tips: [] }, d, 'story-2');
    if ('error' in noTips) throw new Error(noTips.error);
    expect(noTips.script.scenes.some((s) => s.type === 'tip')).toBe(false);
  });

  it('계정의 최근 대본에서 많이 쓴 형식·소재는 이번에 피하게 한다 (견본 4편이 모두 범인 찾기였다)', () => {
    const recent: RecentStory[] = [
      { storyType: 'why', title: '호두정과, 데치는 진짜 이유', firstLine: '호두정과, 왜 데칠까요?' },
      { storyType: 'why', title: '김치전 반죽, 왜 바로 부칠까', firstLine: '김치전 반죽, 왜 미리 안 할까요?' },
      { storyType: 'why', title: '들깨소스는 왜 마지막에', firstLine: '들깨소스, 왜 마지막에 넣죠?' },
      { storyType: 'mystery', title: '할머니 간식 호두의 범인', firstLine: '할머니 간식 호두정과가 떫어요' },
      { storyType: 'mystery', title: '범인은 할머니 김치전 반죽', firstLine: '할머니 김치전이 왜 축축해요?' },
    ];
    expect(overusedTypes(recent)).toEqual(['why']);
    const motifs = repeatedMotifs(recent, [walnut.dishName, walnut.topic]);
    expect(motifs).toContain('범인');
    expect(motifs).toContain('할머니');
    const user = storyUser(walnut, { count: 3, recent });
    // 다른 형식이 충분하면 많이 쓴 형식은 고를 수 있는 형식에서 빠진다
    expect(user.split('## 원본 자료')[0]).not.toMatch(/- why\(/);
    expect(user).toContain('"범인"');
    expect(user).toContain('최근 대본 5개');
    // 예전 갈래도 이름표로 보여 준다
    expect(user).toContain('[추리(예전)]');
    expect(storySystem()).toContain('맛조수 세계의 가상 인물');
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
    d.scenes[5] = { ...d.scenes[5]!, line: '이번엔 바삭하고 고소해요.' };
    const c = finalizeStory(walnut, d, 'story-3');
    if ('error' in c) throw new Error(c.error);
    expect(c.warnings.join(' ')).toContain('오늘의 실험');
    expect(c.warnings.join(' ')).toContain(BRAND.labName);
    expect(c.warnings.join(' ')).toContain('무대');
    expect(c.script.scenes[0]!.visual).toBeUndefined();
  });
});
