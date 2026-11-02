import React from 'react';
import { interpolate } from 'remotion';
import { captionChunks } from '../timeline.ts';
import { COLORS, FONT_FAMILY } from '../theme.ts';

/** 하단 자막. 플랫폼 UI에 가리지 않도록 아래 220px은 비워 둔다. */
export const Captions: React.FC<{ line: string; frame: number; speechFrames: number }> = ({ line, frame, speechFrames }) => {
  const chunks = captionChunks(line, speechFrames);
  const active = chunks.find((c) => frame >= c.from && frame < c.to) ?? (frame >= speechFrames ? chunks.at(-1) : chunks[0]);
  if (!active) return null;
  const pop = interpolate(frame - active.from, [0, 4], [0.92, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 50, right: 50, top: 1540, display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          transform: `scale(${pop})`,
          background: COLORS.white,
          color: COLORS.ink,
          border: `6px solid ${COLORS.ink}`,
          borderRadius: 30,
          padding: '18px 36px',
          fontFamily: FONT_FAMILY,
          fontWeight: 850,
          fontSize: 60,
          lineHeight: 1.3,
          letterSpacing: -1.5,
          textAlign: 'center',
          wordBreak: 'keep-all',
          maxWidth: 940,
        }}
      >
        {active.text}
      </div>
    </div>
  );
};
