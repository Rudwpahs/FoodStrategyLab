import { josa } from './korean.ts';
import type { RecipeInput } from './types.ts';

/** 브랜드 고정 문구. 콘텐츠 안에 연구자 이름이 자연스럽게 들어가도록 한다. */
export const BRAND = {
  labName: '이희재의 맛 연구소',
  slogan: '요리가 쉬워지는 30초 실험실',
  researcher: '이희재',
  researcherTitle: '조리기능장',
  /** 서명 카드에 쓰는 두 번째 직함 */
  researcherRole: '조리외식경영 연구자',
  character: '맛조수',
  /**
   * 시리즈 이름 (사례: 이름이 고정된 시리즈가 알아보기 쉽다).
   * 예전 '맛조수의 실험 노트'는 실제로 실험한 것처럼 들려 바꿨다: 맛조수는 선생님 노트를 정리하는 기록 담당 AI (persona.ts lab-notes)
   */
  series: '맛조수의 기록 노트',
  notePhrase: '이희재 연구자의 조리 노트',
  tipPhrase: '조리기능장 이희재의 한 줄 팁',
  /** 맛조수가 연구자를 부르는 말. 대사에서 이름은 엔딩 서명에 한 번만 말하고, 중간에는 이렇게 부른다 (이름·직함은 화면 카드에 보인다) */
  callName: '희재 선생님',
} as const;

/**
 * 맛조수가 늘 같은 자리(첫 장면·원리·팁·엔딩)에서 하는 말. 한 문장으로 고정하지 않고 묶음에서 고른다.
 * 근거: 낯선 브랜드의 반복 문구는 빨리 닳는다 → 자리만 고정하고 문장은 돌려쓴다 (docs/research/content-strategy/persona-2026-11.md 5장).
 * 모두 맛조수 성격(기록 담당 AI, 차분한 해요체)에 맞춘다: 실수·비명·과장 반응 없음, 직접 만들거나 맛보거나 실험한 척하지 않음.
 * 분량처럼 읽히는 말("한 장", "한 쪽")은 넣지 않는다 (원본 대조에서 분량 오류로 잡힌다).
 */

/** 엔딩: 연구소 이름을 꼭 한 번 말한다 (예전 '오늘의 실험 끝! 이희재의 맛 연구소였어요.' 한 문장을 대신한다) */
export const SIGN_OFFS = [
  `오늘 기록은 여기까지예요. ${BRAND.labName}였어요.`,
  `${BRAND.labName}, 오늘 노트는 여기서 덮을게요.`,
  `다음 노트에서 또 만나요. ${BRAND.labName}였어요.`,
  `이유 하나만 기억하면 돼요. ${BRAND.labName}였어요.`,
  `오늘 정리는 여기까지, ${BRAND.labName}였어요.`,
  `다음 노트도 먼저 읽고 올게요. ${BRAND.labName}였어요.`,
  `같이 확인해 주셔서 고마워요. ${BRAND.labName}였어요.`,
  `${BRAND.labName} 기록 노트, 다음 장에서 만나요.`,
  `다음 기록도 ${BRAND.labName}에서 전할게요.`,
  `${BRAND.labName}였어요. 다음 노트도 같이 봐요.`,
  `외울 것보다 이유가 먼저예요. ${BRAND.labName}였어요.`,
  `한 가지만 챙겨 가셔도 충분해요. ${BRAND.labName}였어요.`,
  `오늘 노트 정리, ${BRAND.labName}였어요.`,
  `${BRAND.labName}에서 오늘 기록을 마칠게요.`,
] as const;

/** 원리 장면 첫머리 (카드 제목은 notePhrase). 원본 원리 문장 앞에 붙는다 */
export const NOTE_LEADS = [
  '선생님 노트를 보면요,',
  '노트에 이유가 적혀 있어요.',
  '선생님 노트에는 이렇게 적혀 있어요.',
  '이유는 선생님 노트에 있어요.',
  '노트에서 짚을 곳은 여기예요.',
  // 이름(희재 선생님)은 넣지 않는다: 문답형에서 "희재 선생님, …뭘까요?" 바로 뒤에 오면 이름이 겹친다
  '선생님 설명은 이래요.',
] as const;

