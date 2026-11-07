import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BRAND } from '@mat-lab/recipe-core';
import { COLORS, FONT_FAMILY } from '../theme.ts';

/** 연구소 주방 배경: 타일 벽 + 원목 조리대 + 고정 소품 */
export const LabBackground: React.FC<{ counterTop?: number; height?: number }> = ({ counterTop = 1470, height = 1920 }) => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, ${COLORS.cream} 0%, ${COLORS.creamDeep} 100%)` }}>
    <svg width="100%" height="100%" viewBox={`0 0 1080 ${height}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <pattern id="tiles" width={90} height={90} patternUnits="userSpaceOnUse">
          <rect width={90} height={90} fill="none" stroke="rgba(43,35,33,0.05)" strokeWidth={3} />
        </pattern>
      </defs>
      <rect width={1080} height={counterTop} fill="url(#tiles)" />
      {/* 벽걸이 조리도구 (세로 영상에서만) */}
      {height >= 1920 && (<>
      <g opacity={0.35} stroke={COLORS.ink} strokeWidth={6} fill="none" strokeLinecap="round">
        <line x1={70} y1={1040} x2={330} y2={1040} />
        <path d="M 120 1040 L 120 1120 M 100 1120 Q 120 1160 140 1120 Z" />
        <path d="M 200 1040 L 200 1110 M 185 1110 L 215 1110 L 210 1150 L 190 1150 Z" />
        <path d="M 280 1040 L 280 1105 M 280 1105 m -22 0 a 22 22 0 1 0 44 0 a 22 22 0 1 0 -44 0" />
        <line x1={750} y1={1040} x2={1010} y2={1040} />
      </g>
      {/* 선반 위 양념통 */}
      <g opacity={0.45}>
        <rect x={790} y={968} width={46} height={72} rx={10} fill={COLORS.red} />
        <rect x={850} y={980} width={46} height={60} rx={10} fill={COLORS.mint} />
        <rect x={910} y={960} width={46} height={80} rx={10} fill={COLORS.yellow} />
      </g>
      </>)}
      {/* 조리대 */}
      <rect x={0} y={counterTop} width={1080} height={34} fill={COLORS.wood} />
      <rect x={0} y={counterTop + 34} width={1080} height={10} fill={COLORS.woodDark} />
      <rect x={0} y={counterTop + 44} width={1080} height={height - counterTop - 44} fill={COLORS.navy} />
    </svg>
  </AbsoluteFill>
);

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
