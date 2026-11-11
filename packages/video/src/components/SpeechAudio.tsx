import React from 'react';
import { Audio } from 'remotion';
import { speechPlayback, speechVolume } from '../speechPlayback.ts';
import type { SceneTiming } from '../timeline.ts';

/** 장면 음성: 앞 무음은 건너뛰고, 시작·끝에 아주 짧은 페이드를 넣어 '틱' 소리를 막는다 (규칙은 speechPlayback.ts) */
export const SpeechAudio: React.FC<{ timing: SceneTiming }> = ({ timing }) => {
  if (!timing.audioUrl) return null;
  const p = speechPlayback(timing);
  return (
    <Audio
      src={timing.audioUrl}
      trimBefore={p.trimBefore || undefined}
      trimAfter={p.trimAfter}
      // 브라우저 미리보기에서 소리를 아직 받는 중이면 화면도 잠시 멈춘다 (소리가 늦게 시작해 장면 끝에서 잘리는 것 방지)
      pauseWhenBuffering
      volume={(f) => speechVolume(f, p.end)}
    />
  );
};
