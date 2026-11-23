import type { Emotion, FoodProfile, Gag } from '@mat-lab/recipe-core';
import React from 'react';
import { Character } from '../components/Character.tsx';
import { COLORS, VIDEO } from '../theme.ts';
import { Dish2D, shade } from './Dish2D.tsx';
import { clamp01, coasterAngle, coasterX, coasterY, deadpanEmotion, ease, hash01, lift, progressOf, swingAngle } from './gagMotion.ts';

/**
 * 농담 장면 그림 ('진지한 엉뚱 가이드'의 말도 안 되는 단계). 2D 그림을 3D 화면 위에 덮는다.
 *
 * 왜 2D인가: 소품 14가지를 3D로 만들면 모델·조명·카메라를 장면마다 맞춰야 하고, 하나뿐인 WebGL 캔버스(휴대폰 사파리 한계)에
 * 무거운 장면이 더 들어간다. 이 그림들은 브랜드 카드·이름표와 같은 굵은 잉크 선 + 평면 색 스티커 그림이고, 맛조수도
 * 실제 촬영 영상 위에서 쓰는 2D 맛조수(Character)를 그대로 쓴다. 휴대폰 크기에서 한눈에 읽히고(예시 영상도 엉뚱한 생각을
 * 단순한 그림으로 글자 그대로 보여 줬다), 그리는 데 드는 시간이 3D 한 화면보다 적다 (그동안 3D 캔버스는 그리지 않는다, KitchenScene skip).
 *
 * 좌표는 1080×1920 화면 그대로. 위 220px(앱 UI·브랜드 배지)과 자막 자리(1250~1480) 사이에 요리와 맛조수를 둔다.
 * 요리는 2D 접시(Dish2D, 3D 음식과 같은 색·종류)로, 맛조수는 끝까지 태연한 표정(deadpanEmotion)으로.
 */
export interface GagProps {
  gag: Gag;
  /** 장면 안 프레임 */
  frame: number;
  /** 장면 길이 (프레임) */
  duration: number;
  food: FoodProfile;
  emotion: Emotion;
  talking: boolean;
  mouth?: number;
}

interface Ctx {
  f: number;
  p: number;
  food: FoodProfile;
  /** 맛조수: 가운데 x, 발 y, 크기 */
  host: (cx: number, feetY: number, size: number, extra?: React.ReactNode) => React.ReactNode;
  dish: (x: number, y: number, scale?: number, rotate?: number, steam?: boolean) => React.ReactNode;
}

const INK = COLORS.ink;
const SW = 8;
const line = { stroke: INK, strokeWidth: SW, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

export const GagScene: React.FC<GagProps> = ({ gag, frame, duration, food, emotion, talking, mouth }) => {
  const ctx: Ctx = {
    f: frame,
    p: progressOf(frame, duration),
    food,
    host: (cx, feetY, size, extra) => (
      <g transform={`translate(${cx - size / 2} ${feetY - size * 1.116})`}>
        <Character emotion={deadpanEmotion(emotion)} frame={frame} talking={talking} mouth={mouth} size={size} />
        {extra && <g transform={`scale(${size / 400})`}>{extra}</g>}
      </g>
    ),
    dish: (x, y, scale = 1, rotate = 0, steam) => <Dish2D food={food} x={x} y={y} scale={scale} rotate={rotate} frame={frame} steam={steam} />,
  };
  const Art = ART[gag];
  return (
    <svg width={VIDEO.width} height={VIDEO.height} viewBox={`0 0 ${VIDEO.width} ${VIDEO.height}`} style={{ position: 'absolute', inset: 0 }}>
      <Art {...ctx} />
    </svg>
  );
};

// ───────── 공통 그림 조각 ─────────

const Sky: React.FC<{ id: string; top: string; bottom: string; until?: number }> = ({ id, top, bottom, until = 1920 }) => (
  <>
    <defs>
      <linearGradient id={`sky-${id}`} x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor={top} />
        <stop offset="100%" stopColor={bottom} />
      </linearGradient>
    </defs>
    <rect x={0} y={0} width={1080} height={until} fill={`url(#sky-${id})`} />
  </>
);

/** 원 여러 개를 합친 구름 (겉선만 잉크) */
const Cloud: React.FC<{ x: number; y: number; s?: number; fill?: string }> = ({ x, y, s = 1, fill = COLORS.white }) => {
  const puffs: [number, number, number][] = [
    [-70, 10, 46],
    [-20, -18, 60],
    [44, -6, 52],
    [90, 16, 38],
    [10, 22, 50],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {puffs.map(([cx, cy, r], i) => (
        <circle key={`o${i}`} cx={cx} cy={cy} r={r + SW / 2 + 1} fill={INK} />
      ))}
      {puffs.map(([cx, cy, r], i) => (
        <circle key={`i${i}`} cx={cx} cy={cy} r={r - SW / 2 + 1} fill={fill} />
      ))}
    </g>
  );
};

const Stars: React.FC<{ f: number; n: number; until: number; salt?: number }> = ({ f, n, until, salt = 0 }) => (
  <g>
    {Array.from({ length: n }, (_, i) => (
      <circle
        key={i}
        cx={hash01(i, 20 + salt) * 1080}
        cy={hash01(i, 21 + salt) * until}
        r={2 + hash01(i, 22 + salt) * 4}
        fill="#FFF6D8"
        opacity={0.45 + 0.55 * Math.abs(Math.sin(f / 12 + i))}
      />
    ))}
  </g>
);

/** 흐르는 바람 줄 */
const Wind: React.FC<{ f: number; rows: number[]; speed?: number; color?: string }> = ({ f, rows, speed = 34, color = COLORS.white }) => (
  <g>
    {rows.map((y, i) => {
      const x = ((f * speed + i * 290) % 1500) - 300;
      return <path key={i} d={`M ${x} ${y} q 60 -26 120 0 t 120 0`} stroke={color} strokeWidth={10} fill="none" strokeLinecap="round" opacity={0.85} />;
    })}
  </g>
);

// ───────── 그림 (엉뚱 가이드용 14가지 + 글자 그대로용 3가지) ─────────

/** 사막 한가운데: 모래 언덕 위 접시, 뜨거운 해, 아지랑이, 선인장 */
const Desert: React.FC<Ctx> = ({ f, host, dish }) => (
  <g>
    <Sky id="desert" top="#FFC768" bottom="#FFEBC2" />
    <g transform={`translate(830 430) rotate(${f * 0.4})`}>
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={-9} y={-200} width={18} height={56} rx={9} fill="#FF9E2C" stroke={INK} strokeWidth={5} transform={`rotate(${i * 30})`} />
      ))}
    </g>
    <circle cx={830} cy={430} r={118} fill="#FFB02E" {...line} />
    <path d="M 0 1010 Q 260 900 560 990 T 1080 960 L 1080 1920 L 0 1920 Z" fill="#F4C27A" {...line} />
    <path d="M -40 1250 Q 300 1070 700 1150 T 1120 1110 L 1120 1920 L -40 1920 Z" fill="#E9A552" {...line} />
    <path d="M 120 1330 q 60 -14 120 0 M 640 1290 q 70 -16 140 0" stroke="#C98436" strokeWidth={6} fill="none" strokeLinecap="round" />
    {/* 선인장 */}
    <g transform="translate(920 1000)">
      <rect x={-30} y={-170} width={60} height={200} rx={30} fill="#5FAE5A" {...line} />
      <path d="M -30 -80 h -34 a 22 22 0 0 1 -22 -22 v -46" fill="none" stroke={INK} strokeWidth={26} strokeLinecap="round" />
      <path d="M -30 -80 h -34 a 22 22 0 0 1 -22 -22 v -46" fill="none" stroke="#5FAE5A" strokeWidth={12} strokeLinecap="round" />
      <path d="M 30 -110 h 30 a 20 20 0 0 0 20 -20 v -30" fill="none" stroke={INK} strokeWidth={26} strokeLinecap="round" />
      <path d="M 30 -110 h 30 a 20 20 0 0 0 20 -20 v -30" fill="none" stroke="#5FAE5A" strokeWidth={12} strokeLinecap="round" />
    </g>
    {dish(640, 1120, 1.05)}
    {/* 아지랑이 */}
    {[0, 1, 2].map((i) => (
      <path key={i} d={`M ${560 + i * 80} ${960 - i * 10} q ${10 + Math.sin((f + i * 10) / 6) * 14} -30 0 -60 t 0 -60`} stroke="#FFF3D6" strokeWidth={8} fill="none" strokeLinecap="round" opacity={0.9} />
    ))}
    {host(240, 1230, 330)}
  </g>
);

