import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Scene } from '@mat-lab/recipe-core';
import { Character } from '../components/Character.tsx';
import { Captions } from '../components/Captions.tsx';
import { SpeechAudio } from '../components/SpeechAudio.tsx';
import { SceneCard } from '../components/SceneCard.tsx';
import { BrandBadge, DraftWatermark, LabBackground } from '../components/Stage.tsx';
import { ensureFonts } from '../fonts.ts';
import type { SceneTiming, VideoProps } from '../timeline.ts';
import { KitchenVideo } from './KitchenVideo.tsx';

ensureFonts();

/** 세로형 숏폼(1080×1920). 레시피가 있으면 3D 주방, 없거나 look='2d'면 2D 카드형으로 만든다. */
export const ShortVideo: React.FC<VideoProps> = (props) =>
  props.recipe && props.look !== '2d' ? <KitchenVideo {...props} recipe={props.recipe} /> : <CardVideo {...props} />;

/** 2D 카드형: 장면 데이터를 받아 캐릭터·카드·자막·음성을 조립한다. */
export const CardVideo: React.FC<VideoProps> = ({ script, timings, reviewed, reviewer, cleanDraft }) => {
  const byId = useMemo(() => new Map(timings.map((t) => [t.sceneId, t])), [timings]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#FFF4E2' }}>
      <LabBackground />
      {script.scenes.map((scene) => {
        const timing = byId.get(scene.id);
        if (!timing) return null;
        return (
          <Sequence key={scene.id} from={timing.from} durationInFrames={timing.durationInFrames} name={`${scene.id} ${scene.type}`}>
            <SceneLayer scene={scene} timing={timing} topic={script.title} reviewed={reviewed} reviewer={reviewer} />
            <SpeechAudio timing={timing} />
          </Sequence>
        );
      })}
      <BrandBadge />
      {!reviewed && !cleanDraft && <DraftWatermark />}
    </AbsoluteFill>
  );
};

const SceneLayer: React.FC<{ scene: Scene; timing: SceneTiming; topic: string; reviewed: boolean; reviewer?: string }> = ({ scene, timing, topic, reviewed, reviewer }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const talking = frame < timing.speechFrames;
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 160 } });
  const hasBigCard = scene.type === 'ingredients' || scene.type === 'steps';
  // 카드가 큰 장면에서는 캐릭터를 옆으로 비켜 세운다
  const x = hasBigCard ? 300 : 540;
  const size = hasBigCard ? 400 : 540;
  return (
    <AbsoluteFill>
      <SceneCard scene={scene} topic={topic} frame={frame} fps={fps} reviewed={reviewed} reviewer={reviewer} />
      <div
        style={{
          position: 'absolute',
          left: x - size / 2,
          top: 1490 - size * 1.15,
          transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})`,
          transformOrigin: 'bottom center',
        }}
      >
        <Character emotion={scene.emotion} frame={frame} talking={talking} size={size} />
      </div>
      <Captions line={scene.line} frame={frame} speechFrames={Math.max(1, timing.speechFrames)} punch={scene.type === 'tip'} words={timing.words} voice={scene.type === 'tip' || scene.type === 'explain' ? 'researcher' : 'character'} />
    </AbsoluteFill>
  );
};
