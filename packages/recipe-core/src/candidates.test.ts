import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, checkScript, contentCandidates, formatIngredient, instagramCaption, type RecipeInput } from './index.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
/** 파일럿과 같은 입력 (흔한 실수 = 검수 필요 초안) */
const pilot: RecipeInput = { ...walnut, commonMistake: '호두를 데치지 않고 바로 조리면 떫은맛이 남을 수 있어요.' };

describe('콘텐츠 후보 3가지', () => {
  it('호두정과 파일럿 입력으로 A(문제 해결)·B(코미디)·C(실험) 세 후보가 나온다', () => {
    const { candidates } = contentCandidates(pilot);
    expect(candidates.map((c) => c.style)).toEqual(['problem', 'comedy', 'experiment']);
  });

  it('세 후보는 연출·훅·첫 화면이 모두 다르다', () => {
    for (const r of [pilot, walnut, ...SAMPLE_RECIPES]) {
      const { candidates } = contentCandidates(r);
      expect(candidates.length, r.dishName).toBe(3);
      for (const k of ['style', 'hookType', 'firstVisual'] as const) {
        expect(new Set(candidates.map((c) => c[k] ?? 'none')).size, `${r.dishName} ${k}`).toBe(3);
      }
      expect(new Set(candidates.map((c) => c.script.scenes.map((s) => s.type).join())).size, r.dishName).toBeGreaterThanOrEqual(2);
    }
  });

  it('후보마다 제목·첫 대사·핵심 장면 3개·예상 길이·이유가 있다', () => {
    for (const c of contentCandidates(pilot).candidates) {
      expect(c.title).toBeTruthy();
      expect(c.firstLine).toBe(c.script.scenes[0]!.line);
      expect(c.keyScenes.map((k) => k.label)).toEqual(['첫 장면', '핵심 장면', '마무리']);
      expect(c.estimatedSeconds).toBeGreaterThan(10);
      expect(c.reason).toBeTruthy();
    }
  });

  it('모든 후보는 원본 재료·분량·순서를 지키고 오류가 없다', () => {
    for (const r of [pilot, ...SAMPLE_RECIPES]) {
      for (const c of contentCandidates(r).candidates) {
        expect(checkScript(r, c.script).filter((i) => i.level === 'error'), `${r.dishName} ${c.key}`).toEqual([]);
        const card = c.script.scenes.find((s) => s.type === 'ingredients');
        if (card) expect(card.cardItems).toEqual(r.ingredients.map(formatIngredient));
      }
    }
  });

  it('"다른 후보 보기"는 이미 본 조합을 빼고, 더 없으면 알려 준다', () => {
    const first = contentCandidates(pilot);
    const seen = first.candidates.map((c) => c.key);
    const second = contentCandidates(pilot, { exclude: seen });
    expect(second.candidates.length).toBeGreaterThan(0);
    for (const c of second.candidates) expect(seen).not.toContain(c.key);
    // 두 번째 묶음은 처음에 안 나온 연출 유형부터 보여 준다
    const firstStyles = first.candidates.map((c) => c.style);
    expect(firstStyles).not.toContain(second.candidates[0]!.style);
    // 핵심 장면은 첫 장면(훅)과 다르다
    for (const c of first.candidates) expect(c.keyScenes[1]!.line).not.toBe(c.keyScenes[0]!.line);
    let all = [...seen, ...second.candidates.map((c) => c.key)];
    let guard = 0;
    let next = second;
    while (!next.exhausted && guard++ < 20) {
      next = contentCandidates(pilot, { exclude: all });
      all = [...all, ...next.candidates.map((c) => c.key)];
    }
    expect(next.exhausted).toBe(true);
  });

  it('필요한 자료가 없는 연출(이야기 없는 스토리형 등)은 후보로 내지 않는다', () => {
    const all = [];
    let exclude: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = contentCandidates(pilot, { exclude });
      all.push(...r.candidates);
      exclude = [...exclude, ...r.candidates.map((c) => c.key)];
      if (r.exhausted) break;
    }
    expect(all.some((c) => c.style === 'story')).toBe(false);
    const withStory = contentCandidates({ ...pilot, story: '정과는 잔칫상에 오르던 과자예요. 꿀에 조려 만들었어요.' }, { exclude: ['problem:mistake', 'comedy:skit', 'experiment:experiment'] });
    expect(withStory.candidates.some((c) => c.style === 'story')).toBe(true);
  });

  it('최근에 같은 연출을 많이 썼으면 그 유형 순위를 낮춘다', () => {
    const tired = contentCandidates(pilot, { recent: [{ style: 'problem' }, { style: 'problem' }, { style: 'problem' }] });
    expect(tired.candidates[0]!.style).not.toBe('problem');
  });

  it('인스타그램 설명은 첫 대사로 시작하고, 승인 전에는 "검토한"이 없다', () => {
    const c = contentCandidates(pilot).candidates[2]!;
    const draft = instagramCaption(pilot, c.script, false, ['호두정과']);
    expect(draft.split('\n')[0]).toBe(c.firstLine);
    expect(draft).not.toContain('검토한');
    expect(instagramCaption(pilot, c.script, true, [], '이희재')).toContain('이희재가 검토한');
    expect(instagramCaption(pilot, c.script, true, [], '가족')).not.toContain('이희재가 검토');
  });
});

describe('후보 5개 (사진으로 만들기)', () => {
  it('샘플 레시피마다 후보 5개: 훅이 모두 다르고, 대본은 원본 대조를 통과한다', () => {
    for (const r of SAMPLE_RECIPES) {
      const { candidates } = contentCandidates(r, { count: 5 });
      expect(candidates).toHaveLength(5);
      expect(new Set(candidates.map((c) => c.key)).size).toBe(5);
      expect(new Set(candidates.map((c) => c.hookType)).size).toBe(5);
      for (const c of candidates) expect(checkScript(r, c.script).filter((i) => i.level === 'error')).toEqual([]);
    }
  });
});