/** 달 위: 회색 달 표면에 접시가 둥실, 하늘에 지구, 우주모 쓴 맛조수 */
const Moon: React.FC<Ctx> = ({ f, host, dish }) => {
  const bob = -Math.abs(Math.sin(f / 22)) * 46;
  return (
    <g>
      <Sky id="moon" top="#1E2A4D" bottom="#3B4A7A" />
      <Stars f={f} n={60} until={1100} />
      <g transform="translate(820 470)">
        <circle r={128} fill="#4DA3E3" {...line} />
        <path d="M -90 -40 q 40 -50 90 -20 q 20 30 -20 50 q -40 10 -70 -30 Z M 30 40 q 50 -10 70 30 q -20 40 -60 30 Z" fill="#6CC27A" stroke={INK} strokeWidth={5} />
      </g>
      <path d="M -40 1060 Q 300 960 640 1030 T 1120 1000 L 1120 1920 L -40 1920 Z" fill="#D8D3C6" {...line} />
      {[
        [180, 1180, 70],
        [760, 1150, 50],
        [470, 1300, 90],
        [930, 1290, 44],
      ].map(([cx, cy, r], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={r} ry={r! * 0.32} fill="#BDB6A6" stroke={INK} strokeWidth={5} />
      ))}
      {/* 깃발 */}
      <line x1={920} y1={1030} x2={920} y2={860} stroke={INK} strokeWidth={9} strokeLinecap="round" />
      <path d={`M 920 866 q 60 ${-10 + Math.sin(f / 10) * 4} 110 6 l 0 64 q -50 -14 -110 -6 Z`} fill={COLORS.red} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      <ellipse cx={640} cy={1152} rx={150 + bob * 0.8} ry={20} fill="rgba(0,0,0,0.18)" />
      <g transform={`translate(0 ${bob})`}>{dish(640, 1110, 0.95, Math.sin(f / 30) * 6)}</g>
      {host(
        240,
        1240,
        320,
        <>
          <circle cx={200} cy={225} r={232} fill="rgba(190,230,255,0.22)" stroke={INK} strokeWidth={9} />
          <path d="M 70 150 A 180 180 0 0 1 170 40" stroke={COLORS.white} strokeWidth={14} fill="none" strokeLinecap="round" opacity={0.8} />
        </>,
      )}
    </g>
  );
};

/** 로켓 타고 우주로: 동그란 창에 접시를 태운 로켓이 위로 */
const Rocket: React.FC<Ctx> = ({ f, p, host, food }) => {
  const up = lift(p);
  const y = 980 - up * 560;
  const shake = up > 0 && up < 1 ? Math.sin(f * 1.7) * 3 : 0;
  return (
    <g>
      <Sky id="rocket" top="#24315C" bottom="#9CCDF2" />
      <Stars f={f} n={30} until={600} salt={3} />
      <Cloud x={160} y={520} s={0.8} />
      <path d="M -40 1180 Q 300 1110 700 1170 T 1120 1150 L 1120 1920 L -40 1920 Z" fill="#7CC07A" {...line} />
      {/* 발사대 */}
      <path d="M 560 1190 L 600 1100 L 820 1100 L 860 1190 Z" fill="#9AA3B5" {...line} />
      {/* 연기 */}
      {[0, 1, 2, 3].map((i) => (
        <Cloud key={i} x={600 + i * 70 - 40} y={1150 - up * 20 * i} s={0.35 + up * 0.25} fill="#F2EEE8" />
      ))}
      <g transform={`translate(${710 + shake} ${y})`}>
        {/* 불꽃 */}
        <path d={`M -46 150 Q 0 ${290 + Math.sin(f) * 30} 46 150 Z`} fill="#FFB02E" {...line} />
        <path d={`M -24 150 Q 0 ${230 + Math.sin(f * 1.3) * 20} 24 150 Z`} fill="#FFE07A" />
        {/* 날개 */}
        <path d="M -80 60 L -150 170 L -80 150 Z M 80 60 L 150 170 L 80 150 Z" fill={COLORS.red} {...line} />
        {/* 몸통 */}
        <path d="M -80 160 L -80 -120 Q -80 -250 0 -330 Q 80 -250 80 -120 L 80 160 Z" fill={COLORS.white} {...line} />
        <path d="M -62 -190 Q 0 -230 62 -190 Q 40 -280 0 -322 Q -40 -280 -62 -190 Z" fill={COLORS.red} stroke={INK} strokeWidth={6} />
        <rect x={-80} y={120} width={160} height={40} fill={COLORS.navy} stroke={INK} strokeWidth={6} />
        {/* 동그란 창: 안에 접시 */}
        <defs>
          <clipPath id="rocket-window">
            <circle cx={0} cy={-40} r={70} />
          </clipPath>
        </defs>
        <circle cx={0} cy={-40} r={70} fill="#CFEAFF" />
        <g clipPath="url(#rocket-window)">
          <Dish2D food={food} x={0} y={-22} scale={0.46} frame={f} steam={false} shadow={false} />
        </g>
        <circle cx={0} cy={-40} r={70} fill="none" stroke={INK} strokeWidth={12} />
        <circle cx={0} cy={-40} r={78} fill="none" stroke="#9AA3B5" strokeWidth={6} />
      </g>
      {host(220, 1250, 300)}
    </g>
  );
};