/** 팁 장면 첫머리 (카드 제목은 tipPhrase). 원본 팁 문장 앞에 붙는다 */
export const TIP_LEADS = [
  '선생님 한 줄 팁이에요.',
  '노트 끝에 적힌 팁도 있어요.',
  '기억해 둘 팁이에요.',
  '오늘 저녁에 바로 쓸 팁이에요.',
  '마지막으로 팁 하나요.',
  '선생님 팁도 하나 챙겨 가세요.',
] as const;

/** 템플릿 대본의 첫 장면 (예전 '맛 연구소에서 오늘도 실험!'). 연구소 이름 전체는 엔딩에서만 말한다 */
export const OPENING_LINES = ['맛 연구소 기록 노트를 펼칠게요.', '선생님 노트부터 같이 읽어 볼게요.', '맛 연구소에서 노트 정리를 시작할게요.', '오늘 노트도 같이 확인해 봐요.'] as const;

/** 연출 엔진의 훅 다음 장면: 주제 앞에 붙는 말 (예전 '오늘의 실험!'). 주제가 "호두정과, 왜 …?"처럼 쉼표로 시작해도 읽히게 문장으로 끝낸다 */
export const TOPIC_LEADS = ['오늘의 노트예요.', '오늘 펼친 노트예요.', '오늘 정리할 노트예요.'] as const;

/** 연출 엔진의 훅 다음 장면: 훅에서 주제를 이미 말했을 때 (함께 확인하는 말투) */
export const BRIDGE_LINES = ['선생님 노트로 같이 확인해 봐요.', '노트에서 이유를 같이 찾아볼게요.', '노트를 펼쳐서 같이 볼게요.'] as const;

/** 흔한 실패를 꺼낼 때: 맛조수가 아니라 많은 사람이 겪는 일로 말한다 (맛조수는 실수하지 않는다) */
export const CASE_LEADS = ['이런 경우, 꽤 흔해요.', '흔히 겪는 일이에요.', '많은 분이 여기서 막혀요.'] as const;

/** 문자열 해시 (FNV-1a 32비트 + 마지막 비트 섞기) */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  // FNV만 쓰면 낮은 비트가 입력의 낮은 비트에만 기대어, 작은 묶음에서 레시피끼리 같은 문장이 함께 걸리기 쉽다 → 비트를 고루 섞는다
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 묶음에서 key로 하나를 고른다: 같은 key면 늘 같은 문장 */
export function pickLine<T extends string>(pool: readonly T[], key: string): T {
  return pool[hash(key) % pool.length]!;
}

export interface HostLines {
  opening: string;
  topicLead: string;
  bridge: string;
  caseLead: string;
  noteLead: string;
  tipLead: string;
  signOff: string;
}

/**
 * 이 레시피·연출에서 맛조수가 고정 자리에서 할 말. 요리 이름 + 연출(style)로 고르므로
 * 같은 레시피를 다시 만들면 같은 문장(승인한 대본과 다시 만든 대본이 어긋나지 않게), 다른 레시피는 대개 다른 문장이 된다.
 * 자리마다 고르는 열쇠가 달라 엔딩·노트·팁 문장이 서로 묶여 움직이지 않는다.
 */
export function hostLines(recipe: Pick<RecipeInput, 'dishName' | 'topic'>, style: string): HostLines {
  const base = `${(recipe.dishName || recipe.topic).trim()}|${style}`;
  const pick = <T extends string>(pool: readonly T[], slot: string) => pickLine(pool, `${base}|${slot}`);
  return {
    opening: pick(OPENING_LINES, 'opening'),
    topicLead: pick(TOPIC_LEADS, 'topic'),
    bridge: pick(BRIDGE_LINES, 'bridge'),
    caseLead: pick(CASE_LEADS, 'case'),
    noteLead: pick(NOTE_LEADS, 'note'),
    tipLead: pick(TIP_LEADS, 'tip'),
    signOff: pick(SIGN_OFFS, 'signOff'),
  };
}

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
