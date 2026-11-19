import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, checkRevision, cleanReviseRequest, formatIngredient, generateTemplateScript, reviseSystem, reviseUser, type Script, type StoryDraft } from '../index.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

/** 지금 대본을 그대로 이야기 초안 형식으로 (가짜 Claude가 낸 답처럼) */
const asDraft = (script: Script, change: (d: StoryDraft) => void = () => undefined): StoryDraft => {
  const d: StoryDraft = {
    title: script.title,
    storyType: 'why',
    logline: '고친 대본',
    scenes: script.scenes.map((s) => ({ beat: 'method', type: s.type, emotion: s.emotion, place: s.place ?? 'kitchen', line: s.line, ...(s.visual ? { visual: s.visual } : {}), ...(s.cardTitle ? { cardTitle: s.cardTitle } : {}), ...(s.cardItems ? { cardItems: s.cardItems } : {}) })),
  };
  change(d);
  return d;
};

describe('쉬운 말 수정 요청', () => {
  it('요청 글: 빈 글·너무 긴 글은 받지 않고 공백을 정리한다', () => {
    expect(cleanReviseRequest('  첫 장면을\n 더 궁금하게 ')).toEqual({ ok: true, request: '첫 장면을 더 궁금하게' });
    expect(cleanReviseRequest(' ').ok).toBe(false);
    expect(cleanReviseRequest(undefined).ok).toBe(false);
    expect(cleanReviseRequest('가'.repeat(301)).ok).toBe(false);
  });

  it('프롬프트: 사실 규칙은 그대로, 요청·지금 대본·원본 자료를 칸으로 나눠 보낸다', () => {
    const script = generateTemplateScript(walnut);
    const sys = reviseSystem();
    expect(sys).toContain('원본에 없는 숫자를 만들지 마');
    expect(sys).toContain('수정 요청 반영');
    const user = reviseUser(walnut, script, '훅을 더 세게', { expertAnswers: ['연구자 답변 원문'] });
    expect(user).toContain('<수정_요청>\n훅을 더 세게\n</수정_요청>');
    const current = JSON.parse(user.slice(user.indexOf('<지금_대본>') + 7, user.indexOf('</지금_대본>')));
    expect(current.scenes.map((s: { line: string }) => s.line)).toEqual(script.scenes.map((s) => s.line));
    const source = JSON.parse(user.slice(user.indexOf('<원본_자료>') + 7, user.indexOf('</원본_자료>')));
    expect(source.재료).toEqual(walnut.ingredients.map(formatIngredient));
    expect(source.전문가답변).toEqual(['연구자 답변 원문']);
  });

  it('고친 대본은 재료 카드를 원본으로 되돌리고 저장할 수 있다', () => {
    const script = generateTemplateScript(walnut);
    const draft = asDraft(script, (d) => {
      d.scenes[0]!.line = `잠깐만요! ${d.scenes[0]!.line}`;
      // 재료 카드에서 하나를 빼먹어도 원본으로 고정된다
      const ing = d.scenes.find((s) => s.type === 'ingredients')!;
      ing.cardItems = ing.cardItems!.slice(1);
    });
    const r = checkRevision(walnut, script, draft);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidate.script.scenes[0]!.line.startsWith('잠깐만요!')).toBe(true);
    expect(r.candidate.script.scenes.find((s) => s.type === 'ingredients')!.cardItems).toEqual(walnut.ingredients.map(formatIngredient));
    expect(r.candidate.script.style).toBe('ai-story');
  });

  it('원본에 없는 분량이 생기면 거절한다 (원칙 1)', () => {
    const script = generateTemplateScript(walnut);
    const r = checkRevision(walnut, script, asDraft(script, (d) => void (d.scenes[1]!.line += ' 설탕은 10큰술 넣어요.')));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('원본 레시피와 다른');
  });

  it('바뀐 곳이 없거나 구조가 틀리면 거절한다', () => {
    const script = generateTemplateScript(walnut);
    const same = checkRevision(walnut, script, asDraft(script));
    expect(same).toEqual({ ok: false, error: expect.stringContaining('고친 곳이 없어요') });
    const noIngredients = checkRevision(walnut, script, asDraft(script, (d) => void (d.scenes = d.scenes.filter((s) => s.type !== 'ingredients'))));
    expect(noIngredients).toEqual({ ok: false, error: expect.stringContaining('재료 장면이 없어요') });
    const tooFew = checkRevision(walnut, script, asDraft(script, (d) => void (d.scenes = d.scenes.slice(0, 2))));
    expect(tooFew.ok).toBe(false);
  });
});
