import { josa } from './korean.ts';

/** 브랜드 고정 문구. 콘텐츠 안에 연구자 이름이 자연스럽게 들어가도록 한다. */
export const BRAND = {
  labName: '이희재의 맛 연구소',
  slogan: '요리가 쉬워지는 30초 실험실',
  researcher: '이희재',
  researcherTitle: '조리기능장',
  /** 서명 카드에 쓰는 두 번째 직함 */
  researcherRole: '조리외식경영 연구자',
  character: '맛조수',
  /** 시리즈 이름 (사례: 이름이 고정된 시리즈가 알아보기 쉽다) */
  series: '맛조수의 실험 노트',
  /** 모든 영상의 마지막 말 (사례: 매번 같은 엔딩 인사·포즈가 계정을 기억하게 한다) */
  signOff: '오늘의 실험 끝! 이희재의 맛 연구소였어요.',
  openingLine: '이희재의 맛 연구소에서 오늘도 실험!',
  notePhrase: '이희재 연구자의 조리 노트',
  tipPhrase: '조리기능장 이희재의 한 줄 팁',
  /** 맛조수가 연구자를 부르는 말. 대사에서 이름은 엔딩 서명에 한 번만 말하고, 중간에는 이렇게 부른다 (이름·직함은 화면 카드에 보인다) */
  callName: '희재 선생님',
  /** 원리 장면 첫머리 (카드 제목은 notePhrase) */
  noteLead: '선생님 노트를 보면요,',
  /** 팁 장면 첫머리 (카드 제목은 tipPhrase) */
  tipLead: '선생님 한 줄 팁!',
} as const;

/** 영상·SNS 설명에 넣는 AI 표시 (블로그 꼬리말은 publishing의 BLOG_AI_NOTICE) */
export const AI_DISCLOSURE = 'AI 캐릭터 애니메이션이며, 음성은 AI 합성(TTS)입니다.';

/**
 * SNS 게시물 설명 문구.
 * '검토한'이라는 표현은 실제 검수(승인)가 끝난 콘텐츠에만 쓴다.
 */
export function brandDescription(reviewed: boolean): string {
  return reviewed
    ? `${josa(`${BRAND.researcherTitle} ${BRAND.researcher}`, '이/가')} 검토한 요리 지식을 캐릭터 애니메이션으로 쉽게 풀어드립니다.`
    : `${BRAND.researcherTitle} ${BRAND.researcher}의 요리 지식을 캐릭터 애니메이션으로 쉽게 풀어드립니다. (검수 전 초안)`;
}
