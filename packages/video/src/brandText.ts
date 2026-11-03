import { BRAND } from '@mat-lab/recipe-core';

/** 서명 카드 아래 문구: 이희재 본인이 승인했을 때만 '이희재 연구자가 검토'라고 쓴다 */
export function signatureNote(reviewed: boolean, reviewer?: string): string {
  if (!reviewed) return '검수 전 초안';
  if (!reviewer || reviewer.includes(BRAND.researcher)) return `이 영상의 조리 정보는 ${BRAND.researcher} 연구자가 검토했습니다`;
  return `조리 정보 검토: ${reviewer}`;
}
