import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, LETTER_FICTION, fictionStoryScenes, gagPlan, ingredientProps, type Scene } from '@mat-lab/recipe-core';
import { GagScene } from '../gags/GagScene.tsx';
import { Captions } from '../components/Captions.tsx';
import { faceSafeCaptionBottom } from '../three/captionPlacement.ts';
import { captionKeywords, type CaptionKeywords } from '../captionStyle.ts';
import { SpeechAudio } from '../components/SpeechAudio.tsx';
import { sfxCues, sfxUrl } from '../sfx.ts';
import { PAGE_TURN_VOLUME, pageTurnCues } from '../hostCues.ts';
import { musicGain, speechIntervals } from '../music.ts';
import { signatureNote } from '../brandText.ts';
import { SceneCard } from '../components/SceneCard.tsx';
import { BrandBadge, DraftWatermark } from '../components/Stage.tsx';
import { Narrator } from '../components/Narrator.tsx';
import { PREVIEW_LEVEL, clipSoundGain } from '../clipSound.ts';
import { badgeOpacity, clipLayers, clipPlayback, kenBurns, layerAt, openingCardVisible, photoLayers, type ClipLayer } from '../realFootage.ts';
import { ensureFonts } from '../fonts.ts';
import { CAPTION_SAFE_BOTTOM, COLORS, FONT_FAMILY } from '../theme.ts';
import { KitchenScene, foodFor } from '../three/KitchenScene.tsx';
import { propPositions } from '../three/layout.ts';
import { placeTransitionAt } from '../three/places.ts';
import { projectToScreen, sceneAt, stageAt } from '../three/stage.ts';
import { FPS, totalFrames, type SceneTiming, type VideoProps } from '../timeline.ts';
import { mouthAt } from '../lipSync.ts';

ensureFonts();


