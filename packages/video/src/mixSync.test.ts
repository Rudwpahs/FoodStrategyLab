import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RenderInternals } from '@remotion/renderer';
import { decodePcm, mixClipSound, mixMusic, musicFile, normalizeLoudness } from './audio.ts';
import { clipSoundFilter, clipSoundVolumeExpr } from './clipSound.ts';
import { musicVolumeExpr } from './music.ts';

/**
 * 렌더 뒤 소리 처리(음량 맞추기 → 촬영 소리 → 배경 음악)가 목소리를 화면보다 늦추거나 당기지 않는지.
 * 1초마다 '딸깍'이 있는 소리를 넣은 영상을 같은 단계로 처리하고, 처리 전후 소리를 맞대어 어긋난 시간을 잰다.
 * (2026-11 측정: 세 단계를 거쳐도 0.5ms 이내. AAC 앞 여백 1024샘플은 MP4 편집 목록으로 가려진다)
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const tiny = path.join(here, '../../../apps/studio/e2e/fixtures/tiny.mp4');
const RATE = 16000;

/** 1초마다 10ms짜리 2kHz 딸깍 (48kHz 모노 WAV) */
function clickWav(seconds: number): Buffer {
  const sr = 48000;
  const n = Math.round(sr * seconds);
  const pcm = new Int16Array(n);
  const len = Math.round(sr * 0.01);
  for (let s = 0.5; s < seconds - 0.2; s += 1) {
    const at = Math.round(s * sr);
    for (let k = 0; k < len; k++) pcm[at + k] = Math.round(16000 * Math.sin((2 * Math.PI * 2000 * k) / sr) * Math.sin((Math.PI * k) / len));
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(36 + n * 2, 4);
  head.write('WAVEfmt ', 8, 'latin1');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sr, 24);
  head.writeUInt32LE(sr * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'latin1');
  head.writeUInt32LE(n * 2, 40);
  return Buffer.concat([head, Buffer.from(pcm.buffer)]);
}

/** b가 a보다 몇 ms 늦는지 (서로 맞대어 가장 잘 겹치는 자리, ±maxMs 안에서) */
function lagMs(a: Int16Array, b: Int16Array, rate: number, maxMs = 60): number {
  const max = Math.round((rate * maxMs) / 1000);
  const n = Math.min(a.length, b.length);
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = -max; lag <= max; lag++) {
    let sum = 0;
    for (let i = Math.max(0, -lag); i < n && i + lag < n; i++) sum += a[i]! * b[i + lag]!;
    if (sum > bestScore) {
      bestScore = sum;
      best = lag;
    }
  }
  return (best * 1000) / rate;
}

describe('소리 맞추기 단계가 목소리 시간을 옮기지 않는다', () => {
  it('lagMs: 일부러 5ms 늦춘 소리를 5ms로 잰다', () => {
    const a = new Int16Array(RATE);
    for (let i = 4000; i < 4160; i++) a[i] = Math.round(10000 * Math.sin(i));
    const b = new Int16Array(RATE);
    b.set(a.subarray(0, RATE - 80), 80);
    expect(lagMs(a, b, RATE)).toBeCloseTo(5, 5);
  });

  it('음량 맞추기 → 촬영 소리 → 배경 음악을 거쳐도 딸깍 소리가 1ms 넘게 옮겨지지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixsync-'));
    try {
      const wav = path.join(dir, 'click.wav');
      fs.writeFileSync(wav, clickWav(3));
      // Remotion 렌더 결과처럼: H.264 화면 + AAC 소리
      const base = path.join(dir, 'base.mp4');
      await RenderInternals.callFf({
        bin: 'ffmpeg',
        args: ['-hide_banner', '-y', '-i', tiny, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', '3', base],
        indent: false,
        logLevel: 'error',
        binariesDirectory: null,
        cancelSignal: undefined,
      });
      const norm = path.join(dir, 'norm.mp4');
      await normalizeLoudness(base, norm);
      const clip = path.join(dir, 'clip.mp4');
      await mixClipSound(norm, [tiny], clip, clipSoundFilter([{ file: tiny, start: 0.2, duration: 2, gainDb: -30 }], clipSoundVolumeExpr([])));
      const music = path.join(dir, 'music.mp4');
      await mixMusic(clip, musicFile('pizzicato'), music, musicVolumeExpr([[0, 90]], 90));

      const ref = await decodePcm(wav);
      for (const f of [base, norm, clip, music]) {
        const lag = lagMs(ref, await decodePcm(f), RATE);
        expect(Math.abs(lag), path.basename(f)).toBeLessThanOrEqual(1);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
