import type { Emotion } from '@mat-lab/recipe-core';
import React from 'react';
import { ARM_POSES, mouthOpen } from '../characterMotion.ts';
import { COLORS } from '../theme.ts';

/**
 * 메인 캐릭터 '맛조수' (가칭).
 * 찐빵 모양 몸통 + 조리모 + 연구용 고글 + 토마토색 앞치마.
 * 매번 생성하지 않고 이 컴포넌트 하나를 계속 재사용해 일관성을 지킨다.
 */
export interface CharacterProps {
  emotion: Emotion;
  /** 애니메이션 기준 프레임 */
  frame: number;
  /** 대사 중이면 입이 움직인다 */
  talking?: boolean;
  size?: number;
  /** 정지 이미지(캐릭터 시트 등)에서 흔들림·깜빡임 끄기 */
  still?: boolean;
}

const INK = COLORS.ink;
const STROKE = 7;

interface Pose {
  leftArm: number; // 회전 각도 (0 = 아래로 내림)
  rightArm: number;
  wave?: boolean;
  squash?: number;
}

const pose = (e: Emotion, extra: Omit<Pose, 'leftArm' | 'rightArm'> = {}): Pose => ({ leftArm: ARM_POSES[e][0], rightArm: ARM_POSES[e][1], ...extra });
const POSES: Record<Emotion, Pose> = {
  joy: pose('joy', { wave: true }),
  embarrassed: pose('embarrassed'),
  curious: pose('curious'),
  confident: pose('confident'),
  surprised: pose('surprised'),
  disappointed: pose('disappointed', { squash: 0.96 }),
};

export const Character: React.FC<CharacterProps> = ({ emotion, frame, talking = false, size = 480, still = false }) => {
  const pose = POSES[emotion];
  const t = still ? 0 : frame;
  const bob = still ? 0 : Math.sin(t / 7) * (talking ? 7 : 4);
  const blink = !still && t % 96 < 4;
  const open = talking && !still ? mouthOpen(t) : 0;
  const wave = pose.wave && !still ? Math.sin(t / 3.5) * 14 : 0;
  const squash = pose.squash ?? 1;

  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 400 460" style={{ overflow: 'visible' }}>
      <ellipse cx={200} cy={447} rx={115} ry={13} fill="rgba(0,0,0,0.13)" />
      <g transform={`translate(0 ${bob}) translate(200 440) scale(1 ${squash}) translate(-200 -440)`}>
        {/* 발 */}
        <ellipse cx={152} cy={430} rx={36} ry={17} fill={COLORS.navy} stroke={INK} strokeWidth={STROKE - 2} />
        <ellipse cx={248} cy={430} rx={36} ry={17} fill={COLORS.navy} stroke={INK} strokeWidth={STROKE - 2} />

        {/* 팔 (몸통 뒤) */}
        <Arm x={84} y={312} angle={pose.leftArm} />
        <Arm x={316} y={312} angle={pose.rightArm + wave} thumb={emotion === 'confident'} />

        {/* 몸통 */}
        <defs>
          <clipPath id="body-clip">
            <path d={BODY_PATH} />
          </clipPath>
        </defs>
        <path d={BODY_PATH} fill="#FFF9EF" />
        <g clipPath="url(#body-clip)">
          {/* 앞치마 */}
          <path d="M 60 338 Q 200 312 340 338 L 340 440 L 60 440 Z" fill={COLORS.red} />
          <path d="M 60 338 Q 200 312 340 338" fill="none" stroke={COLORS.redDark} strokeWidth={5} />
          <rect x={168} y={360} width={64} height={46} rx={10} fill={COLORS.redDark} opacity={0.55} />
          <Flask x={200} y={383} />
        </g>
        <path d={BODY_PATH} fill="none" stroke={INK} strokeWidth={STROKE} strokeLinejoin="round" />

        {/* 볼터치 */}
        <ellipse cx={122} cy={288} rx={24} ry={14} fill={COLORS.blush} opacity={emotion === 'embarrassed' ? 0.95 : 0.6} />
        <ellipse cx={278} cy={288} rx={24} ry={14} fill={COLORS.blush} opacity={emotion === 'embarrassed' ? 0.95 : 0.6} />

        <Brows emotion={emotion} />
        <Eyes emotion={emotion} blink={blink} />
        <Mouth emotion={emotion} open={open} />

        {/* 조리모 + 고글 */}
        <g>
          <circle cx={145} cy={92} r={42} fill={COLORS.white} stroke={INK} strokeWidth={STROKE} />
          <circle cx={255} cy={92} r={42} fill={COLORS.white} stroke={INK} strokeWidth={STROKE} />
          <circle cx={200} cy={70} r={52} fill={COLORS.white} stroke={INK} strokeWidth={STROKE} />
          <rect x={118} y={96} width={164} height={64} rx={14} fill={COLORS.white} />
          <path d="M 118 108 L 118 160 L 282 160 L 282 108" fill="none" stroke={INK} strokeWidth={STROKE} strokeLinejoin="round" />
          <rect x={118} y={136} width={164} height={14} fill={COLORS.red} />
          <line x1={118} y1={160} x2={282} y2={160} stroke={INK} strokeWidth={STROKE} />
          {/* 고글 */}
          <rect x={160} y={114} width={80} height={10} rx={5} fill={COLORS.navy} />
          <circle cx={174} cy={119} r={17} fill={COLORS.mint} stroke={INK} strokeWidth={5} />
          <circle cx={226} cy={119} r={17} fill={COLORS.mint} stroke={INK} strokeWidth={5} />
          <circle cx={168} cy={113} r={5} fill={COLORS.white} opacity={0.85} />
          <circle cx={220} cy={113} r={5} fill={COLORS.white} opacity={0.85} />
        </g>

        <Effects emotion={emotion} t={t} />
      </g>
    </svg>
  );
};

