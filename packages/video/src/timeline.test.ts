import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, generateTemplateScript } from '@mat-lab/recipe-core';
import { buildTimeline, captionChunks, captionGroups, splitCaption, totalFrames, wordTimings } from './timeline.ts';

const script = generateTemplateScript(SAMPLE_RECIPES[1]!);

describe('타임라인', () => {
  it('장면이 겹치지 않고 이어진다', () => {
    const t = buildTimeline(script, script.scenes.map(() => null));
    t.forEach((x, i) => {
      if (i > 0) expect(x.from).toBe(t[i - 1]!.from + t[i - 1]!.durationInFrames);
      expect(x.speechFrames).toBeLessThanOrEqual(x.durationInFrames);
    });
    expect(totalFrames(t)).toBe(t.at(-1)!.from + t.at(-1)!.durationInFrames);
  });

  it('음성 길이가 있으면 그 길이를 기준으로 한다', () => {
    const t = buildTimeline(script, script.scenes.map(() => 3), script.scenes.map((_, i) => `/a${i}.mp3`));
    expect(t[1]!.speechFrames).toBe(90);
    expect(t[1]!.durationInFrames).toBeGreaterThan(90);
    expect(t[1]!.audioUrl).toBe('/a1.mp3');
  });
});

describe('카드 읽는 시간', () => {
  it('재료·순서 카드는 대사가 짧아도 읽을 시간을 준다', () => {
    const t = buildTimeline(script, script.scenes.map(() => 1));
    const i = script.scenes.findIndex((s) => s.type === 'ingredients');
    expect(t[i]!.durationInFrames).toBeGreaterThanOrEqual(3 * 30);
    expect(t[i]!.durationInFrames).toBeLessThanOrEqual(5 * 30);
  });
});

describe('자막', () => {
  it('짧은 쉼표 조각으로 쪼개지 않는다', () => {
    const chunks = splitCaption('준비물은 시금치, 굵은소금, 국간장, 다진 마늘, 참기름!');
    expect(chunks.every((c) => c.length >= 6)).toBe(true);
    expect(chunks.join(' ')).toBe('준비물은 시금치, 굵은소금, 국간장, 다진 마늘, 참기름!');
  });

  it('자막 조각이 대사 구간 전체를 덮는다', () => {
    const chunks = captionChunks('이희재의 맛 연구소에서 오늘도 실험! 오늘의 질문은 시금치예요.', 120);
    expect(chunks[0]!.from).toBe(0);
    expect(chunks.at(-1)!.to).toBe(120);
    chunks.forEach((c) => expect(c.text.length).toBeLessThanOrEqual(22));
  });
});

describe('숏폼 자막 묶음', () => {
  it('1~3어절씩, 13자 이하로 나누고 문장 끝에서 끊는다', () => {
    const groups = captionGroups('이희재의 맛 연구소에서 오늘도 실험! 오늘의 질문은 시금치예요.', 150);
    for (const g of groups) {
      expect(g.words.length).toBeLessThanOrEqual(3);
      expect(g.words.map((w) => w.text).join(' ').length <= 13 || g.words.length === 1).toBe(true);
    }
    expect(groups.some((g) => g.words.at(-1)!.text === '실험!')).toBe(true);
  });

  it('단어 시간이 겹치지 않고 대사 구간을 모두 덮는다', () => {
    const w = wordTimings('반죽은 부치기 직전에 섞으세요', 90);
    expect(w[0]!.from).toBe(0);
    expect(w.at(-1)!.to).toBe(90);
    w.forEach((x, i) => i > 0 && expect(x.from).toBe(w[i - 1]!.to));
  });
});
