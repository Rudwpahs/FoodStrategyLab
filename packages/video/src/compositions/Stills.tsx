import React from 'react';
import { reviewNote } from '../brandText.ts';
import { recipeCardPages } from '../cardPages.ts';
import { AbsoluteFill } from 'remotion';
import { BRAND, EMOTIONS, EMOTION_LABELS, formalParagraph, formatIngredient, type Emotion, type RecipeInput } from '@mat-lab/recipe-core';
import { Character } from '../components/Character.tsx';
import { fitSize } from '../components/SceneCard.tsx';
import { LogoMark } from '../components/Stage.tsx';
import { ensureFonts } from '../fonts.ts';
import { KitchenCover } from './KitchenCover.tsx';
import { COLORS, FONT_FAMILY } from '../theme.ts';

ensureFonts();

export interface CoverProps {
  title: string;
  emotion: Emotion;
  recipe: RecipeInput;
  photoColor?: string;
  [key: string]: unknown;
}

/** 릴스·쇼츠 커버 (1080×1920)와 정사각 썸네일 (1080×1080): 3D 주방 커버 */
export const Cover: React.FC<CoverProps> = (props) => <KitchenCover title={props.title} recipe={props.recipe} photoColor={props.photoColor} emotion={props.emotion} />;
export const SquareThumb = Cover;

export interface RecipeCardProps {
  recipe: RecipeInput;
  reviewed: boolean;
  /** 승인한 사람 (연구자 본인인지 판정에만 쓰고 화면에는 쓰지 않는다) */
  reviewer?: string;
  /** 승인 전 검수용: 상태 문구 없이 출처만 */
  cleanDraft?: boolean;
  [key: string]: unknown;
}