/** 집채만 한 선풍기: 날개가 돌고 바람 줄이 접시를 지나간다 */
const GiantFan: React.FC<Ctx> = ({ f, host, dish }) => (
  <g>
    <Sky id="fan" top="#A9DDF5" bottom="#E8F7FF" until={1060} />
    <rect x={0} y={1040} width={1080} height={880} fill="#E7C08E" />
    <line x1={0} y1={1040} x2={1080} y2={1040} stroke={INK} strokeWidth={SW} />
    {/* 받침·기둥 */}
    <rect x={130} y={900} width={70} height={250} fill="#DCE3EC" {...line} />
    <ellipse cx={165} cy={1160} rx={190} ry={48} fill="#C9D2DE" {...line} />
    {/* 날개 */}
    <g transform={`translate(165 640) rotate(${f * 23})`}>
      {[0, 120, 240].map((a) => (
        <path key={a} d="M 0 0 C 60 -60 220 -80 290 -20 C 230 30 90 40 0 0 Z" fill="#8FD0B4" stroke={INK} strokeWidth={7} transform={`rotate(${a})`} opacity={0.92} />
      ))}
    </g>
    {/* 망 */}
    <circle cx={165} cy={640} r={340} fill="rgba(255,255,255,0.12)" stroke={INK} strokeWidth={12} />
    {[110, 200, 280].map((r) => (
      <circle key={r} cx={165} cy={640} r={r} fill="none" stroke={INK} strokeWidth={3} opacity={0.55} />
    ))}
    {Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return <line key={i} x1={165} y1={640} x2={165 + Math.cos(a) * 340} y2={640 + Math.sin(a) * 340} stroke={INK} strokeWidth={3} opacity={0.5} />;
    })}
    <circle cx={165} cy={640} r={46} fill={COLORS.red} {...line} />
    <Wind f={f} rows={[470, 620, 760, 900]} />
    {/* 작은 탁자 위 접시 (바람에 살짝 떨린다) */}
    <rect x={560} y={1010} width={300} height={30} rx={8} fill={COLORS.wood} {...line} />
    <path d="M 590 1040 L 600 1200 M 830 1040 L 820 1200" stroke={INK} strokeWidth={16} strokeLinecap="round" />
    {dish(710, 960, 0.85, Math.sin(f * 1.9) * 2)}
    {host(930, 1250, 250)}
  </g>
);

/** 거대한 그네: 접시가 그네 판에 앉아 크게 오간다 */
const GiantSwing: React.FC<Ctx> = ({ f, host, dish }) => {
  const a = swingAngle(f);
  return (
    <g>
      <Sky id="swing" top="#9FD8F7" bottom="#E6F6FF" until={1120} />
      <Cloud x={820} y={520} s={0.9} />
      <path d="M -40 1110 Q 400 1060 1120 1110 L 1120 1920 L -40 1920 Z" fill="#8CCB7E" {...line} />
      {/* 틀 */}
      <path d="M 300 1170 L 400 300 L 500 1170" fill="none" stroke={INK} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 300 1170 L 400 300 L 500 1170" fill="none" stroke="#E8553A" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 700 1170 L 800 300 L 900 1170" fill="none" stroke={INK} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 700 1170 L 800 300 L 900 1170" fill="none" stroke="#E8553A" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={360} y={286} width={480} height={34} rx={17} fill="#C2402A" {...line} />
      <g transform={`rotate(${a} 600 303)`}>
        <line x1={490} y1={303} x2={490} y2={960} stroke={INK} strokeWidth={8} />
        <line x1={710} y1={303} x2={710} y2={960} stroke={INK} strokeWidth={8} />
        <rect x={450} y={950} width={300} height={34} rx={10} fill={COLORS.wood} {...line} />
        {dish(600, 912, 0.8)}
      </g>
      {host(170, 1250, 260)}
    </g>
  );
};

/** 타워 크레인: 갈고리에 매단 접시를 높이 들어 올린다 */
const Crane: React.FC<Ctx> = ({ f, p, host, dish }) => {
  const hookY = 1010 - lift(p) * 380;
  const sway = Math.sin(f / 16) * 3;
  const yellow = '#FFC94A';
  return (
    <g>
      <Sky id="crane" top="#9FD3F2" bottom="#E8F5FD" />
      <Cloud x={260} y={560} s={0.7} />
      {/* 도시 */}
      {[
        [0, 980, 160],
        [150, 1060, 130],
        [270, 920, 150],
        [700, 1000, 140],
        [830, 900, 120],
        [940, 1040, 160],
      ].map(([x, y, w], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={1300 - y!} fill={i % 2 ? '#8EA6C8' : '#A9BCD8'} stroke={INK} strokeWidth={6} />
          {Array.from({ length: 6 }, (_, k) => (
            <rect key={k} x={x! + 22 + (k % 2) * (w! / 2 - 6)} y={y! + 30 + Math.floor(k / 2) * 70} width={30} height={36} fill="#FFF1C7" stroke={INK} strokeWidth={3} />
          ))}
        </g>
      ))}
      <rect x={0} y={1290} width={1080} height={630} fill="#C4C9D1" />
      <line x1={0} y1={1290} x2={1080} y2={1290} stroke={INK} strokeWidth={SW} />
      {/* 마스트 (격자) */}
      <rect x={860} y={370} width={70} height={930} fill={yellow} {...line} />
      {Array.from({ length: 13 }, (_, i) => (
        <path key={i} d={`M 860 ${380 + i * 70} L 930 ${450 + i * 70}`} stroke={INK} strokeWidth={4} />
      ))}
      {/* 지브 */}
      <rect x={60} y={330} width={1060} height={50} fill={yellow} {...line} />
      {Array.from({ length: 16 }, (_, i) => (
        <path key={i} d={`M ${70 + i * 66} 376 L ${103 + i * 66} 334 L ${136 + i * 66} 376`} stroke={INK} strokeWidth={4} fill="none" />
      ))}
      <rect x={830} y={250} width={130} height={90} rx={10} fill="#E8553A" {...line} />
      <rect x={850} y={268} width={50} height={40} fill="#CFEAFF" stroke={INK} strokeWidth={4} />
      {/* 도르래·줄·갈고리 */}
      <rect x={380} y={376} width={80} height={30} fill={COLORS.navy} {...line} />
      <g transform={`rotate(${sway} 420 406)`}>
        <line x1={420} y1={406} x2={420} y2={hookY - 110} stroke={INK} strokeWidth={6} />
        <path d={`M 420 ${hookY - 110} l -150 90 M 420 ${hookY - 110} l 150 90`} stroke={INK} strokeWidth={5} />
        <circle cx={420} cy={hookY - 116} r={14} fill="#9AA3B5" stroke={INK} strokeWidth={5} />
        {dish(420, hookY, 0.9, 0, false)}
      </g>
      {host(650, 1260, 260)}
    </g>
  );
};

