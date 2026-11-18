import React from 'react';
import { Easing, interpolate } from 'remotion';
import { captionGroups } from '../timeline.ts';
import { layoutCaption, pickHighlights, type CaptionKeywords } from '../captionStyle.ts';
import { CAPTION_HEIGHT } from '../three/captionPlacement.ts';
import { CAPTION_SAFE_BOTTOM, COLORS, FONT_FAMILY, VIDEO } from '../theme.ts';

/**
 * 숏폼 자막: 1~3어절씩 톡 튀어나오는 굵은 글자 (흰 글자 + 두꺼운 진한 테두리 + 그림자).
 * 묶음마다 중요한 낱말(숫자·단위, 요리·재료 이름, 맛·식감 말)은 브랜드 노란색으로 강조한다.
 * 인스타·쇼츠 앱 UI가 가리는 위 220px·아래 420px과 오른쪽 버튼 줄을 피해 CAPTION_SAFE_BOTTOM 위, 가운데 900px 안에 놓는다.
 */

/**
 * 화자별 색 (PDF 규칙: 주인공은 흰 글자+노란 강조, 두 번째 화자는 주황 글자+흰 강조).
 * 맛조수 대사는 흰색, 이희재 연구자의 지식(조리 노트·한 줄 팁)을 전하는 문장은 주황색.
 */
export type CaptionVoice = 'character' | 'researcher';
const PALETTE: Record<CaptionVoice, { base: string; hi: string }> = {
  character: { base: COLORS.white, hi: '#FFD23F' },
  researcher: { base: '#FFAE45', hi: COLORS.white },
};

/** 글자 크기(px): 보통 / 강조(훅 장면, 팁·실수 장면의 마지막 묶음) */
const SIZE = 96;
const BIG_SIZE = 108;
const LINE_HEIGHT = 1.1;
/** 테두리 두께 (글자 크기 대비, 절반이 글자 바깥으로 나간다) */
const STROKE_EM = 0.2;
/** 튀어나올 때 가장 커지는 배율 */
const POP_SCALE = 1.06;
/** 한 줄 최대 폭: 양옆 90px을 비워 오른쪽 버튼 줄(좋아요·댓글)과 화면 끝을 피한다 */
const MAX_WIDTH = 900;

export interface CaptionProps {
  line: string;
  frame: number;
  speechFrames: number;
  /** 팁·실수 장면: 마지막 묶음을 크게 */
  punch?: boolean;
  /** 훅(첫 장면): 모든 묶음을 크게 */
  hook?: boolean;
  /** 실제 음성에서 잰 어절별 [시작, 끝] 프레임 */
  words?: [number, number][];
  voice?: CaptionVoice;
  /** 강조 낱말을 고를 레시피 이름들 (captionKeywords). 없으면 숫자·맛 말만 강조 */
  keywords?: CaptionKeywords;
  /** 자막 아랫변의 y 좌표 (얼굴을 피해 옮길 때). 기본은 안전 영역 맨 아래 */
  bottomY?: number;
}

const NO_KEYWORDS: CaptionKeywords = { dish: [], ingredients: [] };

export const Captions: React.FC<CaptionProps> = ({ line, frame, speechFrames, punch, hook, words, voice = 'character', keywords = NO_KEYWORDS, bottomY = CAPTION_SAFE_BOTTOM }) => {
  const groups = captionGroups(line, speechFrames, words);
  const colors = PALETTE[voice];
  const active = groups.find((g) => frame >= g.from && frame < g.to) ?? (frame >= speechFrames ? groups.at(-1) : groups[0]);
  if (!active) return null;
  const local = frame - active.from;
  const isLast = active === groups.at(-1);
  const big = Boolean(hook) || (Boolean(punch) && isLast);
  const texts = active.words.map((w) => w.text);
  const highlight = pickHighlights(texts, keywords);
  const layout = layoutCaption(texts, { size: big ? BIG_SIZE : SIZE, maxWidth: MAX_WIDTH, maxHeight: CAPTION_HEIGHT, lineHeight: LINE_HEIGHT, strokeEm: STROKE_EM, popScale: POP_SCALE });
  const size = layout.fontSize;
  // 톡 튀어나오기: 작게 → 살짝 크게 → 제자리 (5프레임). 투명하게 시작하지 않아 묶음이 바뀔 때 깜빡이지 않는다
  const scale = interpolate(local, [0, 3, 6], [0.72, POP_SCALE, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) });
  // 강조 문장(팁·실수의 마지막)은 처음에 살짝 흔들린다
  const wobble = punch && isLast ? Math.sin(local / 2.2) * Math.max(0, 1 - local / 14) * 3 : 0;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: VIDEO.height - Math.min(CAPTION_SAFE_BOTTOM, bottomY), display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          transform: `scale(${scale}) rotate(${wobble}deg)`,
          transformOrigin: '50% 100%',
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: size,
          lineHeight: LINE_HEIGHT,
          letterSpacing: '-0.02em',
          textAlign: 'center',
          WebkitTextStroke: `${Math.round(size * STROKE_EM)}px ${COLORS.ink}`,
          paintOrder: 'stroke fill',
          // 딱 떨어지는 짙은 그림자(스티커 느낌) + 넓게 퍼지는 그림자: 어떤 배경에서도 글자가 뜬다
          filter: `drop-shadow(0 ${Math.round(size * 0.07)}px 0 rgba(30,18,14,0.9)) drop-shadow(0 ${Math.round(size * 0.12)}px ${Math.round(size * 0.22)}px rgba(0,0,0,0.45))`,
        }}
      >
        {layout.lines.map((idx, li) => (
          <div key={li} style={{ whiteSpace: 'nowrap' }}>
            {idx.map((i, k) => (
              <span key={i} style={{ color: highlight[i] ? colors.hi : colors.base }}>
                {texts[i]}
                {k < idx.length - 1 ? ' ' : ''}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
