import { describe, expect, it } from 'vitest';
import { mouthAt, mouthTrack } from './lipSync.ts';
import { buildTimeline } from './timeline.ts';
import { SAMPLE_RECIPES, generateTemplateScript } from '@mat-lab/recipe-core';

const RATE = 16000;
const FPS = 30;

/** 구간별 소리 크기(진폭, 0이면 무음)로 PCM을 만든다 */
function pcmOf(parts: [seconds: number, amp: number][]): Int16Array {
  const out: number[] = [];
  for (const [sec, amp] of parts) for (let i = 0; i < Math.round(sec * RATE); i++) out.push(Math.round(amp * Math.sin(i * 0.3)));
  return Int16Array.from(out);
}

describe('입 모양을 목소리 크기에 맞추기', () => {
  it('말소리 동안 입이 열리고, 문장 사이 쉼에는 닫힌다 (예전에는 쉼에도 계속 움직였다)', () => {
    // 0.5초 말 → 0.4초 쉼 → 0.5초 말
    const track = mouthTrack(pcmOf([[0.5, 8000], [0.4, 0], [0.5, 8000]]), RATE, FPS);
    expect(track).toHaveLength(42);
    const v = [...track].map(Number);
    expect(Math.max(...v.slice(2, 14))).toBe(9);
    // 쉼 가운데(0.6~0.85초)는 닫혀 있다 (닫힐 때는 몇 프레임에 걸쳐 부드럽게)
    expect(Math.max(...v.slice(19, 26))).toBe(0);
    expect(Math.max(...v.slice(29, 40))).toBeGreaterThan(5);
  });

  it('작게 말한 부분은 입을 덜 벌린다', () => {
    const v = [...mouthTrack(pcmOf([[0.5, 12000], [0.5, 900]]), RATE, FPS)].map(Number);
    expect(v[8]).toBeGreaterThan(v[24]!);
    expect(v[24]).toBeGreaterThan(0);
  });

  it('소리가 없으면 입을 닫고, 기록이 없으면 undefined (예전 방식으로 움직인다)', () => {
    expect(mouthTrack(pcmOf([[0.3, 0]]), RATE, FPS)).toBe('0'.repeat(9));
    expect(mouthAt(undefined, 3)).toBeUndefined();
    expect(mouthAt('09', 1)).toBe(1);
    expect(mouthAt('09', 5)).toBe(0);
  });

  it('타임라인: 앞 무음을 자른 만큼 입 기록도 잘라, 말소리가 끝나면 닫는다', () => {
    const script = generateTemplateScript(SAMPLE_RECIPES[1]!);
    // 원본 파일 기준: 0.2초(6프레임) 무음 뒤 말소리
    const mouth = '000000' + '5'.repeat(60) + '000000';
    const t = buildTimeline(script, script.scenes.map(() => 1.5), script.scenes.map(() => '/a.mp3'), script.scenes.map(() => ({ trimStart: 0.2, mouth })));
    expect(t[0]!.audioTrimFrames).toBe(6);
    expect(t[0]!.mouth!.startsWith('5')).toBe(true);
    expect(t[0]!.mouth).toHaveLength(t[0]!.speechFrames + 1);
  });
});
