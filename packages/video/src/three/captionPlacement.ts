import { CAPTION_SAFE_BOTTOM } from '../theme.ts';
import type { StageState } from './KitchenScene.tsx';
import { CHEF_POS, chefFacing } from './layout.ts';
import { projectToScreen } from './stage.ts';

/**
 * 자막이 얼굴을 가리지 않게 (PDF 규칙: 얼굴은 절대 가리지 않는다).
 * 얼굴 = 맛조수 몸통 앞면의 눈썹~입. 발바닥 기준 높이로, Chef3D의 눈(EYE_Y 0.41, 반지름 약 0.056)·눈썹(약 0.5)·입(MOUTH_Y 0.335)에
 * 숨쉬기·통통 튐(±0.035)과 몸이 늘어나는 정도(약 3%)를 더한 범위다.
 */
export const FACE_SPAN = { bottom: 0.26, top: 0.58 } as const;
/** 얼굴 앞면까지의 거리 (몸통 반지름 0.285) */
const FACE_DEPTH = 0.28;
/** 자막 높이: 두 줄짜리 강조 자막(92px×1.15×2, 튀어나올 때 1.16배)까지 */
export const CAPTION_HEIGHT = 230;
/** 위쪽 카드·단계 표시가 차지하는 아랫변 */
export const CARDS_BOTTOM = 760;
/** 자막과 얼굴 사이 여백 */
const GAP = 24;

/** 화면에서 얼굴이 차지하는 세로 범위(px). 얼굴이 카메라를 보지 않거나 화면 밖이면 null */
export function faceBox(state: StageState, width: number, height: number): { top: number; bottom: number } | null {
  if (state.face !== 'camera') return null;
  const facing = chefFacing(state);
  const at = (y: number) => projectToScreen([CHEF_POS[0] + Math.sin(facing) * FACE_DEPTH, CHEF_POS[1] + y, CHEF_POS[2] + Math.cos(facing) * FACE_DEPTH], state.camera, width, height);
  const top = at(FACE_SPAN.top);
  const bottom = at(FACE_SPAN.bottom);
  if (!top.visible && !bottom.visible) return null;
  return { top: top.y, bottom: bottom.y };
}

/**
 * 자막 아랫변 y. 기본은 안전 영역 맨 아래. 얼굴과 겹치면 얼굴 위(카드 아래)로 올린다.
 * 둘 다 자리가 없으면 기본 위치 — 그런 화면이 없도록 카메라 구도(shots.ts)를 잡고 테스트로 확인한다.
 */
export function faceSafeCaptionBottom(state: StageState, width: number, height: number): number {
  const face = faceBox(state, width, height);
  if (!face) return CAPTION_SAFE_BOTTOM;
  if (face.bottom + GAP <= CAPTION_SAFE_BOTTOM - CAPTION_HEIGHT || face.top >= CAPTION_SAFE_BOTTOM) return CAPTION_SAFE_BOTTOM;
  const above = Math.min(CAPTION_SAFE_BOTTOM, face.top - GAP);
  if (above - CAPTION_HEIGHT >= CARDS_BOTTOM) return above;
  return CAPTION_SAFE_BOTTOM;
}