/** 열기구: 바구니에 맛조수와 접시가 함께 타고 둥실 */
const Balloon: React.FC<Ctx> = ({ f, host, dish }) => {
  const bob = Math.sin(f / 24) * 16;
  return (
    <g>
      <Sky id="balloon" top="#8FCFF5" bottom="#EAF7FF" />
      <Cloud x={((900 - f * 1.2) % 1300) + 100} y={430} s={0.8} />
      <Cloud x={((200 - f * 0.8 + 1300) % 1300) - 100} y={1150} s={1.1} />
      {/* 아주 멀리 아래 땅 */}
      <path d="M -40 1500 Q 400 1440 1120 1500 L 1120 1920 L -40 1920 Z" fill="#9BD08C" stroke={INK} strokeWidth={6} />
      <g transform={`translate(0 ${bob})`}>
        <defs>
          <clipPath id="balloon-env">
            <path d="M 540 300 C 820 300 860 600 700 800 L 610 900 L 470 900 L 380 800 C 220 600 260 300 540 300 Z" />
          </clipPath>
        </defs>
        <g clipPath="url(#balloon-env)">
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={260 + i * 80} y={280} width={80} height={640} fill={i % 2 ? COLORS.cream : COLORS.red} />
          ))}
        </g>
        <path d="M 540 300 C 820 300 860 600 700 800 L 610 900 L 470 900 L 380 800 C 220 600 260 300 540 300 Z" fill="none" {...line} />
        <path d="M 470 900 L 400 1010 M 610 900 L 680 1010" stroke={INK} strokeWidth={6} />
        {/* 바구니 뒤판 → 맛조수·접시 → 바구니 앞판 */}
        <rect x={360} y={1000} width={360} height={30} rx={10} fill="#B07A4A" {...line} />
        {host(470, 1160, 230)}
        {dish(620, 990, 0.7, 0, false)}
        <rect x={370} y={1020} width={340} height={150} rx={16} fill="#C98B5A" {...line} />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={370} y1={1050 + i * 32} x2={710} y2={1050 + i * 32} stroke={shade('#C98B5A', -0.3)} strokeWidth={4} />
        ))}
      </g>
    </g>
  );
};

/** 산꼭대기: 눈 덮인 봉우리 위 깃발과 접시 */
const Mountain: React.FC<Ctx> = ({ f, host, dish }) => (
  <g>
    <Sky id="mountain" top="#86C7F0" bottom="#E7F5FF" />
    <path d="M -100 1300 L 150 760 L 380 1300 Z M 700 1300 L 960 700 L 1200 1300 Z" fill="#9DB3CF" {...line} />
    <path d="M 40 1500 L 540 640 L 1040 1500 Z" fill="#7F96B6" {...line} />
    <path d="M 540 640 L 1040 1500 L 700 1500 Z" fill="#6C83A3" />
    {/* 눈 모자 + 평평한 꼭대기 */}
    <path d="M 400 880 L 540 640 L 680 880 Q 640 850 610 880 Q 570 840 540 880 Q 500 845 470 880 Q 440 850 400 880 Z" fill={COLORS.white} {...line} />
    <path d="M 330 760 L 750 760 L 760 790 L 320 790 Z" fill={COLORS.white} {...line} />
    {/* 깃발 */}
    <line x1={360} y1={765} x2={360} y2={560} stroke={INK} strokeWidth={9} strokeLinecap="round" />
    <path d={`M 360 566 q 50 ${Math.sin(f / 7) * 10} 100 0 l 0 60 q -50 ${Math.sin(f / 7 + 1) * 10} -100 0 Z`} fill={COLORS.red} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
    {dish(640, 728, 0.72, 0, false)}
    {host(450, 772, 200)}
    <Cloud x={((1200 - f * 1.5) % 1500) - 100} y={1120} s={1.3} />
    <Cloud x={((500 - f * 1.1 + 1500) % 1500) - 100} y={1230} s={1.1} />
    <Wind f={f} rows={[600, 690]} speed={22} />
  </g>
);