/** 3D 주방 숏폼: 캐릭터가 직접 조리하고, 음식은 레시피로 만든 3D 모델로 보여준다. */
export const KitchenVideo: React.FC<VideoProps> = ({ script, timings, reviewed, reviewer, cleanDraft, recipe, photoUrl, photoColor, sceneMedia = {}, musicSrc, liveClipSound }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const food = useMemo(() => foodFor(recipe, photoColor), [recipe, photoColor]);
  const props = useMemo(() => ingredientProps(recipe), [recipe]);
  const labels = useMemo(() => props.map((p) => p.label), [props]);
  const byId = useMemo(() => new Map(timings.map((t) => [t.sceneId, t])), [timings]);
  const clips = useMemo(() => clipLayers(script, timings, sceneMedia), [script, timings, sceneMedia]);
  const sfx = useMemo(() => sfxCues(script), [script]);
  // 사연 한 통: 꾸민 사연이면 진짜 정보가 나오기 전까지 '가상 사연' 표시 (카드가 가려져도 늘 보이게)
  const fiction = useMemo(() => fictionStoryScenes(script), [script]);
  const music = useMemo(() => ({ intervals: speechIntervals(timings), total: totalFrames(timings) }), [timings]);
  // 실제 완성 사진을 화면 가득: 첫 장면(훅)과 '완성 음식 먼저' 장면 (그 장면에 촬영 영상이 있으면 영상이 우선)
  const photos = useMemo(() => photoLayers(script, timings, photoUrl, clips), [script, timings, photoUrl, clips]);
  const now = sceneAt(script, timings, frame);
  // 농담 장면('진지한 엉뚱 가이드'): 2D 농담 그림이 화면 전체를 덮는다. 실제 촬영 영상·사진보다도 위 (농담이 그림으로 보여야 웃긴다)
  const gags = useMemo(() => gagPlan(script.scenes), [script]);
  const gagNow = now && now.scene.type === 'gag' ? (gags[script.scenes.indexOf(now.scene)] ?? null) : null;
  const real = gagNow ? null : (layerAt(clips, frame) ?? layerAt(photos, frame));
  // 실제 촬영 영상·사진으로 시작하는 장면 (3D 맛조수가 가려진다): 고글 동작은 그다음 노트 장면에서, 첫 장면이면 노트 카드도 띄우지 않는다
  const realScenes = useMemo(() => new Set(timings.filter((t) => layerAt(clips, t.from) ?? layerAt(photos, t.from)).map((t) => t.sceneId)), [timings, clips, photos]);
  // 맛조수 고정 소리: 연구자 노트 카드가 뜰 때마다 노트 넘기는 소리 (hostCues.ts)
  const pages = useMemo(() => pageTurnCues(script, realScenes), [script, realScenes]);
  const state = stageAt(script, timings, frame, food.kind, labels, 'main', { realScenes });
  // 비교 장면: 화면을 위(건너뛴 결과)·아래(노트대로 한 결과)로 나눈다 — 설명용 연출
  const compare = sceneAt(script, timings, frame)?.scene.visual === 'compare';
  const failState = compare ? stageAt(script, timings, frame, food.kind, labels, 'compare-fail') : null;
  const keywords = useMemo(() => captionKeywords(recipe), [recipe]);
  const captionBottom = state && !real && !compare && !gagNow ? faceSafeCaptionBottom(state, width, height) : CAPTION_SAFE_BOTTOM;
  // 첫 화면에는 로고를 두지 않는다: 브랜드 배지는 첫 장면이 끝난 뒤 나타난다
  const openingEnd = timings[0] ? timings[0].from + timings[0].durationInFrames : 0;
  // 장소가 바뀌는 장면 경계: 화면을 옆으로 휙 넘기며(가로 흐림) 바꾼다 — 끊김이 아니라 일부러 넘긴 것처럼
  const whip = placeTransitionAt(script, timings, frame);
  // 나가는 화면은 왼쪽으로 밀려나고 들어오는 화면은 오른쪽에서 들어온다. 살짝 키워서 가장자리가 비지 않게
  const whipTransform = whip.amount > 0 ? `translateX(${whip.side * whip.amount * 12}%) scale(${1 + whip.amount * 0.28})` : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: '#FFF1DC' }}>
      {whip.amount > 0 && <WhipFilter amount={whip.amount} />}
      {/* 색 보정: 대비·채도를 살짝 올려 영화 같은 느낌 */}
      <AbsoluteFill
        style={{
          filter: `contrast(1.07) saturate(1.1)${whip.amount > 0 ? ' url(#whip-blur)' : ''}`,
          transform: whipTransform,
        }}
      >
        {/* 캔버스는 언제나 이 자리에 하나만: 비교 장면은 같은 캔버스 위쪽 절반에 '건너뛴 쪽'을 그린다 */}
        {/* 농담 장면 동안은 3D를 그리지 않는다 (그림이 덮으므로 렌더 시간만 든다). 캔버스는 지우지 않고 남겨 둔다 */}
        {state && <KitchenScene width={width} height={height} frame={frame} state={state} food={food} props={compare ? [] : props} split={failState} skip={Boolean(gagNow)} />}
      </AbsoluteFill>
      {/* 재료 이름표: 3D 소품 위에 붙는다 (장소를 넘길 때는 3D 화면과 함께 밀린다) */}
      <AbsoluteFill style={{ transform: whipTransform }}>
        {state &&
          !compare &&
          !real &&
          !gagNow &&
          props.map((p, i) => {
            const pop = state.propPop[i] ?? 0;
            if (pop < 0.3) return null;
            const pos = propPositions(props.length)[i]!;
            const s = projectToScreen([pos[0], pos[1] + 0.2, pos[2]], state.camera, width, height);
            if (!s.visible) return null;
            // 화면 가장자리 소품의 이름표가 잘리지 않게 안쪽으로 당긴다 (글자 34px + 여백으로 어림한 폭의 절반)
            const half = (p.label.length * 34 + 40) / 2;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: Math.min(width - 16 - half, Math.max(16 + half, s.x)),
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
      </AbsoluteFill>
      {/* 실제 촬영 영상(또는 생성 AI 클립): 묶음 첫 장면에 올리면 약 8초 묶음 전체를 화면 가득 덮는다 */}
      {clips.map((c) => (
        <Sequence key={c.key} from={c.from} durationInFrames={c.duration} name={`clip ${c.key}`}>
          <SceneClip layer={c} speech={music.intervals} live={Boolean(liveClipSound)} />
        </Sequence>
      ))}
      {photos.map((p) => (
        <Sequence key={`photo-${p.sceneId}`} from={p.from} durationInFrames={p.duration} name={`photo ${p.sceneId}`}>
          <ResultPhoto url={photoUrl!} />
        </Sequence>
      ))}
      {gagNow && now && (
        <AbsoluteFill style={{ filter: `contrast(1.04)${whip.amount > 0 ? ' url(#whip-blur)' : ''}`, transform: whipTransform }}>
          <GagScene
            gag={gagNow}
            frame={now.local}
            duration={now.timing.durationInFrames}
            food={food}
            emotion={now.scene.emotion}
            talking={now.local < now.timing.speechFrames}
            mouth={mouthAt(now.timing.mouth, now.local)}
          />
        </AbsoluteFill>
      )}
      {whip.amount > 0 && <AbsoluteFill style={{ backgroundColor: '#FFF6E8', opacity: whip.amount * 0.32, pointerEvents: 'none' }} />}
      <PostFx frame={frame} />
      {script.scenes.map((scene, sceneIndex) => {
        const timing = byId.get(scene.id);
        if (!timing) return null;
        return (
          <Sequence key={scene.id} from={timing.from} durationInFrames={timing.durationInFrames} name={`${scene.id} ${scene.type}`}>
            <Overlay
              scene={scene}
              timing={timing}
              topic={script.title}
              reviewed={reviewed}
              reviewer={reviewer}
              cleanDraft={cleanDraft}
              photoUrl={photoUrl}
              captionBottom={captionBottom}
              keywords={keywords}
              realMedia={realScenes.has(scene.id)}
              opening={timing.from === 0}
              fiction={fiction.includes(sceneIndex)}
            />
            <SpeechAudio timing={timing} />
          </Sequence>
        );
      })}
      {/* 효과음: 실제 녹음 CC0 (훅·실패·공개·서명 순간만, 목소리보다 작게) */}
      {sfx.map((c) => {
        const t = byId.get(c.sceneId);
        if (!t) return null;
        return (
          <Sequence key={`sfx-${c.sceneId}`} from={t.from + c.offset} durationInFrames={30} name={`sfx ${c.name}`}>
            <Audio src={sfxUrl(c.name)} volume={0.32} />
          </Sequence>
        );
      })}
      {/* 노트 넘기는 소리: 장면 직전 쉼에서 사각, 노트 카드가 나타날 때 '탁' (목소리보다 약 13dB 작게) */}
      {pages.map((c) => {
        const t = byId.get(c.sceneId);
        if (!t) return null;
        return (
          <Sequence key={`page-${c.sceneId}`} from={Math.max(0, t.from + c.offset)} durationInFrames={20} name="sfx page">
            <Audio src={sfxUrl('page')} volume={PAGE_TURN_VOLUME} />
          </Sequence>
        );
      })}
      {/* 배경 음악 (미리보기에서만: 서버 렌더는 품질 검사 뒤에 ffmpeg로 같은 규칙대로 섞는다, music.ts) */}
      {musicSrc && <Audio src={musicSrc} loop volume={(f) => musicGain(f, music.intervals, music.total)} />}
      {/* 실제 영상·사진 위에서는 맛조수가 왼쪽 아래 작은 원에서 말한다 (자막·카드를 가리지 않는 자리) */}
      {real && now && (
        <Narrator
          emotion={now.scene.emotion}
          frame={frame}
          talking={now.local < now.timing.speechFrames}
          mouth={mouthAt(now.timing.mouth, now.local)}
          enter={real.from === 0 ? 1 : spring({ frame: frame - real.from, fps: FPS, config: { damping: 13 } })}
        />
      )}
      <div style={{ opacity: badgeOpacity(frame, openingEnd) }}>
        <BrandBadge />
      </div>
      {!reviewed && !cleanDraft && <DraftWatermark />}
    </AbsoluteFill>
  );
};

/** 장소 넘김용 가로 흐림 필터 (SVG). 넘기는 몇 프레임에만 붙는다 */
const WhipFilter: React.FC<{ amount: number }> = ({ amount }) => (
  <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
    <filter id="whip-blur" x="-10%" y="0" width="120%" height="100%">
      <feGaussianBlur stdDeviation={`${Math.round(amount * 46)} 0`} />
    </filter>
  </svg>
);

/** 가장자리 어둡게(비네트) + 은은한 필름 질감 */
const PostFx: React.FC<{ frame: number }> = ({ frame }) => {
  const [x, y] = GRAIN_OFFSETS[frame % GRAIN_OFFSETS.length]!;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 62% at 50% 52%, rgba(0,0,0,0) 58%, rgba(30,14,6,0.42) 100%)' }} />
      <AbsoluteFill style={{ opacity: 0.08, mixBlendMode: 'overlay', backgroundImage: `url("${GRAIN_URL}")`, backgroundPosition: `${x}px ${y}px` }} />
    </AbsoluteFill>
  );
};

