import { describe, expect, it } from 'vitest';
import {
  BRAND,
  GAGS,
  GAG_LABELS,
  SAMPLE_RECIPES,
  STYLE_IDS,
  ScriptSchema,
  StorySceneDraftSchema,
  buildStyledScript,
  checkScript,
  clipGroups,
  finalizeStory,
  formatIngredient,
  gagFromLine,
  gagPlan,
  generateTemplateScript,
  shotList,
  storySystem,
  storyUser,
  type Script,
  type StoryDraft,
} from './index.ts';
import { GAG_HINTS } from './gags.ts';

const kimchi = SAMPLE_RECIPES.find((r) => r.dishName === '바삭한 김치전')!;
const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

/** 견본(2026-11-23)처럼 엉뚱한 단계를 tip으로 적은 김치전 엉뚱 가이드 */
const sampleDraft = (over: Partial<StoryDraft['scenes'][number]>[] = []): StoryDraft => {
  const scenes: StoryDraft['scenes'] = [
    { beat: 'hook', type: 'intro', emotion: 'curious', visual: 'result', place: 'dining', line: '식탁 위 김치전이 금방 눅눅해지셨나요?' },
    { beat: 'context', type: 'tip', emotion: 'confident', place: 'dining', line: '먼저 김치전을 들고 사막 한가운데로 이사해 주세요.', cardTitle: BRAND.tipPhrase, cardItems: [kimchi.tips[0]!] },
    { beat: 'context', type: 'tip', emotion: 'confident', place: 'dining', line: '집채만 한 선풍기를 틀고, 그래도 안 되면 달로 가져가세요.', cardTitle: BRAND.tipPhrase, cardItems: [kimchi.tips[0]!] },
    { beat: 'point', type: 'question', emotion: 'confident', place: 'lab', line: '여기까지는 농담이에요. 진짜 방법은 부엌에 있어요.' },
    { beat: 'point', type: 'explain', emotion: 'confident', place: 'lab', line: '김치 속 소금이 반죽 수분을 끌어내 질어져요.', cardTitle: BRAND.notePhrase, cardItems: [] },
    { beat: 'method', type: 'ingredients', emotion: 'confident', place: 'kitchen', line: '재료는 이렇게 준비해요.', cardTitle: '재료', cardItems: kimchi.ingredients.map(formatIngredient) },
    { beat: 'method', type: 'steps', emotion: 'confident', visual: 'sizzle', place: 'kitchen', line: '반죽은 부치기 직전에 섞어 주세요.', cardItems: kimchi.steps.slice(0, 5) },
    { beat: 'close', type: 'tip', emotion: 'confident', place: 'kitchen', line: '다 부치면 식힘망에 펼쳐 주세요.' },
    { beat: 'close', type: 'outro', emotion: 'joy', visual: 'signature', place: 'dining', line: `식힘망이면 충분하다고 ${BRAND.labName}가 전해요.` },
  ];
  return { title: '눅눅한 김치전, 사막으로 가야 할까', storyType: 'deadpan', audience: 'young-home', logline: '엉뚱한 방법 뒤 진짜 방법', scenes: scenes.map((s, i) => ({ ...s, ...over[i] })) };
};