/** 바다 위 배: 작은 배가 흔들리고 접시가 갑판에 */
const Ocean: React.FC<Ctx> = ({ f, host, dish }) => {
  const rock = Math.sin(f / 18) * 5;
  const bob = Math.sin(f / 14) * 10;
  const wave = (y: number, amp: number, phase: number, fill: string) => {
    const pts = Array.from({ length: 23 }, (_, i) => {
      const x = i * 50 - 25;
      return `${x} ${y + Math.sin(i * 0.9 + phase) * amp}`;
    });
    return <path d={`M -40 1920 L ${pts.join(' L ')} L 1120 1920 Z`} fill={fill} stroke={INK} strokeWidth={6} strokeLinejoin="round" />;
  };
  return (
    <g>
      <Sky id="ocean" top="#FFC98A" bottom="#FFF0D8" />
      <circle cx={260} cy={620} r={110} fill="#FF9E5A" {...line} />
      {[0, 1].map((i) => (
        <path key={i} d={`M ${700 + i * 120 + Math.sin(f / 20 + i) * 20} ${500 + i * 60} q 22 -22 44 0 q 22 -22 44 0`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />
      ))}
      {wave(1000, 14, f / 10, '#4F8FC4')}
      <g transform={`translate(0 ${bob}) rotate(${rock} 540 1080)`}>
        {/* 돛대·돛 */}
        <line x1={600} y1={1040} x2={600} y2={600} stroke={INK} strokeWidth={12} strokeLinecap="round" />
        <path d="M 610 620 L 610 980 L 840 980 Z" fill={COLORS.cream} {...line} />
        {host(420, 1110, 220)}
        {dish(720, 1030, 0.62, 0, false)}
        <path d="M 250 1040 L 850 1040 L 780 1160 L 320 1160 Z" fill={COLORS.red} {...line} />
        <rect x={262} y={1040} width={576} height={26} fill={COLORS.white} stroke={INK} strokeWidth={6} />
      </g>
      {wave(1140, 18, f / 8 + 1, '#3B78AE')}
      {wave(1260, 22, f / 7 + 2, '#2F6699')}
    </g>
  );
};

/** 북극 얼음 위: 눈이 내리고 펭귄 둘이 접시를 쳐다본다 */
const NorthPole: React.FC<Ctx> = ({ f, host, dish }) => {
  const penguin = (x: number, feet: number, tilt: number) => (
    <g transform={`translate(${x} ${feet}) rotate(${tilt} 0 -60)`}>
      <ellipse cx={0} cy={-90} rx={62} ry={92} fill={COLORS.navy} {...line} />
      <ellipse cx={0} cy={-76} rx={42} ry={68} fill={COLORS.white} />
      <circle cx={-16} cy={-140} r={8} fill={INK} />
      <circle cx={16} cy={-140} r={8} fill={INK} />
      <path d="M -14 -122 L 0 -104 L 14 -122 Z" fill="#FFA43A" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <ellipse cx={-26} cy={0} rx={22} ry={10} fill="#FFA43A" stroke={INK} strokeWidth={4} />
      <ellipse cx={26} cy={0} rx={22} ry={10} fill="#FFA43A" stroke={INK} strokeWidth={4} />
    </g>
  );
  return (
    <g>
      <Sky id="pole" top="#B9DDF2" bottom="#F2FAFF" />
      {/* 오로라 */}
      <path d={`M -40 520 Q 300 ${430 + Math.sin(f / 30) * 20} 600 520 T 1120 480`} stroke="#9EE6C4" strokeWidth={46} fill="none" opacity={0.55} strokeLinecap="round" />
      <path d={`M -40 610 Q 360 ${540 + Math.sin(f / 26) * 20} 700 600 T 1120 580`} stroke="#C7B4F0" strokeWidth={30} fill="none" opacity={0.45} strokeLinecap="round" />
      <rect x={0} y={1080} width={1080} height={840} fill="#3E6E9C" />
      <line x1={0} y1={1080} x2={1080} y2={1080} stroke={INK} strokeWidth={6} />
      {/* 얼음 */}
      <path d="M 20 1000 L 1060 990 L 1030 1170 L 60 1180 Z" fill="#9FD0EA" {...line} />
      <path d="M 20 1000 L 1060 990 L 1050 1040 L 30 1050 Z" fill={COLORS.white} {...line} />
      {/* 이글루 */}
      <path d="M 120 1010 A 120 120 0 0 1 360 1010 Z" fill={COLORS.white} {...line} />
      <path d="M 200 1010 A 40 44 0 0 1 280 1010 Z" fill="#6F8FB0" stroke={INK} strokeWidth={6} />
      <path d="M 140 960 h 200 M 170 915 h 140" stroke="#B8D3E6" strokeWidth={5} />
      {dish(580, 1020, 0.85, 0, false)}
      {penguin(860, 1030, Math.sin(f / 14) * 8)}
      {penguin(980, 1040, -6)}
      {host(240, 1060, 230)}
      {/* 눈송이 */}
      {Array.from({ length: 40 }, (_, i) => (
        <circle key={i} cx={(hash01(i, 30) * 1080 + Math.sin(f / 20 + i) * 20) % 1080} cy={(hash01(i, 31) * 1920 + f * (3 + hash01(i, 32) * 3)) % 1300} r={5 + hash01(i, 33) * 5} fill={COLORS.white} stroke="#9EB8CF" strokeWidth={2} />
      ))}
    </g>
  );
};

/** 텐트 캠핑: 밤, 텐트 안 침낭에 접시가 누워 잔다 (불 대신 전등) */
const Camping: React.FC<Ctx> = ({ f, host, food }) => (
  <g>
    <Sky id="camp" top="#2E3F6E" bottom="#566BA0" />
    <Stars f={f} n={50} until={900} salt={5} />
    <path d="M 860 300 a 80 80 0 1 0 60 130 a 64 64 0 1 1 -60 -130 Z" fill="#FFE7A0" {...line} />
    {/* 나무 */}
    {[60, 980].map((x, i) => (
      <path key={i} d={`M ${x} 1080 L ${x - 110} 1080 L ${x} 700 L ${x + 110} 1080 Z`} fill="#2F5E46" {...line} />
    ))}
    <rect x={0} y={1060} width={1080} height={860} fill="#4E7F55" />
    <line x1={0} y1={1060} x2={1080} y2={1060} stroke={INK} strokeWidth={SW} />
    {/* 텐트 */}
    <path d="M 300 1150 L 640 560 L 1000 1150 Z" fill="#F08A3C" {...line} />
    <path d="M 470 1150 L 640 760 L 820 1150 Z" fill="#FFE2A8" stroke={INK} strokeWidth={6} />
    <path d="M 640 560 L 640 760" stroke={INK} strokeWidth={6} />
    {/* 전등 */}
    <circle cx={640} cy={790} r={60} fill="#FFF3B0" opacity={0.5} />
    <rect x={624} y={770} width={32} height={40} rx={8} fill="#FFE070" stroke={INK} strokeWidth={5} />
    {/* 침낭 + 베개 위 접시 */}
    <rect x={520} y={1040} width={300} height={90} rx={44} fill="#5A8FD8" {...line} />
    <path d="M 640 1050 L 640 1120" stroke={INK} strokeWidth={4} strokeDasharray="10 8" />
    <Dish2D food={food} x={555} y={1000} scale={0.52} rotate={-12} frame={f} steam={false} shadow={false} />
    {/* Zzz */}
    {[0, 1, 2].map((i) => {
      const t = ((f + i * 20) % 60) / 60;
      return (
        <text key={i} x={600 + i * 34 + t * 30} y={950 - i * 46 - t * 50} fontSize={44 + i * 10} fontWeight={900} fill={COLORS.white} stroke={INK} strokeWidth={3} opacity={1 - t * 0.7} fontFamily="Pretendard, sans-serif">
          Z
        </text>
      );
    })}
    {host(180, 1240, 260)}
  </g>
);

/** 커다란 돋보기: 렌즈 속에서 접시가 크게 보인다 (렌즈 가운데를 기준으로 실제처럼 확대) */
const Magnifier: React.FC<Ctx> = ({ f, host, food }) => {
  const cx = 600 + Math.sin(f / 28) * 26;
  const cy = 1040;
  const r = 220;
  const m = 1.9;
  const room = (lensed: boolean) => (
    <g>
      <rect x={-200} y={-200} width={1480} height={1300} fill={COLORS.cream} />
      {Array.from({ length: 34 }, (_, i) => (
        <line key={`v${i}`} x1={i * 40 - 120} y1={-200} x2={i * 40 - 120} y2={1100} stroke="#F1D9B4" strokeWidth={3} />
      ))}
      {Array.from({ length: 33 }, (_, i) => (
        <line key={`h${i}`} x1={-200} y1={i * 40 - 200} x2={1280} y2={i * 40 - 200} stroke="#F1D9B4" strokeWidth={3} />
      ))}
      {!lensed && host(190, 1130, 270)}
      <rect x={-200} y={1100} width={1480} height={900} fill={COLORS.wood} />
      <line x1={-200} y1={1100} x2={1280} y2={1100} stroke={INK} strokeWidth={SW} />
      <rect x={-200} y={1100} width={1480} height={34} fill={COLORS.woodDark} />
      <Dish2D food={food} x={600} y={1080} scale={0.85} frame={f} steam={false} />
    </g>
  );
  return (
    <g>
      {room(false)}
      {/* 손잡이 */}
      <path d={`M ${cx + 160} ${cy - 160} L ${cx + 380} ${cy - 380}`} stroke={INK} strokeWidth={70} strokeLinecap="round" />
      <path d={`M ${cx + 160} ${cy - 160} L ${cx + 380} ${cy - 380}`} stroke={COLORS.red} strokeWidth={50} strokeLinecap="round" />
      <defs>
        <clipPath id="lens">
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
      </defs>
      <g clipPath="url(#lens)">
        <g transform={`translate(${cx} ${cy}) scale(${m}) translate(${-cx} ${-cy})`}>{room(true)}</g>
        <circle cx={cx} cy={cy} r={r} fill="rgba(170,220,255,0.16)" />
        <path d={`M ${cx - 160} ${cy - 50} A 170 170 0 0 1 ${cx - 50} ${cy - 160}`} stroke={COLORS.white} strokeWidth={20} fill="none" strokeLinecap="round" opacity={0.75} />
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth={34} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3B4660" strokeWidth={18} />
    </g>
  );
};

/** 롤러코스터: 접시가 맨 앞자리에 앉아 큰 언덕을 넘는다 */
const RollerCoaster: React.FC<Ctx> = ({ f, p, host, food }) => {
  const xs = Array.from({ length: 61 }, (_, i) => -60 + i * 20);
  const track = xs.map((x, i) => `${i ? 'L' : 'M'} ${x} ${coasterY(x).toFixed(1)}`).join(' ');
  const cx = coasterX(p);
  const cy = coasterY(cx);
  const ang = coasterAngle(cx);
  return (
    <g>
      <Sky id="coaster" top="#8ED2F6" bottom="#EAF8FF" />
      <Cloud x={200} y={420} s={0.8} />
      <Cloud x={880} y={560} s={0.7} />
      <rect x={0} y={1240} width={1080} height={680} fill="#8CCB7E" />
      <line x1={0} y1={1240} x2={1080} y2={1240} stroke={INK} strokeWidth={SW} />
      {/* 기둥 */}
      {xs
        .filter((_, i) => i % 3 === 0)
        .map((x) => (
          <line key={x} x1={x} y1={coasterY(x) + 10} x2={x} y2={1240} stroke={INK} strokeWidth={10} />
        ))}
      {/* 선로 */}
      <path d={track} stroke={INK} strokeWidth={30} fill="none" strokeLinejoin="round" />
      <path d={track} stroke={COLORS.red} strokeWidth={16} fill="none" strokeLinejoin="round" />
      {/* 차: 앞자리에 접시 */}
      <g transform={`translate(${cx} ${cy}) rotate(${ang})`}>
        <Dish2D food={food} x={40} y={-70} scale={0.48} frame={f} steam={false} shadow={false} />
        <path d="M -120 -60 L 120 -60 L 100 -10 L -100 -10 Z" fill={COLORS.yellow} {...line} />
        <rect x={-130} y={-74} width={20} height={40} rx={8} fill={COLORS.navy} stroke={INK} strokeWidth={5} />
        <circle cx={-70} cy={-6} r={18} fill={COLORS.navy} stroke={INK} strokeWidth={6} />
        <circle cx={70} cy={-6} r={18} fill={COLORS.navy} stroke={INK} strokeWidth={6} />
      </g>
      {host(900, 1260, 250)}
    </g>
  );
};

/** 낙하산: 접시가 낙하산에 매달려 과녁으로 천천히 내려온다 */
const Parachute: React.FC<Ctx> = ({ f, p, host, dish }) => {
  const drop = ease(p) * 260;
  const sway = Math.sin(f / 20) * 7;
  const panels = [COLORS.red, COLORS.cream, COLORS.mint, COLORS.cream, COLORS.red];
  return (
    <g>
      <Sky id="chute" top="#7EC6F2" bottom="#E4F5FF" />
      <Cloud x={180} y={((700 - f * 2.2) % 900) + 300} s={0.8} />
      <Cloud x={900} y={((1100 - f * 1.8) % 900) + 300} s={0.6} />
      <rect x={0} y={1180} width={1080} height={740} fill="#8CCB7E" />
      <line x1={0} y1={1180} x2={1080} y2={1180} stroke={INK} strokeWidth={SW} />
      {/* 과녁 */}
      {[200, 140, 80].map((r, i) => (
        <ellipse key={r} cx={480} cy={1250} rx={r} ry={r * 0.26} fill={i % 2 ? COLORS.white : COLORS.red} stroke={INK} strokeWidth={6} />
      ))}
      <g transform={`translate(0 ${drop}) rotate(${sway} 480 380)`}>
        <defs>
          <clipPath id="canopy">
            <path d="M 200 470 Q 200 230 480 230 Q 760 230 760 470 Z" />
          </clipPath>
        </defs>
        <g clipPath="url(#canopy)">
          {panels.map((c, i) => (
            <rect key={i} x={200 + i * 112} y={220} width={112} height={260} fill={c} />
          ))}
        </g>
        <path d="M 200 470 Q 200 230 480 230 Q 760 230 760 470 Q 703 440 646 470 Q 590 440 536 470 Q 480 440 424 470 Q 368 440 312 470 Q 256 440 200 470 Z" fill="none" {...line} />
        {[200, 312, 424, 536, 646, 760].map((x) => (
          <line key={x} x1={x} y1={470} x2={480 + (x - 480) * 0.35} y2={720} stroke={INK} strokeWidth={4} />
        ))}
        {dish(480, 740, 0.62, 0, false)}
      </g>
      {host(880, 1250, 250)}
    </g>
  );
};


// ───────── 글자 그대로(wordplay)용 그림 (2026-11-23) ─────────

/** 빨간 우체통: 우표 붙인 봉투에 담긴 접시가 우체통 입구로 들어간다 ('편지를 부치다') */
const Mailbox: React.FC<Ctx> = ({ f, p, host, food }) => {
  // 앞 55%: 우체통 입구 위로 날아감, 뒤: 입구로 쏙 내려가 사라짐 (입구 윗선 아래는 잘라 낸다)
  const t = ease(p / 0.55);
  const drop = ease((p - 0.55) / 0.4);
  const ex = 340 + (760 - 340) * t;
  const ey = 860 - Math.sin(t * Math.PI) * 140 - (860 - 540) * t + drop * 330;
  return (
    <g>
      <Sky id="mail" top="#A6DAF5" bottom="#EAF7FF" until={1130} />
      <Cloud x={230} y={420} s={0.8} />
      <Cloud x={860} y={330} s={0.6} />
      {/* 담장과 보도 */}
      <rect x={0} y={880} width={1080} height={260} fill="#E9C9A3" />
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1={i * 150} y1={880} x2={i * 150} y2={1130} stroke="#C9A47A" strokeWidth={5} />
      ))}
      <line x1={0} y1={880} x2={1080} y2={880} stroke={INK} strokeWidth={6} />
      <rect x={0} y={1130} width={1080} height={790} fill="#C9CDD4" />
      <line x1={0} y1={1130} x2={1080} y2={1130} stroke={INK} strokeWidth={SW} />
      {/* 우체통: 둥근 지붕, 입구, 기둥 */}
      <g transform="translate(760 0)">
        <rect x={-30} y={1060} width={60} height={90} fill="#8A2A1C" {...line} />
        <path d="M -150 1070 L -150 640 Q -150 520 0 520 Q 150 520 150 640 L 150 1070 Z" fill={COLORS.red} {...line} />
        <path d="M -150 640 Q -150 520 0 520 Q 150 520 150 640 Z" fill={COLORS.redDark} {...line} />
        <rect x={-110} y={680} width={220} height={44} rx={22} fill={INK} />
        <rect x={-96} y={688} width={192} height={10} rx={5} fill="#5A3A33" />
        {/* 앞면 띠 두 줄 (글 없이) */}
        <rect x={-150} y={800} width={300} height={22} fill={COLORS.white} stroke={INK} strokeWidth={5} />
        <rect x={-150} y={840} width={300} height={10} fill={COLORS.white} stroke={INK} strokeWidth={4} />
        <rect x={-60} y={930} width={120} height={70} rx={10} fill={COLORS.redDark} stroke={INK} strokeWidth={5} />
        <circle cx={0} cy={965} r={10} fill="#FFC94A" stroke={INK} strokeWidth={3} />
      </g>
      {/* 봉투: 입구 쪽으로 날아가 끝에 쏙 들어간다 */}
      <defs>
        <clipPath id="mail-slot">
          <rect x={0} y={0} width={1080} height={702} />
        </clipPath>
      </defs>
      <g clipPath="url(#mail-slot)">
        <g transform={`translate(${ex} ${ey}) rotate(${-8 + t * 8}) scale(0.62)`}>
          <path d="M -150 -40 L 0 -150 L 150 -40 Z" fill="#F4EBDD" {...line} />
          <rect x={-150} y={-40} width={300} height={190} rx={10} fill="#FFFDF7" {...line} />
          <Dish2D food={food} x={0} y={-30} scale={0.5} frame={f} steam={false} shadow={false} />
          <path d="M -150 -10 L 0 70 L 150 -10 L 150 150 L -150 150 Z" fill="#FFFDF7" {...line} />
          {/* 항공 우편 줄무늬 */}
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x={-142 + i * 33} y={128} width={16} height={12} fill={i % 2 ? COLORS.navy : COLORS.red} />
          ))}
          {/* 우표 (톱니 테두리, 글 없이 그림만) */}
          <g transform="translate(96 40)">
            <rect x={-34} y={-40} width={68} height={80} fill={COLORS.white} stroke={INK} strokeWidth={4} strokeDasharray="6 5" />
            <rect x={-24} y={-30} width={48} height={60} fill="#7CC6A4" />
            <circle cx={0} cy={-6} r={12} fill="#FFC94A" stroke={INK} strokeWidth={3} />
            <path d="M -24 30 L -6 10 L 6 22 L 24 4 L 24 30 Z" fill="#3E8E6E" />
          </g>
        </g>
      </g>
      {host(200, 1250, 290)}
    </g>
  );
};

