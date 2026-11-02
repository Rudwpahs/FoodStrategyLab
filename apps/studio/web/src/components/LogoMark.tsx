import React from 'react';

export const LogoMark: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
    <circle cx={24} cy={24} r={22} fill="#E8553A" stroke="#2B2321" strokeWidth={3} />
    <path d="M 19 11 L 29 11 L 29 19 L 35 32 Q 37 37 32 37 L 16 37 Q 11 37 13 32 L 19 19 Z" fill="#fff" stroke="#2B2321" strokeWidth={2.5} />
    <path d="M 15 30 L 33 30 L 35 34 Q 35 36 32 36 L 16 36 Q 13 36 13 34 Z" fill="#7CC6A4" />
  </svg>
);
