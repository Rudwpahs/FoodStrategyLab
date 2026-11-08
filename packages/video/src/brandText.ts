import { BRAND, approvedByResearcher, reviewerCredit } from '@mat-lab/recipe-core';

/** 서명 카드 아래 문구: 이희재 본인이 승인했을 때만 '이희재 연구자가 검토'라고 쓰고, 아니면 승인한 사람 이름을 쓴다 */
export function signatureNote(reviewed: boolean, reviewer?: string, cleanDraft = false): string {
  if (!reviewed) return cleanDraft ? '' : '검수 전 초안';
  if (approvedByResearcher(reviewer)) return `이 영상의 조리 정보는 ${BRAND.researcher} 연구자가 검토했습니다`;
  const name = reviewerCredit(reviewer);
  return name ? `조리 정보 검토: ${name}` : '조리 정보 검토 완료';
}

/** 마지막 장면·레시피 카드의 짧은 검토 표시: '조리기능장 이희재 검토 완료' 또는 '○○ 검토 완료' */
export function reviewBadge(reviewer?: string): string {
  const name = reviewerCredit(reviewer);
  return name ? `${name} 검토 완료` : '검토 완료';
}
