import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, clipGroups, foodProfile, ingredientProps, type FoodProfile, type RecipeInput, type Scene } from '@mat-lab/recipe-core';
import { Captions, SAFE_BOTTOM } from '../components/Captions.tsx';
import { faceSafeCaptionBottom } from '../three/captionPlacement.ts';
import { SpeechAudio } from '../components/SpeechAudio.tsx';
import { sfxCues, sfxUrl } from '../sfx.ts';
import { signatureNote } from '../brandText.ts';
import { SceneCard } from '../components/SceneCard.tsx';
import { BrandBadge, DraftWatermark } from '../components/Stage.tsx';
import { ensureFonts } from '../fonts.ts';
import { COLORS, FONT_FAMILY } from '../theme.ts';
import { KitchenScene } from '../three/KitchenScene.tsx';
import { propPositions } from '../three/layout.ts';
import { projectToScreen, sceneAt, stageAt } from '../three/stage.ts';
import type { SceneTiming, VideoProps } from '../timeline.ts';

ensureFonts();

export function foodFor(recipe: RecipeInput, photoColor?: string): FoodProfile {
  const food = foodProfile(recipe);
  // 완성 사진이 있으면 사진의 대표 색을 익은 색으로 쓴다
  return photoColor ? { ...food, cookedColor: photoColor } : food;
}