/**
 * 필름 질감: 예전에는 화면 전체(1080×1920)에 잡음 필터를 프레임마다 새로 계산했다(휴대폰 미리보기·렌더가 느려짐).
 * 같은 잡음(이음새 없는 256px 타일)을 한 번만 그려 깔고, 프레임마다 위치만 바꿔 12가지 무늬가 돌게 한다.
 */
const GRAIN_TILE = 256;
const GRAIN_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${GRAIN_TILE}" height="${GRAIN_TILE}"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>`,
)}`;
const GRAIN_OFFSETS = Array.from({ length: 12 }, (_, i) => [(i * 97) % GRAIN_TILE, (i * 151) % GRAIN_TILE] as const);

/**
 * 실제 촬영 영상·사진(또는 생성 AI 클립)이 화면을 꽉 채운다 (가운데 맞춰 자르기 + 천천히 다가가는 확대).
 * 휴대폰 촬영 소리는 목소리 밑에 작게 깐다: 미리보기는 여기서 바로(live), 서버 렌더는 품질 검사 뒤 ffmpeg로 섞는다 (clipSound.ts).
 * 생성 AI 클립은 대사가 섞여 있을 수 있어 소리를 끈다 (sound 없음).
 */
const SceneClip: React.FC<{ layer: ClipLayer; speech: [number, number][]; live: boolean }> = ({ layer, speech, live }) => {
  const frame = useCurrentFrame();
  const { media, duration } = layer;
  const zoom = kenBurns(frame, duration, media.kind);
  const fill: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` };
  if (media.kind === 'image') {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
        <Img src={media.url} style={fill} />
        <CaptionShade />
      </AbsoluteFill>
    );
  }
  const { playbackRate, loopFrames } = clipPlayback(media.seconds, duration);
  const withSound = live && Boolean(media.sound);
  const video = (
    <OffthreadVideo
      src={media.url}
      muted={!withSound}
      volume={withSound ? clipSoundGain(layer.from + frame, speech) * PREVIEW_LEVEL : 0}
      playbackRate={playbackRate}
      style={fill}
    />
  );
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      {loopFrames ? <Loop durationInFrames={loopFrames}>{video}</Loop> : video}
      <CaptionShade />
    </AbsoluteFill>
  );
};