describe('농담 장면 그림 (gag)', () => {
  it('그림 목록은 12~20가지이고 이름·설명이 모두 있다', () => {
    expect(GAGS.length).toBeGreaterThanOrEqual(12);
    expect(GAGS.length).toBeLessThanOrEqual(20);
    for (const g of GAGS) {
      expect(GAG_LABELS[g]).toBeTruthy();
      expect(GAG_HINTS[g]).toBeTruthy();
    }
  });

  it('대사 낱말로 그림을 고른다 (달군다·정상적인 같은 말에는 걸리지 않게)', () => {
    expect(gagFromLine('먼저 김치전을 들고 사막 한가운데로 이사해 주세요.')).toBe('desert');
    expect(gagFromLine('그래도 남으면 호두를 달까지 보내 주세요.')).toBe('moon');
    expect(gagFromLine('호두를 집채만 한 그네에 태워 주세요.')).toBe('giant-swing');
    expect(gagFromLine('보통은 호두를 타워크레인으로 옥상까지 올려요.')).toBe('crane');
    expect(gagFromLine('팬을 충분히 달군다.')).toBeNull();
    expect(gagFromLine('반죽을 얇게 펴 주세요.')).toBeNull();
  });

  it('글자 그대로용 그림: 편지·우체통, 부채, 재우기', () => {
    expect(gagFromLine('글자 그대로면 전을 우체통에 넣어 보내는 일이에요.')).toBe('mailbox');
    expect(gagFromLine('편지를 부치는 그 부치다요.')).toBe('mailbox');
    expect(gagFromLine('커다란 부채로 바람을 보내 드려요.')).toBe('hand-fan');
    expect(gagFromLine('부채질을 아주 성실하게 해요.')).toBe('hand-fan');
    expect(gagFromLine('집채만 한 선풍기를 틀어요.')).toBe('giant-fan');
    expect(gagFromLine('고기를 이불 덮어 재워 주세요.')).toBe('bedtime');
    expect(gagFromLine('반죽을 앞뒤로 노릇하게 부친다.')).toBeNull();
  });

  it('대본 안에서 그림이 겹치지 않게 고르고, 작가가 고른 그림은 그대로 둔다', () => {
    const plan = gagPlan([
      { type: 'intro', line: '사막' },
      { type: 'gag', line: '사막으로 가 주세요.' },
      { type: 'gag', line: '이번에도 사막으로 가 주세요.' },
      { type: 'gag', line: '아무 말', gag: 'ocean' },
    ]);
    expect(plan[0]).toBeNull();
    expect(plan[1]).toBe('desert');
    expect(plan[2]).not.toBe('desert');
    expect(plan[2]).not.toBe('ocean');
    expect(plan[3]).toBe('ocean');
  });

  it('대본 형식(ScriptSchema)과 작가 출력 형식이 gag 장면·그림을 받는다', () => {
    const scene = StorySceneDraftSchema.parse({ beat: 'context', type: 'gag', gag: 'moon', emotion: 'confident', place: 'dining', line: '달로 가져가세요.' });
    expect(scene.gag).toBe('moon');
    const script = ScriptSchema.parse({ title: 't', scenes: [{ id: 's1', type: 'intro', emotion: 'joy', line: 'a' }, { id: 's2', type: 'gag', gag: 'desert', emotion: 'confident', line: 'b' }, { id: 's3', type: 'outro', emotion: 'joy', line: 'c' }] });
    expect(script.scenes[1]!.gag).toBe('desert');
    expect(() => ScriptSchema.parse({ ...script, scenes: script.scenes.map((s) => ({ ...s, gag: 'volcano' })) })).toThrow();
  });

  it('연출 엔진·템플릿은 농담 장면을 만들지 않는다', () => {
    for (const recipe of SAMPLE_RECIPES) {
      expect(generateTemplateScript(recipe).scenes.some((s) => s.type === 'gag')).toBe(false);
      for (const style of STYLE_IDS) expect(buildStyledScript(recipe, { style }).script.scenes.some((s) => s.type === 'gag')).toBe(false);
    }
  });
});

