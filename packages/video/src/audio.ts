import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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

export { speechBounds, type SpeechBounds } from './speech.ts';
import { speechBounds, type SpeechBounds } from './speech.ts';
import { QA_STEP, rmsDb } from './qa.ts';

/** 음성 파일의 크기·수정 시각 (옆에 저장한 분석 결과가 이 파일 것인지 확인용) */
export function fileStamp(file: string): string {
  const st = fs.statSync(file);
  return `${st.size}:${Math.round(st.mtimeMs)}`;
}

/** 옆에 저장한 분석 결과가 지금 파일 것일 때만 돌려준다 */
export function readFreshCache<T>(cacheFile: string, file: string): T | undefined {
  if (!fs.existsSync(cacheFile)) return undefined;
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as { stamp?: string; value?: T };
    return c && c.stamp === fileStamp(file) ? c.value : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache<T>(cacheFile: string, file: string, value: T) {
  fs.writeFileSync(cacheFile, JSON.stringify({ stamp: fileStamp(file), value }));
}

/** 음성 파일과 옆에 저장한 분석 결과를 함께 지운다 (다시 만든 파일에 옛 길이가 붙지 않게) */
export function removeAudioWithCache(file: string) {
  for (const f of [file, `${file}.bounds3.json`, `${file}.bounds2.json`, `${file}.words.json`, `${file}.words2.json`, `${file}.asr.json`]) fs.rmSync(f, { force: true });
}

/**
 * 결과를 음성 파일 옆에 저장해 두고 다시 쓴다.
 * 파일 크기·수정 시각을 같이 적어 두고, 다르면 다시 잰다
 * (예전에는 빈 음성을 지우고 다시 만들어도 빈 음성의 짧은 길이가 남아, 영상에서 대사 끝이 잘렸다).
 */
export async function cachedSpeechBounds(file: string): Promise<SpeechBounds> {
  const meta = `${file}.bounds3.json`;
  const cached = readFreshCache<SpeechBounds>(meta, file);
  if (cached && !cached.silent) return cached;
  const bounds = speechBounds(await decodePcm(file));
  writeCache(meta, file, bounds);
  return bounds;
}

/** 최종 영상 음량을 -14 LUFS로 맞춘다 (화면은 다시 인코딩하지 않음) */
export async function normalizeLoudness(input: string, output: string): Promise<void> {
  await ff(['-hide_banner', '-y', '-i', path.resolve(input), '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', path.resolve(output)]);
}

/** 영상·음성의 소리 크기(dB)를 QA_STEP 간격으로 (자동 품질 검사용) */
export async function audioDb(file: string): Promise<number[]> {
  return rmsDb(await decodePcm(file), RATE, QA_STEP);
}

/** 화면 평균 밝기(0~255)를 일정 간격으로 (검은 화면 검사용). 아주 작게 줄여서 빠르게 본다 */
export async function frameBrightness(video: string, step = 0.5): Promise<number[]> {
  const w = 16;
  const h = 28;
  // Remotion에 든 ffmpeg에는 rawvideo·bmp 출력이 없어서, 흑백 PNG를 이어 받아 직접 푼다
  const buf = await ff(['-hide_banner', '-i', path.resolve(video), '-an', '-vf', `scale=${w}:${h},format=gray`, '-r', String(1 / step), '-c:v', 'png', '-f', 'image2pipe', '-']);
  return splitPngs(buf).map((png) => {
    const px = decodeGrayPng(png);
    return px.length ? px.reduce((a, b) => a + b, 0) / px.length : 0;
  });
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 이어 붙은 PNG들을 하나씩 나눈다 */
export function splitPngs(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let i = buf.indexOf(PNG_SIG);
  while (i !== -1) {
    const next = buf.indexOf(PNG_SIG, i + 8);
    out.push(buf.subarray(i, next === -1 ? buf.length : next));
    i = next;
  }
  return out;
}

/** 8비트 흑백 PNG(비월 없음)를 화소 배열로 푼다 */
export function decodeGrayPng(png: Buffer): Uint8Array {
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (pos + 8 <= png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('latin1', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 0 || data[12] !== 0) return new Uint8Array();
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (width + 1)]!;
    for (let x = 0; x < width; x++) {
      const v = raw[y * (width + 1) + 1 + x]!;
      const a = x > 0 ? out[y * width + x - 1]! : 0;
      const b = y > 0 ? out[(y - 1) * width + x]! : 0;
      const c = x > 0 && y > 0 ? out[(y - 1) * width + x - 1]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[y * width + x] = (v + (f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth : 0)) & 0xff;
    }
  }
  return out;
}

/** PNG → JPEG (인스타그램 표지·이미지는 JPEG만 받는다) */
export async function toJpeg(input: string, output: string): Promise<void> {
  await ff(['-hide_banner', '-y', '-i', path.resolve(input), '-q:v', '2', path.resolve(output)]);
}

/** 영상의 특정 시각 프레임을 작은 이미지로 저장 (자막 확인용) */
export async function extractFrame(video: string, seconds: number, output: string, width = 360): Promise<void> {
  await ff(['-hide_banner', '-y', '-ss', seconds.toFixed(3), '-i', path.resolve(video), '-frames:v', '1', '-vf', `scale=${width}:-2`, path.resolve(output)]);
}

/**
 * 말 빠르기 바꾸기 (음높이는 그대로): 0.5~2.0배. MP3로 저장한다.
 * 목소리 엔진(VoxCPM2)의 속도 설정은 요청한 만큼 정확히 바뀌지 않아서, 만든 뒤에 맞춘다.
 */
export async function changeTempo(input: string, output: string, tempo: number): Promise<void> {
  const t = Math.min(2, Math.max(0.5, tempo));
  await ff(['-hide_banner', '-y', '-i', path.resolve(input), '-af', `atempo=${t.toFixed(3)}`, '-codec:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', path.resolve(output)]);
}
