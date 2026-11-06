import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { DATA_DIR } from './config.ts';

/**
 * VoiceStudio(로컬 음성 앱) 연결.
 * - 앱은 보통 3900번 포트를 쓰고, 막혀 있으면 4900, 5900 … 19900 순서로 옮긴다 (앱과 같은 규칙).
 * - 앱이 모델을 불러오는 동안 /health는 503 "starting"을 돌려준다.
 */
export type VoiceStudioStatus = { state: 'ok' | 'starting'; url: string; version: string } | { state: 'offline' };

const CANDIDATE_PORTS = Array.from({ length: 17 }, (_, i) => 3900 + i * 1000);

function headers(): Record<string, string> {
  const key = process.env.OMNIVOICE_API_KEY;
  return key ? { authorization: `Bearer ${key}` } : {};
}

async function probe(url: string): Promise<VoiceStudioStatus | null> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1200), headers: headers() });
    const body = (await res.json().catch(() => null)) as { status?: string; version?: string } | null;
    if (!body || (body.status !== 'ok' && body.status !== 'starting')) return null;
    return { state: body.status === 'ok' ? 'ok' : 'starting', url, version: String(body.version ?? '') };
  } catch {
    return null;
  }
}

/**
 * 오래 걸릴 수 있는 VoiceStudio 요청 (fetch와 같은 모양으로 쓴다).
 * 내장 fetch는 응답 헤더를 5분까지만 기다리는데, 클라우드 GPU는 처음 켜질 때 그보다 오래 걸릴 수 있다.
 * 그래서 node:http로 보내고, 전체 시간 제한(timeoutMs)만 둔다.
 */
export async function slowFetch(
  target: string,
  init: { method?: string; headers?: Record<string, string>; body?: FormData | string },
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }> {
  // FormData는 Request로 한 번 감싸 여러 부분(multipart) 본문과 헤더를 얻는다
  const req0 = new Request(target, { method: init.method ?? 'GET', headers: init.headers, body: init.body });
  const body = init.body === undefined ? undefined : Buffer.from(await req0.arrayBuffer());
  const hdrs: Record<string, string> = {};
  req0.headers.forEach((v, k) => (hdrs[k] = v));
  if (body) hdrs['content-length'] = String(body.length);
  const u = new URL(target);
  const lib = u.protocol === 'https:' ? https : http;
  const { status, buf } = await new Promise<{ status: number; buf: Buffer }>((resolve, reject) => {
    const req = lib.request(u, { method: init.method ?? 'GET', headers: hdrs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode ?? 0, buf: Buffer.concat(chunks) });
      });
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new Error(`목소리 엔진 응답이 ${Math.round(timeoutMs / 60000)}분 안에 오지 않았습니다.`)), timeoutMs);
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end(body);
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => buf.toString('utf8'),
    json: async () => JSON.parse(buf.toString('utf8')) as unknown,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  };
}

let lastUrl: string | null = null;

/** 설정한 주소(VOICESTUDIO_URL)가 있으면 그것만, 없으면 앱이 쓰는 포트를 차례로 찾아본다 */
export async function findVoiceStudio(): Promise<VoiceStudioStatus> {
  const fixed = process.env.VOICESTUDIO_URL?.replace(/\/$/, '');
  if (fixed) return (await probe(fixed)) ?? { state: 'offline' };
  if (lastUrl) {
    const again = await probe(lastUrl);
    if (again) return again;
  }
  for (const port of CANDIDATE_PORTS) {
    const found = await probe(`http://127.0.0.1:${port}`);
    if (found && found.state !== 'offline') {
      lastUrl = found.url;
      return found;
    }
  }
  lastUrl = null;
  return { state: 'offline' };
}

/**
 * 목록·엔진 정보 요청의 시간 제한. 클라우드 GPU는 처음 깨어나는 데 몇 분 걸려서
 * VOICESTUDIO_INFO_TIMEOUT_MS로 늘린다 (기본: 목록 5초, 엔진 60초).
 */
const infoTimeout = (fallback: number) => Number(process.env.VOICESTUDIO_INFO_TIMEOUT_MS) || fallback;

export interface VoiceProfile {
  id: string;
  name: string;
  kind: string;
  audioUrl: string | null;
}

export async function listProfiles(url: string): Promise<VoiceProfile[]> {
  const res = await slowFetch(`${url}/profiles`, { headers: headers() }, infoTimeout(5000));
  if (!res.ok) throw new Error(`VoiceStudio 목소리 목록을 불러오지 못했습니다 (${res.status})`);
  const rows = (await res.json()) as { id: string | number; name: string; kind?: string; audio_url?: string | null }[];
  return rows.map((r) => ({ id: String(r.id), name: r.name, kind: r.kind ?? '', audioUrl: r.audio_url ? `${url}${r.audio_url}` : null }));
}

/**
 * 상업적으로 쓸 수 있는 라이선스(Apache-2.0·MIT)의 한국어 가능 엔진, 선호 순서.
 * VoiceStudio 기본 엔진인 OmniVoice는 가중치가 비상업(CC-BY-NC)이라 쓰지 않는다.
 */
export const COMMERCIAL_ENGINES = ['voxcpm2', 'moss-tts-nano', 'confucius4-tts', 'gpt-sovits'] as const;
export const NONCOMMERCIAL_ENGINES = ['omnivoice', 'omnivoice-gguf', 'omnivoice-subprocess', 'pockettts'];

