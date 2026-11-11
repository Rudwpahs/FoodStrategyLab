import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { changeTempo, readFreshCache, removeAudioWithCache, writeCache } from '@mat-lab/video/audio';
import { ttsSettings } from './config.ts';
import { VOICE_TEMPOS, defaultPreset, ensurePresetVoice, isVoiceTempo, presetByVoiceName } from './voicePresets.ts';
import { assertCommercialEngine, engineInfo, findVoiceStudio, listProfiles, readVoiceSettings, slowFetch } from './voicestudio.ts';

/**
 * 음성 만들기.
 * - voicestudio: VoiceStudio API (내 PC의 앱, 또는 클라우드 배포의 GPU 목소리 서버). 저장소 기준 녹음으로 고정한 목소리만 쓴다
 * - edge: edge-tts 파이썬 패키지 (VoiceStudio가 없을 때 'auto' 설정에서만. 맛조수 목소리가 아니라서 영상 검사 결과에 알린다)
 * 둘 다 없으면 음성 없이 자막만으로 영상을 만든다.
 */
export type TtsProvider = 'voicestudio' | 'edge' | 'none';

let detected: Promise<TtsProvider> | null = null;
let detectedAt = 0;
/** 앱을 나중에 켜도 알아채도록 15초마다 다시 확인한다 */
const DETECT_TTL_MS = 15_000;

/** 설정이 바뀌었을 때 다시 감지하도록 캐시를 지운다 */
export function resetTtsDetection() {
  detected = null;
}

/**
 * 지금 쓰는 VoiceStudio 목소리 프로필 이름 (환경 변수 > 스튜디오 화면에서 고른 것 > 기본 맛조수).
 * 저장소 기준 녹음이 있는 목록의 목소리만 쓴다 (원칙 5): 목록에 없는 이름은 건너뛴다.
 */
export function voicestudioVoice(): string {
  const wanted = [ttsSettings().voicestudio.voiceOverride, readVoiceSettings().voicestudioVoice];
  return wanted.find((v) => v && presetByVoiceName(v)) ?? defaultPreset()?.voiceName ?? 'default';
}

/** 말 빠르기 배수 (설정 화면에서 고름, 1 = 보통) */
export function voiceTempo(): number {
  const t = readVoiceSettings().tempo;
  return isVoiceTempo(t) ? t : 1;
}

/** 목소리·빠르기를 설정과 다르게 쓸 때 (설정 화면의 '들어보기') */
export interface VoiceOverride {
  voice?: string;
  tempo?: number;
}

async function voicestudioUrl(): Promise<string | null> {
  const s = await findVoiceStudio();
  return s.state === 'ok' ? s.url : null;
}

