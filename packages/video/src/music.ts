import type { Script } from '@mat-lab/recipe-core';
import { FPS, type SceneTiming } from './timeline.ts';

/**
 * 배경 음악 (CC0 실제 연주 녹음, 출처는 packages/video/assets/bgm/LICENSES.md).
 * 대사가 나오는 동안은 소리를 줄이고(더킹), 말이 쉬는 틈에는 조금 키운다. 규칙은 이 파일 한 곳에 두고
 * 브라우저 미리보기(<Audio volume>)와 서버 렌더(ffmpeg volume 식)가 같은 값을 쓴다.
 * 서버는 대사·효과음만으로 영상을 만든 뒤 자동 품질 검사를 하고, 그다음에 음악을 섞는다 (음악이 대사 잘림 검사를 흐리지 않게).
 */
export const MUSIC_TRACKS = ['ukulele', 'upbeat', 'pizzicato', 'musicbox'] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number];
export const isMusicTrack = (v: unknown): v is MusicTrack => (MUSIC_TRACKS as readonly unknown[]).includes(v);

export const MUSIC_LABELS: Record<MusicTrack, string> = {
  ukulele: '밝은 우쿨렐레',
  upbeat: '신나는 리듬',
  pizzicato: '궁금한 현악 피치카토',
  musicbox: '따뜻한 오르골',
};

/**
 * 이야기 분위기에 맞는 곡. 이야기 대본은 갈래(hookType), 연출 대본은 연출(style)로 고른다.
 * 감동(선물·추억) → 오르골, 추리·오해·코미디 → 피치카토, 시간 싸움·내기·구출 → 신나는 리듬, 나머지 → 우쿨렐레
 */
export function musicFor(script: Pick<Script, 'style' | 'hookType'>): MusicTrack {
  const kind = script.style === 'ai-story' ? script.hookType : script.style;
  switch (kind) {
    case 'gift':
    case 'memory':
    case 'story':
      return 'musicbox';
    case 'mystery':
    case 'myth':
    case 'comedy':
    case 'problem':
      return 'pizzicato';
    case 'race':
    case 'bet':
    case 'rescue':
    case 'experiment':
      return 'upbeat';
    default:
      return 'ukulele';
  }
}

/** 곡 파일은 -20 LUFS로 맞춰 두었다. 대사 중에는 이만큼(약 -31 LUFS, 목소리보다 17dB쯤 작게), 말이 쉬는 틈에는 이만큼(약 -24 LUFS) */
export const MUSIC_GAIN_SPEECH = 0.28;
export const MUSIC_GAIN_GAP = 0.6;
/** 줄이고 키울 때 걸리는 시간(프레임) — 갑자기 바뀌면 거슬린다 */
const DUCK_RAMP = 6;
/** 영상 처음에 커지는 시간, 끝에서 작아지는 시간 (프레임) */
const FADE_IN = 12;
const FADE_OUT = 36;

/** 대사가 나오는 구간 [시작, 끝] (영상 전체 프레임 기준) */
export function speechIntervals(timings: SceneTiming[]): [number, number][] {
  return timings.filter((t) => t.speechFrames > 0).map((t) => [t.from, t.from + t.speechFrames]);
}

/** 프레임 f에서 음악 크기 (0~1, 곡 파일 크기 대비) */
export function musicGain(f: number, intervals: [number, number][], total: number): number {
  let duck = 0;
  for (const [a, b] of intervals) duck = Math.max(duck, Math.min(1, Math.max(0, Math.min((f - (a - DUCK_RAMP)) / DUCK_RAMP, (b + DUCK_RAMP - f) / DUCK_RAMP))));
  const fade = Math.max(0, Math.min(1, f / FADE_IN, (total - f) / FADE_OUT));
  return (MUSIC_GAIN_GAP - (MUSIC_GAIN_GAP - MUSIC_GAIN_SPEECH) * duck) * fade;
}

/** 같은 규칙을 ffmpeg volume 필터 식으로 (t = 초). musicGain과 같은 값을 낸다 (테스트로 확인) */
export function musicVolumeExpr(intervals: [number, number][], total: number, fps = FPS): string {
  const r = DUCK_RAMP / fps;
  const traps = intervals.map(([a, b]) => `clip(min((t-(${(a / fps - r).toFixed(3)}))/${r.toFixed(4)},(${(b / fps + r).toFixed(3)}-t)/${r.toFixed(4)}),0,1)`);
  const duck = traps.length ? traps.reduce((acc, x) => `max(${acc},${x})`) : '0';
  const fade = `clip(min(t/${(FADE_IN / fps).toFixed(4)},(${(total / fps).toFixed(3)}-t)/${(FADE_OUT / fps).toFixed(4)}),0,1)`;
  return `(${MUSIC_GAIN_GAP}-${(MUSIC_GAIN_GAP - MUSIC_GAIN_SPEECH).toFixed(2)}*${duck})*${fade}`;
}
