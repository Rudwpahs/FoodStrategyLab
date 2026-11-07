import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoiceFromReference, listProfiles } from './voicestudio.ts';

/**
 * 고를 수 있는 목소리들 (모두 VoxCPM2, 상업 이용 가능).
 * 목소리마다 저장소에 고정한 기준 녹음이 있고, 그 녹음을 복제해 쓰므로 어디서 만들어도 같은 목소리가 난다.
 * 목록은 tools/setup/voices.json (클라우드 GPU도 같은 파일을 읽는다).
 */
export const SETUP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../tools/setup');
export const VOICE_MANIFEST = path.join(SETUP_DIR, 'voices.json');

interface ManifestEntry {
  id: string;
  /** 목소리 이름 앞부분 (뒤에 녹음 지문 6자가 붙는다) */
  name: string;
  label: string;
  note: string;
  /** tools/setup 기준 상대 경로 */
  file: string;
  refText: string;
}

export interface VoicePreset extends ManifestEntry {
  /** VoiceStudio 목소리 프로필 이름 (예: 맛조수-6f2213) */
  voiceName: string;
  wav: Buffer;
}

let cache: VoicePreset[] | null = null;

export function voicePresets(): VoicePreset[] {
  if (cache) return cache;
  let entries: ManifestEntry[] = [];
  try {
    entries = JSON.parse(fs.readFileSync(VOICE_MANIFEST, 'utf8')) as ManifestEntry[];
  } catch {
    entries = [];
  }
  const list: VoicePreset[] = [];
  for (const e of entries) {
    const file = path.join(SETUP_DIR, e.file);
    if (!fs.existsSync(file)) continue;
    const wav = fs.readFileSync(file);
    list.push({ ...e, wav, voiceName: presetVoiceName(e.name, wav) });
  }
  cache = list;
  return list;
}

export function presetVoiceName(name: string, wav: Buffer): string {
  return `${name}-${crypto.createHash('sha1').update(wav).digest('hex').slice(0, 6)}`;
}

export const presetById = (id: string) => voicePresets().find((p) => p.id === id) ?? null;
export const presetByVoiceName = (voiceName: string) => voicePresets().find((p) => p.voiceName === voiceName) ?? null;

/** 기본 목소리 (목록의 첫 번째: 맛조수) */
export const defaultPreset = () => voicePresets()[0] ?? null;

/**
 * 고른 목소리가 VoiceStudio에 아직 없으면 기준 녹음으로 만든다.
 * (클라우드 GPU는 켜질 때 모두 만들어 두므로 보통 바로 끝난다)
 */
const ensured = new Set<string>();
export async function ensurePresetVoice(url: string, voiceName: string): Promise<void> {
  const preset = presetByVoiceName(voiceName);
  if (!preset || ensured.has(`${url}|${voiceName}`)) return;
  const exists = (await listProfiles(url)).some((p) => p.name === voiceName);
  if (!exists) await createVoiceFromReference(url, voiceName, preset.wav, preset.refText);
  ensured.add(`${url}|${voiceName}`);
}

/** 말 빠르기 (1 = 지금까지와 같은 보통 빠르기) */
export const VOICE_TEMPOS = [
  { value: 0.9, label: '느리게' },
  { value: 1, label: '보통' },
  { value: 1.1, label: '조금 빠르게' },
  { value: 1.2, label: '빠르게' },
] as const;

export function isVoiceTempo(v: unknown): v is number {
  return VOICE_TEMPOS.some((t) => t.value === v);
}
