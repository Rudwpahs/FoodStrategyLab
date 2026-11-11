import React from 'react';
import { BRAND } from '@mat-lab/recipe-core';
import { COLORS, FONT_FAMILY } from '../theme.ts';

/** 좌상단 브랜드 배지 (모든 장면에 고정) */
export const BrandBadge: React.FC<{ scale?: number; top?: number }> = ({ scale = 1, top }) => (
  <div
    style={{
      position: 'absolute',
      top: top ?? (scale === 1 ? 232 : 120) * scale,
      left: 56 * scale,
      display: 'flex',
      alignItems: 'center',
      gap: 14 * scale,
      background: COLORS.red,
      color: COLORS.white,
      padding: `${14 * scale}px ${30 * scale}px ${14 * scale}px ${20 * scale}px`,
      borderRadius: 999,
      border: `${5 * scale}px solid ${COLORS.ink}`,
      fontFamily: FONT_FAMILY,
      fontWeight: 850,
      fontSize: 40 * scale,
      letterSpacing: -1,
      boxShadow: `0 ${6 * scale}px 0 ${COLORS.ink}`,
    }}
  >
    <LogoMark size={46 * scale} />
    {BRAND.labName}
  </div>
);

/** 로고 마크: 플라스크 + 숟가락 */
export const LogoMark: React.FC<{ size?: number }> = ({ size = 46 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48">
    <circle cx={24} cy={24} r={22} fill={COLORS.cream} stroke={COLORS.ink} strokeWidth={3} />
    <path d="M 19 11 L 29 11 L 29 19 L 35 32 Q 37 37 32 37 L 16 37 Q 11 37 13 32 L 19 19 Z" fill={COLORS.white} stroke={COLORS.ink} strokeWidth={2.5} />
    <path d="M 15 30 L 33 30 L 35 34 Q 35 36 32 36 L 16 36 Q 13 36 13 34 Z" fill={COLORS.red} />
    <circle cx={22} cy={26} r={2} fill={COLORS.mint} />
    <circle cx={27} cy={23} r={1.6} fill={COLORS.mint} />
  </svg>
);

/** 승인 전 미리보기에는 워터마크를 띄운다. */
export const DraftWatermark: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      top: 40,
      right: 40,
      padding: '12px 24px',
      borderRadius: 16,
      background: 'rgba(232,85,58,0.92)',
      color: COLORS.white,
      fontFamily: FONT_FAMILY,
      fontWeight: 800,
      fontSize: 34,
      border: `4px solid ${COLORS.ink}`,
    }}
  >
    검수 전 미리보기
  </div>
);
