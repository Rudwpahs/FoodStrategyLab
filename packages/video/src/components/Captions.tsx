import React from 'react';
import { interpolate } from 'remotion';
import { captionGroups } from '../timeline.ts';
import { COLORS, FONT_FAMILY } from '../theme.ts';

/**
 * 숏폼 자막: 1~3어절씩 튀어나오고, 지금 말하는 단어는 노란색.
 * 인스타·쇼츠 앱 UI가 가리는 위 220px·아래 420px을 피해 1500px 위에 놓는다.
 */
export const SAFE_BOTTOM = 1480;

export const Captions: React.FC<{ line: string; frame: number; speechFrames: number; punch?: boolean }> = ({ line, frame, speechFrames, punch }) => {
  const groups = captionGroups(line, speechFrames);
  const active = groups.find((g) => frame >= g.from && frame < g.to) ?? (frame >= speechFrames ? groups.at(-1) : groups[0]);
  if (!active) return null;
  const local = frame - active.from;
  const isLast = active === groups.at(-1);
  const big = punch && isLast;
  // 작게 → 조금 크게 → 보통 (마지막 강조 문장은 더 크게, 살짝 흔들림)
  const scale = interpolate(local, [0, 3, 7], [0.82, big ? 1.16 : 1.07, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wobble = big ? Math.sin(local / 2.2) * Math.max(0, 1 - local / 14) * 4 : 0;
  return (
    <div style={{ position: 'absolute', left: 40, right: 40, bottom: 1920 - SAFE_BOTTOM, display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          transform: `scale(${scale}) rotate(${wobble}deg)`,
          fontFamily: FONT_FAMILY,
          fontWeight: 920,
          fontSize: big ? 92 : 80,
          lineHeight: 1.15,
          letterSpacing: -2,
          textAlign: 'center',
          wordBreak: 'keep-all',
          WebkitTextStroke: `14px ${COLORS.ink}`,
          paintOrder: 'stroke fill',
          textShadow: '0 8px 18px rgba(0,0,0,0.35)',
          maxWidth: 1000,
        }}
      >
        {active.words.map((w, i) => {
          const speaking = frame >= w.from && frame < w.to;
          return (
            <span key={i} style={{ color: speaking ? COLORS.yellow : COLORS.white }}>
              {w.text}
              {i < active.words.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
};
