import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, STYLE_IDS, buildStyledScript } from '@mat-lab/recipe-core';
import { captionKeywords, layoutCaption, pickHighlights, textEm, type CaptionLayoutOptions } from './captionStyle.ts';
import { captionGroups, buildTimeline } from './timeline.ts';
import { CAPTION_HEIGHT } from './three/captionPlacement.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
const kw = captionKeywords(walnut);
/** 강조된 낱말만 */
const picked = (line: string, keywords = kw) => {
  const words = line.split(' ');
  const hi = pickHighlights(words, keywords);
  return words.filter((_, i) => hi[i]);
};

describe('자막 강조 낱말 고르기', () => {
  it('레시피에서 요리 이름과 재료 이름을 모은다', () => {
    expect(kw.dish).toEqual(['호두정과']);
    expect(kw.ingredients).toContain('호두');
    expect(kw.ingredients).toContain('물엿');
    const pasta = captionKeywords({ dishName: '바삭한 김치전', ingredients: [{ name: '들깨 가루(국산)', amount: '2큰술' }] });
    expect(pasta.dish).toEqual(['바삭한김치전', '바삭한', '김치전']);
    expect(pasta.ingredients).toEqual(['들깨가루', '가루']);
    const kimchi = captionKeywords({ dishName: '김치전', ingredients: [{ name: '잘 익은 김치', amount: '200g' }] });
    expect(kimchi.ingredients).toEqual(['잘익은김치', '김치']);
    expect(pickHighlights(['김치', '속', '소금이'], kimchi)).toEqual([true, false, false]);
    expect(captionKeywords(undefined)).toEqual({ dish: [], ingredients: [] });
  });

  it('숫자+단위를 강조한다', () => {
    expect(picked('140도 정도에서')).toEqual(['140도']);
    expect(picked('설탕은 2큰술,')).toEqual(['2큰술,']);
    expect(picked('딱 5분만')).toEqual(['5분만']);
    // 두 어절이면 하나만: 재료보다 분량이 먼저
    expect(picked('물엿 1/2컵')).toEqual(['1/2컵']);
    expect(picked('물엿 1/2컵 넣고')).toEqual(['물엿', '1/2컵']);
  });

  it('요리 이름·재료 이름에 조사가 붙어도 강조한다', () => {
    expect(picked('바삭한 호두정과,')).toContain('호두정과,');
    expect(picked('튀겨낸 호두는 타공판에')).toEqual(['호두는']);
    expect(picked('설탕을 넣고')).toEqual(['설탕을']);
  });

  it('한 글자 재료는 조사만 붙을 때 강조한다 (물 ≠ 물론)', () => {
    expect(picked('끓는 물에')).toEqual(['물에']);
    expect(picked('물론 괜찮아요')).toEqual([]);
  });

  it('맛·식감·결과 말을 강조한다', () => {
    const none = captionKeywords(undefined);
    expect(picked('겉이 바삭해져요', none)).toEqual(['바삭해져요']);
    expect(picked('헹구면 떫은맛이', none)).toEqual(['떫은맛이']);
    expect(picked('그래서 눅눅해요', none)).toEqual(['눅눅해요']);
    expect(picked('이러면 실패해요', none)).toEqual(['실패해요']);
  });

  it('평범한 말은 강조하지 않는다', () => {
    expect(picked('오늘의 실험!')).toEqual([]);
    expect(picked('왜 데쳤다가 튀길까?')).toEqual([]);
    expect(picked('저장!')).toEqual([]);
  });

  it('묶음을 다 칠하지 않는다: 최대 2개, 어절 수보다 적게, 우선순위(숫자 > 요리 > 재료 > 맛) 순', () => {
    // 세 어절 모두 후보여도 둘만, 숫자가 먼저
    expect(picked('호두 설탕 140도')).toEqual(['호두', '140도']);
    expect(pickHighlights(['호두', '설탕', '140도'], kw)).toEqual([true, false, true]);
    // 두 어절이면 하나만
    expect(picked('바삭한 호두를')).toEqual(['호두를']);
    // 한 어절짜리는 그 하나
    expect(picked('5단계,')).toEqual(['5단계,']);
    expect(pickHighlights([], kw)).toEqual([]);
  });
});

const OPTS: CaptionLayoutOptions = { size: 96, maxWidth: 900, maxHeight: CAPTION_HEIGHT, lineHeight: 1.1, strokeEm: 0.2, popScale: 1.06 };
const width = (words: string[], lines: number[][], size: number) => Math.max(...lines.map((l) => (textEm(l.map((i) => words[i]).join(' ')) + OPTS.strokeEm) * size));

describe('자막 줄 나누기·글자 크기', () => {
  it('짧으면 한 줄, 원래 크기', () => {
    const words = ['바삭한', '호두정과,'];
    expect(layoutCaption(words, OPTS)).toEqual({ lines: [[0, 1]], fontSize: 96 });
  });

  it('길면 낱말 단위로 두 줄, 비슷한 길이로', () => {
    const words = ['튀겨낸', '호두는', '타공판에서'];
    const l = layoutCaption(words, OPTS);
    expect(l.lines).toHaveLength(2);
    expect(l.lines.flat()).toEqual([0, 1, 2]);
    expect(width(words, l.lines, l.fontSize)).toBeLessThanOrEqual(900);
  });

  it('아주 긴 한 낱말은 끊지 않고 글자를 줄여 한 줄에 넣는다', () => {
    const words = ['들깨고사리파스타를맛있게만드는법'];
    const l = layoutCaption(words, OPTS);
    expect(l.lines).toEqual([[0]]);
    expect(l.fontSize).toBeLessThan(96);
    expect(width(words, l.lines, l.fontSize)).toBeLessThanOrEqual(900);
  });

  it('두 줄 + 튀어나오는 크기까지 얼굴 피하기 계산의 자막 높이(CAPTION_HEIGHT)를 넘지 않는다', () => {
    const l = layoutCaption(['완성부터', '보여', '드릴게요!'], { ...OPTS, size: 108 });
    expect(l.lines).toHaveLength(2);
    expect(2 * l.fontSize * OPTS.lineHeight * OPTS.popScale).toBeLessThanOrEqual(CAPTION_HEIGHT);
  });

  it('모든 샘플 레시피 × 연출 6종의 자막 묶음이 2줄 안, 폭 900px 안, 높이 한도 안에 들어간다', () => {
    let checked = 0;
    for (const r of SAMPLE_RECIPES) {
      for (const style of STYLE_IDS) {
        const { script } = buildStyledScript(r, { style });
        const t = buildTimeline(script, script.scenes.map(() => null));
        script.scenes.forEach((s, i) => {
          for (const g of captionGroups(s.line, t[i]!.speechFrames)) {
            const words = g.words.map((w) => w.text);
            for (const size of [96, 108]) {
              const l = layoutCaption(words, { ...OPTS, size });
              expect(l.lines.length).toBeLessThanOrEqual(2);
              expect(l.lines.flat()).toEqual(words.map((_, k) => k));
              expect(width(words, l.lines, l.fontSize), words.join(' ')).toBeLessThanOrEqual(900);
              expect(l.lines.length * l.fontSize * OPTS.lineHeight * OPTS.popScale).toBeLessThanOrEqual(CAPTION_HEIGHT);
              expect(l.fontSize).toBeGreaterThanOrEqual(80);
              checked++;
            }
          }
        });
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});
