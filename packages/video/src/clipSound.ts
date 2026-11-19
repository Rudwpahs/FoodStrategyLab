import { duckAmount, duckExpr } from './music.ts';
import type { ClipLayer } from './realFootage.ts';
import { FPS } from './timeline.ts';

/**
 * 휴대폰 촬영 소리(지글지글·보글보글)를 목소리 밑에 작게 깐다.
 * 자동 품질 검사(qa.ts)의 '대사 잘림'은 말소리 끝 뒤가 30dB 이상 조용해지는지로 판정하므로, 촬영 소리가 깔린 채로 검사하면
 * 진짜 잘린 대사를 놓친다. 그래서 배경 음악처럼: 서버는 촬영 소리 없이(영상은 그대로) 렌더 → 품질 검사 → 그다음에 촬영 소리를 섞는다.
 * 브라우저 미리보기는 같은 크기 규칙으로 화면에서 바로 튼다 (liveClipSound).
 */

/** 촬영 소리 크기 맞춤 목표 (평균 dBFS). 휴대폰마다 녹음 크기가 달라서 먼저 이 크기로 맞춘다 */
export const CLIP_SOUND_TARGET_DB = -28;
/** 조용한 영상을 이 이상 키우지 않는다 (방 잡음이 커지지 않게) */
const MAX_BOOST_DB = 6;
const MAX_CUT_DB = -30;
/** 대사 중에는 이만큼(약 -10dB, 목소리보다 20dB쯤 작게), 말이 쉬는 틈에는 이만큼 */
export const CLIP_SOUND_GAIN_SPEECH = 0.3;
export const CLIP_SOUND_GAIN_GAP = 0.7;
/** 묶음 처음·끝에서 소리가 뚝 끊기지 않게 (초) */
const EDGE_FADE = 0.25;
/** 미리보기는 크기 맞춤을 못 하므로 휴대폰 녹음 보통 크기(-20dB 안팎)를 어림해 줄인다 */
export const PREVIEW_LEVEL = 0.4;

/** 프레임 f에서 촬영 소리 크기 (0~1, 크기 맞춘 촬영 소리 대비) */
export function clipSoundGain(f: number, intervals: [number, number][]): number {
  return CLIP_SOUND_GAIN_GAP - (CLIP_SOUND_GAIN_GAP - CLIP_SOUND_GAIN_SPEECH) * duckAmount(f, intervals);
}

/** 같은 규칙을 ffmpeg volume 식으로 (t = 영상 전체 기준 초) */
export function clipSoundVolumeExpr(intervals: [number, number][], fps = FPS): string {
  return `${CLIP_SOUND_GAIN_GAP}-${(CLIP_SOUND_GAIN_GAP - CLIP_SOUND_GAIN_SPEECH).toFixed(2)}*${duckExpr(intervals, fps)}`;
}

/** 촬영 소리의 평균 크기(dBFS) → 맞출 크기(dB). 모르면 0 */
export function clipLevelDb(meanDb: number | undefined): number {
  if (meanDb === undefined || !Number.isFinite(meanDb) || meanDb <= -90) return 0;
  return Math.round(Math.min(MAX_BOOST_DB, Math.max(MAX_CUT_DB, CLIP_SOUND_TARGET_DB - meanDb)) * 10) / 10;
}

export interface ClipSoundInput {
  /** 영상 파일 (서버 디스크 경로) */
  file: string;
  /** 영상 전체 기준 시작(초)과 길이(초) */
  start: number;
  duration: number;
  /** 크기 맞춤 (clipLevelDb) */
  gainDb: number;
}

/** 소리를 깔 묶음: 촬영 소리를 켠 영상(휴대폰 촬영)만 */
export function soundLayers(layers: ClipLayer[]): ClipLayer[] {
  return layers.filter((l) => l.media.kind === 'video' && l.media.sound);
}

/**
 * ffmpeg filter_complex: 입력 0 = 완성 영상(목소리·효과음), 입력 1.. = 촬영 영상(-stream_loop -1로 반복).
 * 각 촬영 소리: 크기 맞춤 → 구간 길이로 자르기 → 시작 시각으로 밀기 → 대사 때 줄이기(앞뒤 짧은 페이드 포함) → 섞기.
 */
export function clipSoundFilter(inputs: ClipSoundInput[], volumeExpr: string): string {
  const parts = inputs.map((c, i) => {
    const d = Math.max(0.1, c.duration);
    const ms = Math.max(0, Math.round(c.start * 1000));
    // 앞뒤 페이드도 volume 식으로 (Remotion에 든 ffmpeg에는 afade가 없다)
    const fade = Math.min(EDGE_FADE, d / 4).toFixed(3);
    const a = (ms / 1000).toFixed(3);
    const b = (ms / 1000 + d).toFixed(3);
    const edges = `clip(min((t-${a})/${fade},(${b}-t)/${fade}),0,1)`;
    return `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${c.gainDb}dB,atrim=0:${d.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${ms}|${ms},volume='(${volumeExpr})*${edges}':eval=frame[c${i}]`;
  });
  const labels = inputs.map((_, i) => `[c${i}]`).join('');
  return `${parts.join(';')};[0:a]${labels}amix=inputs=${inputs.length + 1}:duration=first:normalize=0[a]`;
}