/** 블로그·저장용 레시피 카드 (1080×1350). 원본 데이터만 사용한다. */
export const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, reviewed, reviewer, cleanDraft }) => {
  const steps = recipe.steps;
  const many = recipe.ingredients.length > 10;
  const ingSize = recipe.ingredients.length > 16 ? 22 : many ? 25 : 36;
  const stepSize = steps.length > 7 ? 26 : steps.length > 5 ? 34 : 40;
  const note = reviewNote(reviewed, reviewer, cleanDraft);
  return (
    <AbsoluteFill style={{ background: COLORS.cream, fontFamily: FONT_FAMILY, color: COLORS.ink, padding: 56, letterSpacing: -1, wordBreak: 'keep-all' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, fontWeight: 800, color: COLORS.red }}>
        <LogoMark size={52} /> {BRAND.labName}
      </div>
      <div style={{ fontSize: fitSize(recipe.dishName || recipe.topic, 72, 12), fontWeight: 950, marginTop: 14, letterSpacing: -2 }}>{recipe.dishName || recipe.topic}</div>
      <div style={{ display: 'flex', gap: 28, marginTop: 26, flex: 1, minHeight: 0 }}>
        <div style={{ width: many ? 330 : 380, background: COLORS.white, border: `5px solid ${COLORS.ink}`, borderRadius: 32, padding: 28 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: COLORS.red, marginBottom: 12 }}>재료</div>
          {/* 원본 순서 그대로: 앞 재료와 그룹이 바뀔 때만 머리글 (캐러셀과 같은 규칙) */}
          {recipe.ingredients.map((i, idx) => (
            <React.Fragment key={idx}>
              {i.group && (idx === 0 || recipe.ingredients[idx - 1]!.group !== i.group) && (
                <div style={{ fontSize: ingSize + 2, fontWeight: 850, margin: `${idx ? 10 : 4}px 0 2px`, color: COLORS.navy }}>[{i.group}]</div>
              )}
              <div style={{ fontSize: ingSize, fontWeight: 600, lineHeight: many ? 1.25 : 1.32, marginBottom: many ? 1 : 12 }}>· {formatIngredient(i)}</div>
            </React.Fragment>
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
        {note && `${note} · `}출처: {recipe.source}
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

export interface CarouselCardProps extends RecipeCardProps {
  page: number;
}

/** 넘겨 보는 레시피 카드 한 장 (1080×1350, 인스타그램 캐러셀). 내용은 원본을 나누기만 한다 */
export const CarouselCard: React.FC<CarouselCardProps> = ({ recipe, reviewed, reviewer, cleanDraft, page }) => {
  const pages = recipeCardPages(recipe);
  const note = reviewNote(reviewed, reviewer, cleanDraft);
  const p = pages[Math.min(page, pages.length - 1)];
  const dish = recipe.dishName || recipe.topic;
  const box: React.CSSProperties = { flex: 1, minHeight: 0, background: COLORS.white, border: `5px solid ${COLORS.ink}`, borderRadius: 36, padding: '36px 40px', marginTop: 28 };
  const title = (t: string) => <div style={{ fontSize: 46, fontWeight: 950, color: COLORS.red, marginBottom: 20 }}>{t}</div>;
  return (
    <AbsoluteFill style={{ background: COLORS.cream, fontFamily: FONT_FAMILY, color: COLORS.ink, padding: 60, letterSpacing: -1, wordBreak: 'keep-all', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 800, color: COLORS.red }}>
        <LogoMark size={48} /> {BRAND.series}
        <div style={{ flex: 1 }} />
        <span style={{ color: COLORS.ink, opacity: 0.6 }}>
          {page + 1}/{pages.length}
        </span>
      </div>
      <div style={{ fontSize: fitSize(dish, 76, 12), fontWeight: 950, marginTop: 12, letterSpacing: -2 }}>{dish}</div>
      {p?.kind === 'ingredients' && (
        <div style={box}>
          {title(p.parts > 1 ? `재료 (${p.part}/${p.parts})` : '재료')}
          {p.items.map((i, idx) => (
            <div key={idx} style={{ fontSize: p.items.length > 12 ? 30 : p.items.length > 9 ? 36 : 44, fontWeight: 650, lineHeight: 1.35, marginBottom: 6 }}>
              {i.group && (idx === 0 || p.items[idx - 1]!.group !== i.group) && <div style={{ fontSize: 32, fontWeight: 850, color: COLORS.navy, marginTop: idx ? 10 : 0 }}>[{i.group}]</div>}
              · {formatIngredient(i)}
            </div>
          ))}
        </div>
      )}
      {p?.kind === 'steps' && (
        <div style={box}>
          {title(p.parts > 1 ? `만드는 법 (${p.part}/${p.parts})` : '만드는 법')}
          {p.items.map((s, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 18, fontSize: p.items.length > 5 ? 32 : p.items.length > 4 ? 36 : 42, fontWeight: 650, lineHeight: 1.36, marginBottom: p.items.length > 4 ? 14 : 22 }}>
              <b style={{ color: COLORS.red, minWidth: 40 }}>{p.start + idx}</b>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
      {p?.kind === 'note' && (
        <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {p.principle && (
            <div>
              {title(BRAND.notePhrase)}
              <div style={{ fontSize: 40, fontWeight: 650, lineHeight: 1.45 }}>{formalParagraph(p.principle)}</div>
            </div>
          )}
          {p.tip && (
            <div style={{ background: COLORS.yellow, border: `5px solid ${COLORS.ink}`, borderRadius: 28, padding: '24px 30px', fontSize: 36, fontWeight: 700, lineHeight: 1.42 }}>
              💡 {BRAND.tipPhrase}
              <div style={{ marginTop: 8 }}>{p.tip}</div>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
            <Character emotion="joy" frame={0} size={260} still />
            <div style={{ fontSize: 32, fontWeight: 750, lineHeight: 1.4, paddingBottom: 30 }}>
              저장해 두고 만들 때 꺼내 보세요!
              <div style={{ fontSize: 26, fontWeight: 600, opacity: 0.7 }}>{BRAND.labName}</div>
            </div>
          </div>
        </div>
      )}
      <div style={{ marginTop: 22, fontSize: 26, fontWeight: 600, opacity: 0.7 }}>
        {note ? `${note} · ` : `레시피 ${BRAND.researcherTitle} ${BRAND.researcher} · `}진행 {BRAND.character}(AI 캐릭터){p?.kind === 'note' ? '' : ' · 저장해 두고 보세요'}
      </div>
    </AbsoluteFill>
  );
};
