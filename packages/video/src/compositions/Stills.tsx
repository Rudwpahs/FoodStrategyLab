import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BRAND, EMOTIONS, EMOTION_LABELS, formatIngredient, type Emotion, type RecipeInput } from '@mat-lab/recipe-core';
import { Character } from '../components/Character.tsx';
import { fitSize } from '../components/SceneCard.tsx';
import { BrandBadge, LabBackground, LogoMark } from '../components/Stage.tsx';
import { ensureFonts } from '../fonts.ts';
import { KitchenCover } from './KitchenVideo.tsx';
import { COLORS, FONT_FAMILY } from '../theme.ts';

ensureFonts();

export interface CoverProps {
  title: string;
  emotion: Emotion;
  /** 있으면 3D 주방 커버로 만든다 */
  recipe?: RecipeInput;
  photoColor?: string;
  [key: string]: unknown;
}

/** 릴스·쇼츠 커버 (1080×1920) */
export const Cover: React.FC<CoverProps> = (props) =>
  props.recipe ? <KitchenCover title={props.title} recipe={props.recipe} photoColor={props.photoColor} emotion={props.emotion} /> : <FlatCover {...props} />;

/** 정사각 썸네일 (1080×1080) */
export const SquareThumb: React.FC<CoverProps> = (props) =>
  props.recipe ? <KitchenCover title={props.title} recipe={props.recipe} photoColor={props.photoColor} emotion={props.emotion} /> : <FlatSquare {...props} />;

const FlatCover: React.FC<CoverProps> = ({ title, emotion }) => (
  <AbsoluteFill>
    <LabBackground />
    <BrandBadge />
    <div
      style={{
        position: 'absolute',
        left: 60,
        right: 60,
        top: 330,
        fontFamily: FONT_FAMILY,
        fontWeight: 950,
        fontSize: fitSize(title, 112, 12, 70),
        lineHeight: 1.18,
        letterSpacing: -3,
        color: COLORS.ink,
        textAlign: 'center',
        wordBreak: 'keep-all',
        textShadow: `0 6px 0 ${COLORS.white}`,
      }}
    >
      {highlightQuestion(title)}
    </div>
    <div style={{ position: 'absolute', left: 540 - 300, top: 1490 - 600 * 1.15 }}>
      <Character emotion={emotion} frame={0} size={600} still />
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 1560, textAlign: 'center', fontFamily: FONT_FAMILY, color: COLORS.white, fontSize: 48, fontWeight: 800 }}>
      {BRAND.slogan}
    </div>
  </AbsoluteFill>
);

const FlatSquare: React.FC<CoverProps> = ({ title, emotion }) => (
  <AbsoluteFill style={{ background: COLORS.cream, fontFamily: FONT_FAMILY }}>
    <LabBackground counterTop={860} height={1080} />
    <BrandBadge scale={0.8} />
    <div
      style={{
        position: 'absolute',
        left: 60,
        width: 600,
        top: 240,
        fontWeight: 950,
        fontSize: fitSize(title, 88, 10, 56),
        lineHeight: 1.2,
        letterSpacing: -2.5,
        color: COLORS.ink,
        wordBreak: 'keep-all',
      }}
    >
      {highlightQuestion(title)}
    </div>
    <div style={{ position: 'absolute', right: 20, top: 870 - 420 * 1.15 }}>
      <Character emotion={emotion} frame={0} size={420} still />
    </div>
    <div style={{ position: 'absolute', left: 60, top: 930, color: COLORS.white, fontSize: 40, fontWeight: 800 }}>{BRAND.slogan}</div>
  </AbsoluteFill>
);

function highlightQuestion(title: string) {
  const m = title.match(/^(.*?)([^\s]+\?)$/);
  if (!m) return title;
  return (
    <>
      {m[1]}
      <span style={{ color: COLORS.red }}>{m[2]}</span>
    </>
  );
}

export interface RecipeCardProps {
  recipe: RecipeInput;
  reviewed: boolean;
  [key: string]: unknown;
}

