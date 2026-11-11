/** 브랜드 대표 색상 (브랜드 가이드와 동일하게 유지) */
export const COLORS = {
  red: '#E8553A',
  redDark: '#C2402A',
  cream: '#FFF4E2',
  creamDeep: '#FBE3C4',
  navy: '#263248',
  mint: '#7CC6A4',
  yellow: '#FFC94A',
  ink: '#2B2321',
  white: '#FFFFFF',
  blush: '#FF9C8A',
  wood: '#C98B5A',
  woodDark: '#9C6640',
} as const;

export const FONT_FAMILY = 'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export const VIDEO = { width: 1080, height: 1920, fps: 30 } as const;

/** 자막 아랫변의 기본 y: 인스타·쇼츠 앱 UI가 가리는 아래 420px(1500 아래)를 피한다 */
export const CAPTION_SAFE_BOTTOM = 1480;
