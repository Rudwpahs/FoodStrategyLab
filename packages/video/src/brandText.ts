import { BRAND } from '@mat-lab/recipe-core';

/**
 * 승인 상태 문구 (AGENTS.md 원칙 3). 영상·카드의 모든 '검토' 문구는 여기서만 만든다.
 * - 승인 전: '검수 전 초안' (승인 전 검수용 제작 cleanDraft면 아무 문구도 없음 — 승인 뒤에도 거짓이 되지 않게)
 * - 연구자 본인 승인: 브랜드에 고정된 연구자 이름으로만 '검토'라고 쓴다
 * - 다른 사람이 승인(가족 대리 입력 등)했거나 누가 승인했는지 모르면: 연구자 이름 없이 '조리 정보 검토'
 * 승인자의 로그인 표시 이름은 화면에 쓰지 않는다 (연구자 직함 옆에 다른 이름이 붙는 일이 없게).
 */
type ReviewState = 'researcher' | 'approved' | 'draft' | 'none';

function reviewState(reviewed: boolean, reviewer: string | undefined, cleanDraft: boolean): ReviewState {
  if (!reviewed) return cleanDraft ? 'none' : 'draft';
  return reviewer?.includes(BRAND.researcher) ? 'researcher' : 'approved';
}

/** 짧은 상태 문구 (엔딩 카드·레시피 카드·캐러셀 아래 줄) */
export function reviewNote(reviewed: boolean, reviewer?: string, cleanDraft = false): string {
  const s = reviewState(reviewed, reviewer, cleanDraft);
  if (s === 'researcher') return `${BRAND.researcherTitle} ${BRAND.researcher} 검토 완료`;
  if (s === 'approved') return '조리 정보 검토 완료';
  return s === 'draft' ? '검수 전 초안' : '';
}

/** 서명 카드 아래 문구 (조금 긴 문장) */
export function signatureNote(reviewed: boolean, reviewer?: string, cleanDraft = false): string {
  const s = reviewState(reviewed, reviewer, cleanDraft);
  if (s === 'researcher') return `이 영상의 조리 정보는 ${BRAND.researcher} 연구자가 검토했습니다`;
  if (s === 'approved') return '이 영상의 조리 정보는 검토를 마쳤습니다';
  return s === 'draft' ? '검수 전 초안' : '';
}
