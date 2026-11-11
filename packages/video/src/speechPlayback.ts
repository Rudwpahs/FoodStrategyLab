import type { SceneTiming } from './timeline.ts';

/**
 * 장면 음성을 어떻게 재생하는지 (SpeechAudio와 자동 품질 검사가 같은 규칙을 쓴다).
 * - 앞 무음은 건너뛴다 (trimBefore)
 * - 말소리 끝(end)을 가운데 두고 2프레임 동안 줄여 '틱' 소리를 막는다: end-1 프레임까지 1 → end+1 프레임에 0
 * - 그 뒤(end+2)에서 자른다
 * 프레임은 모두 장면 시작 기준.
 */
/** 아주 짧은 대사도 페이드가 들어갈 자리는 둔다 */
const MIN_END_FRAMES = 4;

export interface SpeechPlayback {
  trimBefore: number;
  trimAfter: number;
  /** 말소리 끝 (페이드 한가운데) */
  end: number;
  /** 페이드 시작·끝 프레임 */
  fadeStart: number;
  fadeEnd: number;
}

export function speechPlayback(timing: Pick<SceneTiming, 'speechFrames' | 'audioTrimFrames'>): SpeechPlayback {
  const end = Math.max(MIN_END_FRAMES, timing.speechFrames);
  const trim = timing.audioTrimFrames ?? 0;
  return { trimBefore: trim, trimAfter: trim + end + 2, end, fadeStart: end - 1, fadeEnd: end + 1 };
}

/** 음성 크기 (0~1): 0→1프레임에 커지고, end-1 → end+1에 줄어든다 */
export function speechVolume(frame: number, end: number): number {
  if (frame <= 0) return 0;
  if (frame < 1) return frame;
  if (frame <= end - 1) return 1;
  return Math.max(0, (end + 1 - frame) / 2);
}
