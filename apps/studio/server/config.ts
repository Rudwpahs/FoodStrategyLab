import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../../..');
export const DATA_DIR = path.resolve(process.env.MATLAB_DATA_DIR ?? path.join(ROOT, 'data'));
export const PORT = Number(process.env.PORT ?? 5178);

export const TTS = {
  /** 'auto' | 'edge' | 'none' */
  provider: (process.env.TTS_PROVIDER ?? 'auto') as 'auto' | 'edge' | 'none',
  command: process.env.EDGE_TTS_CMD ?? 'edge-tts',
  voice: process.env.TTS_VOICE ?? 'ko-KR-SunHiNeural',
  rate: process.env.TTS_RATE ?? '+8%',
  pitch: process.env.TTS_PITCH ?? '+15Hz',
  proxy: process.env.TTS_PROXY ?? '',
};
