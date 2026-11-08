/** 브랜드 고정 문구. 콘텐츠 안에 연구자 이름이 자연스럽게 들어가도록 한다. */
export const BRAND = {
  labName: '이희재의 맛 연구소',
  slogan: '요리가 쉬워지는 30초 실험실',
  researcher: '이희재',
  researcherTitle: '조리기능장',
  /** 서명 카드에 쓰는 두 번째 직함 */
  researcherRole: '조리외식경영 연구자',
  character: '맛조수',
  openingLine: '이희재의 맛 연구소에서 오늘도 실험!',
  notePhrase: '이희재 연구자의 조리 노트',
  tipPhrase: '조리기능장 이희재의 한 줄 팁',
  /** 훅이 먼저 나오는 대본에서 두 번째 장면에 쓰는 짧은 브랜드 문구 */
  shortOpening: '이희재의 맛 연구소, 오늘의 실험!',
} as const;

/**
 * SNS 게시물 설명 문구.
 * '검토한'이라는 표현은 실제 검수(승인)가 끝난 콘텐츠에만 쓴다.
 */
export function brandDescription(reviewed: boolean, reviewer?: string): string {
  if (!reviewed) return `${BRAND.researcherTitle} ${BRAND.researcher}의 요리 지식을 캐릭터 애니메이션으로 쉽게 풀어드립니다. (검수 전 초안)`;
  return `${reviewedKnowledge(reviewer)} 캐릭터 애니메이션으로 쉽게 풀어드립니다.`;
}

/** 이희재 본인이 승인했는지 (이름이 정확히 같을 때만. 가족 계정 등은 아니다) */
export function approvedByResearcher(reviewer?: string): boolean {
  return (reviewer ?? '').trim() === BRAND.researcher;
}

/** 검토한 사람 표기: 이희재 본인이면 '조리기능장 이희재', 아니면 승인한 사람의 실제 이름 (없으면 빈 문자열) */
export function reviewerCredit(reviewer?: string): string {
  return approvedByResearcher(reviewer) ? `${BRAND.researcherTitle} ${BRAND.researcher}` : (reviewer ?? '').trim();
}

/** 이름 뒤 주격 조사: 받침이 있으면 '이', 없으면 '가' */
export function subjectParticle(name: string): string {
  const c = name.charCodeAt(name.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? '이' : '가';
  return '가';
}

/**
 * 승인된 콘텐츠의 '검토' 문구 (뒤에 '…으로 풀었습니다' 등을 붙여 쓴다).
 * 이희재 본인이 승인했을 때만 '조리기능장 이희재가 검토한'. 다른 사람이면 그 사람 이름으로 쓴다.
 */
export function reviewedKnowledge(reviewer?: string): string {
  const knowledge = `${BRAND.researcherTitle} ${BRAND.researcher}의 요리 지식을`;
  if (approvedByResearcher(reviewer)) return `${BRAND.researcherTitle} ${BRAND.researcher}가 검토한 요리 지식을`;
  const name = reviewerCredit(reviewer);
  return name ? `${knowledge} ${name}${subjectParticle(name)} 검토해` : `${knowledge} 검토를 거쳐`;
}
