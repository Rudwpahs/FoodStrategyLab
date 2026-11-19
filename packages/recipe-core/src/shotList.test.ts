import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, SHOT_TIPS, STYLE_IDS, buildStyledScript, clipGroups, formatIngredient, generateTemplateScript, shotList, type Script } from './index.ts';

const recipes = SAMPLE_RECIPES;
const kimchi = recipes[0]!;

describe('촬영 목록 (휴대폰으로 찍을 장면)', () => {
  it('영상 묶음마다 하나씩, 같은 번호·같은 장면으로 만든다', () => {
    for (const recipe of recipes) {
      const script = generateTemplateScript(recipe);
      const shots = shotList(script, recipe);
      expect(shots.map((s) => s.sceneIds)).toEqual(clipGroups(script));
      expect(shots.map((s) => s.group)).toEqual(shots.map((_, i) => i + 1));
    }
  });

  it('첫 묶음은 완성 요리, 조리 장면은 손동작, 재료 장면은 재료 펼치기', () => {
    const script = generateTemplateScript(kimchi);
    const shots = shotList(script, kimchi);
    expect(shots[0]!.kind).toBe('dish');
    expect(shots[0]!.instruction).toContain('바삭한 김치전을');
    expect(shots[0]!.instruction).toMatch(/위에서|45도/);
    const steps = shots.find((s) => s.kind === 'step')!;
    expect(steps).toBeDefined();
    // 불을 쓰는 단계(부치기)를 먼저 고른다
    expect(steps.instruction).toContain('반죽을 얇게 펴서 앞뒤로 노릇하게 부친다.');
    const ing = shots.find((s) => s.kind === 'ingredients');
    if (ing) expect(ing.quote).toEqual(kimchi.ingredients.map(formatIngredient));
  });

  it('원본 조리 순서·재료 글자를 바꾸지 않는다 (분량 포함)', () => {
    for (const recipe of recipes) {
      for (const style of STYLE_IDS) {
        let script: Script;
        try {
          script = buildStyledScript(recipe, { style }).script;
        } catch {
          continue;
        }
        const originals = new Set([...recipe.steps, ...recipe.ingredients.map(formatIngredient), recipe.principle, ...recipe.tips]);
        const scriptCards = new Set(script.scenes.flatMap((s) => s.cardItems ?? []));
        for (const shot of shotList(script, recipe)) {
          for (const q of shot.quote) expect(originals.has(q) || scriptCards.has(q)).toBe(true);
          if (shot.kind === 'step') {
            const quoted = shot.instruction.match(/“(.+)”/)?.[1];
            if (quoted) expect(recipe.steps).toContain(quoted);
            for (const q of shot.quote) expect(recipe.steps).toContain(q);
          }
        }
      }
    }
  });

  it('찍는 시간은 3~8초, 요령은 한 줄씩 있다', () => {
    for (const recipe of recipes) {
      for (const shot of shotList(generateTemplateScript(recipe), recipe)) {
        expect(shot.seconds).toBeGreaterThanOrEqual(3);
        expect(shot.seconds).toBeLessThanOrEqual(8);
        expect(shot.tip.length).toBeGreaterThan(5);
        expect(shot.tip).not.toContain('\n');
        expect(shot.title.length).toBeGreaterThan(0);
      }
    }
    expect(SHOT_TIPS.join(' ')).toContain('세로');
    expect(SHOT_TIPS.join(' ')).toContain('손만');
    expect(SHOT_TIPS.join(' ')).toContain('소리');
  });

  it('설명·팁 장면은 핵심 순간을 가까이 찍게 한다 (레시피 말로 고름)', () => {
    const script: Script = {
      title: '김치전',
      scenes: [
        { id: 's1', type: 'question', emotion: 'curious', line: '김치전 왜 눅눅해질까요?', hook: true },
        { id: 's1b', type: 'mistake', emotion: 'embarrassed', line: '으악, 반죽을 미리 만들어 뒀더니 다 눅눅해졌어요!' },
        { id: 's2', type: 'explain', emotion: 'confident', line: '기름을 넉넉히 두르고 충분히 달궈야 바삭하게 부쳐져요. 이게 제일 중요해요.', cardItems: ['팬에 식용유를 넉넉히 두르고 충분히 달군다.'] },
        { id: 's3', type: 'tip', emotion: 'joy', line: '다 부친 전은 겹치지 말고 식힘망에 올리세요. 그래야 바삭함이 오래가요.', cardItems: [kimchi.tips[0]!] },
        { id: 's4', type: 'outro', emotion: 'joy', line: '오늘도 맛있게!' },
      ],
    };
    const shots = shotList(script, kimchi);
    const close = shots.filter((s) => s.kind === 'closeup');
    expect(close.length).toBeGreaterThan(0);
    expect(close[0]!.instruction).toContain('지글지글');
    expect(shots.at(-1)!.kind).toBe('dish');
    expect(shots.at(-1)!.instruction).toContain('한 입');
  });

  it('요리 이름에 맞는 조사를 붙인다', () => {
    const script = generateTemplateScript(recipes[1]!);
    expect(shotList(script, recipes[1]!)[0]!.instruction).toContain('시금치나물을');
  });
});