const BODY_PATH = 'M 66 320 C 58 205 128 152 200 152 C 272 152 342 205 334 320 C 330 398 276 432 200 432 C 124 432 70 398 66 320 Z';

const Arm: React.FC<{ x: number; y: number; angle: number; thumb?: boolean }> = ({ x, y, angle, thumb }) => (
  <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <rect x={-23} y={-4} width={46} height={64} rx={23} fill="#FFF9EF" stroke={INK} strokeWidth={STROKE} />
    <circle cx={0} cy={62} r={25} fill="#FFF9EF" stroke={INK} strokeWidth={STROKE} />
    {thumb && <rect x={-8} y={74} width={16} height={28} rx={8} fill="#FFF9EF" stroke={INK} strokeWidth={5} />}
  </g>
);

const Flask: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M -7 -16 L 7 -16 L 7 -4 L 16 14 Q 18 18 13 18 L -13 18 Q -18 18 -16 14 L -7 -4 Z" fill={COLORS.cream} stroke={INK} strokeWidth={3} />
    <path d="M -12 9 L 12 9 L 15 15 L -15 15 Z" fill={COLORS.mint} />
  </g>
);

const EYE_L = { x: 158, y: 252 };
const EYE_R = { x: 242, y: 252 };

const Eyes: React.FC<{ emotion: Emotion; blink: boolean }> = ({ emotion, blink }) => {
  const eye = (cx: number, cy: number, key: string) => {
    if (blink && emotion !== 'joy' && emotion !== 'embarrassed') {
      return <path key={key} d={`M ${cx - 16} ${cy} Q ${cx} ${cy + 6} ${cx + 16} ${cy}`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />;
    }
    switch (emotion) {
      case 'joy':
        return <path key={key} d={`M ${cx - 18} ${cy + 6} Q ${cx} ${cy - 16} ${cx + 18} ${cy + 6}`} stroke={INK} strokeWidth={8} fill="none" strokeLinecap="round" />;
      case 'embarrassed': {
        const dir = cx < 200 ? 1 : -1;
        return (
          <path key={key} d={`M ${cx - 14 * dir} ${cy - 12} L ${cx + 12 * dir} ${cy} L ${cx - 14 * dir} ${cy + 12}`} stroke={INK} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        );
      }
      case 'surprised':
        return (
          <g key={key}>
            <circle cx={cx} cy={cy} r={22} fill={COLORS.white} stroke={INK} strokeWidth={6} />
            <circle cx={cx} cy={cy + 2} r={9} fill={INK} />
          </g>
        );
      case 'confident':
        return (
          <g key={key}>
            <circle cx={cx} cy={cy + 3} r={13} fill={INK} />
            <circle cx={cx + 4} cy={cy - 1} r={4} fill={COLORS.white} />
            <rect x={cx - 18} y={cy - 20} width={36} height={16} fill="#FFF9EF" />
            <line x1={cx - 17} y1={cy - 4} x2={cx + 17} y2={cy - 4} stroke={INK} strokeWidth={6} strokeLinecap="round" />
          </g>
        );
      case 'disappointed':
        return (
          <g key={key}>
            <circle cx={cx} cy={cy + 6} r={11} fill={INK} />
            <path d={`M ${cx - 18} ${cy - 4} L ${cx + 18} ${cy - 4}`} stroke={INK} strokeWidth={6} strokeLinecap="round" />
          </g>
        );
      case 'curious':
      default: {
        const r = cx < 200 ? 14 : 17;
        return (
          <g key={key}>
            <circle cx={cx} cy={cy} r={r} fill={INK} />
            <circle cx={cx + 5} cy={cy - 5} r={5} fill={COLORS.white} />
          </g>
        );
      }
    }
  };
  return <g>{[eye(EYE_L.x, EYE_L.y, 'l'), eye(EYE_R.x, EYE_R.y, 'r')]}</g>;
};

const Brows: React.FC<{ emotion: Emotion }> = ({ emotion }) => {
  const line = (x1: number, y1: number, x2: number, y2: number, key: string) => (
    <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={7} strokeLinecap="round" />
  );
  switch (emotion) {
    case 'curious':
      return <g>{[line(140, 222, 172, 220, 'l'), line(226, 208, 260, 200, 'r')]}</g>;
    case 'confident':
      return <g>{[line(138, 218, 174, 226, 'l'), line(226, 226, 262, 218, 'r')]}</g>;
    case 'surprised':
      return <g>{[line(140, 206, 174, 200, 'l'), line(226, 200, 260, 206, 'r')]}</g>;
    case 'disappointed':
      return <g>{[line(140, 226, 174, 218, 'l'), line(226, 218, 260, 226, 'r')]}</g>;
    case 'embarrassed':
      return <g>{[line(140, 222, 174, 228, 'l'), line(226, 228, 260, 222, 'r')]}</g>;
    default:
      return null;
  }
};

const Mouth: React.FC<{ emotion: Emotion; open: number }> = ({ emotion, open }) => {
  const cx = 200;
  const cy = 300;
  if (open > 0.12) {
    const w = emotion === 'joy' || emotion === 'surprised' ? 30 : 24;
    const h = 8 + open * 26;
    return (
      <g>
        <ellipse cx={cx} cy={cy + h / 3} rx={w} ry={h} fill="#7A2A22" stroke={INK} strokeWidth={6} />
        <ellipse cx={cx} cy={cy + h / 3 + h * 0.55} rx={w * 0.55} ry={h * 0.35} fill={COLORS.blush} />
      </g>
    );
  }
  switch (emotion) {
    case 'joy':
      return (
        <g>
          <path d={`M ${cx - 32} ${cy - 6} Q ${cx} ${cy - 6} ${cx + 32} ${cy - 6} Q ${cx + 28} ${cy + 34} ${cx} ${cy + 34} Q ${cx - 28} ${cy + 34} ${cx - 32} ${cy - 6} Z`} fill="#7A2A22" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
          <ellipse cx={cx} cy={cy + 22} rx={15} ry={8} fill={COLORS.blush} />
        </g>
      );
    case 'embarrassed':
      return <path d={`M ${cx - 28} ${cy + 6} q 7 -10 14 0 t 14 0 t 14 0 t 14 0`} fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />;
    case 'curious':
      return <ellipse cx={cx + 12} cy={cy + 6} rx={10} ry={11} fill="#7A2A22" stroke={INK} strokeWidth={6} />;
    case 'confident':
      return <path d={`M ${cx - 26} ${cy + 2} Q ${cx + 4} ${cy + 22} ${cx + 30} ${cy - 8}`} fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />;
    case 'surprised':
      return <ellipse cx={cx} cy={cy + 10} rx={16} ry={22} fill="#7A2A22" stroke={INK} strokeWidth={6} />;
    case 'disappointed':
      return <path d={`M ${cx - 24} ${cy + 16} Q ${cx} ${cy - 4} ${cx + 24} ${cy + 16}`} fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />;
  }
};

const Effects: React.FC<{ emotion: Emotion; t: number }> = ({ emotion, t }) => {
  const pulse = 1 + Math.sin(t / 5) * 0.08;
  switch (emotion) {
    case 'joy':
    case 'confident':
      return (
        <g>
          <Sparkle x={340} y={170} s={pulse} />
          <Sparkle x={62} y={210} s={1.6 - pulse * 0.7} />
        </g>
      );
    case 'embarrassed':
      return <path d="M 312 190 Q 330 220 322 236 Q 310 248 300 236 Q 294 222 312 190 Z" fill="#8FD3F4" stroke={INK} strokeWidth={4} transform={`translate(0 ${(t % 40) * 0.6})`} />;
    case 'curious':
      return (
        <text x={330} y={150 + Math.sin(t / 6) * 6} fontSize={90} fontWeight={900} fill={COLORS.red} stroke={INK} strokeWidth={4} fontFamily="Pretendard, sans-serif">
          ?
        </text>
      );
    case 'surprised':
      return (
        <text x={330} y={150} fontSize={100} fontWeight={900} fill={COLORS.yellow} stroke={INK} strokeWidth={4} fontFamily="Pretendard, sans-serif" transform={`rotate(${Math.sin(t / 2) * 6} 350 120)`}>
          !
        </text>
      );
    case 'disappointed':
      return (
        <g stroke="#6B7A99" strokeWidth={5} strokeLinecap="round" opacity={0.8}>
          <line x1={140} y1={20} x2={140} y2={50} />
          <line x1={175} y1={8} x2={175} y2={44} />
          <line x1={225} y1={8} x2={225} y2={44} />
          <line x1={260} y1={20} x2={260} y2={50} />
        </g>
      );
  }
};

const Sparkle: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M 0 -22 Q 4 -4 22 0 Q 4 4 0 22 Q -4 4 -22 0 Q -4 -4 0 -22 Z" fill={COLORS.yellow} stroke={INK} strokeWidth={3} />
);