/** 3D 주방 숏폼: 캐릭터가 직접 조리하고, 음식은 레시피로 만든 3D 모델로 보여준다. */
export const KitchenVideo: React.FC<VideoProps & { recipe: RecipeInput }> = ({ script, timings, reviewed, reviewer, cleanDraft, recipe, photoUrl, photoColor, sceneMedia = {} }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const food = useMemo(() => foodFor(recipe, photoColor), [recipe, photoColor]);
  const props = useMemo(() => ingredientProps(recipe), [recipe]);
  const state = stageAt(script, timings, frame, food.kind, props.length);
  // 비교 장면: 화면을 위(건너뛴 결과)·아래(노트대로 한 결과)로 나눈다 — 설명용 연출
  const compare = sceneAt(script, timings, frame)?.scene.visual === 'compare';
  const failState = compare ? stageAt(script, timings, frame, food.kind, props.length, 'compare-fail') : null;
  const byId = useMemo(() => new Map(timings.map((t) => [t.sceneId, t])), [timings]);
  const clips = useMemo(() => clipLayers(script, timings, sceneMedia), [script, timings, sceneMedia]);
  const sfx = useMemo(() => sfxCues(script), [script]);
  const clipNow = clips.some((c) => frame >= c.from && frame < c.from + c.duration);
  const captionBottom = state && !clipNow && !compare ? faceSafeCaptionBottom(state, width, height) : SAFE_BOTTOM;
  const half = Math.round(height / 2);

  return (
    <AbsoluteFill style={{ backgroundColor: '#FFF1DC' }}>
      {/* 색 보정: 대비·채도를 살짝 올려 영화 같은 느낌 */}
      <AbsoluteFill style={{ filter: 'contrast(1.07) saturate(1.1)' }}>
        {state && compare && failState ? (
          <>
            <div style={{ position: 'absolute', left: 0, top: 0, width, height: half, overflow: 'hidden' }}>
              <KitchenScene width={width} height={half} frame={frame} state={failState} food={food} props={[]} />
            </div>
            <div style={{ position: 'absolute', left: 0, top: half, width, height: height - half, overflow: 'hidden' }}>
              <KitchenScene width={width} height={height - half} frame={frame} state={state} food={food} props={[]} />
            </div>
          </>
        ) : (
          state && <KitchenScene width={width} height={height} frame={frame} state={state} food={food} props={props} />
        )}
      </AbsoluteFill>
      {/* 재료 이름표: 3D 소품 위에 붙는다 */}
      {state &&
        !compare &&
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
      {/* 생성 AI 클립: 묶음 첫 장면에 올리면 약 8초 묶음 전체를 덮는다 */}
      {clips.map((c) => (
        <Sequence key={c.key} from={c.from} durationInFrames={c.duration} name={`clip ${c.key}`}>
          <SceneClip media={c.media} />
        </Sequence>
      ))}
      <PostFx frame={frame} />
      {script.scenes.map((scene) => {
        const timing = byId.get(scene.id);
        if (!timing) return null;
        return (
          <Sequence key={scene.id} from={timing.from} durationInFrames={timing.durationInFrames} name={`${scene.id} ${scene.type}`}>
            <Overlay scene={scene} timing={timing} topic={script.title} reviewed={reviewed} reviewer={reviewer} cleanDraft={cleanDraft} photoUrl={photoUrl} captionBottom={captionBottom} />
            <SpeechAudio timing={timing} />
          </Sequence>
        );
      })}
      {/* 효과음: 코드로 합성한 소리 (훅·실패·공개·서명 순간만, 목소리보다 작게) */}
      {sfx.map((c) => {
        const t = byId.get(c.sceneId);
        if (!t) return null;
        return (
          <Sequence key={`sfx-${c.sceneId}`} from={t.from + c.offset} durationInFrames={30} name={`sfx ${c.name}`}>
            <Audio src={sfxUrl(c.name)} volume={0.32} />
          </Sequence>
        );
      })}
      <BrandBadge />
      {!reviewed && !cleanDraft && <DraftWatermark />}
    </AbsoluteFill>
  );
};

type Media = { url: string; kind: 'video' | 'image' };

/** 올린 클립이 덮을 구간: 묶음 첫 장면이면 묶음 전체, 아니면 그 장면만 */
function clipLayers(script: VideoProps['script'], timings: SceneTiming[], media: Record<string, Media>) {
  const t = new Map(timings.map((x) => [x.sceneId, x]));
  const layers: { key: string; from: number; duration: number; media: Media }[] = [];
  for (const group of clipGroups(script)) {
    group.forEach((id, k) => {
      const m = media[id];
      const start = t.get(id);
      if (!m || !start) return;
      // 묶음 안 다른 장면에 따로 올린 클립이 있으면 그 앞에서 멈춘다
      let endId = id;
      if (k === 0) for (const g of group.slice(1)) {
        if (media[g]) break;
        endId = g;
      }
      const end = t.get(endId)!;
      layers.push({ key: id, from: start.from, duration: end.from + end.durationInFrames - start.from, media: m });
    });
  }
  return layers;
}

/** 가장자리 어둡게(비네트) + 은은한 필름 질감 */
const PostFx: React.FC<{ frame: number }> = ({ frame }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 62% at 50% 52%, rgba(0,0,0,0) 58%, rgba(30,14,6,0.42) 100%)' }} />
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.08, mixBlendMode: 'overlay' }}>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 12} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  </AbsoluteFill>
);

/**
 * 생성 AI로 만든 장면 클립(또는 첫 프레임 이미지)을 3D 장면 대신 보여준다.
 * 클립 소리는 끈다: 목소리는 검수된 대사로 만든 스튜디오 음성을 쓴다.
 */
const SceneClip: React.FC<{ media: { url: string; kind: 'video' | 'image' } }> = ({ media }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (media.kind === 'video') {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <OffthreadVideo src={media.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
    );
  }
  // 이미지는 천천히 확대 (켄 번스 효과)
  const zoom = interpolate(frame, [0, Math.max(1, durationInFrames)], [1.0, 1.08]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <Img src={media.url} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
    </AbsoluteFill>
  );
};