async function voicestudioUp(): Promise<boolean> {
  return (await voicestudioUrl()) !== null;
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
  if (detected && Date.now() - detectedAt > DETECT_TTL_MS) detected = null;
  if (!detected) detectedAt = Date.now();
  detected ??= (async (): Promise<TtsProvider> => {
    if (choice === 'voicestudio') {
      if (await voicestudioUp()) return 'voicestudio';
      throw new Error('VoiceStudio에 연결할 수 없습니다. VoiceStudio 앱을 켜고, 모델 준비가 끝날 때까지 기다려 주세요.');
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
  if (provider === 'voicestudio') {
    const v = voicestudioVoice();
    const tempo = voiceTempo();
    return `${presetByVoiceName(v)?.label ?? v}${tempo !== 1 ? ` · ${VOICE_TEMPOS.find((t) => t.value === tempo)?.label}` : ''}`;
  }
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

/**
 * 지금 쓰는 목소리의 정체: 음성 도구 + 엔진 + 목소리 프로필 ID + 설정.
 * 같은 이름으로 목소리를 다시 만들거나 엔진이 바뀌면 값이 달라져서, 예전 음성 캐시를 쓰지 않는다.
 */
export async function voiceIdentity(provider: TtsProvider, override: VoiceOverride = {}, known?: VoiceStudioTarget): Promise<string | null> {
  const s = ttsSettings();
  if (provider === 'edge') return ['edge', s.edge.voice, s.edge.rate, s.edge.pitch].join('|');
  if (provider !== 'voicestudio') return null;
  const target = known ?? (await voicestudioTarget());
  if (!target) return null;
  const { url } = target;
  const engine = target.engine ?? 'none';
  const voice = override.voice ?? voicestudioVoice();
  const profileId = (await listProfiles(url).catch(() => [])).find((p) => p.name === voice)?.id ?? 'builtin';
  const tempo = override.tempo ?? voiceTempo();
  // 보통 빠르기(1)는 예전과 같은 이름 → 이미 만든 음성을 그대로 쓴다
  return ['vs', engine, voice, profileId, s.voicestudio.speed, ...(tempo !== 1 ? [`tempo${tempo}`] : [])].join('|');
}

/** 목소리 정체 + 문장으로 캐시 파일 이름을 만든다 */
export function audioKey(text: string, identity: string): string {
  return crypto.createHash('sha1').update(`${identity}|${text}`).digest('hex').slice(0, 16);
}

/** 한 문장을 만드는 동안 쓰는 VoiceStudio 주소와 엔진 (한 번 묻고 아래 단계에 넘긴다) */
interface VoiceStudioTarget {
  url: string;
  /** 상업 이용 가능한 엔진 (없으면 null) */
  engine: string | null;
}

async function voicestudioTarget(): Promise<VoiceStudioTarget | null> {
  const url = await voicestudioUrl();
  return url ? { url, engine: (await engineInfo(url)).chosen } : null;
}

async function voicestudioSpeech(text: string, out: string, voice: string, { url, engine: model }: VoiceStudioTarget) {
  const { speed, apiKey } = ttsSettings().voicestudio;
  // 상업 이용 가능한 엔진만 쓴다 (기본 OmniVoice는 비상업 라이선스)
  if (!model) throw new Error('상업적으로 쓸 수 있는 음성 엔진(VoxCPM2 등)이 설치되어 있지 않습니다. VoiceStudio 앱의 Model Catalogue에서 VoxCPM2를 설치해 주세요.');
  // 그래픽카드 없는 PC에서는 한 줄에 몇 분 걸릴 수 있다 (기본 15분, VOICESTUDIO_TIMEOUT_MS로 조정).
  // 내장 fetch는 응답 헤더를 5분까지만 기다리므로 node:http로 직접 요청한다.
  const timeoutMs = Number(process.env.VOICESTUDIO_TIMEOUT_MS) || 900_000;
  const payload = JSON.stringify({ model: assertCommercialEngine(model), voice, input: text, response_format: 'mp3', speed, language: 'ko' });
  const headers = { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) };
  // VoiceStudio가 다른 음성을 만드는 중이면 429(바쁨, 다시 시도해도 안전)를 준다 → 잠시 기다렸다 다시 요청
  const retryMs = Number(process.env.VOICESTUDIO_RETRY_MS) || 15_000;
  // 막 켜진 GPU가 엔진을 불러오는 중이면 '엔진 없음(400 not available)'으로 잘못 답할 때가 있다 → 3번까지 다시
  const engineStarting = (r: { status: number; body: Buffer }) => r.status === 400 && /not available|not installed/i.test(r.body.toString('utf8'));
  let res = await postSlow(`${url}/v1/audio/speech`, payload, headers, timeoutMs);
  for (let tries = 0, starting = 0; (res.status === 429 && tries < 40) || (engineStarting(res) && starting < 3); tries++) {
    if (engineStarting(res)) starting++;
    await new Promise((r) => setTimeout(r, retryMs));
    res = await postSlow(`${url}/v1/audio/speech`, payload, headers, timeoutMs);
  }
  if (res.status === 429) throw new Error('VoiceStudio가 다른 음성을 만드느라 바빠요. 잠시 뒤 다시 시도해 주세요.');
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`VoiceStudio 음성 생성 실패 (${res.status}): ${res.body.toString('utf8').slice(0, 200)}`);
  }
  fs.writeFileSync(out, res.body);
}

/** 오래 걸리는 로컬 요청: 전체 시간 제한만 두고 응답 헤더 대기 제한은 두지 않는다 */
export function postSlow(target: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const u = new URL(target);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'POST', headers: { ...headers, 'content-length': Buffer.byteLength(body) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) });
      });
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new Error(`VoiceStudio 응답이 ${Math.round(timeoutMs / 60000)}분 안에 오지 않았습니다.`)), timeoutMs);
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end(body);
  });
}

/** 음성 받아쓰기 결과 (VoiceStudio의 Whisper 계열) */
export interface Transcript {
  text: string;
  words: { start: number; end: number }[];
}

/**
 * 음성 파일을 받아쓴다. 결과는 파일 크기·수정 시각과 함께 옆에 저장한다.
 * 받아쓰기를 쓸 수 없으면(목소리 엔진이 VoiceStudio가 아님, 연결 실패) undefined.
 */
