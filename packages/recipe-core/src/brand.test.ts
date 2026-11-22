import { describe, expect, it } from 'vitest';
import {
  BRAND,
  BRIDGE_LINES,
  CASE_LEADS,
  HOOK_TYPES,
  NOTE_LEADS,
  OPENING_LINES,
  SAMPLE_RECIPES,
  SIGN_OFFS,
  STYLE_IDS,
  TIP_LEADS,
  TOPIC_LEADS,
  buildStyledScript,
  candidateTitle,
  checkScript,
  extractQuantities,
  findChildishFraming,
  findFakeExperience,
  generateTemplateScript,
  hasLimitLine,
  hookCandidate,
  hostLines,
  pickLine,
  type RecipeInput,
  type Script,
} from './index.ts';

/**
 * 맛조수가 고정 자리(첫 장면·원리·팁·엔딩)에서 하는 말과, 템플릿·연출 엔진 대본 전체가 고른 성격(기록 담당 AI)을 지키는지.
 * 근거: docs/research/content-strategy/persona-2026-11.md (낯선 브랜드의 반복 문구는 빨리 닳는다, '실험' 낱말 정리)
 */
const POOLS = { SIGN_OFFS, NOTE_LEADS, TIP_LEADS, OPENING_LINES, TOPIC_LEADS, BRIDGE_LINES, CASE_LEADS };
const count = (text: string, word: string) => text.split(word).length - 1;

describe('고정 자리 문장 묶음', () => {
  it('엔딩은 12개 이상이고, 모두 연구소 이름을 딱 한 번 말한다', () => {
    expect(SIGN_OFFS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SIGN_OFFS).size).toBe(SIGN_OFFS.length);
    for (const s of SIGN_OFFS) expect(count(s, BRAND.labName), s).toBe(1);
  });

  it('엔딩 밖의 자리에서는 연구소 이름(전체)을 말하지 않는다 (대본에서 한 번만)', () => {
    for (const [name, pool] of Object.entries(POOLS)) if (name !== 'SIGN_OFFS') for (const s of pool) expect(s, name).not.toContain(BRAND.labName);
  });

  it('실험한 척·비명·과장·가짜 경험·맛 한계 한마디·분량처럼 읽히는 말이 없다', () => {
    for (const [name, pool] of Object.entries(POOLS)) {
      expect(new Set(pool).size, name).toBe(pool.length);
      for (const s of pool) {
        expect(s, name).not.toMatch(/실험|으악|망했|대성공|!/);
        expect(findFakeExperience(s), s).toEqual([]);
        expect(findChildishFraming(s), s).toEqual([]);
        expect(hasLimitLine(s), s).toBe(false);
        expect(extractQuantities(s), s).toEqual([]);
        expect(s, s).not.toContain('에 따르면');
      }
    }
  });

  it('시리즈 이름에 "실험"이 없다 (기록·노트 쪽)', () => {
    expect(BRAND.series).not.toContain('실험');
    expect(BRAND.series).toMatch(/기록|노트/);
  });
});

