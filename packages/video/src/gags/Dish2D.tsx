import type { FoodProfile } from '@mat-lab/recipe-core';
import React from 'react';
import { COLORS } from '../theme.ts';
import { hash01 } from './gagMotion.ts';

const INK = COLORS.ink;

/** 색을 어둡게/밝게 (#rrggbb, amount -1~1) */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return hex;
  const ch = (v: number) => Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch);
  return `#${((1 << 24) | (r! << 16) | (g! << 8) | b!).toString(16).slice(1)}`;
}

/**
 * 농담 그림에 나오는 2D 요리 한 접시 (3D 음식과 같은 색·종류: 전은 납작한 부침, 정과·볶음은 수북한 알갱이, 국·면·밥은 그릇).
 * (0,0)이 접시 가운데. scale 1이면 접시 폭 약 340px.
 * 분량·재료 수를 세어 보이게 그리지 않는다 (원본 분량과 다른 개수로 읽히지 않게, 건더기는 무늬처럼만).
 */
export const Dish2D: React.FC<{ food: FoodProfile; x: number; y: number; scale?: number; rotate?: number; frame: number; steam?: boolean; shadow?: boolean }> = ({
  food,
  x,
  y,
  scale = 1,
  rotate = 0,
  frame,
  steam = food.hot ?? false,
  shadow = true,
}) => {
  const c = food.cookedColor;
  const bits = food.bits.length ? food.bits : [shade(c, -0.35)];
  const bowl = food.kind === 'soup' || food.kind === 'noodles' || food.kind === 'rice';
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      {shadow && <ellipse cx={0} cy={bowl ? 92 : 46} rx={170} ry={26} fill="rgba(0,0,0,0.16)" />}
      {bowl ? <Bowl food={food} bits={bits} /> : <Plate />}
      {!bowl && <PlateFood food={food} bits={bits} />}
      {steam && <Steam frame={frame} top={bowl ? -70 : food.kind === 'pancake' ? -30 : -110} />}
    </g>
  );
};

const Plate: React.FC = () => (
  <g>
    <ellipse cx={0} cy={10} rx={172} ry={56} fill={COLORS.white} stroke={INK} strokeWidth={8} />
    <ellipse cx={0} cy={6} rx={128} ry={36} fill="none" stroke="#E9DED0" strokeWidth={5} />
  </g>
);

const PlateFood: React.FC<{ food: FoodProfile; bits: string[] }> = ({ food, bits }) => {
  const c = food.cookedColor;
  switch (food.kind) {
    case 'pancake':
      return (
        <g>
          <ellipse cx={0} cy={-4} rx={130} ry={42} fill={shade(c, -0.18)} stroke={INK} strokeWidth={7} />
          <ellipse cx={0} cy={-12} rx={120} ry={34} fill={c} />
          <ellipse cx={-34} cy={-22} rx={48} ry={10} fill={shade(c, 0.35)} opacity={0.7} />
          {Array.from({ length: 14 }, (_, i) => {
            const a = hash01(i, 1) * Math.PI * 2;
            const r = Math.sqrt(hash01(i, 2));
            return (
              <rect
                key={i}
                x={Math.cos(a) * r * 98 - 9}
                y={Math.sin(a) * r * 24 - 16}
                width={18}
                height={9}
                rx={3}
                fill={bits[i % bits.length]}
                stroke={shade(bits[i % bits.length]!, -0.45)}
                strokeWidth={2}
                transform={`rotate(${hash01(i, 3) * 80 - 40} ${Math.cos(a) * r * 98} ${Math.sin(a) * r * 24 - 12})`}
              />
            );
          })}
        </g>
      );
    case 'egg':
      return (
        <g>
          {[-62, 62].map((dx) => (
            <g key={dx}>
              <ellipse cx={dx} cy={-14} rx={58} ry={34} fill={COLORS.white} stroke={INK} strokeWidth={7} />
              <circle cx={dx + 4} cy={-18} r={22} fill="#FFB938" stroke={shade('#FFB938', -0.4)} strokeWidth={3} />
            </g>
          ))}
        </g>
      );
    case 'greens':
      return (
        <g>
          {Array.from({ length: 11 }, (_, i) => {
            const px = (hash01(i, 4) - 0.5) * 200;
            const py = -18 - hash01(i, 5) * 50 + Math.abs(px) * 0.18;
            return <ellipse key={i} cx={px} cy={py} rx={44} ry={16} fill={i % 3 ? c : shade(c, 0.2)} stroke={INK} strokeWidth={5} transform={`rotate(${hash01(i, 6) * 70 - 35} ${px} ${py})`} />;
          })}
        </g>
      );
    default: {
      // 정과·볶음·튀김·기타: 수북한 알갱이 (아래 줄부터 쌓는다)
      const rows = [
        { n: 5, y: -10, w: 230 },
        { n: 4, y: -46, w: 170 },
        { n: 3, y: -80, w: 110 },
        { n: 1, y: -108, w: 0 },
      ];
      let k = 0;
      return (
        <g>
          {rows.map((row) =>
            Array.from({ length: row.n }, (_, i) => {
              const px = row.n === 1 ? 0 : -row.w / 2 + (row.w / (row.n - 1)) * i + (hash01(k, 7) - 0.5) * 14;
              const py = row.y + (hash01(k, 8) - 0.5) * 8;
              const key = k++;
              return (
                <g key={key} transform={`rotate(${hash01(key, 9) * 50 - 25} ${px} ${py})`}>
                  <ellipse cx={px} cy={py} rx={36} ry={27} fill={c} stroke={INK} strokeWidth={6} />
                  <path d={`M ${px - 18} ${py + 2} Q ${px} ${py - 10} ${px + 16} ${py + 4}`} stroke={shade(c, -0.35)} strokeWidth={4} fill="none" strokeLinecap="round" />
                  <ellipse cx={px - 12} cy={py - 11} rx={10} ry={5} fill={shade(c, 0.55)} opacity={0.85} />
                </g>
              );
            }),
          )}
          {bits.length > 0 &&
            food.bits.length > 0 &&
            Array.from({ length: 8 }, (_, i) => <circle key={`b${i}`} cx={(hash01(i, 10) - 0.5) * 180} cy={-20 - hash01(i, 11) * 80} r={5} fill={bits[i % bits.length]} stroke={INK} strokeWidth={2} />)}
        </g>
      );
    }
  }
};

