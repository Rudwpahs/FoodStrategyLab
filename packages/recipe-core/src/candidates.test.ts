import { describe, expect, it } from 'vitest';
import { IG_MAX_CAPTION, IG_MAX_HASHTAGS, SAMPLE_RECIPES, checkScript, contentCandidates, formatIngredient, instagramCaption, instagramCaptionChecks, type RecipeInput } from './index.ts';

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
    expect(instagramCaption(pilot, c.script, true, [])).toContain('검토한');
  });

  it('인스타그램 설명: 재료·순서를 원본 그대로 싣고, 역할(레시피·AI 진행)을 밝히고, 해시태그는 5개 이하', () => {
    const r = SAMPLE_RECIPES[0]!;
    const text = instagramCaption(r, null, true, ['이희재의맛연구소', '요리팁', '바삭한김치전', '실패해결', '맛조수', '요리과학']);
    for (const i of r.ingredients) expect(text).toContain(`- ${formatIngredient(i)}`);
    r.steps.forEach((s, n) => expect(text).toContain(`${n + 1}. ${s}`));
    expect(text).toContain('AI 캐릭터');
    expect(text).toContain('조리기능장 이희재');
    expect(text).toContain('김치전 좋아하는 사람에게 보내 주세요');
    expect(text).toContain('#김치전레시피');
    expect(text.match(/#[^\s#]+/g)!.length).toBeLessThanOrEqual(IG_MAX_HASHTAGS);
    expect(checkScript(r, { title: 'x', scenes: [{ id: 's1', type: 'intro', emotion: 'joy', line: text }] }).filter((i) => i.code === 'quantity')).toEqual([]);
  });

  it('인스타그램 설명이 2,200자를 넘으면 만드는 법부터 블로그로 넘긴다', () => {
    const long = { ...SAMPLE_RECIPES[0]!, steps: Array.from({ length: 40 }, (_, i) => `아주 긴 조리 단계 설명 문장 ${i + 1}번입니다. 천천히 저어 가며 고르게 익힙니다.`) };
    const text = instagramCaption(long, null, false, []);
    expect(text.length).toBeLessThanOrEqual(IG_MAX_CAPTION);
    expect(text).not.toContain('[만드는 법]');
    expect(text).toContain('블로그에 정리했어요');
    expect(text).toContain('[재료]');
  });
});

describe('인스타그램 설명이 아주 길 때', () => {
  it('2,200자로 자르더라도 역할 표시(AI)·"검수 전 초안"·해시태그는 남는다', () => {
    // 원리 첫 문장 하나가 2,200자를 넘는 경우
    const long = { ...SAMPLE_RECIPES[0]!, principle: `${'아주 긴 원리 설명, '.repeat(250)}그래서 바삭해집니다.` };
    const text = instagramCaption(long, null, false, ['김치전']);
    expect(text.length).toBeLessThanOrEqual(IG_MAX_CAPTION);
    expect(text).toContain('(검수 전 초안)');
    expect(text).toContain('AI 캐릭터');
    expect(text.trim().split('\n').at(-1)).toMatch(/^#이희재의맛연구소 .*#김치전레시피/);
  });
});

describe('영상 포맷 선택이 후보에 반영된다', () => {
  it('캐릭터 코미디형을 고르면 코미디 연출이 첫 후보, 실험 설명형이면 아니다', () => {
    const kimchi = SAMPLE_RECIPES[0]!;
    expect(contentCandidates({ ...kimchi, format: 'comedy' }).candidates[0]!.style).toBe('comedy');
    expect(contentCandidates({ ...kimchi, format: 'explainer' }).candidates[0]!.style).not.toBe('comedy');
  });
});

describe('인스타그램 설명 점검', () => {
  const level = (caption: string, word: string) => instagramCaptionChecks(caption).find((c) => c.text.includes(word))?.level;

  it('효능 표현은 띄어쓰기와 상관없이 잡는다 (피부미용, 피부 미용)', () => {
    expect(level('피부미용에 좋아요 AI', '건강·효능')).toBe('warn');
    expect(level('피부 미용에 좋아요 AI', '건강·효능')).toBe('warn');
  });

  it('"재료" 낱말만 있고 [재료] 목록이 없으면 재료 없음으로 본다', () => {
    const long = { ...SAMPLE_RECIPES[0]!, ingredients: Array.from({ length: 120 }, (_, i) => ({ name: `아주 긴 이름의 재료 ${i + 1}`, amount: '1큰술' })) };
    const text = instagramCaption(long, null, false, []);
    expect(text).not.toContain('[재료]');
    expect(text).toContain('전체 재료와 만드는 법은 블로그에');
    expect(level(text, '재료')).toBe('warn');
    expect(level(instagramCaption(SAMPLE_RECIPES[0]!, null, false, []), '재료')).toBe('ok');
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
