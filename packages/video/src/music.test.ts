import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MUSIC_GAIN_GAP, MUSIC_GAIN_SPEECH, MUSIC_TRACKS, musicFor, musicGain, musicVolumeExpr, speechIntervals } from './music.ts';
import type { SceneTiming } from './timeline.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const timings: SceneTiming[] = [
  { sceneId: 's1', from: 0, durationInFrames: 60, speechFrames: 45 },
  { sceneId: 's2', from: 60, durationInFrames: 90, speechFrames: 70 },
  { sceneId: 's3', from: 150, durationInFrames: 60, speechFrames: 0 },
];
const total = 210;

/** ffmpeg 식을 자바스크립트로 계산한다 (clip·min·max만 쓰므로) */
function evalExpr(expr: string, t: number): number {
  const js = expr.replace(/clip\(/g, '__clip(').replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(').replace(/\bt\b/g, String(t));
  // eslint-disable-next-line no-new-func
  return new Function('__clip', `return ${js};`)((x: number, a: number, b: number) => Math.min(b, Math.max(a, x)));
}

describe('배경 음악', () => {
  it('이야기 분위기에 맞는 곡을 고른다', () => {
    expect(musicFor({ style: 'ai-story', hookType: 'heritage' })).toBe('musicbox');
    expect(musicFor({ style: 'ai-story', hookType: 'why' })).toBe('pizzicato');
    expect(musicFor({ style: 'ai-story', hookType: 'quick' })).toBe('upbeat');
    expect(musicFor({ style: 'ai-story', hookType: 'one-fix' })).toBe('ukulele');
    // 예전에 저장된 갈래도 그대로
    expect(musicFor({ style: 'ai-story', hookType: 'gift' })).toBe('musicbox');
    expect(musicFor({ style: 'ai-story', hookType: 'mystery' })).toBe('pizzicato');
    expect(musicFor({ style: 'comedy', hookType: 'question' })).toBe('pizzicato');
    expect(musicFor({})).toBe('ukulele');
  });

  it('대사 중에는 줄이고, 쉬는 틈에는 키우고, 처음·끝은 부드럽게', () => {
    const iv = speechIntervals(timings);
    expect(iv).toEqual([[0, 45], [60, 130]]);
    expect(musicGain(30, iv, total)).toBeCloseTo(MUSIC_GAIN_SPEECH);
    expect(musicGain(170, iv, total)).toBeCloseTo(MUSIC_GAIN_GAP);
    expect(musicGain(0, iv, total)).toBe(0);
    expect(musicGain(total, iv, total)).toBe(0);
    // 대사 직전에 미리 줄어들기 시작한다 (갑자기 바뀌지 않게)
    const before = musicGain(57, iv, total);
    expect(before).toBeGreaterThan(MUSIC_GAIN_SPEECH);
    expect(before).toBeLessThan(MUSIC_GAIN_GAP);
  });

  it('서버(ffmpeg 식)와 미리보기(musicGain)가 같은 크기를 낸다', () => {
    const iv = speechIntervals(timings);
    const expr = musicVolumeExpr(iv, total);
    for (let f = 0; f <= total; f += 3) expect(evalExpr(expr, f / 30)).toBeCloseTo(musicGain(f, iv, total), 2);
  });

  it('곡 파일과 출처 표가 있다 (CC0만)', () => {
    const dir = path.join(here, '../assets/bgm');
    const licenses = fs.readFileSync(path.join(dir, 'LICENSES.md'), 'utf8');
    for (const t of MUSIC_TRACKS) {
      const buf = fs.readFileSync(path.join(dir, `${t}.mp3`));
      expect(buf.length).toBeGreaterThan(50_000);
      expect(buf.length).toBeLessThan(800_000);
      expect(licenses).toMatch(new RegExp(`\`${t}\\.mp3\`.*CC0`));
    }
  });
});
