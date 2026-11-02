import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { foodProfile, ingredientProps, type FoodProfile, type RecipeInput, type Scene } from '@mat-lab/recipe-core';
import { Captions } from '../components/Captions.tsx';
import { SceneCard } from '../components/SceneCard.tsx';
import { BrandBadge, DraftWatermark } from '../components/Stage.tsx';
import { ensureFonts } from '../fonts.ts';
import { COLORS, FONT_FAMILY } from '../theme.ts';
import { KitchenScene } from '../three/KitchenScene.tsx';
import { propPositions } from '../three/layout.ts';
import { projectToScreen, stageAt } from '../three/stage.ts';
import type { SceneTiming, VideoProps } from '../timeline.ts';

ensureFonts();

export function foodFor(recipe: RecipeInput, photoColor?: string): FoodProfile {
  const food = foodProfile(recipe);
  // 완성 사진이 있으면 사진의 대표 색을 익은 색으로 쓴다
  return photoColor ? { ...food, cookedColor: photoColor } : food;
}

/** 3D 주방 숏폼: 캐릭터가 직접 조리하고, 음식은 레시피로 만든 3D 모델로 보여준다. */
export const KitchenVideo: React.FC<VideoProps & { recipe: RecipeInput }> = ({ script, timings, reviewed, recipe, photoUrl, photoColor }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const food = useMemo(() => foodFor(recipe, photoColor), [recipe, photoColor]);
  const props = useMemo(() => ingredientProps(recipe), [recipe]);
  const state = stageAt(script, timings, frame, food.kind, props.length);
  const byId = useMemo(() => new Map(timings.map((t) => [t.sceneId, t])), [timings]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#FFF1DC' }}>
      {state && <KitchenScene width={width} height={height} frame={frame} state={state} food={food} props={props} />}
      {/* 재료 이름표: 3D 소품 위에 붙는다 */}
      {state &&
        props.map((p, i) => {
          const pop = state.propPop[i] ?? 0;
          if (pop < 0.3) return null;
          const pos = propPositions(props.length)[i]!;
          const s = projectToScreen([pos[0], pos[1] + 0.2, pos[2]], state.camera, width, height);
          if (!s.visible) return null;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: s.x,
                top: s.y - (i % 2) * 64,
                transform: `translate(-50%, -100%) scale(${Math.min(1, pop)})`,
                background: COLORS.white,
                border: `4px solid ${COLORS.ink}`,
                borderRadius: 18,
                padding: '6px 16px',
                fontFamily: FONT_FAMILY,
                fontWeight: 800,
                fontSize: 34,
                whiteSpace: 'nowrap',
                color: COLORS.ink,
                boxShadow: `0 5px 0 ${COLORS.ink}`,
              }}
            >
              {p.label}
            </div>
          );
        })}
      {script.scenes.map((scene) => {
        const timing = byId.get(scene.id);
        if (!timing) return null;
        return (
          <Sequence key={scene.id} from={timing.from} durationInFrames={timing.durationInFrames} name={`${scene.id} ${scene.type}`}>
            <Overlay scene={scene} timing={timing} topic={script.title} reviewed={reviewed} photoUrl={photoUrl} />
            {timing.audioUrl ? <Audio src={timing.audioUrl} /> : null}
          </Sequence>
        );
      })}
      <BrandBadge />
      {!reviewed && <DraftWatermark />}
    </AbsoluteFill>
  );
};

/** 3D 화면을 가리지 않도록 카드를 작게, 위쪽에 띄운다 */
const Overlay: React.FC<{ scene: Scene; timing: SceneTiming; topic: string; reviewed: boolean; photoUrl?: string }> = ({ scene, timing, topic, reviewed, photoUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const showPhoto = photoUrl && (scene.type === 'tip' || scene.type === 'outro');
  return (
    <AbsoluteFill>
      {scene.type === 'steps' ? (
        <StepTicker scene={scene} frame={frame} duration={timing.durationInFrames} />
      ) : scene.type === 'ingredients' ? (
        <TitleChip text={scene.cardTitle ?? '준비물'} frame={frame} fps={fps} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, transform: 'scale(0.8)', transformOrigin: '50% 8%' }}>
          <SceneCard scene={scene} topic={topic} frame={frame} fps={fps} reviewed={reviewed} />
        </div>
      )}
      {showPhoto && <PhotoInset url={photoUrl} frame={frame} fps={fps} />}
      <Captions line={scene.line} frame={frame} speechFrames={Math.max(1, timing.speechFrames)} />
    </AbsoluteFill>
  );
};

const TitleChip: React.FC<{ text: string; frame: number; fps: number }> = ({ text, frame, fps }) => {
  const p = spring({ frame, fps, config: { damping: 14 } });
  return (
    <div style={{ position: 'absolute', top: 250, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: p, transform: `translateY(${interpolate(p, [0, 1], [-30, 0])}px)` }}>
      <div style={{ background: COLORS.mint, border: `5px solid ${COLORS.ink}`, borderRadius: 999, padding: '14px 44px', fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 56, color: COLORS.ink, boxShadow: `0 8px 0 ${COLORS.ink}` }}>
        {text}
      </div>
    </div>
  );
};

