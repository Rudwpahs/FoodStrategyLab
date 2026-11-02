import fs from 'node:fs';
import path from 'node:path';
import { RenderInternals } from '@remotion/renderer';

/**
 * (ffmpeg는 자기 폴더에서 실행되므로 경로는 모두 절대 경로로 넘긴다)
 * Remotion에 들어 있는 ffmpeg로 소리를 다룬다 (따로 설치할 필요 없음).
 * - 음성 앞뒤 무음 구간 찾기 → 영상에서 잘라 쓴다
 * - 최종 영상 음량을 숏폼 기준(-14 LUFS)으로 맞춘다
 * - 자막 확인용 프레임 추출
 */
async function ff(args: string[]): Promise<Buffer> {
  const res = await RenderInternals.callFf({
    bin: 'ffmpeg',
    args,
    indent: false,
    logLevel: 'error',
    binariesDirectory: null,
    cancelSignal: undefined,
    // 표준 출력을 바이트 그대로 받는다
    options: { encoding: null as unknown as string, maxBuffer: 512 * 1024 * 1024 },
  });
  return Buffer.from(res.stdout as unknown as Uint8Array);
}

const RATE = 16000;

/** 음성 파일을 16kHz 모노 PCM으로 읽는다 (WAV로 받아 'data' 부분만 쓴다) */
export async function decodePcm(file: string): Promise<Int16Array> {
  const wav = await ff(['-hide_banner', '-i', path.resolve(file), '-f', 'wav', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', String(RATE), '-']);
  const data = wav.indexOf('data', 12, 'latin1');
  const start = data === -1 ? 44 : data + 8;
  const body = wav.subarray(start);
  const copy = new Uint8Array(body.byteLength - (body.byteLength % 2));
  copy.set(body.subarray(0, copy.byteLength));
  return new Int16Array(copy.buffer);
}

export interface SpeechBounds {
  /** 말이 시작되는 시각(초) */
  start: number;
  /** 말이 끝나는 시각(초) */
  end: number;
}

/**
 * 10ms 단위 음량으로 말소리 구간을 찾는다.
 * 앞은 0.03초, 뒤는 0.08초 여유를 둬서 숨소리·끝소리가 잘리지 않게 한다.
 */
export function speechBounds(pcm: Int16Array, rate = RATE, thresholdDb = -42): SpeechBounds {
  const win = Math.round(rate * 0.01);
  const total = pcm.length / rate;
  let first = -1;
  let last = -1;
  for (let i = 0, w = 0; i + win <= pcm.length; i += win, w++) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += pcm[j]! * pcm[j]!;
    const db = 20 * Math.log10(Math.sqrt(sum / win) / 32768 + 1e-9);
    if (db > thresholdDb) {
      if (first === -1) first = w;
      last = w;
    }
  }
  if (first === -1) return { start: 0, end: total };
  return { start: Math.max(0, first * 0.01 - 0.03), end: Math.min(total, (last + 1) * 0.01 + 0.08) };
}

/** 결과를 음성 파일 옆에 저장해 두고 다시 쓴다 */
export async function cachedSpeechBounds(file: string): Promise<SpeechBounds> {
  const meta = `${file}.bounds.json`;
  if (fs.existsSync(meta)) return JSON.parse(fs.readFileSync(meta, 'utf8')) as SpeechBounds;
  const bounds = speechBounds(await decodePcm(file));
  fs.writeFileSync(meta, JSON.stringify(bounds));
  return bounds;
}

/** 최종 영상 음량을 -14 LUFS로 맞춘다 (화면은 다시 인코딩하지 않음) */
export async function normalizeLoudness(input: string, output: string): Promise<void> {
  await ff(['-hide_banner', '-y', '-i', path.resolve(input), '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', path.resolve(output)]);
}

/** 영상의 특정 시각 프레임을 작은 이미지로 저장 (자막 확인용) */
export async function extractFrame(video: string, seconds: number, output: string, width = 360): Promise<void> {
  await ff(['-hide_banner', '-y', '-ss', seconds.toFixed(3), '-i', path.resolve(video), '-frames:v', '1', '-vf', `scale=${width}:-2`, path.resolve(output)]);
}
