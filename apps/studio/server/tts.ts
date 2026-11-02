import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ttsSettings } from './config.ts';

/**
 * 비용 0원 음성. 두 가지 무료 방식을 지원한다.
 * - voicestudio: 내 PC에서 돌아가는 VoiceStudio 앱의 로컬 API (목소리 디자인·복제 가능)
 * - edge: edge-tts 파이썬 패키지 (Microsoft Edge 읽어주기 음성)
 * 둘 다 없으면 음성 없이 자막만으로 영상을 만든다.
 */
export type TtsProvider = 'voicestudio' | 'edge' | 'none';

let detected: Promise<TtsProvider> | null = null;

/** 설정이 바뀌었을 때 다시 감지하도록 캐시를 지운다 */
export function resetTtsDetection() {
  detected = null;
}

async function voicestudioUp(): Promise<boolean> {
  const { url, apiKey } = ttsSettings().voicestudio;
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500), headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {} });
    return res.ok;
  } catch {
    return false;
  }
}

async function edgeUp(): Promise<boolean> {
  return run(ttsSettings().edge.command, ['--help']).then(
    () => true,
    () => false,
  );
}

export function ttsProvider(): Promise<TtsProvider> {
  const choice = ttsSettings().provider;
  if (choice === 'none') return Promise.resolve('none');
  detected ??= (async (): Promise<TtsProvider> => {
    if (choice === 'voicestudio') {
      if (await voicestudioUp()) return 'voicestudio';
      throw new Error(`VoiceStudio(${ttsSettings().voicestudio.url})에 연결할 수 없습니다. VoiceStudio 앱을 켜 주세요.`);
    }
    if (choice === 'edge') {
      if (await edgeUp()) return 'edge';
      throw new Error(`${ttsSettings().edge.command} 실행 실패. "pip install edge-tts"로 설치하세요.`);
    }
    if (await voicestudioUp()) return 'voicestudio';
    if (await edgeUp()) return 'edge';
    return 'none';
  })().catch((e) => {
    detected = null;
    throw e;
  });
  return detected;
}

export function describeVoice(provider: TtsProvider): string {
  const s = ttsSettings();
  if (provider === 'voicestudio') return `VoiceStudio · ${s.voicestudio.voice} (${s.voicestudio.model})`;
  if (provider === 'edge') return `edge-tts · ${s.edge.voice}`;
  return '음성 없음 (자막만)';
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

/** 목소리 설정 + 문장으로 캐시 키를 만든다 (설정이 바뀌면 새로 만든다) */
export function audioKey(text: string, provider: TtsProvider = 'edge'): string {
  const s = ttsSettings();
  const voice = provider === 'voicestudio' ? ['vs', s.voicestudio.model, s.voicestudio.voice, s.voicestudio.speed] : [s.edge.voice, s.edge.rate, s.edge.pitch];
  return crypto.createHash('sha1').update([...voice, text].join('|')).digest('hex').slice(0, 16);
}

async function voicestudioSpeech(text: string, out: string) {
  const { url, model, voice, speed, apiKey } = ttsSettings().voicestudio;
  const res = await fetch(`${url}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model, voice, input: text, response_format: 'mp3', speed, language: 'ko' }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`VoiceStudio 음성 생성 실패 (${res.status}): ${detail.slice(0, 200)}`);
  }
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

/**
 * 실제 음성의 어절별 시간 (VoiceStudio 받아쓰기, Whisper 계열).
 * 받아쓴 단어 수가 대사 어절 수와 같을 때만 쓴다. 결과는 음성 파일 옆에 저장한다.
 */
export async function measuredWords(file: string, line: string): Promise<[number, number][] | undefined> {
  const cache = `${file}.words.json`;
  if (fs.existsSync(cache)) return (JSON.parse(fs.readFileSync(cache, 'utf8')) as [number, number][] | null) ?? undefined;
  if ((await ttsProvider().catch(() => 'none')) !== 'voicestudio') return undefined;
  const { url, apiKey } = ttsSettings().voicestudio;
  let words: [number, number][] | null = null;
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), path.basename(file));
    form.append('model', 'whisper-1');
    form.append('language', 'ko');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    const res = await fetch(`${url}/v1/audio/transcriptions`, { method: 'POST', body: form, headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {}, signal: AbortSignal.timeout(120_000) });
    if (res.ok) {
      const data = (await res.json()) as { words?: { start: number; end: number }[] };
      const expected = line.trim().split(/\s+/).filter(Boolean).length;
      if (data.words && data.words.length === expected) words = data.words.map((w) => [w.start, w.end]);
    }
  } catch {
    words = null;
  }
  fs.writeFileSync(cache, JSON.stringify(words));
  return words ?? undefined;
}

/** 같은 문장은 다시 만들지 않는다 (캐시). 반환값: 파일 경로와 길이(초) */
export async function synthesize(text: string, audioDir: string): Promise<{ file: string; seconds: number }> {
  const provider = await ttsProvider();
  if (provider === 'none') throw new Error('사용할 수 있는 음성 도구가 없습니다.');
  fs.mkdirSync(audioDir, { recursive: true });
  const file = path.join(audioDir, `${audioKey(text, provider)}.mp3`);
  if (!fs.existsSync(file)) {
    const tmp = `${file}.tmp`;
    if (provider === 'voicestudio') {
      await voicestudioSpeech(text, tmp);
    } else {
      const e = ttsSettings().edge;
      const args = ['--voice', e.voice, `--rate=${e.rate}`, `--pitch=${e.pitch}`, '--text', text, '--write-media', tmp];
      if (e.proxy) args.push('--proxy', e.proxy);
      await run(e.command, args);
    }
    fs.renameSync(tmp, file);
  }
  return { file, seconds: mp3DurationSeconds(fs.readFileSync(file)) };
}

/** 지금 쓰는 음성 도구로 만든 캐시가 있으면 돌려준다 */
export function cachedAudio(text: string, audioDir: string, provider: TtsProvider): { file: string; seconds: number } | null {
  if (provider === 'none') return null;
  const file = path.join(audioDir, `${audioKey(text, provider)}.mp3`);
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
