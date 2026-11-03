import { describe, expect, it } from 'vitest';
import {
  HOOK_TYPES,
  STYLE_IDS,
  SAMPLE_RECIPES,
  applyHook,
  buildStyledScript,
  causeEffect,
  checkScript,
  findSensory,
  formatIngredient,
  hookCandidate,
  hookLineIssues,
  josa,
  suggestHooks,
  repetitionWarning,
  type RecipeInput,
} from './index.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
const pasta = SAMPLE_RECIPES.find((r) => r.dishName === '들깨고사리파스타')!;
/** 실험용: 연구자가 실수·오해·이야기를 입력한 상태 */
const walnutFull: RecipeInput = {
  ...walnut,
  commonMistake: '호두를 데치지 않고 바로 조리면 떫은맛이 남을 수 있어요.',
  misconception: '정과는 오래 졸일수록 바삭하다',
  story: '정과는 예부터 잔칫상에 오르던 과자예요. 과일이나 견과를 꿀이나 조청에 조려 만들었어요.',
};

describe('한국어 도우미', () => {
  it('받침에 맞는 조사를 붙인다', () => {
    expect(josa('호두정과', '이/가')).toBe('호두정과가');
    expect(josa('조리기능장', '이/가')).toBe('조리기능장이');
    expect(josa('파스타', '을/를')).toBe('파스타를');
    expect(josa('들깨', '으로/로')).toBe('들깨로');
    expect(josa('물', '으로/로')).toBe('물로');
    expect(josa('밥', '으로/로')).toBe('밥으로');
  });

  it('"~하면 ~합니다" 원리 문장을 원인과 결과로 나눈다', () => {
    expect(causeEffect('호두를 끓는 물에 데친 뒤 찬물에 헹구면 떫은맛이 줄어듭니다.')).toEqual({
      cause: '호두를 끓는 물에 데친 뒤 찬물에 헹구면',
      effect: '떫은맛이 줄어듭니다',
    });
    // "~면서"는 조건이 아니다
    expect(causeEffect('굳으면서 바삭해집니다')).toBeNull();
  });

  it('원본에 있는 식감 표현만 찾는다', () => {
    expect(findSensory(walnut.principle).map((s) => s.stem)).toEqual(['바삭']);
    expect(findSensory('그냥 끓입니다')).toEqual([]);
  });
});

describe('훅 후보 엔진', () => {
  it('15가지 유형을 모두 평가하고, 만들 수 없는 유형은 필요한 자료와 함께 뒤로 보낸다', () => {
    const hooks = suggestHooks(walnut);
    expect(hooks).toHaveLength(15);
    expect(new Set(hooks.map((h) => h.type))).toEqual(new Set(HOOK_TYPES));
    const firstUnavailable = hooks.findIndex((h) => !h.available);
    expect(hooks.slice(firstUnavailable).every((h) => !h.available)).toBe(true);
    const mistake = hooks.find((h) => h.type === 'mistake')!;
    expect(mistake.available).toBe(false);
    expect(mistake.missing).toContain('흔한 실수');
  });

  it('흔한 실수·오해·이야기가 없으면 지어내지 않는다', () => {
    for (const t of ['mistake', 'myth', 'problem-solve', 'story', 'twist'] as const) {
      expect(hookCandidate(walnut, t).available).toBe(false);
    }
    for (const t of ['mistake', 'myth', 'problem-solve', 'story', 'twist'] as const) {
      expect(hookCandidate(walnutFull, t).available).toBe(true);
    }
  });

  it('같은 레시피에서 서로 다른 훅 문장과 첫 화면을 만든다', () => {
    const available = suggestHooks(walnutFull).filter((h) => h.available);
    expect(available.length).toBeGreaterThanOrEqual(13);
    expect(new Set(available.map((h) => h.line)).size).toBe(available.length);
    const visuals = new Set(available.map((h) => h.scenes[0]?.visual));
    expect(visuals.size).toBeGreaterThanOrEqual(4);
  });

  it('추천 이유를 레시피 특징으로 설명한다', () => {
    const fact = hookCandidate(walnut, 'surprising-fact');
    expect(fact.reason).toContain('숫자');
    const story = hookCandidate(walnutFull, 'story');
    expect(story.reason).toContain('전통조리');
  });

  it('비교·실험 훅은 설명용 연출임을 검수 항목으로 남긴다', () => {
    for (const t of ['compare', 'experiment'] as const) {
      const h = hookCandidate(walnut, t);
      expect(h.scenes[0]?.visual).toBe('compare');
      expect(h.needsReview.join(' ')).toContain('설명용');
    }
  });

  it('모든 훅 문장에 원본에 없는 분량이 없다', () => {
    for (const recipe of [walnutFull, pasta]) {
      for (const h of suggestHooks(recipe).filter((x) => x.available)) {
        expect(hookLineIssues(recipe, h.line), `${h.type}: ${h.line}`).toEqual([]);
      }
    }
    expect(hookLineIssues(walnut, '180도에서 튀기세요')).toHaveLength(1);
  });
});

