import fs from 'node:fs';
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

export interface VoiceProfile {
  id: string;
  name: string;
  kind: string;
  audioUrl: string | null;
}

export async function listProfiles(url: string): Promise<VoiceProfile[]> {
  const res = await fetch(`${url}/profiles`, { headers: headers(), signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`VoiceStudio 목소리 목록을 불러오지 못했습니다 (${res.status})`);
  const rows = (await res.json()) as { id: string | number; name: string; kind?: string; audio_url?: string | null }[];
  return rows.map((r) => ({ id: String(r.id), name: r.name, kind: r.kind ?? '', audioUrl: r.audio_url ? `${url}${r.audio_url}` : null }));
}

/** 맛조수 목소리 설계: 밝고 높은 톤의 젊은 목소리 */
export const MASCOT_VOICE_DESCRIPTION = 'young adult female, high pitch, bright cheerful energetic voice';

/**
 * VoiceStudio의 '목소리 디자인'으로 프로필을 만든다.
 * 설명 문장을 앱의 디자인 항목(성별·나이·높이·스타일)으로 바꾼 뒤 저장한다.
 */
export async function createDesignedVoice(url: string, name: string, description = MASCOT_VOICE_DESCRIPTION): Promise<VoiceProfile> {
  const described = await fetch(`${url}/design/describe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers() },
    body: JSON.stringify({ description }),
    signal: AbortSignal.timeout(10000),
  });
  if (!described.ok) throw new Error(`목소리 설명을 해석하지 못했습니다 (${described.status})`);
  const { attrs } = (await described.json()) as { attrs: Record<string, string> };

  const form = new FormData();
  form.append('name', name);
  form.append('kind', 'design');
  form.append('vd_states', JSON.stringify(attrs));
  form.append('language', 'Auto');
  const created = await fetch(`${url}/profiles`, { method: 'POST', body: form, headers: headers(), signal: AbortSignal.timeout(180000) });
  if (!created.ok) {
    const detail = await created.text().catch(() => '');
    throw new Error(`목소리를 만들지 못했습니다 (${created.status}): ${detail.slice(0, 200)}`);
  }
  const r = (await created.json()) as { id: string | number; name: string; kind?: string; audio_url?: string | null };
  return { id: String(r.id), name: r.name, kind: r.kind ?? 'design', audioUrl: r.audio_url ? `${url}${r.audio_url}` : null };
}

// ---------- 스튜디오 음성 설정 (data/settings.json) ----------

export interface StudioVoiceSettings {
  /** VoiceStudio 목소리 프로필 이름 */
  voicestudioVoice?: string;
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
