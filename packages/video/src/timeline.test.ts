import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, estimateSceneSeconds, estimateSpeechSeconds, generateTemplateScript } from '@mat-lab/recipe-core';
import { speechPlayback, speechVolume } from './speechPlayback.ts';
import { FPS, buildTimeline, captionChunks, captionGroups, totalFrames, wordTimings } from './timeline.ts';

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

  it('음성이 없으면 recipe-core의 말하는 시간 추정을 그대로 쓴다 (예전 "장면 길이 - 0.5초"와 같은 타임라인)', () => {
    const t = buildTimeline(script, script.scenes.map(() => null));
    script.scenes.forEach((s, i) => expect(t[i]!.speechFrames).toBe(Math.min(t[i]!.durationInFrames, Math.ceil(estimateSpeechSeconds(s.line) * FPS))));
    expect(t).toEqual(buildTimeline(script, script.scenes.map((s) => estimateSceneSeconds(s) - 0.5)));
  });

  it('음성 길이가 있으면 그 길이를 기준으로 한다', () => {
    const t = buildTimeline(script, script.scenes.map(() => 3), script.scenes.map((_, i) => `/a${i}.mp3`));
    expect(t[1]!.speechFrames).toBe(90);
    expect(t[1]!.durationInFrames).toBeGreaterThan(90);
    expect(t[1]!.audioUrl).toBe('/a1.mp3');
  });

  it('서버처럼 앞 무음·어절 시간을 함께 넣으면: 음성은 말소리를 다 내고 장면이 끝나기 전에 멈춘다', () => {
    // 음성 파일: 0.4초 무음 뒤 2.5초 말소리, 어절 4개 (원본 파일 기준 초)
    const extras = script.scenes.map(() => ({ trimStart: 0.4, words: [[0.4, 1], [1.05, 1.6], [1.7, 2.3], [2.35, 2.9]] as [number, number][] }));
    const t = buildTimeline(script, script.scenes.map(() => 2.5), script.scenes.map((_, i) => `/a${i}.mp3`), extras);
    for (const x of t) {
      const p = speechPlayback(x);
      expect(p.trimBefore).toBe(12);
      // 말소리 2.5초(75프레임)를 다 재생하고, 페이드가 끝난 뒤 자른다
      expect(p.fadeStart).toBeGreaterThanOrEqual(75 - 1);
      expect(p.trimAfter - p.trimBefore).toBeGreaterThan(p.fadeEnd);
      // 재생이 장면 안에서 끝난다 (다음 장면 대사와 겹치지 않음)
      expect(p.trimAfter - p.trimBefore).toBeLessThanOrEqual(x.durationInFrames);
      expect(speechVolume(p.fadeStart, p.end)).toBe(1);
      expect(speechVolume(p.fadeEnd, p.end)).toBe(0);
      // 어절 시간은 앞 무음을 뺀 장면 기준 프레임
      expect(x.words?.[0]).toEqual([0, 18]);
      expect(x.words?.at(-1)![1]).toBe(75);
    }
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

describe('SRT 자막 조각', () => {
  it('영상 자막과 같은 규칙(captionGroups)으로 나누고, 잰 어절 시간도 같이 따른다', () => {
    const line = '이희재의 맛 연구소에서 오늘도 실험! 오늘의 질문은 시금치예요.';
    const asText = (groups: ReturnType<typeof captionGroups>) => groups.map((g) => ({ text: g.words.map((w) => w.text).join(' '), from: g.from, to: g.to }));
    expect(captionChunks(line, 120)).toEqual(asText(captionGroups(line, 120)));
    const measured: [number, number][] = [[0, 10], [12, 20], [22, 40], [42, 55], [57, 62], [64, 80], [82, 100], [102, 118]];
    expect(captionChunks(line, 120, measured)).toEqual(asText(captionGroups(line, 120, measured)));
    const chunks = captionChunks(line, 120);
    expect(chunks[0]!.from).toBe(0);
    expect(chunks.at(-1)!.to).toBe(120);
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

describe('소리 다듬기', () => {
  it('앞 무음만큼 음성을 건너뛰고, 잰 단어 시간을 장면 기준으로 바꾼다', () => {
    const t = buildTimeline(script, script.scenes.map(() => 2), [], script.scenes.map(() => ({ trimStart: 0.4, words: [[0.4, 0.9], [1.0, 2.4]] as [number, number][] })));
    expect(t[0]!.audioTrimFrames).toBe(12);
    expect(t[0]!.words).toEqual([[0, 15], [18, 60]]);
  });

  it('팁 장면 뒤에는 짧은 쉼이 있다', () => {
    const t = buildTimeline(script, script.scenes.map(() => 2));
    const tip = script.scenes.findIndex((x) => x.type === 'tip');
    const explain = script.scenes.findIndex((x) => x.type === 'explain');
    expect(t[tip]!.durationInFrames).toBeGreaterThan(t[explain]!.durationInFrames);
  });

  it('잰 단어 시간이 어절 수와 맞으면 자막이 그 시간을 따른다', () => {
    const groups = captionGroups('하나 둘 셋', 90, [[0, 10], [40, 50], [70, 85]]);
    const words = groups.flatMap((g) => g.words);
    expect(words.map((w) => w.from)).toEqual([0, 40, 70]);
  });
});

describe('빈 음성 감지', () => {
  it('소리가 전혀 없는 음성 파일은 silent로 표시한다', async () => {
    const { speechBounds } = await import('./speech.ts');
    expect(speechBounds(new Int16Array(16000)).silent).toBe(true);
    const tone = new Int16Array(16000).map((_, i) => (i > 4000 && i < 12000 ? Math.round(Math.sin(i / 5) * 8000) : 0));
    const b = speechBounds(tone);
    expect(b.silent).toBe(false);
    expect(b.start).toBeGreaterThan(0.2);
    expect(b.end).toBeLessThan(0.85);
  });
});
