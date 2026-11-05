import fs from 'node:fs';
import { readVoiceSettings } from './voicestudio.ts';

/**
 * VibeVoice-Realtime-0.5B (Microsoft, MIT) — 실험용 음성 엔진.
 * - 빠르지만 한국어는 '실험' 단계이고, 기본 목소리 2개만 고를 수 있다 (맛조수 목소리 복제 불가).
 * - Microsoft는 연구·개발용으로 권한다 → 기본 엔진은 VoxCPM2(맛조수), 이건 설정에서 골랐을 때만 쓴다.
 * 서버 주소: VIBEVOICE_URL (클라우드: 목소리 중계기 /vibevoice, 로컬: deploy/vibevoice/engine.py --serve)
 */
export const VIBEVOICE_MODEL = 'VibeVoice-Realtime-0.5B';
export const VIBEVOICE_SPEAKERS = [
  { id: 'kr-woman', label: '한국어 여성 (실험)' },
  { id: 'kr-man', label: '한국어 남성 (실험)' },
] as const;
export type VibeVoiceSpeaker = (typeof VIBEVOICE_SPEAKERS)[number]['id'];

export function vibevoiceUrl(): string | null {
  return process.env.VIBEVOICE_URL?.replace(/\/$/, '') || null;
}

export function isVibeVoiceSpeaker(id: unknown): id is VibeVoiceSpeaker {
  return VIBEVOICE_SPEAKERS.some((s) => s.id === id);
}

export function vibevoiceSpeaker(): VibeVoiceSpeaker {
  const s = readVoiceSettings().vibevoiceSpeaker;
  return isVibeVoiceSpeaker(s) ? s : 'kr-woman';
}

export function vibevoiceLabel(id = vibevoiceSpeaker()): string {
  return VIBEVOICE_SPEAKERS.find((s) => s.id === id)?.label ?? id;
}

export async function vibevoiceUp(): Promise<boolean> {
  const url = vibevoiceUrl();
  if (!url) return false;
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 대사 → MP3 파일. 클라우드 GPU가 잠들어 있으면 처음 한 번은 깨어나는 데 1~3분 걸린다.
 * postSlow: tts.ts의 오래 걸리는 요청 함수 (응답 헤더 대기 제한 없음)
 */
export async function vibevoiceSpeech(
  text: string,
  out: string,
  postSlow: (url: string, body: string, headers: Record<string, string>, timeoutMs: number) => Promise<{ status: number; body: Buffer }>,
  speaker: VibeVoiceSpeaker = vibevoiceSpeaker(),
): Promise<void> {
  const url = vibevoiceUrl();
  if (!url) throw new Error('VibeVoice 서버가 설정되어 있지 않아요 (VIBEVOICE_URL).');
  const timeoutMs = Number(process.env.VIBEVOICE_TIMEOUT_MS) || 900_000;
  const res = await postSlow(`${url}/tts`, JSON.stringify({ text, speaker }), { 'content-type': 'application/json' }, timeoutMs);
  if (res.status < 200 || res.status >= 300) {
    let detail = res.body.toString('utf8').slice(0, 200);
    try {
      detail = (JSON.parse(res.body.toString('utf8')) as { detail?: string }).detail ?? detail;
    } catch {
      // 글자 그대로 보여 준다
    }
    throw new Error(`VibeVoice 음성 생성 실패 (${res.status}): ${detail}`);
  }
  if (res.body.length < 200) throw new Error('VibeVoice가 빈 음성을 돌려줬어요. 다시 시도해 주세요.');
  fs.writeFileSync(out, res.body);
}