export interface EngineInfo {
  active: string;
  /** 스튜디오가 쓸 엔진 (상업 이용 가능, 설치됨). 없으면 null */
  chosen: string | null;
  available: string[];
}

export async function engineInfo(url: string): Promise<EngineInfo> {
  // 모델을 처음 불러오는 동안에는 응답이 늦을 수 있다
  const res = await slowFetch(`${url}/engines/tts`, { headers: headers() }, infoTimeout(60000));
  if (!res.ok) throw new Error(`VoiceStudio 엔진 목록을 불러오지 못했습니다 (${res.status})`);
  const d = (await res.json()) as { active: string; backends: { id: string; available: boolean }[] };
  const available = d.backends.filter((b) => b.available).map((b) => b.id);
  const forced = process.env.VOICESTUDIO_MODEL;
  const chosen = forced && forced !== 'tts-1' ? forced : (COMMERCIAL_ENGINES.find((e) => available.includes(e)) ?? null);
  return { active: d.active, chosen, available };
}

/** 맛조수 목소리 설계: 밝고 높은 톤의 귀여운 젊은 목소리 */
export const MASCOT_VOICE_DESCRIPTION = 'A cute, bright young female voice, cheerful and energetic, slightly high pitch, friendly cartoon assistant';
/** 기준 녹음에 쓰는 문장 (프로필에 대본으로 함께 저장) */
export const MASCOT_REFERENCE_TEXT = '이희재의 맛 연구소에서 오늘도 실험! 오늘의 질문, 호두정과는 왜 데쳤다가 튀길까요?';

/**
 * 맛조수 목소리 만들기.
 * 1) VoxCPM2 '목소리 디자인'으로 설명 문장에서 기준 녹음 한 개를 만들고
 * 2) 그 녹음을 고정 프로필(복제)로 저장한다 → 모든 대사가 같은 목소리로 나온다.
 */
export async function createDesignedVoice(url: string, name: string, description = MASCOT_VOICE_DESCRIPTION): Promise<VoiceProfile> {
  const engines = await engineInfo(url);
  if (!engines.available.includes('voxcpm2')) {
    throw new Error('목소리 디자인에는 VoxCPM2 엔진이 필요합니다. VoiceStudio 앱의 Model Catalogue에서 VoxCPM2를 설치해 주세요.');
  }
  const speech = await slowFetch(
    `${url}/v1/audio/speech`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers() },
      body: JSON.stringify({ model: 'voxcpm2', voice: 'default', language: 'ko', response_format: 'wav', description, input: MASCOT_REFERENCE_TEXT }),
    },
    1_800_000,
  );
  if (!speech.ok) throw new Error(`기준 녹음을 만들지 못했습니다 (${speech.status}): ${(await speech.text().catch(() => '')).slice(0, 200)}`);
  const wav = Buffer.from(await speech.arrayBuffer());
  return createVoiceFromReference(url, name, wav);
}

/**
 * 맛조수 기준 녹음 (저장소에 고정). 어디서 만들든 같은 목소리가 나오게 이 녹음으로 목소리를 복제한다.
 * 목소리 이름에 녹음 지문(6자)을 붙여, 다른 기준으로 만든 예전 목소리와 섞이지 않게 한다.
 */
export const MASCOT_REFERENCE_FILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../tools/setup/matjosu-reference.wav');

export function mascotVoiceName(wav: Buffer): string {
  return `맛조수-${crypto.createHash('sha1').update(wav).digest('hex').slice(0, 6)}`;
}

/** 기준 녹음 한 개로 고정 목소리(복제 프로필)를 만든다 */
export async function createVoiceFromReference(url: string, name: string, wav: Buffer, refText = MASCOT_REFERENCE_TEXT): Promise<VoiceProfile> {
  const form = new FormData();
  form.append('name', name);
  form.append('kind', 'clone');
  form.append('ref_text', refText);
  form.append('language', 'Auto');
  form.append('ref_audio', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'matjosu-reference.wav');
  const created = await slowFetch(`${url}/profiles`, { method: 'POST', body: form, headers: headers() }, Math.max(300_000, infoTimeout(300_000)));
  if (!created.ok) {
    const detail = await created.text().catch(() => '');
    throw new Error(`목소리를 만들지 못했습니다 (${created.status}): ${detail.slice(0, 200)}`);
  }
  const r = (await created.json()) as { id: string | number; name: string; kind?: string; audio_url?: string | null };
  return { id: String(r.id), name: r.name, kind: r.kind ?? 'clone', audioUrl: r.audio_url ? `${url}${r.audio_url}` : null };
}

// ---------- 스튜디오 음성 설정 (data/settings.json) ----------

export interface StudioVoiceSettings {
  /** VoiceStudio 목소리 프로필 이름 */
  voicestudioVoice?: string;
  /** 말 빠르기 배수 (1 = 보통, voicePresets.ts의 VOICE_TEMPOS 중 하나) */
  tempo?: number;
}

const settingsFile = () => path.join(DATA_DIR, 'settings.json');

export function readVoiceSettings(): StudioVoiceSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as StudioVoiceSettings;
  } catch {
    return {};
  }
}

export function writeVoiceSettings(patch: StudioVoiceSettings) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...readVoiceSettings(), ...patch }, null, 2));
}