/** 3D 화면을 가리지 않도록 카드를 작게, 위쪽에 띄운다 */
const Overlay: React.FC<{ scene: Scene; timing: SceneTiming; topic: string; reviewed: boolean; reviewer?: string; cleanDraft?: boolean; photoUrl?: string; captionBottom: number }> = ({
  scene,
  timing,
  topic,
  reviewed,
  reviewer,
  cleanDraft,
  photoUrl,
  captionBottom,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 결과 선공개 장면에 실제 완성 사진이 있으면 3D 모델 대신 사진을 크게 보여 준다 (실물 증거)
  const realResult = Boolean(photoUrl) && scene.visual === 'result';
  const showPhoto = photoUrl && !realResult && (scene.type === 'tip' || scene.type === 'outro');
  return (
    <AbsoluteFill>
      {realResult && <ResultPhoto url={photoUrl!} frame={frame} duration={timing.durationInFrames} />}
      {(scene.visual === 'fail' || scene.visual === 'fail-closeup') && <IllustrationTag />}
      {scene.visual === 'compare' ? (
        <CompareOverlay scene={scene} frame={frame} fps={fps} />
      ) : scene.visual === 'signature' ? (
        <SignatureCard frame={frame} fps={fps} reviewed={reviewed} reviewer={reviewer} cleanDraft={cleanDraft} />
      ) : scene.type === 'steps' ? (
        <StepTicker scene={scene} frame={frame} duration={timing.durationInFrames} />
      ) : scene.type === 'ingredients' ? (
        <TitleChip text={scene.cardTitle ?? '준비물'} frame={frame} fps={fps} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, transform: 'translateY(40px) scale(0.8)', transformOrigin: '50% 8%' }}>
          <SceneCard scene={scene} topic={topic} frame={frame} fps={fps} reviewed={reviewed} />
        </div>
      )}
      {showPhoto && <PhotoInset url={photoUrl} frame={frame} fps={fps} />}
      <Captions
        line={scene.line}
        frame={frame}
        speechFrames={Math.max(1, timing.speechFrames)}
        punch={scene.type === 'tip' || scene.type === 'mistake'}
        words={timing.words}
        voice={scene.type === 'tip' || scene.type === 'explain' ? 'researcher' : 'character'}
        bottomY={captionBottom}
      />
    </AbsoluteFill>
  );
};

/** 비교 화면 이름표: 위 = 건너뛴 결과, 아래 = 노트대로 한 결과. 실제 실험이 아님을 항상 표시한다. */
const CompareOverlay: React.FC<{ scene: Scene; frame: number; fps: number }> = ({ scene, frame, fps }) => {
  const [top, bottom] = [scene.cardItems?.[0] ?? '건너뛰면', scene.cardItems?.[1] ?? '노트대로 하면'];
  const p = spring({ frame, fps, config: { damping: 14 } });
  const tag = (text: string, y: number, bg: string, fg: string) => (
    <div style={{ position: 'absolute', left: 56, top: y, transform: `scale(${p})`, transformOrigin: 'left top', background: bg, color: fg, border: `5px solid ${COLORS.ink}`, borderRadius: 22, padding: '10px 30px', fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 58, boxShadow: `0 7px 0 ${COLORS.ink}` }}>
      {text}
    </div>
  );
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 957, height: 6, background: COLORS.ink }} />
      {tag(`✕ ${top}`, 340, COLORS.white, COLORS.red)}
      {tag(`○ ${bottom}`, 1000, COLORS.mint, COLORS.ink)}
      {scene.cardTitle && (
        <div style={{ position: 'absolute', left: 60, right: 60, top: 860, display: 'flex', justifyContent: 'center', opacity: p }}>
          <div style={{ background: COLORS.yellow, border: `5px solid ${COLORS.ink}`, borderRadius: 26, padding: '12px 30px', fontFamily: FONT_FAMILY, fontWeight: 850, fontSize: fitText(scene.cardTitle, 46, 20), color: COLORS.ink, textAlign: 'center', wordBreak: 'keep-all', boxShadow: `0 6px 0 ${COLORS.ink}` }}>
            {scene.cardTitle}
          </div>
        </div>
      )}
      <div style={{ position: 'absolute', right: 40, top: 880 - 110, background: 'rgba(43,35,33,0.82)', color: COLORS.white, borderRadius: 14, padding: '6px 18px', fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 30 }}>
        설명용 연출
      </div>
    </AbsoluteFill>
  );
};

const fitText = (text: string, base: number, comfortable: number) => (text.length <= comfortable ? base : Math.max(base * 0.6, base * Math.sqrt(comfortable / text.length)));

