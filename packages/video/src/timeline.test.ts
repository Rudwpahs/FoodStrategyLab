import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, generateTemplateScript } from '@mat-lab/recipe-core';
import { buildTimeline, captionChunks, splitCaption, totalFrames } from './timeline.ts';

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