/** 블로그·저장용 레시피 카드 (1080×1350). 원본 데이터만 사용한다. */
export const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, reviewed }) => {
  const steps = recipe.steps;
  const many = recipe.ingredients.length > 10;
  const ingSize = recipe.ingredients.length > 16 ? 22 : many ? 25 : 36;
  const stepSize = steps.length > 7 ? 26 : steps.length > 5 ? 34 : 40;
  const groups = new Map<string, RecipeInput['ingredients']>();
  for (const i of recipe.ingredients) groups.set(i.group ?? '', [...(groups.get(i.group ?? '') ?? []), i]);
  return (
    <AbsoluteFill style={{ background: COLORS.cream, fontFamily: FONT_FAMILY, color: COLORS.ink, padding: 56, letterSpacing: -1, wordBreak: 'keep-all' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, fontWeight: 800, color: COLORS.red }}>
        <LogoMark size={52} /> {BRAND.labName}
      </div>
      <div style={{ fontSize: fitSize(recipe.dishName || recipe.topic, 72, 12), fontWeight: 950, marginTop: 14, letterSpacing: -2 }}>{recipe.dishName || recipe.topic}</div>
      <div style={{ display: 'flex', gap: 28, marginTop: 26, flex: 1, minHeight: 0 }}>
        <div style={{ width: many ? 330 : 380, background: COLORS.white, border: `5px solid ${COLORS.ink}`, borderRadius: 32, padding: 28 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: COLORS.red, marginBottom: 12 }}>재료</div>
          {[...groups.entries()].map(([group, items]) => (
            <div key={group} style={{ marginBottom: group ? 6 : 0 }}>
              {group && <div style={{ fontSize: ingSize + 2, fontWeight: 850, margin: '4px 0 2px', color: COLORS.navy }}>[{group}]</div>}
              {items.map((i, idx) => (
                <div key={idx} style={{ fontSize: ingSize, fontWeight: 600, lineHeight: many ? 1.25 : 1.32, marginBottom: many ? 1 : 12 }}>
                  · {formatIngredient(i)}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, background: COLORS.white, border: `5px solid ${COLORS.ink}`, borderRadius: 32, padding: 28 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: COLORS.red, marginBottom: 12 }}>만드는 법</div>
          {steps.map((s, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 12, fontSize: stepSize, fontWeight: 600, lineHeight: 1.32, marginBottom: steps.length > 7 ? 8 : 16 }}>
              <b style={{ color: COLORS.red }}>{idx + 1}</b>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>
      {recipe.tips[0] && (
        <div style={{ marginTop: 22, background: COLORS.yellow, border: `5px solid ${COLORS.ink}`, borderRadius: 28, padding: '20px 28px', fontSize: 30, fontWeight: 700, lineHeight: 1.4 }}>
          💡 {BRAND.tipPhrase} — {recipe.tips[0]}
        </div>
      )}
      <div style={{ marginTop: 18, fontSize: 24, fontWeight: 600, opacity: 0.7 }}>
        {reviewed ? `${BRAND.researcherTitle} ${BRAND.researcher} 검토 완료` : '검수 전 초안'} · 출처: {recipe.source}
      </div>
    </AbsoluteFill>
  );
};

/** 캐릭터 기준 시트: 기본 감정 6종 + 대표 색상 (1920×1080) */
export const CharacterSheet: React.FC<Record<string, unknown>> = () => (
  <AbsoluteFill style={{ background: COLORS.cream, fontFamily: FONT_FAMILY, color: COLORS.ink, padding: '50px 70px' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
      <div style={{ fontSize: 64, fontWeight: 950, letterSpacing: -2 }}>{BRAND.character} 캐릭터 시트</div>
      <div style={{ fontSize: 30, fontWeight: 600, opacity: 0.7 }}>{BRAND.labName} · 기본 감정 6종</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 20, marginTop: 50 }}>
      {EMOTIONS.map((e) => (
        <div key={e} style={{ background: COLORS.white, border: `5px solid ${COLORS.ink}`, borderRadius: 32, padding: '30px 0 20px', textAlign: 'center' }}>
          <Character emotion={e} frame={0} size={250} still />
          <div style={{ fontSize: 36, fontWeight: 850, marginTop: 10 }}>{EMOTION_LABELS[e]}</div>
          <div style={{ fontSize: 22, opacity: 0.6 }}>{e}</div>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 22, marginTop: 50, alignItems: 'center' }}>
      <div style={{ fontSize: 30, fontWeight: 800, marginRight: 10 }}>대표 색상</div>
      {Object.entries(COLORS).slice(0, 8).map(([name, hex]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22 }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: hex, border: `3px solid ${COLORS.ink}` }} />
          {hex}
        </div>
      ))}
    </div>
  </AbsoluteFill>
);