/** 조리 장면: 3D로 조리하는 동안 지금 단계만 크게 보여준다 */
const StepTicker: React.FC<{ scene: Scene; frame: number; duration: number }> = ({ scene, frame, duration }) => {
  const items = scene.cardItems ?? [];
  if (items.length === 0) return null;
  const per = duration / items.length;
  const i = Math.min(items.length - 1, Math.floor(frame / per));
  const local = frame - i * per;
  const enter = interpolate(local, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', top: 240, left: 60, right: 60, fontFamily: FONT_FAMILY, color: COLORS.ink }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {items.map((_, k) => (
          <div key={k} style={{ flex: 1, height: 12, borderRadius: 99, background: k <= i ? COLORS.red : 'rgba(43,35,33,0.18)' }} />
        ))}
      </div>
      <div
        style={{
          background: COLORS.white,
          border: `6px solid ${COLORS.ink}`,
          borderRadius: 36,
          boxShadow: `0 10px 0 ${COLORS.ink}`,
          padding: '28px 36px',
          display: 'flex',
          gap: 24,
          alignItems: 'center',
          opacity: enter,
          transform: `translateY(${(1 - enter) * 30}px)`,
          wordBreak: 'keep-all',
        }}
      >
        <div style={{ flex: 'none', width: 92, height: 92, borderRadius: 99, background: COLORS.red, color: COLORS.white, border: `5px solid ${COLORS.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 50, fontWeight: 950 }}>
          {i + 1}
        </div>
        <div style={{ fontSize: items[i]!.length > 26 ? 46 : 54, fontWeight: 800, lineHeight: 1.3, letterSpacing: -1.5 }}>{items[i]}</div>
      </div>
    </div>
  );
};

const PhotoInset: React.FC<{ url: string; frame: number; fps: number }> = ({ url, frame, fps }) => {
  const p = spring({ frame: frame - 10, fps, config: { damping: 13 } });
  return (
    <div style={{ position: 'absolute', right: 56, top: 760, transform: `scale(${p}) rotate(4deg)`, transformOrigin: 'top right' }}>
      <div style={{ background: COLORS.white, padding: 14, paddingBottom: 54, border: `5px solid ${COLORS.ink}`, borderRadius: 18, boxShadow: `0 8px 0 ${COLORS.ink}` }}>
        <Img src={url} style={{ width: 300, height: 300, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 10, textAlign: 'center', fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: 30, color: COLORS.ink }}>완성 사진</div>
      </div>
    </div>
  );
};

/** 3D 커버·썸네일: 완성 접시를 든 맛조수 + 제목 */
export const KitchenCover: React.FC<{ title: string; recipe: RecipeInput; photoColor?: string; emotion: Scene['emotion'] }> = ({ title, recipe, photoColor, emotion }) => {
  const { width, height } = useVideoConfig();
  const food = useMemo(() => foodFor(recipe, photoColor), [recipe, photoColor]);
  const square = width === height;
  const state = coverState(emotion, square);
  return (
    <AbsoluteFill style={{ backgroundColor: '#FFF1DC' }}>
      <KitchenScene width={width} height={height} frame={0} state={state} food={food} props={[]} />
      <BrandBadge scale={square ? 0.8 : 1} />
      <div
        style={{
          position: 'absolute',
          left: 50,
          right: 50,
          top: square ? 170 : 300,
          textAlign: 'center',
          fontFamily: FONT_FAMILY,
          fontWeight: 950,
          fontSize: square ? 76 : 104,
          lineHeight: 1.18,
          letterSpacing: -3,
          color: COLORS.ink,
          wordBreak: 'keep-all',
          textShadow: `0 0 18px ${COLORS.white}, 0 6px 0 ${COLORS.white}`,
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};

function coverState(emotion: Scene['emotion'], square: boolean): import('../three/KitchenScene.tsx').StageState {
  const face: [number, number, number] = [-0.62, 0.84, -0.5];
  return {
    camera: square
      ? { pos: [face[0] + 0.3, face[1] + 0.3, face[2] + 1.8], target: [face[0] + 0.05, face[1] + 0.12, face[2]], fov: 46 }
      : { pos: [face[0] + 0.3, face[1] + 0.25, face[2] + 2.2], target: [face[0] + 0.05, face[1] + 0.2, face[2]], fov: 46 },
    emotion,
    talking: false,
    action: 'present',
    face: 'camera',
    burnerOn: false,
    showFoodInVessel: false,
    cook: 1,
    flip: 0,
    plated: 'done',
    propPop: [],
    chefPop: 1,
  };
}
