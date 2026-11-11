import React, { useMemo } from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { BRAND, type RecipeInput, type Scene } from '@mat-lab/recipe-core';
import { fitSize } from '../components/SceneCard.tsx';
import { BrandBadge } from '../components/Stage.tsx';
import { ensureFonts } from '../fonts.ts';
import { COLORS, FONT_FAMILY } from '../theme.ts';
import { KitchenScene, foodFor, type StageState } from '../three/KitchenScene.tsx';
import { CHEF_FACE } from '../three/layout.ts';

ensureFonts();

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
          // 긴 제목은 줄여서 3:4 안쪽(330~1600)·접시 위에 머물게 (예전 2D 표지와 같은 fitSize 규칙)
          fontSize: square ? fitSize(title, 76, 10, 50) : fitSize(title, 104, 12, 66),
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

function coverState(emotion: Scene['emotion'], square: boolean): StageState {
  const face = CHEF_FACE;
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
