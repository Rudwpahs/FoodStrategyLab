import type { Script } from '@mat-lab/recipe-core';
import { estimateSceneSeconds } from '@mat-lab/recipe-core';

export const FPS = 30;
const PAD_SECONDS = 0.45;
const MIN_SCENE_SECONDS = 1.8;
const MIN_INTRO_SECONDS = 2.4;
const OUTRO_EXTRA_SECONDS = 1.6;
/** 화면 카드를 읽는 데 필요한 최소 시간 (초당 약 16자, 최대 5초) */
const READ_CHARS_PER_SECOND = 16;
const MAX_READ_SECONDS = 5;

export function readingSeconds(scene: Pick<Script['scenes'][number], 'type' | 'cardItems'>): number {
  if (scene.type !== 'ingredients' && scene.type !== 'steps') return 0;
  const chars = (scene.cardItems ?? []).join('').replace(/\s/g, '').length;
  return Math.min(MAX_READ_SECONDS, 1 + chars / READ_CHARS_PER_SECOND);
}

export interface SceneTiming {
  sceneId: string;
  from: number;
  durationInFrames: number;
  /** 대사가 나오는 구간 (입 모양·자막용) */
  speechFrames: number;
  audioUrl?: string;
}

export interface VideoProps {
  script: Script;
  timings: SceneTiming[];
  /** 연구자 승인 여부. false면 '검수 전 미리보기' 워터마크를 표시한다. */
  reviewed: boolean;
  [key: string]: unknown;
}

/**
 * 장면별 음성 길이(초)로 타임라인을 만든다.
 * 음성이 없으면(null) 글자 수로 길이를 추정한다.
 */
export function buildTimeline(script: Script, speechSeconds: (number | null)[], audioUrls: (string | undefined)[] = [], fps = FPS): SceneTiming[] {
  let cursor = 0;
  return script.scenes.map((scene, i) => {
    const speech = speechSeconds[i] ?? estimateSceneSeconds(scene) - 0.5;
    let seconds = Math.max(speech + PAD_SECONDS, readingSeconds(scene), scene.type === 'intro' ? MIN_INTRO_SECONDS : MIN_SCENE_SECONDS);
    if (scene.type === 'outro') seconds += OUTRO_EXTRA_SECONDS;
    const durationInFrames = Math.ceil(seconds * fps);
    const timing: SceneTiming = {
      sceneId: scene.id,
      from: cursor,
      durationInFrames,
      speechFrames: Math.min(durationInFrames, Math.ceil(speech * fps)),
      audioUrl: audioUrls[i],
    };
    cursor += durationInFrames;
    return timing;
  });
}

export function totalFrames(timings: SceneTiming[]): number {
  const last = timings.at(-1);
  return last ? last.from + last.durationInFrames : 1;
}

export interface CaptionChunk {
  text: string;
  /** 장면 시작 기준 프레임 */
  from: number;
  to: number;
}

const MAX_CHUNK_CHARS = 22;

/**
 * 대사를 자막 단위로 나눈다.
 * 단어를 최대 글자 수까지 채우되, 문장이 끝나면(. ! ?) 적당한 길이에서 끊는다.
 */
export function splitCaption(line: string, max = MAX_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const word of line.trim().split(/\s+/).filter(Boolean)) {
    if (current && (current + ' ' + word).length > max) {
      chunks.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
    if (/[.!?…]$/.test(current) && current.length >= 5) {
      chunks.push(current);
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** 자막 조각을 글자 수 비율로 대사 구간에 배치한다. */
export function captionChunks(line: string, speechFrames: number): CaptionChunk[] {
  const texts = splitCaption(line);
  const weights = texts.map((t) => Math.max(1, t.replace(/\s/g, '').length));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return texts.map((text, i) => {
    const len = Math.round((weights[i]! / total) * speechFrames);
    const chunk = { text, from: cursor, to: i === texts.length - 1 ? speechFrames : cursor + len };
    cursor += len;
    return chunk;
  });
}
