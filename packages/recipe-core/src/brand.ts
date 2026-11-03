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
export function brandDescription(reviewed: boolean): string {
  return reviewed
    ? `${BRAND.researcherTitle} ${BRAND.researcher}가 검토한 요리 지식을 캐릭터 애니메이션으로 쉽게 풀어드립니다.`
    : `${BRAND.researcherTitle} ${BRAND.researcher}의 요리 지식을 캐릭터 애니메이션으로 쉽게 풀어드립니다. (검수 전 초안)`;
}
