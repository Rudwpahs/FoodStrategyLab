import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TTS } from './config.ts';

/**
 * 비용 0원 음성: edge-tts(파이썬 패키지, 무료)를 호출한다.
 * 설치되어 있지 않으면 음성 없이 자막만으로 영상을 만든다.
 */
export type TtsProvider = 'edge' | 'none';

let detected: Promise<TtsProvider> | null = null;

export function ttsProvider(): Promise<TtsProvider> {
  if (TTS.provider === 'none') return Promise.resolve('none');
  detected ??= run(TTS.command, ['--help'])
    .then(() => 'edge' as const)
    .catch(() => (TTS.provider === 'edge' ? Promise.reject(new Error(`${TTS.command} 실행 실패. "pip install edge-tts"로 설치하세요.`)) : ('none' as const)));
  return detected;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim().split('\n').at(-1) || `exit ${code}`))));
  });
}

export function audioKey(text: string): string {
  return crypto.createHash('sha1').update([TTS.voice, TTS.rate, TTS.pitch, text].join('|')).digest('hex').slice(0, 16);
}

/** 같은 문장은 다시 만들지 않는다 (캐시). 반환값: 파일 경로와 길이(초) */
export async function synthesize(text: string, audioDir: string): Promise<{ file: string; seconds: number }> {
  fs.mkdirSync(audioDir, { recursive: true });
  const file = path.join(audioDir, `${audioKey(text)}.mp3`);
  if (!fs.existsSync(file)) {
    const tmp = `${file}.tmp`;
    const args = ['--voice', TTS.voice, `--rate=${TTS.rate}`, `--pitch=${TTS.pitch}`, '--text', text, '--write-media', tmp];
    if (TTS.proxy) args.push('--proxy', TTS.proxy);
    await run(TTS.command, args);
    fs.renameSync(tmp, file);
  }
  return { file, seconds: mp3DurationSeconds(fs.readFileSync(file)) };
}

export function cachedAudio(text: string, audioDir: string): { file: string; seconds: number } | null {
  const file = path.join(audioDir, `${audioKey(text)}.mp3`);
  if (!fs.existsSync(file)) return null;
  return { file, seconds: mp3DurationSeconds(fs.readFileSync(file)) };
}

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** MP3 프레임을 훑어서 길이를 잰다 (ffprobe 없이 동작하도록). */
export function mp3DurationSeconds(buf: Buffer): number {
  let i = 0;
  if (buf.subarray(0, 3).toString('latin1') === 'ID3') {
    const size = ((buf[6]! & 0x7f) << 21) | ((buf[7]! & 0x7f) << 14) | ((buf[8]! & 0x7f) << 7) | (buf[9]! & 0x7f);
    i = 10 + size;
  }
  let seconds = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1]! & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const version = (buf[i + 1]! >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layer = (buf[i + 1]! >> 1) & 0x03; // 1 = Layer III
    const bitrateIdx = (buf[i + 2]! >> 4) & 0x0f;
    const srIdx = (buf[i + 2]! >> 2) & 0x03;
    const padding = (buf[i + 2]! >> 1) & 0x01;
    const rates = SAMPLE_RATES[version];
    if (version === 1 || layer !== 1 || !rates || srIdx === 3 || bitrateIdx === 0 || bitrateIdx === 15) {
      i++;
      continue;
    }
    const sampleRate = rates[srIdx]!;
    const bitrate = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIdx]! * 1000;
    const samples = version === 3 ? 1152 : 576;
    const frameLen = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding;
    if (frameLen < 4) {
      i++;
      continue;
    }
    seconds += samples / sampleRate;
    i += frameLen;
  }
  return seconds;
}