describe('레시피마다 고르기', () => {
  it('같은 레시피·연출이면 늘 같은 문장 (다시 만들어도 승인한 대본과 같게)', () => {
    for (const r of SAMPLE_RECIPES) for (const style of STYLE_IDS) expect(hostLines(r, style)).toEqual(hostLines(structuredClone(r), style));
    expect(pickLine(SIGN_OFFS, '호두정과|problem|signOff')).toBe(pickLine(SIGN_OFFS, '호두정과|problem|signOff'));
  });

  it('레시피가 다르면 대개 다른 문장이 된다 (모든 영상이 같은 말로 끝나지 않게)', () => {
    const ends = SAMPLE_RECIPES.flatMap((r) => STYLE_IDS.map((style) => hostLines(r, style).signOff));
    expect(new Set(ends).size).toBeGreaterThanOrEqual(8);
    for (const style of STYLE_IDS) expect(new Set(SAMPLE_RECIPES.map((r) => hostLines(r, style).signOff)).size, style).toBeGreaterThan(1);
    expect(new Set(SAMPLE_RECIPES.map((r) => hostLines(r, 'template').noteLead)).size).toBeGreaterThan(1);
    expect(new Set(SAMPLE_RECIPES.map((r) => hostLines(r, 'template').tipLead)).size).toBeGreaterThan(1);
  });

  it('자리마다 따로 고른다: 노트·팁·엔딩이 서로 묶여 움직이지 않고, 엔딩 문장이 고루 쓰인다', () => {
    // 해시를 FNV만 쓰면 노트·팁 번호가 한 번도 같지 않았고(0%), 세 자리가 통째로 같은 요리 쌍이 독립일 때의 4배쯤 나왔다
    const picks = Array.from({ length: 400 }, (_, i) => hostLines({ dishName: `요리${i}`, topic: '' }, 'template'));
    const sameIndex = picks.filter((p) => NOTE_LEADS.indexOf(p.noteLead as (typeof NOTE_LEADS)[number]) === TIP_LEADS.indexOf(p.tipLead as (typeof TIP_LEADS)[number])).length / picks.length;
    expect(sameIndex).toBeGreaterThan(0.08); // 독립이면 1/6쯤
    expect(sameIndex).toBeLessThan(0.3);
    const triples = picks.map((p) => `${p.signOff}|${p.noteLead}|${p.tipLead}`);
    let pairs = 0;
    let same = 0;
    for (let i = 0; i < triples.length; i++)
      for (let j = i + 1; j < triples.length; j++) {
        pairs++;
        if (triples[i] === triples[j]) same++;
      }
    expect(same / pairs).toBeLessThan(0.004); // 독립이면 1/(14×6×6) ≈ 0.002
    const counts = SIGN_OFFS.map((s) => picks.filter((p) => p.signOff === s).length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(10); // 고르면 문장마다 29번쯤
  });

  it('요리 이름이 없으면 주제로 고른다', () => {
    const r = SAMPLE_RECIPES[1]!;
    expect(hostLines({ dishName: '', topic: r.topic }, 'template')).toEqual(hostLines({ dishName: r.topic, topic: 'x' }, 'template'));
  });
});

/** 연구자가 실수·오해·이야기까지 입력한 레시피 (모든 훅을 만들 수 있게) */
const full: RecipeInput[] = SAMPLE_RECIPES.map((r) => ({
  ...r,
  commonMistake: r.commonMistake || `순서를 건너뛰면 ${r.dishName} 맛이 덜해요.`,
  misconception: '오래 익힐수록 맛있다',
  story: '예부터 집집마다 만들던 음식이에요. 손님상에도 올랐어요.',
}));

/** 템플릿·연출 엔진이 만드는 모든 대본 (샘플 × 연출 × 만들 수 있는 훅) */
function engineScripts(): { name: string; recipe: RecipeInput; script: Script }[] {
  const out: { name: string; recipe: RecipeInput; script: Script }[] = [];
  for (const recipe of [...SAMPLE_RECIPES, ...full]) {
    out.push({ name: `${recipe.dishName}/template`, recipe, script: generateTemplateScript(recipe) });
    out.push({ name: `${recipe.dishName}/template-comedy`, recipe, script: generateTemplateScript({ ...recipe, format: 'comedy' }) });
    for (const style of STYLE_IDS)
      for (const type of HOOK_TYPES) {
        if (!hookCandidate(recipe, type).available) continue;
        try {
          out.push({ name: `${recipe.dishName}/${style}/${type}`, recipe, script: buildStyledScript(recipe, { style, hookType: type }).script });
        } catch {
          // 자료가 모자란 조합 (이야기 없는 스토리형 등)
        }
      }
  }
  return out;
}

describe('엔진 대본은 고른 맛조수 성격으로 말한다', () => {
  const all = engineScripts();

  it('충분히 많은 조합을 살펴본다', () => {
    expect(all.length).toBeGreaterThan(300);
  });

  it('맛조수는 실수·당황·비명·"대성공" 없이, 실험·조리·시식을 직접 한 척하지 않는다', () => {
    for (const { name, script } of all) {
      const lines = script.scenes.map((s) => s.line).join('\n');
      expect(lines, name).not.toMatch(/실험|으악|망했|대성공|이번엔 제대로|대체 왜|만들어 볼게요/);
      expect(findFakeExperience(lines), name).toEqual([]);
      expect(findChildishFraming(lines), name).toEqual([]);
      expect(hasLimitLine(lines), name).toBe(false);
      for (const s of script.scenes) {
        expect(['embarrassed', 'disappointed'], `${name} ${s.id}`).not.toContain(s.emotion);
        // 'fail'은 맛조수가 실패 접시를 든 화면 (실패는 음식 클로즈업 'fail-closeup'으로만)
        expect(s.visual, `${name} ${s.id}`).not.toBe('fail');
      }
    }
  });

  it('연구소 이름은 마지막 대사에서 한 번만 말하고, 원본 대조 오류가 없다 (원칙 1)', () => {
    for (const { name, recipe, script } of all) {
      const lines = script.scenes.map((s) => s.line).join('\n');
      expect(count(lines, BRAND.labName), name).toBe(1);
      expect(script.scenes.at(-1)!.line, name).toContain(BRAND.labName);
      expect(SIGN_OFFS.some((s) => script.scenes.at(-1)!.line.endsWith(s)), name).toBe(true);
      expect(checkScript(recipe, script).filter((i) => i.level === 'error'), name).toEqual([]);
    }
  });

  it('후보 제목에도 실험·도전기 같은 말이 없다', () => {
    for (const r of SAMPLE_RECIPES) for (const style of STYLE_IDS) expect(candidateTitle(r, style), `${r.dishName}/${style}`).not.toMatch(/실험|도전기/);
  });
});
