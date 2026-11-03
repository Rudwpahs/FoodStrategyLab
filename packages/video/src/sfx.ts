import type { Scene, Script } from '@mat-lab/recipe-core';

/**
 * 효과음: 코드로 직접 합성한다 (외부 음원을 쓰지 않으므로 저작권·라이선스 문제가 없다).
 * 근거: 놀람이 주의를 모은다는 연구(sources.md S44), 1분 넘는 Shorts의 음원 클레임 위험(S16).
 */
export type SfxName = 'whoosh' | 'ding' | 'boing' | 'pop';
const RATE = 22050;

function wav(samples: Float32Array): Uint8Array {
  const data = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) data[i] = Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767);
  const buf = new ArrayBuffer(44 + data.byteLength);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + data.byteLength, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, data.byteLength, true);
  new Uint8Array(buf, 44).set(new Uint8Array(data.buffer));
  return new Uint8Array(buf);
}

/** 매번 같은 소리가 나도록 고정 씨앗 난수 */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff - 0.5;
  };
}

export function synthSfx(name: SfxName): Float32Array {
  const len = { whoosh: 0.38, ding: 0.7, boing: 0.45, pop: 0.12 }[name];
  const n = Math.round(len * RATE);
  const out = new Float32Array(n);
  const rnd = noise(7);
  let lp = 0;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const p = t / len;
    if (name === 'whoosh') {
      // 걸러진 잡음이 커졌다 작아짐
      const cutoff = 0.04 + 0.25 * Math.sin(Math.PI * p);
      lp += cutoff * (rnd() - lp);
      out[i] = lp * 2.4 * Math.sin(Math.PI * p);
    } else if (name === 'ding') {
      const env = Math.exp(-5 * t);
      out[i] = env * (0.55 * Math.sin(2 * Math.PI * 1318.5 * t) + 0.25 * Math.sin(2 * Math.PI * 2637 * t)) * Math.min(1, t / 0.004);
    } else if (name === 'boing') {
      // 내려가는 소리 + 떨림 (실수·실패)
      const f = 420 * Math.pow(0.45, p) * (1 + 0.06 * Math.sin(2 * Math.PI * 18 * t));
      phase += (2 * Math.PI * f) / RATE;
      out[i] = 0.5 * Math.sin(phase) * (1 - p) * Math.min(1, t / 0.01);
    } else {
      const f = 600 + 900 * p;
      phase += (2 * Math.PI * f) / RATE;
      out[i] = 0.45 * Math.sin(phase) * Math.sin(Math.PI * p);
    }
  }
  return out;
}

const cache = new Map<SfxName, string>();
/** Remotion <Audio>에 바로 넣을 수 있는 data URL */
export function sfxUrl(name: SfxName): string {
  let url = cache.get(name);
  if (!url) {
    const bytes = wav(synthSfx(name));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    url = `data:audio/wav;base64,${btoa(bin)}`;
    cache.set(name, url);
  }
  return url;
}

export interface SfxCue {
  sceneId: string;
  name: SfxName;
  /** 장면 시작 기준 프레임 */
  offset: number;
}

/** 장면 연출에 맞춰 효과음 자리를 정한다. 장면마다 최대 1개, 영상 전체 4개 이하 (과하지 않게) */
export function sfxCues(script: Script): SfxCue[] {
  const cues: SfxCue[] = [];
  const pick = (s: Scene): Omit<SfxCue, 'sceneId'> | null => {
    // 연출 엔진이 붙인 화면 연출·훅에만 넣는다 (기존 템플릿 영상은 소리가 바뀌지 않게)
    if (s.visual === 'fail' || s.visual === 'fail-closeup') return { name: 'boing', offset: 2 };
    if (s.hook) return { name: 'whoosh', offset: 0 };
    if (s.visual === 'result' || s.visual === 'compare') return { name: 'ding', offset: 6 };
    if (s.visual === 'signature') return { name: 'pop', offset: 4 };
    return null;
  };
  for (const s of script.scenes) {
    const c = pick(s);
    if (c) cues.push({ sceneId: s.id, ...c });
  }
  return cues.slice(0, 4);
}