const Bowl: React.FC<{ food: FoodProfile; bits: string[] }> = ({ food, bits }) => {
  const top = food.kind === 'rice' ? food.cookedColor : (food.liquidColor ?? food.cookedColor);
  return (
    <g>
      <path d="M -150 -20 Q -146 86 0 92 Q 146 86 150 -20 Z" fill="#F7F1E8" stroke={INK} strokeWidth={8} strokeLinejoin="round" />
      <path d="M -112 52 Q 0 80 112 52" stroke={COLORS.red} strokeWidth={8} fill="none" opacity={0.7} />
      <ellipse cx={0} cy={-20} rx={150} ry={40} fill={COLORS.white} stroke={INK} strokeWidth={8} />
      {food.kind === 'rice' ? (
        <path d="M -128 -18 Q -100 -110 0 -112 Q 100 -110 128 -18 Z" fill={top} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
      ) : (
        <ellipse cx={0} cy={-18} rx={130} ry={30} fill={top} stroke={shade(top, -0.3)} strokeWidth={4} />
      )}
      {food.kind === 'noodles' &&
        [-60, -20, 20, 60].map((dx) => <path key={dx} d={`M ${dx - 30} -14 q 10 -12 20 0 t 20 0 t 20 0`} stroke={shade(food.cookedColor, -0.25)} strokeWidth={6} fill="none" strokeLinecap="round" />)}
      {food.kind !== 'rice' &&
        Array.from({ length: 7 }, (_, i) => <circle key={i} cx={(hash01(i, 12) - 0.5) * 200} cy={-18 + (hash01(i, 13) - 0.5) * 30} r={9} fill={bits[i % bits.length]} stroke={INK} strokeWidth={2} />)}
    </g>
  );
};

/** 김: 세 가닥이 위로 흔들리며 올라간다 */
const Steam: React.FC<{ frame: number; top: number }> = ({ frame, top }) => (
  <g opacity={0.8}>
    {[-50, 0, 50].map((dx, i) => {
      const rise = (frame * 1.4 + i * 22) % 60;
      const sway = Math.sin((frame + i * 17) / 9) * 8;
      const y0 = top - rise;
      return (
        <path
          key={dx}
          d={`M ${dx} ${y0} q ${14 + sway} -22 0 -44 t 0 -44`}
          stroke={COLORS.white}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
          opacity={1 - rise / 60}
        />
      );
    })}
  </g>
);