describe('엉뚱 가이드 안전망 (finalizeStory)', () => {
  it('견본처럼 엉뚱한 단계를 tip으로 적어도 농담 장면이 되고, 진짜 팁 카드는 농담 중에 뜨지 않는다', () => {
    const c = finalizeStory(kimchi, sampleDraft(), 's');
    if ('error' in c) throw new Error(c.error);
    const types = c.script.scenes.map((s) => s.type);
    expect(types.slice(0, 4)).toEqual(['intro', 'gag', 'gag', 'question']);
    expect(c.script.scenes[1]!.gag).toBe('desert');
    expect(c.script.scenes[2]!.gag).toBe('moon');
    const turn = c.script.scenes.findIndex((s) => s.line.includes('농담'));
    // 연구자 카드(노트·팁)는 농담이라고 밝힌 뒤에만
    c.script.scenes.forEach((s, i) => {
      const researcher = s.cardTitle === BRAND.tipPhrase || s.cardTitle === BRAND.notePhrase;
      if (i < turn) expect(researcher).toBe(false);
      if (s.type === 'gag') expect(s.cardTitle ?? s.cardItems ?? s.visual).toBeUndefined();
    });
    // 전환 뒤의 진짜 팁은 그대로 팁 카드
    expect(c.script.scenes[7]!.type).toBe('tip');
    expect(c.script.scenes[7]!.cardTitle).toBe(BRAND.tipPhrase);
    expect(c.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(c.notes.join(' ')).toContain('농담 장면으로 바꾸고 연구자 카드를 뺐습니다');
  });

  it('작가가 gag로 적고 카드를 붙여도 카드는 빠지고 고른 그림은 남는다', () => {
    const d = sampleDraft([{}, { type: 'gag', gag: 'camping', cardTitle: BRAND.tipPhrase, cardItems: ['x'] }]);
    const c = finalizeStory(kimchi, d, 's');
    if ('error' in c) throw new Error(c.error);
    expect(c.script.scenes[1]).toMatchObject({ type: 'gag', gag: 'camping' });
    expect(c.script.scenes[1]!.cardTitle).toBeUndefined();
  });

  it('질문 장면이라도 농담 전 엉뚱한 곳 이야기는 농담 장면으로 (그림이 보이게)', () => {
    const c = finalizeStory(kimchi, sampleDraft([{}, { type: 'question', cardTitle: undefined, cardItems: undefined }]), 's');
    if ('error' in c) throw new Error(c.error);
    expect(c.script.scenes[1]!.type).toBe('gag');
  });

  it('농담이라고 밝히는 줄이 없으면 바꾸지 않고 경고만 한다', () => {
    const d = sampleDraft([{}, {}, {}, { line: '이제 부엌으로 가 볼게요.' }]);
    const c = finalizeStory(kimchi, d, 's');
    if ('error' in c) throw new Error(c.error);
    expect(c.script.scenes[1]!.type).toBe('tip');
    expect(c.warnings.join(' ')).toContain('농담이라고 밝히는 줄이 없어요');
  });

  it('다른 형식에 섞인 농담 장면은 질문 장면으로 되돌린다', () => {
    const d: StoryDraft = { ...sampleDraft([{}, { type: 'gag', gag: 'desert' }]), storyType: 'why' };
    const c = finalizeStory(kimchi, d, 's');
    if ('error' in c) throw new Error(c.error);
    expect(c.script.scenes.some((s) => s.type === 'gag' || s.gag)).toBe(false);
  });
});

describe('원본 대조: 농담 장면', () => {
  const script = (gagLine: string, card = false): Script => ({
    title: 't',
    style: 'ai-story',
    scenes: [
      { id: 's1', type: 'intro', emotion: 'joy', line: '호두정과 떫을 때 있죠?' },
      { id: 's2', type: 'gag', emotion: 'confident', line: gagLine, gag: 'moon', ...(card ? { cardTitle: BRAND.tipPhrase, cardItems: [walnut.tips[0]!] } : {}) },
      { id: 's3', type: 'outro', emotion: 'joy', line: `${BRAND.labName}였어요.` },
    ],
  });
  it('농담 장면에 분량이 있으면 원본에 있는 분량이어도 막는다', () => {
    const issues = checkScript(walnut, script('호두 500g을 달까지 보내 주세요.'));
    expect(issues.some((i) => i.level === 'error' && i.code === 'gag' && i.sceneId === 's2')).toBe(true);
  });
  it('농담 장면에 카드가 있으면 막는다', () => {
    expect(checkScript(walnut, script('호두를 달까지 보내 주세요.', true)).some((i) => i.code === 'gag')).toBe(true);
  });
  it('분량·카드 없는 농담 장면은 통과', () => {
    expect(checkScript(walnut, script('호두를 달까지 보내 주세요.')).some((i) => i.level === 'error')).toBe(false);
  });
});

describe('촬영 묶음과 농담 장면', () => {
  it('농담 장면은 농담 장면끼리만 묶이고, 그 묶음은 찍지 않아도 된다고 알린다', () => {
    const c = finalizeStory(kimchi, sampleDraft(), 's');
    if ('error' in c) throw new Error(c.error);
    const groups = clipGroups(c.script);
    const byId = new Map(c.script.scenes.map((s) => [s.id, s]));
    for (const g of groups) {
      const kinds = new Set(g.map((id) => byId.get(id)!.type === 'gag'));
      expect(kinds.size).toBe(1);
    }
    const shots = shotList(c.script, kimchi);
    const gagShot = shots.find((s) => s.sceneIds.every((id) => byId.get(id)!.type === 'gag'))!;
    expect(gagShot.title).toContain('찍지 않아도');
  });
});

describe('작가 지시 (프롬프트)', () => {
  it('장면 종류·그림 목록·실패 화면 설명에 농담 장면 규칙이 있다', () => {
    const sys = storySystem();
    expect(sys).toMatch(/type: .*\| gag/);
    for (const g of GAGS) expect(sys).toContain(`- ${g}: `);
    expect(sys).toContain('농담 장면에는 쓰지 마');
    const user = storyUser(walnut, { count: 3, mustInclude: 'deadpan' });
    expect(user).toContain('type "gag"');
    expect(user).toContain('tip·explain으로 쓰지 마');
  });

  it('요청한 형식과 시청자를 한 대본에 함께 꼭 넣으라고 알린다', () => {
    const both = storyUser(kimchi, { count: 3, mustInclude: 'deadpan', mustAudience: 'young-home' });
    expect(both).toContain('반드시 형식 deadpan');
    expect(both).toContain('시청자 young-home');
    expect(both).toContain('audience는 "young-home"');
    const who = storyUser(kimchi, { count: 3, mustAudience: 'hobby-learner' });
    expect(who).toContain('반드시 시청자 hobby-learner');
    expect(storyUser(kimchi, { count: 3 })).not.toContain('반드시');
  });
});
