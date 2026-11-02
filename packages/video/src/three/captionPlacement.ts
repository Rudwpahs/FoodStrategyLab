import type { StageState } from './KitchenScene.tsx';
import { CHEF_POS } from './layout.ts';
import { projectToScreen } from './stage.ts';

/** 자막이 놓이는 기본 아랫변 (인스타·쇼츠 아래 420px 피함) */
const SAFE_BOTTOM = 1480;
/**
 * 자막이 얼굴을 가리지 않게: 캐릭터 얼굴이 자막 자리에 오면 턱 아래나 머리 위로 옮긴다.
 * (PDF 규칙: 얼굴은 절대 가리지 않는다)
 */
const CAPTION_HEIGHT = 230;
const CARDS_BOTTOM = 760;
export function faceSafeCaptionBottom(state: StageState, width: number, height: number): number {
  if (state.face !== 'camera') return SAFE_BOTTOM;
  const top = projectToScreen([CHEF_POS[0], CHEF_POS[1] + 0.95, CHEF_POS[2]], state.camera, width, height);
  const chin = projectToScreen([CHEF_POS[0], CHEF_POS[1] + 0.2, CHEF_POS[2]], state.camera, width, height);
  if (!top.visible && !chin.visible) return SAFE_BOTTOM;
  const capTop = SAFE_BOTTOM - CAPTION_HEIGHT;
  const overlaps = chin.y > capTop && top.y < SAFE_BOTTOM;
  if (!overlaps) return SAFE_BOTTOM;
  if (chin.y + 30 + CAPTION_HEIGHT <= SAFE_BOTTOM) return chin.y + 30 + CAPTION_HEIGHT;
  if (top.y - 20 - CAPTION_HEIGHT >= CARDS_BOTTOM) return top.y - 20;
  return SAFE_BOTTOM;
}

