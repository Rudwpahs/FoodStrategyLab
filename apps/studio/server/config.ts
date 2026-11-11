import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../../..');
export const DATA_DIR = path.resolve(process.env.MATLAB_DATA_DIR ?? path.join(ROOT, 'data'));
export const PORT = Number(process.env.PORT ?? 5178);
/** DB 파일. 클라우드에서는 서버 안 디스크(MATLAB_DB_FILE)에 두고 DATA_DIR로 복사본을 보낸다 */
export const DB_FILE = path.resolve(process.env.MATLAB_DB_FILE ?? path.join(DATA_DIR, 'studio.db'));
/** 클라우드 저장소에 둘 DB 복사본 (MATLAB_DB_FILE을 따로 정했을 때만) */
export const DB_SNAPSHOT = process.env.MATLAB_DB_FILE ? path.join(DATA_DIR, 'studio.db') : null;

export type TtsChoice = 'auto' | 'voicestudio' | 'edge' | 'none';

/**
 * 음성 설정. 매번 환경 변수를 읽는다 (테스트·설정 변경 반영).
 * auto: VoiceStudio(로컬 앱)가 켜져 있으면 그것을, 아니면 edge-tts, 둘 다 없으면 음성 없음.
 */
export function ttsSettings() {
  const e = process.env;
  return {
    provider: (e.TTS_PROVIDER ?? 'auto') as TtsChoice,
    edge: {
      command: e.EDGE_TTS_CMD ?? 'edge-tts',
      voice: e.TTS_VOICE ?? 'ko-KR-SunHiNeural',
      rate: e.TTS_RATE ?? '+8%',
      pitch: e.TTS_PITCH ?? '+15Hz',
      proxy: e.TTS_PROXY ?? '',
    },
    voicestudio: {
      /** 목소리 프로필 이름을 강제로 지정할 때만 (보통은 스튜디오 화면에서 고른다) */
      voiceOverride: e.VOICESTUDIO_VOICE ?? '',
      speed: Number(e.VOICESTUDIO_SPEED ?? '1.05'),
      apiKey: e.VOICESTUDIO_API_KEY ?? '',
    },
  };
}