/**
 * 엔딩 서명 카드: 전문가 이름을 매번 길게 소개하지 않고, 끝에 한 번 또렷하게 남긴다.
 * '검토' 문구는 실제 승인된 대본으로 만든 영상에만 나온다.
 */
const SignatureCard: React.FC<{ frame: number; fps: number; reviewed: boolean; reviewer?: string; cleanDraft?: boolean }> = ({ frame, fps, reviewed, reviewer, cleanDraft }) => {
  const note = signatureNote(reviewed, reviewer, cleanDraft);
  const p = spring({ frame: frame - 4, fps, config: { damping: 13 } });
  return (
    <div style={{ position: 'absolute', left: 90, right: 90, top: 280, transform: `translateY(${interpolate(p, [0, 1], [60, 0])}px)`, opacity: p }}>
      <div style={{ background: COLORS.white, border: `6px solid ${COLORS.ink}`, borderRadius: 40, boxShadow: `0 12px 0 ${COLORS.ink}`, padding: '34px 40px', fontFamily: FONT_FAMILY, color: COLORS.ink, textAlign: 'center' }}>
        <div style={{ fontSize: 36, fontWeight: 700, opacity: 0.75 }}>
          {BRAND.researcherTitle} · {BRAND.researcherRole}
        </div>
        <div style={{ fontSize: 112, fontWeight: 950, letterSpacing: 6, margin: '6px 0 4px', fontStyle: 'italic' }}>{BRAND.researcher}</div>
        <div style={{ fontSize: 40, fontWeight: 800, color: COLORS.red }}>{BRAND.labName}</div>
        {note && <div style={{ marginTop: 18, fontSize: 30, fontWeight: 700, opacity: 0.8 }}>{note}</div>}
      </div>
    </div>
  );
};

const TitleChip: React.FC<{ text: string; frame: number; fps: number }> = ({ text, frame, fps }) => {
  const p = spring({ frame, fps, config: { damping: 14 } });
  return (
    <div style={{ position: 'absolute', top: 330, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: p, transform: `translateY(${interpolate(p, [0, 1], [-30, 0])}px)` }}>
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
    <div style={{ position: 'absolute', top: 330, left: 60, right: 60, fontFamily: FONT_FAMILY, color: COLORS.ink }}>
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

/** 3D 실패 장면은 실제 조리 결과가 아니므로 "설명용 연출"을 표시한다 */
const IllustrationTag: React.FC = () => (
  <div style={{ position: 'absolute', right: 40, top: 230, background: 'rgba(43,35,33,0.82)', color: COLORS.white, borderRadius: 14, padding: '6px 18px', fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 30 }}>설명용 연출</div>
);

const ResultPhoto: React.FC<{ url: string; frame: number; duration: number }> = ({ url, frame, duration }) => {
  const zoom = interpolate(frame, [0, Math.max(1, duration)], [1.06, 1.0]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
      <div style={{ position: 'absolute', right: 40, top: 860, background: 'rgba(43,35,33,0.82)', color: COLORS.white, borderRadius: 14, padding: '6px 18px', fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 30 }}>
        실제 완성 사진
      </div>
    </AbsoluteFill>
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
      {/* 세로 표지: 프로필 격자는 가운데 3:4(위아래 240px씩 잘림)만 보여서, 글씨는 모두 그 안(330~1600)에 둔다 */}
      <BrandBadge scale={square ? 0.8 : 1} top={square ? undefined : 330} />
      <div
        style={{
          position: 'absolute',
          left: 50,
          right: 50,
          top: square ? 170 : 440,
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
      {!square && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 1596,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontWeight: 850,
              fontSize: 38,
              color: COLORS.ink,
              background: COLORS.yellow,
              border: `5px solid ${COLORS.ink}`,
              borderRadius: 999,
              padding: '10px 30px',
              letterSpacing: -1,
            }}
          >
            🧪 {BRAND.series} · 레시피 {BRAND.researcherTitle} {BRAND.researcher}
          </div>
        </div>
      )}
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
    mood: 'golden',
  };
}
