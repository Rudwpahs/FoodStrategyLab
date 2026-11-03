import React from 'react';
import { interpolate, spring } from 'remotion';
import { BRAND, type Scene } from '@mat-lab/recipe-core';
import { COLORS, FONT_FAMILY } from '../theme.ts';
import { LogoMark } from './Stage.tsx';

interface CardProps {
  scene: Scene;
  topic: string;
  frame: number;
  fps: number;
  reviewed: boolean;
}

/** 글자 수에 따라 글자 크기를 줄인다. */
export function fitSize(text: string, base: number, comfortableChars: number, min = base * 0.55): number {
  const len = text.length;
  if (len <= comfortableChars) return base;
  return Math.max(min, base * Math.sqrt(comfortableChars / len));
}

const cardBase: React.CSSProperties = {
  position: 'absolute',
  left: 60,
  right: 60,
  top: 250,
  background: COLORS.white,
  border: `6px solid ${COLORS.ink}`,
  borderRadius: 44,
  boxShadow: `0 12px 0 ${COLORS.ink}`,
  padding: '48px 52px',
  fontFamily: FONT_FAMILY,
  color: COLORS.ink,
  letterSpacing: -1.5,
  wordBreak: 'keep-all',
};

const Label: React.FC<{ children: React.ReactNode; color?: string; textColor?: string }> = ({ children, color = COLORS.red, textColor = COLORS.white }) => (
  <div
    style={{
      display: 'inline-block',
      background: color,
      color: textColor,
      borderRadius: 999,
      padding: '10px 28px',
      fontSize: 38,
      fontWeight: 800,
      marginBottom: 28,
      border: `4px solid ${COLORS.ink}`,
    }}
  >
    {children}
  </div>
);

export const SceneCard: React.FC<CardProps> = ({ scene, topic, frame, fps, reviewed }) => {
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 140 } });
  const style: React.CSSProperties = {
    ...cardBase,
    opacity: enter,
    transform: `translateY(${interpolate(enter, [0, 1], [80, 0])}px) scale(${interpolate(enter, [0, 1], [0.94, 1])})`,
  };
  const item = (i: number) => {
    const p = spring({ frame: frame - 6 - i * 5, fps, config: { damping: 16 } });
    return { opacity: p, transform: `translateX(${interpolate(p, [0, 1], [40, 0])}px)` };
  };

  switch (scene.type) {
    case 'intro':
      return (
        <div style={{ ...style, textAlign: 'center', top: 300 }}>
          <Label>오늘의 실험</Label>
          <div style={{ fontSize: fitSize(scene.cardTitle ?? topic, 84, 14), fontWeight: 900, lineHeight: 1.22 }}>{scene.cardTitle ?? topic}</div>
        </div>
      );
    case 'question':
      return (
        <div style={{ ...style, textAlign: 'center', top: 300, background: COLORS.cream }}>
          <Label color={COLORS.navy}>{scene.cardTitle ?? '오늘의 질문'}</Label>
          {/* 훅 장면은 말하는 첫 문장을 그대로 크게 보여 준다 (소리 없이 봐도 이해되도록) */}
          <div style={{ fontSize: fitSize(scene.hook ? scene.line : topic, 80, 14), fontWeight: 900, lineHeight: 1.22 }}>
            <span style={{ color: COLORS.red }}>Q. </span>
            {scene.hook ? scene.line : topic}
          </div>
        </div>
      );
    case 'mistake':
      return (
        <div style={{ ...style, top: 300, textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-block',
              color: COLORS.red,
              border: `8px solid ${COLORS.red}`,
              borderRadius: 18,
              padding: '4px 32px',
              fontSize: 72,
              fontWeight: 950,
              transform: `rotate(-6deg) scale(${interpolate(enter, [0, 1], [1.6, 1])})`,
              marginBottom: 30,
            }}
          >
            실패!
          </div>
          <div style={{ fontSize: fitSize(scene.line, 64, 24), fontWeight: 700, lineHeight: 1.35 }}>{stripExclaim(scene.line)}</div>
        </div>
      );
    case 'explain': {
      const text = scene.cardItems?.[0] ?? scene.line;
      return (
        <div
          style={{
            ...style,
            background: `#FFFDF7`,
            borderLeft: `26px solid ${COLORS.red}`,
          }}
        >
          <Label color={COLORS.yellow} textColor={COLORS.ink}>📒 {scene.cardTitle ?? BRAND.notePhrase}</Label>
          <div style={{ fontSize: fitSize(text, 66, 30), fontWeight: 700, lineHeight: 1.45 }}>{text}</div>
        </div>
      );
    }
    case 'ingredients': {
      const items = scene.cardItems ?? [];
      const size = items.length > 6 ? 44 : 54;
      return (
        <div style={style}>
          <Label color={COLORS.mint} textColor={COLORS.ink}>{scene.cardTitle ?? '준비물'}</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: size, fontWeight: 700, ...item(i) }}>
                <span style={{ width: 22, height: 22, borderRadius: 99, background: COLORS.red, flex: 'none' }} />
                {it}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'steps': {
      const items = scene.cardItems ?? [];
      const size = items.length > 4 ? 42 : 48;
      return (
        <div style={style}>
          <Label color={COLORS.navy}>{scene.cardTitle ?? '조리 순서'}</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 20, fontSize: size, fontWeight: 650, lineHeight: 1.3, ...item(i) }}>
                <span
                  style={{
                    flex: 'none',
                    width: size * 1.3,
                    height: size * 1.3,
                    borderRadius: 99,
                    background: COLORS.red,
                    color: COLORS.white,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    border: `4px solid ${COLORS.ink}`,
                  }}
                >
                  {i + 1}
                </span>
                {it}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'tip': {
      const text = scene.cardItems?.[0] ?? scene.line;
      return (
        <div style={{ ...style, background: COLORS.yellow }}>
          <Label color={COLORS.ink}>💡 {scene.cardTitle ?? BRAND.tipPhrase}</Label>
          <div style={{ fontSize: fitSize(text, 66, 28), fontWeight: 800, lineHeight: 1.4 }}>{text}</div>
        </div>
      );
    }
    case 'outro':
      return (
        <div style={{ ...style, textAlign: 'center', top: 330, background: COLORS.red, color: COLORS.white }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <LogoMark size={130} />
          </div>
          <div style={{ fontSize: 80, fontWeight: 950 }}>{BRAND.labName}</div>
          <div style={{ fontSize: 40, fontWeight: 600, marginTop: 14, opacity: 0.95 }}>{BRAND.slogan}</div>
          {reviewed && (
            <div style={{ marginTop: 30, fontSize: 36, fontWeight: 700, background: 'rgba(0,0,0,0.18)', borderRadius: 20, padding: '14px 20px' }}>
              {BRAND.researcherTitle} {BRAND.researcher} 검토 완료
            </div>
          )}
        </div>
      );
  }
};

function stripExclaim(line: string) {
  return line.replace(/^으악,?\s*망했어요!\s*/, '');
}