/** 커다란 부채: 맛조수 옆의 접이 부채가 오가며 접시 쪽으로 바람을 보낸다 ('부채를 부치다') */
const HandFan: React.FC<Ctx> = ({ f, host, dish }) => {
  const swing = Math.sin((2 * Math.PI * f) / 36) * 16 * clamp01(f / 12);
  const ribs = 13;
  const r = 330;
  const at = (k: number, rad: number): [number, number] => {
    const a = ((-150 + (120 * k) / (ribs - 1)) * Math.PI) / 180;
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  };
  const arc = (rad: number) =>
    Array.from({ length: ribs }, (_, k) => at(k, rad))
      .map(([x, y], k) => `${k ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
  const [bx, by] = at(3, r * 0.6);
  const [mx, my] = at(6, r * 0.82);
  const [tx, ty] = at(10, r * 0.88);
  return (
    <g>
      {/* 방: 창살 벽과 마루 */}
      <rect x={0} y={0} width={1080} height={1080} fill={COLORS.cream} />
      {Array.from({ length: 7 }, (_, i) => (
        <line key={`v${i}`} x1={60 + i * 160} y1={240} x2={60 + i * 160} y2={1060} stroke="#E8CFA8" strokeWidth={6} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={260 + i * 160} x2={1080} y2={260 + i * 160} stroke="#E8CFA8" strokeWidth={6} />
      ))}
      <rect x={0} y={1060} width={1080} height={860} fill={COLORS.wood} />
      <line x1={0} y1={1060} x2={1080} y2={1060} stroke={INK} strokeWidth={SW} />
      {Array.from({ length: 6 }, (_, i) => (
        <line key={i} x1={0} y1={1120 + i * 70} x2={1080} y2={1120 + i * 70} stroke={COLORS.woodDark} strokeWidth={4} />
      ))}
      {/* 낮은 소반 위 접시 */}
      <path d="M 560 1066 L 580 1180 M 880 1066 L 860 1180" stroke={INK} strokeWidth={18} strokeLinecap="round" />
      <ellipse cx={720} cy={1050} rx={230} ry={46} fill="#B5743F" {...line} />
      {dish(720, 1000, 0.85, Math.sin(f / 5) * 1.5)}
      <Wind f={f} rows={[760, 850, 930]} speed={24} color="#7FBCE0" />
      {host(200, 1250, 290)}
      {/* 부채: 사북(손잡이 끝)을 축으로 오간다 */}
      <g transform={`translate(400 1000) rotate(${swing})`}>
        <path d={`M 0 0 ${arc(r).replace('M', 'L')} Z`} fill="#FFF1C9" {...line} />
        {/* 그림: 매화 가지 (글 없이) */}
        <path d={`M ${bx} ${by} Q ${mx} ${my} ${tx} ${ty}`} stroke="#6B4A3A" strokeWidth={8} fill="none" strokeLinecap="round" />
        {[4, 6, 8, 10].map((k) => {
          const [x, y] = at(k, r * (0.7 + (k % 3) * 0.08));
          return <circle key={k} cx={x} cy={y} r={14} fill="#F49AB0" stroke={INK} strokeWidth={3} />;
        })}
        {Array.from({ length: ribs }, (_, k) => {
          const [x, y] = at(k, r);
          return <line key={k} x1={0} y1={0} x2={x} y2={y} stroke="#B98A55" strokeWidth={k === 0 || k === ribs - 1 ? 8 : 3} />;
        })}
        <path d={arc(r)} fill="none" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        <path d={arc(r * 0.42)} fill="none" stroke="#B98A55" strokeWidth={5} />
        <circle cx={0} cy={0} r={14} fill="#B98A55" stroke={INK} strokeWidth={5} />
      </g>
    </g>
  );
};

/** 이불 덮고 재우기: 밤, 작은 침대에서 접시가 베개를 베고 이불을 덮고 잔다 ('재우다') */
const Bedtime: React.FC<Ctx> = ({ f, host, food }) => (
  <g>
    {/* 밤 방: 벽지와 창 */}
    <rect x={0} y={0} width={1080} height={1100} fill="#33406B" />
    {Array.from({ length: 30 }, (_, i) => (
      <circle key={i} cx={(i % 6) * 190 + 60 + (Math.floor(i / 6) % 2) * 95} cy={300 + Math.floor(i / 6) * 160} r={6} fill="#4A5888" />
    ))}
    <g transform="translate(700 470)">
      <rect x={-190} y={-170} width={380} height={300} rx={18} fill="#1B2547" {...line} />
      <g transform="translate(-190 -170) scale(0.35 0.28)">
        <Stars f={f} n={14} until={1000} salt={9} />
      </g>
      <path d="M 70 -120 a 60 60 0 1 0 44 98 a 48 48 0 1 1 -44 -98 Z" fill="#FFE7A0" stroke={INK} strokeWidth={5} />
      <line x1={0} y1={-170} x2={0} y2={130} stroke={INK} strokeWidth={8} />
      <line x1={-190} y1={-20} x2={190} y2={-20} stroke={INK} strokeWidth={8} />
      {/* 커튼 */}
      <path d="M -210 -190 Q -150 -20 -230 150 L -250 150 L -250 -190 Z" fill={COLORS.red} {...line} />
      <path d="M 210 -190 Q 150 -20 230 150 L 250 150 L 250 -190 Z" fill={COLORS.red} {...line} />
    </g>
    <rect x={0} y={1090} width={1080} height={830} fill="#8C6A54" />
    <line x1={0} y1={1090} x2={1080} y2={1090} stroke={INK} strokeWidth={SW} />
    {/* 침대: 머리판, 매트리스 */}
    <rect x={930} y={760} width={60} height={420} rx={20} fill={COLORS.wood} {...line} />
    <rect x={420} y={1000} width={540} height={110} rx={20} fill="#F6EFE4" {...line} />
    <rect x={420} y={1100} width={540} height={60} fill={COLORS.woodDark} {...line} />
    <path d="M 440 1160 L 440 1200 M 940 1160 L 940 1200" stroke={INK} strokeWidth={16} strokeLinecap="round" />
    {/* 베개 + 접시 */}
    <rect x={760} y={940} width={170} height={80} rx={36} fill={COLORS.white} {...line} />
    <Dish2D food={food} x={810} y={945} scale={0.5} rotate={-14} frame={f} steam={false} shadow={false} />
    {/* 이불 (체크 무늬) */}
    <defs>
      <clipPath id="quilt">
        <path d="M 440 960 Q 600 930 790 975 L 800 1110 L 430 1110 Z" />
      </clipPath>
    </defs>
    <g clipPath="url(#quilt)">
      <rect x={420} y={920} width={400} height={200} fill="#7CC6A4" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={`a${i}`} x={420 + i * 72} y={920} width={30} height={200} fill="#66B08F" />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <rect key={`b${i}`} x={420} y={930 + i * 52} width={400} height={18} fill={COLORS.white} opacity={0.35} />
      ))}
    </g>
    <path d="M 440 960 Q 600 930 790 975 L 800 1110 L 430 1110 Z" fill="none" {...line} />
    {/* Zzz */}
    {[0, 1, 2].map((i) => {
      const k = ((f + i * 20) % 60) / 60;
      return (
        <text key={i} x={850 + i * 34 + k * 30} y={880 - i * 46 - k * 50} fontSize={44 + i * 10} fontWeight={900} fill={COLORS.white} stroke={INK} strokeWidth={3} opacity={1 - k * 0.7} fontFamily="Pretendard, sans-serif">
          Z
        </text>
      );
    })}
    {/* 작은 스탠드 */}
    <circle cx={360} cy={990} r={90} fill="#FFF3B0" opacity={0.18} />
    <rect x={330} y={1010} width={60} height={90} fill="#C9A47A" {...line} />
    <path d="M 310 1010 L 330 940 L 390 940 L 410 1010 Z" fill="#FFE59A" {...line} />
    {host(170, 1250, 270)}
  </g>
);


const ART: Record<Gag, React.FC<Ctx>> = {
  desert: Desert,
  moon: Moon,
  rocket: Rocket,
  'giant-fan': GiantFan,
  'giant-swing': GiantSwing,
  crane: Crane,
  balloon: Balloon,
  mountain: Mountain,
  ocean: Ocean,
  'north-pole': NorthPole,
  camping: Camping,
  magnifier: Magnifier,
  'roller-coaster': RollerCoaster,
  parachute: Parachute,
  mailbox: Mailbox,
  'hand-fan': HandFan,
  bedtime: Bedtime,
};
