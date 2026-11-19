import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Script } from '@mat-lab/recipe-core';
import { audioDb, mediaInfo, mixClipSound } from './audio.ts';
import { CLIP_SOUND_GAIN_GAP, CLIP_SOUND_GAIN_SPEECH, clipLevelDb, clipSoundFilter, clipSoundGain, clipSoundVolumeExpr, soundLayers } from './clipSound.ts';
import { speechIntervals } from './music.ts';
import { QA_STEP, auditAudio } from './qa.ts';
import { clipLayers } from './realFootage.ts';
import type { SceneTiming } from './timeline.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const tiny = path.join(here, '../../../apps/studio/e2e/fixtures/tiny.mp4');

const timings: SceneTiming[] = [
  { sceneId: 's1', from: 0, durationInFrames: 60, speechFrames: 45, audioUrl: 'a1' },
  { sceneId: 's2', from: 60, durationInFrames: 90, speechFrames: 70, audioUrl: 'a2' },
  { sceneId: 's3', from: 150, durationInFrames: 60, speechFrames: 40, audioUrl: 'a3' },
];
const script: Script = {
  title: 't',
  scenes: [
    { id: 's1', type: 'question', emotion: 'curious', line: '김치전 왜 눅눅해질까요?' },
    { id: 's2', type: 'explain', emotion: 'confident', line: '반죽은 부치기 직전에 섞어요. 그래야 바삭해요.' },
    { id: 's3', type: 'outro', emotion: 'joy', line: '오늘도 맛있게!' },
  ],
};

/** ffmpeg 식을 자바스크립트로 계산한다 (clip·min·max만 쓰므로) */
function evalExpr(expr: string, t: number): number {
  const js = expr.replace(/clip\(/g, '__clip(').replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(').replace(/\bt\b/g, String(t));
  // eslint-disable-next-line no-new-func
  return new Function('__clip', `return ${js};`)((x: number, a: number, b: number) => Math.min(b, Math.max(a, x)));
}

describe('촬영 소리 (지글지글을 목소리 밑에 작게)', () => {
  it('대사 중에는 줄이고 쉬는 틈에는 키운다. 서버(ffmpeg 식)와 미리보기가 같은 크기', () => {
    const iv = speechIntervals(timings);
    expect(clipSoundGain(20, iv)).toBeCloseTo(CLIP_SOUND_GAIN_SPEECH);
    expect(clipSoundGain(140, iv)).toBeCloseTo(CLIP_SOUND_GAIN_GAP);
    const expr = clipSoundVolumeExpr(iv);
    for (let f = 0; f <= 210; f += 3) expect(evalExpr(expr, f / 30)).toBeCloseTo(clipSoundGain(f, iv), 2);
  });

  it('휴대폰마다 다른 녹음 크기를 맞춘다 (조용한 영상은 조금만 키운다)', () => {
    expect(clipLevelDb(-28)).toBe(0);
    expect(clipLevelDb(-18)).toBe(-10);
    expect(clipLevelDb(-60)).toBe(6);
    expect(clipLevelDb(undefined)).toBe(0);
    expect(clipLevelDb(-100)).toBe(0);
  });

  it('휴대폰 촬영 영상만 소리를 깐다 (생성 AI 클립·사진은 끔)', () => {
    const layers = clipLayers(script, timings, {
      s1: { url: 'phone.mp4', kind: 'video', sound: true },
      s2: { url: 'ai.mp4', kind: 'video', sound: false },
      s3: { url: 'photo.jpg', kind: 'image', sound: true },
    });
    expect(soundLayers(layers).map((l) => l.key)).toEqual(['s1']);
  });

  it('ffmpeg 섞기 식: 촬영마다 크기 맞춤 → 자르기 → 시작 시각으로 밀기 → 대사 때 줄이기', () => {
    const f = clipSoundFilter(
      [
        { file: 'a.mp4', start: 2, duration: 3, gainDb: -4 },
        { file: 'b.mov', start: 5.5, duration: 2, gainDb: 3 },
      ],
      'VOL',
    );
    expect(f).toContain('[1:a]');
    expect(f).toContain('[2:a]');
    expect(f).toContain('volume=-4dB');
    expect(f).toContain('atrim=0:3.000');
    expect(f).toContain('adelay=2000|2000');
    expect(f).toContain('adelay=5500|5500');
    expect(f).toContain("volume='(VOL)*clip(min((t-2.000)/0.250,(5.000-t)/0.250),0,1)':eval=frame");
    expect(f).toContain('[0:a][c0][c1]amix=inputs=3:duration=first:normalize=0[a]');
  });

  it('촬영 소리를 깐 채로 검사하면 진짜 잘린 대사를 놓친다 → 그래서 서버는 품질 검사 뒤에 섞는다', () => {
    // 장면 2가 말하는 중(-20dB)에 끊긴 영상
    const total = 7;
    const db = Array.from({ length: Math.round(total / QA_STEP) }, () => -100);
    const fill = (s: number, e: number, v: number) => {
      for (let i = Math.round(s / QA_STEP); i < Math.round(e / QA_STEP); i++) db[i] = Math.max(db[i]!, v);
    };
    fill(0, 1.3, -18);
    fill(2, 4.3, -20);
    fill(5, 6.2, -19);
    const clean = auditAudio({ db: [...db], timings, script }).filter((i) => i.code === 'cut');
    expect(clean.map((i) => i.sceneId)).toEqual(['s2']);
    // 같은 영상에 촬영 소리(-35dB)가 깔려 있으면 끊긴 뒤에도 소리가 이어져 잘림을 못 잡는다
    const withAmbience = db.map((v) => Math.max(v, -35));
    expect(auditAudio({ db: withAmbience, timings, script }).filter((i) => i.code === 'cut')).toEqual([]);
  });

  it('실제 파일: 길이·소리를 재고, 완성 영상에 촬영 소리를 섞는다', async () => {
    const info = await mediaInfo(tiny);
    expect(info.hasAudio).toBe(true);
    expect(info.seconds).toBeCloseTo(3, 0);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipsound-'));
    try {
      const out = path.join(dir, 'mixed.mp4');
      const inputs = [{ file: tiny, start: 0.5, duration: 2, gainDb: clipLevelDb(info.meanDb) }];
      await mixClipSound(tiny, [tiny], out, clipSoundFilter(inputs, clipSoundVolumeExpr([])));
      expect(fs.statSync(out).size).toBeGreaterThan(1000);
      const mixed = await mediaInfo(out);
      expect(mixed.seconds).toBeCloseTo(3, 0);
      expect((await audioDb(out)).length).toBeGreaterThan(200);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