/** 실제 영상 위 자막이 어떤 배경에서도 읽히게 아래쪽을 살짝 어둡게 */
const CaptionShade: React.FC = () => (
  <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.32) 78%, rgba(0,0,0,0.12) 100%)', pointerEvents: 'none' }} />
);

/** 3D 화면을 가리지 않도록 카드를 작게, 위쪽에 띄운다 */
const Overlay: React.FC<{
  scene: Scene;
  timing: SceneTiming;
  topic: string;
  reviewed: boolean;
  reviewer?: string;
  cleanDraft?: boolean;
  photoUrl?: string;
  captionBottom: number;
  keywords: CaptionKeywords;
  /** 이 장면이 실제 촬영 영상·완성 사진으로 시작하는지 */
  realMedia: boolean;
  /** 영상 첫 장면(훅) */
  opening: boolean;
  /** '가상 사연' 표시를 붙일 장면 */
  fiction?: boolean;
}> = ({
  scene,
  timing,
  topic,
  reviewed,
  reviewer,
  cleanDraft,
  photoUrl,
  captionBottom,
  keywords,
  realMedia,
  opening,
  fiction,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 실제 완성 사진(화면 가득)은 KitchenVideo의 photoLayers가 그린다. 팁·마무리 장면은 3D 위에 작은 사진 카드로
  const showPhoto = photoUrl && !realMedia && scene.visual !== 'result' && (scene.type === 'tip' || scene.type === 'outro');
  // 첫 장면: 자막과 같은 문장을 위 카드에 또 띄우지 않는다. 실제 사진·영상으로 시작하면 음식과 큰 자막만
  const card = !opening || openingCardVisible(scene, topic, realMedia);
  return (
    <AbsoluteFill>
      {/* 3D 실패 장면 표시. 실제 사진·영상이 덮으면 그건 연출이 아니므로 붙이지 않는다 ('실제 완성 사진' 표시가 대신 나온다) */}
      {(scene.visual === 'fail' || scene.visual === 'fail-closeup') && !realMedia && scene.type !== 'gag' && <IllustrationTag />}
      {fiction && <FictionTag below={(scene.visual === 'fail' || scene.visual === 'fail-closeup') && !realMedia} />}
      {/* 농담 장면: 그림이 화면을 채우고 '농담' 표시만. 연구자 카드(노트·팁)는 붙이지 않는다 */}
      {scene.type === 'gag' ? (
        <JokeTag />
      ) : scene.visual === 'compare' ? (
        <CompareOverlay scene={scene} frame={frame} fps={fps} />
      ) : scene.visual === 'signature' ? (
        <SignatureCard frame={frame} fps={fps} reviewed={reviewed} reviewer={reviewer} cleanDraft={cleanDraft} />
      ) : scene.type === 'steps' ? (
        <StepTicker scene={scene} frame={frame} duration={timing.durationInFrames} />
      ) : scene.type === 'ingredients' ? (
        <TitleChip text={scene.cardTitle ?? '준비물'} frame={frame} fps={fps} />
      ) : card ? (
        <div style={{ position: 'absolute', inset: 0, transform: 'translateY(40px) scale(0.8)', transformOrigin: '50% 8%' }}>
          <SceneCard scene={scene} topic={topic} frame={frame} fps={fps} reviewed={reviewed} reviewer={reviewer} />
        </div>
      ) : null}
      {showPhoto && <PhotoInset url={photoUrl} frame={frame} fps={fps} />}
      <Captions
        line={scene.line}
        frame={frame}
        speechFrames={Math.max(1, timing.speechFrames)}
        punch={scene.type === 'tip' || scene.type === 'mistake'}
        hook={scene.hook}
        keywords={keywords}
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
/** 농담 장면 표시: 엉뚱한 단계가 연구자 조언으로 보이지 않게 ('설명용 연출'과 같은 자리·모양) */
const JokeTag: React.FC = () => (
  <div style={{ position: 'absolute', right: 40, top: 230, background: 'rgba(43,35,33,0.82)', color: COLORS.white, borderRadius: 14, padding: '6px 18px', fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 30 }}>농담</div>
);

/** 꾸민 사연 표시: 지어낸 이야기가 실제 받은 사연처럼 보이지 않게 ('농담'·'설명용 연출'과 같은 모양) */
const FictionTag: React.FC<{ below?: boolean }> = ({ below }) => (
  <div style={{ position: 'absolute', right: 40, top: below ? 290 : 230, background: 'rgba(43,35,33,0.82)', color: COLORS.white, borderRadius: 14, padding: '6px 18px', fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 30 }}>
    {LETTER_FICTION}
  </div>
);

const IllustrationTag: React.FC = () => (
  <div style={{ position: 'absolute', right: 40, top: 230, background: 'rgba(43,35,33,0.82)', color: COLORS.white, borderRadius: 14, padding: '6px 18px', fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 30 }}>설명용 연출</div>
);

/** 실제 완성 사진을 화면 가득 (천천히 다가가는 확대). 첫 프레임부터 바로 보인다 */
const ResultPhoto: React.FC<{ url: string }> = ({ url }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const zoom = kenBurns(frame, durationInFrames, 'image');
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
      <CaptionShade />
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