export async function transcribeAudio(file: string): Promise<Transcript | undefined> {
  const cache = `${file}.asr.json`;
  const cached = readFreshCache<Transcript>(cache, file);
  if (cached) return cached;
  if ((await ttsProvider().catch(() => 'none')) !== 'voicestudio') return undefined;
  const { apiKey } = ttsSettings().voicestudio;
  const url = await voicestudioUrl();
  if (!url) return undefined;
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), path.basename(file));
    form.append('model', 'whisper-1');
    form.append('language', 'ko');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    const res = await slowFetch(`${url}/v1/audio/transcriptions`, { method: 'POST', body: form, headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {} }, Number(process.env.VOICESTUDIO_INFO_TIMEOUT_MS) || 120_000);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { text?: string; words?: { start: number; end: number }[] };
    const t: Transcript = { text: String(data.text ?? ''), words: (data.words ?? []).map((w) => ({ start: Number(w.start), end: Number(w.end) })) };
    writeCache(cache, file, t);
    return t;
  } catch {
    // 연결 문제(시간 초과 등)는 기억하지 않는다: 다음에 다시 시도한다
    return undefined;
  }
}

/**
 * 실제 음성의 어절별 시간 (받아쓰기 결과에서).
 * 받아쓴 단어 수가 대사 어절 수와 같을 때만 쓴다.
 */
export async function measuredWords(file: string, line: string): Promise<[number, number][] | undefined> {
  const t = await transcribeAudio(file);
  if (!t) return undefined;
  const expected = line.trim().split(/\s+/).filter(Boolean).length;
  return t.words.length === expected ? t.words.map((w) => [w.start, w.end]) : undefined;
}

/**
 * 같은 문장은 다시 만들지 않는다 (캐시). 반환값: 파일 경로와 길이(초)
 * override: 설정과 다른 목소리·빠르기로 (설정 화면의 '들어보기')
 */
export async function synthesize(text: string, audioDir: string, override: VoiceOverride = {}): Promise<{ file: string; seconds: number }> {
  const provider = await ttsProvider();
  if (provider === 'none') throw new Error('사용할 수 있는 음성 도구가 없습니다.');
  const voice = override.voice ?? voicestudioVoice();
  const tempo = override.tempo ?? voiceTempo();
  // VoiceStudio 주소·엔진은 한 번만 묻고 아래 단계에 넘긴다.
  // 고른 목소리가 VoiceStudio에 아직 없으면 기준 녹음으로 먼저 만든다 (목소리 정체에 프로필 ID가 들어가므로 먼저)
  const target = provider === 'voicestudio' ? await voicestudioTarget() : null;
  if (target) await ensurePresetVoice(target.url, voice);
  const identity = await voiceIdentity(provider, { voice, tempo }, target ?? undefined);
  if (!identity) throw new Error('음성 도구에 연결할 수 없습니다.');
  fs.mkdirSync(audioDir, { recursive: true });
  const file = path.join(audioDir, `${audioKey(text, identity)}.mp3`);
  if (!fs.existsSync(file)) {
    // 같은 음성을 동시에 만들면(후보 목소리 작업 + 영상 제작) 먼저 시작한 작업을 기다린다
    let job = making.get(file);
    if (!job) {
      job = makeAudio(provider, text, file, voice, tempo, target).finally(() => making.delete(file));
      making.set(file, job);
    }
    await job;
  }
  return { file, seconds: mp3DurationSeconds(fs.readFileSync(file)) };
}

/** 지금 만들고 있는 음성 파일 (같은 파일을 동시에 두 번 만들지 않게) */
const making = new Map<string, Promise<void>>();

async function makeAudio(provider: TtsProvider, text: string, file: string, voice: string, tempo: number, target: VoiceStudioTarget | null) {
  // 같은 이름으로 다시 만드는 경우: 옛 분석 결과(길이·어절 시간)를 먼저 지운다
  removeAudioWithCache(file);
  // 임시 파일 이름은 작업마다 다르게 (다른 작업의 임시 파일을 덮거나 지우지 않게)
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const raw = `${tmp}.raw.mp3`;
  try {
    if (provider === 'voicestudio') {
      if (!target) throw new Error('VoiceStudio에 연결할 수 없습니다. 앱을 켜 주세요.');
      await voicestudioSpeech(text, tmp, voice, target);
      // 말 빠르기 (음높이는 그대로)
      if (tempo !== 1) {
        fs.renameSync(tmp, raw);
        await changeTempo(raw, tmp, tempo);
      }
    } else {
      const e = ttsSettings().edge;
      const args = ['--voice', e.voice, `--rate=${e.rate}`, `--pitch=${e.pitch}`, '--text', text, '--write-media', tmp];
      if (e.proxy) args.push('--proxy', e.proxy);
      await run(e.command, args);
    }
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(raw, { force: true });
    fs.rmSync(tmp, { force: true });
  }
}

/** 지금 목소리(identity)로 만든 캐시가 있으면 돌려준다 */
export function cachedAudio(text: string, audioDir: string, identity: string | null): { file: string; seconds: number } | null {
  if (!identity) return null;
  const file = path.join(audioDir, `${audioKey(text, identity)}.mp3`);
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