describe('반복 방지와 첫 3초', () => {
  it('최근에 같은 훅을 여러 번 썼으면 순위를 낮추고 이유를 말한다', () => {
    const fresh = hookCandidate(walnut, 'result-first');
    const tired = hookCandidate(walnut, 'result-first', { recent: [{ hookType: 'result-first' }, { hookType: 'result-first' }, { hookType: 'question' }] });
    expect(tired.score).toBeLessThan(fresh.score);
    expect(tired.reason).toContain('반복');
  });

  it('최근 3편이 같은 연출이면 경고한다', () => {
    expect(repetitionWarning([{ style: 'comedy' }, { style: 'comedy' }, { style: 'comedy' }], 'comedy')).toContain('반복');
    expect(repetitionWarning([{ style: 'comedy' }, { style: 'experiment' }, { style: 'comedy' }], 'comedy')).toBeNull();
  });

  it('첫 문장이 3초를 넘으면 이유와 함께 감점한다', () => {
    const fact = hookCandidate(walnut, 'surprising-fact');
    expect(fact.reason).toMatch(/초/);
  });
});

describe('연출 유형별 대본', () => {
  it('모든 연출 유형에서 원본 재료·분량을 바꾸지 않고 오류 없는 대본을 만든다', () => {
    for (const style of STYLE_IDS) {
      const recipe = style === 'story' ? walnutFull : walnut;
      const { script } = buildStyledScript(recipe, { style });
      expect(script.scenes.length).toBeGreaterThanOrEqual(4);
      expect(script.scenes.length).toBeLessThanOrEqual(12);
      expect(script.style).toBe(style);
      const card = script.scenes.find((s) => s.type === 'ingredients');
      if (card) expect(card.cardItems).toEqual(recipe.ingredients.map(formatIngredient));
      const errors = checkScript(recipe, script).filter((i) => i.level === 'error');
      expect(errors, style).toEqual([]);
    }
  });

  it('첫 장면이 훅이고, 엔딩은 연구자 서명 카드다', () => {
    const { script, hook } = buildStyledScript(walnut, { style: 'experiment' });
    expect(script.scenes[0]!.hook).toBe(true);
    expect(script.scenes[0]!.line).toBe(hook.line);
    expect(script.scenes.at(-1)!.visual).toBe('signature');
  });

  it('캐릭터 코미디형과 실험형은 장면 구성이 다르다', () => {
    const comedy = buildStyledScript(walnutFull, { style: 'comedy' }).script;
    const experiment = buildStyledScript(walnutFull, { style: 'experiment' }).script;
    expect(comedy.scenes[0]!.visual).toBe('fail');
    expect(comedy.scenes[0]!.emotion).toBe('embarrassed');
    expect(experiment.scenes[0]!.visual).toBe('compare');
    expect(comedy.scenes.map((s) => s.type).join()).not.toBe(experiment.scenes.map((s) => s.type).join());
    expect(comedy.scenes.some((s) => s.visual === 'react')).toBe(true);
  });

  it('필요한 자료가 없으면 지어내지 않고 안내를 남긴다', () => {
    const { notes } = buildStyledScript(walnut, { style: 'problem' });
    expect(notes.join(' ')).toContain('흔한 실수');
    expect(() => buildStyledScript(walnut, { style: 'story', hookType: 'story' })).toThrow(/이야기/);
  });

  it('전문가 이름은 노트·팁·서명에 나오되, 긴 자기소개를 반복하지 않는다', () => {
    const { script } = buildStyledScript(walnut, { style: 'problem' });
    const all = script.scenes.map((s) => s.line).join(' ');
    expect(all).toContain('이희재');
    expect(all.split('조리기능장').length - 1).toBeLessThanOrEqual(2);
  });
});

describe('훅만 바꾸기', () => {
  it('훅을 바꾸면 첫 장면만 바뀌고 나머지 장면(음성)은 그대로다', () => {
    const { script } = buildStyledScript(walnut, { style: 'experiment', hookType: 'experiment' });
    const { script: next } = applyHook(script, walnut, 'result-first');
    expect(next.hookType).toBe('result-first');
    expect(next.scenes[0]!.visual).toBe('result');
    expect(next.scenes[0]!.line).not.toBe(script.scenes[0]!.line);
    expect(next.scenes.slice(1)).toEqual(script.scenes.slice(1));
    expect(new Set(next.scenes.map((s) => s.id)).size).toBe(next.scenes.length);
  });

  it('만들 수 없는 훅으로는 바꾸지 않는다', () => {
    const { script } = buildStyledScript(walnut, { style: 'experiment' });
    expect(() => applyHook(script, walnut, 'mistake')).toThrow(/흔한 실수/);
  });
});
