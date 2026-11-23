import type { Scene, Script } from '@mat-lab/recipe-core';
import { SFX_WAV_BASE64 } from './sfxData.ts';

/**
 * 효과음: 실제 녹음 (CC0, 출처는 packages/video/assets/sfx/LICENSES.md).
 * 예전에는 코드로 합성했는데, 합성음은 귀로 확인하지 못해 어색하게 들릴 수 있어 실제 녹음으로 바꿨다.
 * 근거: 놀람이 주의를 모은다는 연구(sources.md S44), 1분 넘는 Shorts의 음원 클레임 위험(S16) — CC0라 클레임 대상이 아니다.
 * page(노트 넘기는 소리)만 이 저장소에서 합성했다 (tools/content-lab/synth-page.ts, 참고 녹음과 같은 잣대로 재어 맞춤).
 * 연출 효과음(sfxCues)과 따로, 노트 카드가 뜰 때마다 나는 맛조수의 고정 소리다 (hostCues.ts).
 */
export type SfxName = 'whoosh' | 'ding' | 'boing' | 'pop' | 'page';

/** Remotion <Audio>에 바로 넣을 수 있는 data URL (화면 미리보기와 렌더가 같은 소리) */
export function sfxUrl(name: SfxName): string {
  return `data:audio/wav;base64,${SFX_WAV_BASE64[name]}`;
}

/** 효과음 소리 값 (-1~1)과 초당 샘플 수. 품질 검사 시험에서 실제 효과음을 섞어 볼 때 쓴다 */
export function sfxSamples(name: SfxName): { samples: Float32Array; rate: number } {
  const bin = atob(SFX_WAV_BASE64[name]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const v = new DataView(bytes.buffer);
  // RIFF 안의 'fmt '·'data' 칸을 찾는다 (16비트 모노만 쓴다)
  let rate = 0;
  for (let o = 12; o + 8 <= bytes.length; ) {
    const id = String.fromCharCode(...bytes.subarray(o, o + 4));
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ') rate = v.getUint32(o + 12, true);
    if (id === 'data') {
      const n = Math.floor(size / 2);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = v.getInt16(o + 8 + i * 2, true) / 32768;
      return { samples, rate };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error(`효과음 ${name}에 소리 칸이 없어요`);
}

export interface SfxCue {
  sceneId: string;
  name: SfxName;
  /** 장면 시작 기준 프레임 */
  offset: number;
}

/** 장면 연출에 맞춰 효과음 자리를 정한다 (훅·공개·서명). 장면마다 최대 1개, 영상 전체 4개 이하 (과하지 않게) */
export function sfxCues(script: Script): SfxCue[] {
  const cues: SfxCue[] = [];
  const pick = (s: Scene): Omit<SfxCue, 'sceneId'> | null => {
    // 연출 엔진이 붙인 화면 연출·훅에만 넣는다 (기존 템플릿 영상은 소리가 바뀌지 않게)
    // 실패 장면에는 소리를 넣지 않는다: 예전 'boing'(구금)은 실패를 개그처럼 들리게 했다 (맛조수는 실수를 웃음거리로 삼지 않는 차분한 기록 담당)
    if (s.hook) return { name: 'whoosh', offset: 0 };
    if (s.visual === 'result' || s.visual === 'compare') return { name: 'ding', offset: 6 };
    if (s.visual === 'signature') return { name: 'pop', offset: 4 };
    return null;
  };
  // 농담 장면: 첫 농담 그림이 나타날 때만 가볍게 '퐁' (장면마다 넣으면 시끄럽고 엔딩 서명 소리가 빠진다)
  const firstGag = script.scenes.find((s) => s.type === 'gag' && !s.hook)?.id;
  for (const s of script.scenes) {
    const c = s.id === firstGag ? { name: 'pop' as const, offset: 6 } : pick(s);
    if (c) cues.push({ sceneId: s.id, ...c });
  }
  return cues.slice(0, 4);
}
