import type { Emotion } from '@mat-lab/recipe-core';
import React from 'react';
import { narratorBox } from '../realFootage.ts';
import { COLORS } from '../theme.ts';
import { Character } from './Character.tsx';

/**
 * 실제 촬영 영상·사진 위의 맛조수: 왼쪽 아래 작은 원 안에서 표정을 바꾸며 말한다 (시리즈 캐릭터를 놓치지 않게).
 * 자리는 narratorBox (자막·위쪽 카드·앱 UI를 가리지 않는 곳, realFootage.test.ts로 확인).
 */
export const Narrator: React.FC<{ emotion: Emotion; frame: number; talking: boolean; mouth?: number; enter: number }> = ({ emotion, frame, talking, mouth, enter }) => {
  const box = narratorBox();
  const character = Math.round(box.width * 0.8);
  if (enter <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        transform: `scale(${enter})`,
        transformOrigin: '20% 100%',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          background: `radial-gradient(circle at 50% 38%, ${COLORS.white} 0%, ${COLORS.cream} 55%, ${COLORS.creamDeep} 100%)`,
          border: `7px solid ${COLORS.ink}`,
          boxShadow: `0 9px 0 ${COLORS.ink}, 0 14px 30px rgba(0,0,0,0.35)`,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ position: 'absolute', left: (box.width - character) / 2 - 7, top: box.height * 0.1 }}>
          <Character emotion={emotion} frame={frame} talking={talking} mouth={mouth} size={character} />
        </div>
      </div>
    </div>
  );
};
