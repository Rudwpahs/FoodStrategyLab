import { BRAND } from './brand.ts';
import { extractQuantities, recipeText } from './fidelity.ts';
import { firstSentence, splitSentences } from './format.ts';
import { causeEffect, compactLength, findSensory, josa, spoken } from './korean.ts';
import type { Category, Emotion, RecipeInput, Scene, SceneType, Visual } from './types.ts';

/**
 * 훅(첫 장면) 유형 15종.
 * 근거와 사례는 docs/research/content-strategy/hook-library.md 에 정리했다.
 */
export const HOOK_TYPES = [
  'question',
  'result-first',
  'mistake',
  'myth',
  'compare',
  'curiosity-gap',
  'problem-solve',
  'experiment',
  'skit',
  'surprising-fact',
  'sensory',
  'time-saver',
  'story',
  'expert-view',
  'twist',
] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export interface HookInfo {
  label: string;
  /** 시청자의 어떤 관심을 건드리는가 */
  interest: string;
  /** 잘 맞는 소재 */
  fits: string;
  /** 맞지 않는 상황 */
  avoid: string;
  /** 첫 화면 구성 */
  firstScreen: string;
  /** 첫 문장 작성법 */
  firstLine: string;
  /** 어울리는 편집 */
  editing: string;
  /** 정확성 주의점 */
  accuracy: string;
  /** 맛조수 적용법 */
  mascot: string;
}

export const HOOK_INFO: Record<HookType, HookInfo> = {
  question: {
    label: '질문형',
    interest: '이유를 알고 싶은 마음',
    fits: '조리 과정에 "왜?"가 있는 단계(데치기, 휴지, 온도)',
    avoid: '답이 너무 뻔하거나 원리 설명이 없는 레시피',
    firstScreen: '팬 속 음식 클로즈업 + 질문 카드 (첫 화면에 음식이 보이게)',
    firstLine: '질문 하나만, 짧게. 답은 뒤에서',
    editing: '질문 직후 바로 조리 장면으로 넘어가 답을 찾아가는 구조',
    accuracy: '답(원리)이 원본에 있어야 한다',
    mascot: '시청자 대신 묻는 역할 그대로',
  },
  'result-first': {
    label: '결과 선공개형',
    interest: '"저걸 나도 만들 수 있을까"라는 기대',
    fits: '완성 모습이 예쁘거나 식감이 눈에 보이는 음식',
    avoid: '완성 모습이 평범하거나 사진·모델이 실제와 다를 때',
    firstScreen: '완성 접시 클로즈업, 맛조수는 화면 밖 또는 작게',
    firstLine: '완성 음식을 가리키는 한 문장',
    editing: '완성 → 처음으로 되감기 → 과정',
    accuracy: '화면 속 완성 모습이 실제 레시피 결과와 비슷해야 한다',
    mascot: '접시를 들고 자랑하거나, 맛보려다 멈춤',
  },
  mistake: {
    label: '실수 경고형',
    interest: '"나도 저렇게 하는데?" 하는 걱정',
    fits: '연구자가 실제로 자주 보는 실수가 있는 레시피',
    avoid: '흔한 실수가 확인되지 않았을 때 (만들어 내지 않는다)',
    firstScreen: '실패한 결과 + 맛조수 당황',
    firstLine: '"잠깐!" + 실수 한 문장',
    editing: '실패 → 원인 → 바른 방법 순서, 실패와 성공을 나란히',
    accuracy: '실수 내용은 연구자가 입력한 것만 쓴다',
    mascot: '맛조수가 대신 실수해서 시청자가 민망하지 않게',
  },
  myth: {
    label: '오해 반박형',
    interest: '내가 알던 게 틀렸을지 모른다는 궁금증',
    fits: '사람들이 흔히 잘못 아는 조리 상식이 있을 때',
    avoid: '근거가 연구자 경험뿐인데 "과학적으로 틀렸다"고 단정할 때',
    firstScreen: '흔한 믿음을 적은 카드 + 맛조수 의심 표정',
    firstLine: '"이렇게 알고 계셨죠?"',
    editing: '믿음 → 멈춤 → 바른 설명',
    accuracy: '반박 근거가 원본에 있어야 하고, 단정 표현을 피한다',
    mascot: '맛조수도 그렇게 알고 있었다는 설정',
  },
  compare: {
    label: '비교형',
    interest: '두 결과가 얼마나 다른지 보고 싶은 마음',
    fits: '한 단계를 하고 안 하고의 차이가 원리로 설명되는 레시피',
    avoid: '실제 차이를 촬영하지 않았는데 결과처럼 보여 줄 때',
    firstScreen: '좌우 분할 비교 + "설명용 연출" 표시',
    firstLine: '"이거 하면 뭐가 달라질까요?"',
    editing: '좌우 분할, 차이가 나는 부분 확대',
    accuracy: '그림 비교는 설명용임을 화면에 표시한다',
    mascot: '두 접시 사이에서 고민하는 맛조수',
  },
  'curiosity-gap': {
    label: '호기심 공백형',
    interest: '숨겨진 답을 끝까지 확인하고 싶은 마음',
    fits: '결정적인 한 단계가 있는 레시피',
    avoid: '답을 끝까지 안 주거나, 낚시처럼 과장할 때',
    firstScreen: '단계 카드 일부를 가린 화면',
    firstLine: '"이 단계에 비밀이 있대요"',
    editing: '중간에 힌트, 마지막 전에 공개',
    accuracy: '공개하는 답이 실제로 핵심 원리여야 한다',
    mascot: '연구자에게 들은 비밀을 전하는 조수',
  },
  'problem-solve': {
    label: '문제 해결형',
    interest: '내가 겪은 실패를 해결하고 싶은 마음',
    fits: '실패 경험이 많은 음식',
    avoid: '해결법이 원본에 없을 때',
    firstScreen: '실패 결과 + "해결" 표시',
    firstLine: '문제 한 문장 + "해결법 알려 드릴게요"',
    editing: '문제 → 원인 → 해결 → 확인',
    accuracy: '문제와 해결 모두 원본·연구자 입력에서',
    mascot: '해결법을 연구자 노트에서 찾아오는 조수',
  },
  experiment: {
    label: '실험형',
    interest: '직접 확인하는 과정을 보고 싶은 마음',
    fits: '조리 과학 원리가 분명한 레시피',
    avoid: '실제 실험 없이 "실험 결과"라고 말할 때',
    firstScreen: '두 조건을 나란히 놓은 실험대',
    firstLine: '"그림으로 비교해 볼게요"',
    editing: '조건 소개 → 과정 → 결과 공개 → 원리',
    accuracy: '실제 실험 영상이 없으면 "설명용"으로 표시한다',
    mascot: '실험 조수 역할 그대로',
  },
  skit: {
    label: '상황극형',
    interest: '캐릭터의 실수와 반응을 보는 재미',
    fits: '맛조수의 성격을 보여 주고 싶은 회차',
    avoid: '실수 장면이 실제 조리 실패 원인과 다를 때',
    firstScreen: '맛조수가 실패한 음식을 들고 당황',
    firstLine: '"으악!" 같은 감탄 + 상황',
    editing: '반응 클로즈업, 짧은 정적, 해결 후 반전',
    accuracy: '실패 원인은 원리 설명과 맞아야 한다',
    mascot: '덜렁대지만 배우는 조수',
  },
  'surprising-fact': {
    label: '놀라운 사실형',
    interest: '예상과 다른 정보',
    fits: '숫자(온도·시간)나 의외의 원리가 있는 레시피',
    avoid: '사실이 길어서 첫 문장이 늘어질 때',
    firstScreen: '숫자나 핵심어를 크게 보여 주는 카드',
    firstLine: '"알고 계셨나요?" + 원리 한 문장',
    editing: '핵심어 강조 자막, 바로 근거 장면',
    accuracy: '원리 문장을 그대로 쓴다',
    mascot: '놀라서 연구자 노트를 다시 보는 조수',
  },
  sensory: {
    label: '감각 자극형',
    interest: '맛·식감을 상상하게 만드는 자극',
    fits: '식감 표현(바삭, 쫀득)이 원본에 있는 음식',
    avoid: '실제 조리 소리·영상이 없는데 소리를 강조할 때',
    firstScreen: '음식 클로즈업, 말은 최소',
    firstLine: '식감 단어 하나로 시작',
    editing: '느린 확대, 대사 적게',
    accuracy: '식감 표현은 원본 문장에 있는 것만',
    mascot: '맛보고 감탄하는 표정',
  },
  'time-saver': {
    label: '시간·편의형',
    interest: '시간과 수고를 줄이고 싶은 마음',
    fits: '조리 시간·보관 팁이 있는 레시피',
    avoid: '시간 정보가 없을 때',
    firstScreen: '시계·보관 용기 카드',
    firstLine: '"바쁜 날엔 이렇게!"',
    editing: '빠른 단계 넘김, 결과 확인',
    accuracy: '시간·분량은 원본 그대로',
    mascot: '바쁜 척 뛰어다니는 조수',
  },
  story: {
    label: '스토리형',
    interest: '음식에 얽힌 이야기',
    fits: '전통 음식, 연구자의 실제 경험담',
    avoid: '이야기가 확인되지 않았을 때 (지어내지 않는다)',
    firstScreen: '완성 음식 + 이야기 카드',
    firstLine: '이야기의 첫 문장',
    editing: '이야기 → 원리 → 과정',
    accuracy: '이야기는 연구자가 입력한 것만',
    mascot: '이야기를 듣고 신기해하는 조수',
  },
  'expert-view': {
    label: '전문가 관점형',
    interest: '전문가만 아는 포인트',
    fits: '연구자의 팁·원리가 분명한 레시피',
    avoid: '매 회 같은 자기소개로 반복될 때',
    firstScreen: '"조리기능장의 포인트" 카드 + 조리 장면',
    firstLine: '"조리기능장이 꼭 짚는 한 가지"',
    editing: '포인트 카드 → 해당 장면 확대',
    accuracy: '연구자가 실제로 말한 내용만',
    mascot: '연구자 말을 전하는 조수 (지식의 주인은 연구자)',
  },
  twist: {
    label: '반전형',
    interest: '예상이 뒤집히는 재미',
    fits: '흔한 오해가 있는 레시피',
    avoid: '반전 근거가 없을 때',
    firstScreen: '맛조수가 확신하는 표정',
    firstLine: '"~라고 생각했죠?"',
    editing: '확신 → 정적 → 반전 공개',
    accuracy: '반전 내용이 원본·연구자 입력에 있어야 한다',
    mascot: '자신만만하다가 깜짝 놀라는 조수',
  },
};

export interface HookCandidate {
  type: HookType;
  label: string;
  /** 이 레시피로 만들 수 있는지 */
  available: boolean;
  /** 만들 수 없을 때 필요한 자료 */
  missing?: string;
  /** 첫 대사 */
  line: string;
  /** 첫 화면 설명 (사람이 읽는 글) */
  firstScreen: string;
  /** 대본 맨 앞에 들어갈 장면들 */
  scenes: Omit<Scene, 'id'>[];
  /** 추천 이유 */
  reason: string;
  score: number;
  /** 연구자가 꼭 확인할 점 */
  needsReview: string[];
  /** 쓴 원본 자료 */
  uses: string[];
}

interface Facts {
  dish: string;
  /** 꾸미는 말을 뺀 요리 이름 ("바삭한 김치전" → "김치전"): 실패 장면에서 "제 바삭한 김치전이…"처럼 앞뒤가 안 맞지 않게 */
  plainDish: string;
  topic: string;
  principle: string[];
  causeEffect: { cause: string; effect: string } | null;
  mistake: string;
  misconception: string;
  story: string;
  tip: string;
  sensory: ReturnType<typeof findSensory>;
  hasNumberInPrinciple: boolean;
  timeTip: string;
}

/** 요리 이름 앞의 꾸미는 말(바삭한, 부드러운, 잘 익은)을 뺀다. 다 빼면 원래 이름 */
export function plainDishName(dish: string): string {
  const words = dish.trim().split(/\s+/);
  let i = 0;
  while (i < words.length - 1 && /(?:한|운|은|던)$/.test(words[i]!)) i++;
  return words.slice(i).join(' ') || dish;
}

function facts(recipe: RecipeInput): Facts {
  const principle = splitSentences(recipe.principle);
  const ce = principle.map(causeEffect).find(Boolean) ?? null;
  const timeTip = recipe.tips.find((t) => /보관|미리|한 번에|나눠|냉동|냉장|간단|빠르/.test(t)) ?? '';
  return {
    dish: recipe.dishName || recipe.topic,
    plainDish: plainDishName(recipe.dishName || recipe.topic),
    topic: recipe.topic,
    principle,
    causeEffect: ce,
    mistake: recipe.commonMistake.trim(),
    misconception: (recipe.misconception ?? '').trim(),
    story: (recipe.story ?? '').trim(),
    tip: recipe.tips[0] ?? '',
    sensory: findSensory([recipe.topic, recipe.principle, ...recipe.tips].join(' ')),
    hasNumberInPrinciple: extractQuantities(recipe.principle).length > 0,
    timeTip,
  };
}

type Built = Pick<HookCandidate, 'line' | 'firstScreen' | 'scenes' | 'needsReview' | 'uses'>;
type Builder = (f: Facts) => Built | { missing: string };

const scene = (type: SceneType, emotion: Emotion, line: string, visual?: Visual, card?: { title?: string; items?: string[] }): Omit<Scene, 'id'> => ({
  type,
  emotion,
  line,
  ...(visual ? { visual } : {}),
  ...(card?.title !== undefined ? { cardTitle: card.title } : {}),
  ...(card?.items ? { cardItems: card.items } : {}),
  hook: true,
});

const COMPARE_LABELS = ['건너뛰면', '노트대로 하면'];
const ILLUSTRATION_NOTE = '위아래 비교 화면은 실제 실험 영상이 아닌 설명용 연출입니다. 화면의 "설명용 연출" 표시를 확인하세요. 실제 비교 사진·클립을 올리면 더 설득력 있어요.';

const BUILDERS: Record<HookType, Builder> = {
  question: (f) => {
    const line = /[?？]$/.test(f.topic) ? f.topic : `${f.dish}, 왜 이렇게 만들까요?`;
    return { line, firstScreen: HOOK_INFO.question.firstScreen, scenes: [scene('question', 'curious', line, 'sizzle', { title: '오늘의 질문' })], needsReview: [], uses: ['주제'] };
  },
  'result-first': (f) => {
    const s = f.sensory[0];
    const line = s ? `${s.modifier} ${f.dish}, 완성부터 보여 드릴게요!` : `완성된 ${f.dish}부터 보여 드릴게요!`;
    return {
      line,
      firstScreen: '완성 접시 클로즈업 (따뜻한 조명)',
      scenes: [scene('intro', 'joy', line, 'result', { title: f.dish })],
      needsReview: ['화면 속 완성 모습(3D 모델·사진)이 실제 완성품과 비슷한지 확인하세요.'],
      uses: s ? ['요리 이름', `원본 속 표현 "${s.stem}"`] : ['요리 이름'],
    };
  },
  mistake: (f) => {
    if (!f.mistake) return { missing: '흔한 실수 (연구자가 실제로 자주 보는 실수)' };
    // 파일럿에서 실수 문장을 통째로 말하면 약 5초 걸렸다 → 말은 짧게, 실수 내용은 카드로 (첫 3초)
    const line = `잠깐! ${f.plainDish}, 이렇게 하면 안 돼요!`;
    return { line, firstScreen: '실패한 음식 클로즈업 + 실수 내용 카드', scenes: [scene('mistake', 'embarrassed', line, 'fail-closeup', { title: firstSentence(f.mistake) })], needsReview: [], uses: ['요리 이름', '흔한 실수'] };
  },
  myth: (f) => {
    if (!f.misconception) return { missing: '흔한 오해 (사람들이 잘못 아는 점)' };
    const line = `"${firstSentence(f.misconception).replace(/[.!?。]$/, '')}" 이렇게 알고 계셨죠? 사실은 달라요!`;
    return { line, firstScreen: '팬 속 음식 + "정말일까?" 카드', scenes: [scene('question', 'curious', line, 'sizzle', { title: '정말일까?' })], needsReview: [], uses: ['흔한 오해'] };
  },
  compare: (f) => {
    if (!f.causeEffect) return { missing: '"~하면 ~합니다" 형태의 핵심 원리 문장' };
    const line = `${f.plainDish}, 이 단계 하고 안 하고 차이 보실래요?`;
    return {
      line,
      firstScreen: `좌우 분할: 건너뛴 결과 vs 노트대로 한 결과, 위에 "${f.causeEffect.cause}" 카드 (설명용 연출 표시)`,
      scenes: [scene('question', 'curious', line, 'compare', { title: f.causeEffect.cause, items: COMPARE_LABELS })],
      needsReview: [ILLUSTRATION_NOTE],
      uses: ['핵심 원리'],
    };
  },
  'curiosity-gap': (f) => {
    if (!f.causeEffect) return { missing: '"~하면 ~합니다" 형태의 핵심 원리 문장' };
    const line = `${f.plainDish}, 비밀은 딱 한 단계에 있대요!`;
    return {
      line,
      firstScreen: '조리 중 클로즈업 + 단계 카드 일부 가림',
      scenes: [scene('question', 'curious', line, 'sizzle', { title: '비밀의 한 단계' })],
      needsReview: ['"비밀이 있는 단계"가 원리 문장의 그 단계가 맞는지 확인하세요. 답은 영상 안에서 꼭 공개됩니다.'],
      uses: ['요리 이름', '핵심 원리'],
    };
  },
  'problem-solve': (f) => {
    if (!f.mistake) return { missing: '흔한 실수 또는 자주 겪는 실패' };
    // 실패 내용은 화면 카드로 보여 주고, 말은 짧게 (첫 3초)
    const line = `${f.plainDish}, 이렇게 실패했다면 해결법 있어요!`;
    return { line, firstScreen: '실패한 음식 클로즈업 + 실패 내용 카드', scenes: [scene('mistake', 'disappointed', line, 'fail-closeup', { title: firstSentence(f.mistake) })], needsReview: [], uses: ['요리 이름', '흔한 실수'] };
  },
  experiment: (f) => {
    if (!f.causeEffect) return { missing: '"~하면 ~합니다" 형태의 핵심 원리 문장' };
    // 파일럿에서 약 4초 → 말은 질문만. '설명용 연출'은 화면에 표시된다.
    // "이 단계"라고만 하면 무슨 단계인지 들리지 않으므로, 짧으면 그 단계(원리 문장의 앞부분)를 말한다
    const cause = f.causeEffect.cause;
    const line = compactLength(cause) <= 13 ? `${cause}, 뭐가 달라질까요?` : `${f.plainDish}, 이 단계 하나로 뭐가 달라질까요?`;
    return {
      line,
      firstScreen: `두 조건을 나란히 놓은 비교 화면, 위에 "${f.causeEffect.cause}" 카드 (설명용 연출 표시)`,
      scenes: [scene('question', 'curious', line, 'compare', { title: f.causeEffect.cause, items: COMPARE_LABELS })],
      needsReview: [ILLUSTRATION_NOTE],
      uses: ['핵심 원리'],
    };
  },
  skit: (f) => {
    const line = `으악! 제 ${josa(f.plainDish, '이/가')} 왜 이렇죠?`;
    return {
      line,
      firstScreen: '실패한 음식을 든 맛조수 당황',
      scenes: [scene('mistake', 'embarrassed', line, 'fail')],
      needsReview: f.mistake ? [] : ['맛조수의 실패 장면은 설명용 연출입니다. 실패 모습이 원리 설명과 맞는지 확인하세요.'],
      uses: f.mistake ? ['요리 이름', '흔한 실수'] : ['요리 이름'],
    };
  },
  'surprising-fact': (f) => {
    const pick = f.principle.find((s) => extractQuantities(s).length > 0) ?? f.principle[0];
    if (!pick) return { missing: '핵심 원리' };
    const line = `알고 계셨나요? ${spoken(pick)}`;
    return { line, firstScreen: '핵심어·숫자를 크게 보여 주는 카드', scenes: [scene('question', 'surprised', line, 'sizzle', { title: '알고 계셨나요?' })], needsReview: [], uses: ['핵심 원리'] };
  },
  sensory: (f) => {
    const s = f.sensory[0];
    if (!s) return { missing: '원본 속 식감·맛 표현 (바삭, 쫀득, 고소 등)' };
    const line = `이 ${s.modifier} ${s.kind === 'texture' ? '식감' : '맛'}, 비결이 뭘까요?`;
    return { line, firstScreen: '음식 클로즈업, 대사 최소', scenes: [scene('intro', 'joy', line, 'result')], needsReview: [], uses: [`원본 속 표현 "${s.stem}"`] };
  },
  'time-saver': (f) => {
    if (!f.timeTip) return { missing: '시간을 줄이거나 보관하는 팁' };
    const line = `바쁜 날엔 이렇게! ${spoken(firstSentence(f.timeTip))}`;
    return { line, firstScreen: '보관·준비 카드', scenes: [scene('tip', 'confident', line, 'sizzle', { title: '시간 절약 팁' })], needsReview: [], uses: ['전문가 팁'] };
  },
  story: (f) => {
    if (!f.story) return { missing: '음식 이야기·유래·연구자의 실제 경험' };
    const line = firstSentence(f.story);
    // 첫 화면 카드에는 무슨 음식 이야기인지 바로 보이게 요리 이름을 쓴다 ('맛 연구소 이야기'만으로는 알 수 없다)
    return { line, firstScreen: '완성 음식 + 이야기 카드', scenes: [scene('intro', 'curious', line, 'result', { title: `${f.dish} 이야기` })], needsReview: [], uses: ['음식 이야기'] };
  },
  'expert-view': (f) => {
    if (!f.tip && !f.causeEffect) return { missing: '전문가 팁 또는 핵심 원리' };
    const line = `${josa(BRAND.researcherTitle, '이/가')} ${f.dish}에서 꼭 짚는 한 가지, 알려 드릴게요!`;
    return {
      line,
      firstScreen: `"${BRAND.researcherTitle} ${BRAND.researcher}의 포인트" 카드 + 조리 장면`,
      scenes: [scene('question', 'confident', line, 'sizzle', { title: `${BRAND.researcherTitle} ${BRAND.researcher}의 포인트` })],
      needsReview: [],
      uses: ['요리 이름', f.tip ? '전문가 팁' : '핵심 원리'],
    };
  },
  twist: (f) => {
    if (!f.misconception) return { missing: '흔한 오해 (반전에 쓸 믿음)' };
    const line = `${firstSentence(f.misconception).replace(/[.!?。]$/, '')}, 라고 생각했죠? 반전이 있어요!`;
    return { line, firstScreen: '자신만만한 맛조수', scenes: [scene('question', 'confident', line, 'react')], needsReview: [], uses: ['흔한 오해'] };
  },
};

/** 분류별로 잘 맞는 훅 (가중치) */
const CATEGORY_AFFINITY: Record<Category, Partial<Record<HookType, number>>> = {
  science: { question: 3, experiment: 3, 'surprising-fact': 3, compare: 2, 'curiosity-gap': 2, 'expert-view': 1 },
  fix: { mistake: 3, 'problem-solve': 3, skit: 2, myth: 2, compare: 2 },
  compare: { compare: 3, experiment: 2, 'expert-view': 2, 'time-saver': 2 },
  tradition: { story: 3, 'result-first': 2, question: 2, 'curiosity-gap': 2, 'expert-view': 2 },
};

export interface HookOptions {
  /** 연출 유형이 선호하는 훅 (앞쪽일수록 강하게) */
  preferred?: readonly HookType[];
  /** 최근 만든 콘텐츠들의 연출·훅 (같은 상황 반복을 피하기 위해) */
  recent?: RecentFormat[];
}

export interface RecentFormat {
  style?: string;
  hookType?: string;
}

/**
 * 같은 연출이 반복되는지 경고한다.
 * 근거: YouTube 수익화 정책(2025-07)이 "같은 상황·같은 결과가 반복되는 캐릭터 콘텐츠"를 예로 든다.
 */
export function repetitionWarning(recent: RecentFormat[], style: string): string | null {
  const last = recent.slice(0, 3);
  if (last.length >= 3 && last.every((r) => r.style === style)) {
    return '최근 3편이 모두 같은 연출 유형이에요. 매번 같은 상황·결과가 반복되면 플랫폼이 반복 콘텐츠로 볼 수 있으니, 다른 유형도 섞어 주세요.';
  }
  return null;
}

const CATEGORY_NAME: Record<Category, string> = { science: '요리 과학', fix: '실패 해결', compare: '재료 비교', tradition: '전통조리' };

/** 한 가지 훅 후보를 만든다. */
export function hookCandidate(recipe: RecipeInput, type: HookType, opts: HookOptions = {}): HookCandidate {
  const f = facts(recipe);
  const built = BUILDERS[type](f);
  const info = HOOK_INFO[type];
  if ('missing' in built) {
    return { type, label: info.label, available: false, missing: built.missing, line: '', firstScreen: info.firstScreen, scenes: [], reason: `${built.missing}이(가) 입력되면 쓸 수 있어요.`, score: -100, needsReview: [], uses: [] };
  }
  const reasons: string[] = [];
  let score = 0;
  const cat = CATEGORY_AFFINITY[recipe.category][type] ?? 0;
  if (cat) {
    score += cat;
    reasons.push(`'${CATEGORY_NAME[recipe.category]}' 주제와 잘 맞아요`);
  }
  const pi = opts.preferred?.indexOf(type) ?? -1;
  if (pi >= 0) {
    score += Math.max(1, 3 - pi);
    reasons.push('고른 연출 유형에 어울려요');
  }
  if ((type === 'sensory' || type === 'result-first') && f.sensory.length) {
    score += 1;
    reasons.push(`원본에 "${f.sensory[0]!.stem}" 같은 식감 표현이 있어요`);
  }
  if (type === 'surprising-fact' && f.hasNumberInPrinciple) {
    score += 1;
    reasons.push('원리 문장에 숫자(온도·시간)가 있어 눈에 띄어요');
  }
  if ((type === 'mistake' || type === 'problem-solve') && f.mistake) {
    score += 1;
    reasons.push('연구자가 입력한 실제 실수가 있어요');
  }
  if ((type === 'myth' || type === 'twist') && f.misconception) {
    score += 2;
    reasons.push('연구자가 입력한 흔한 오해가 있어요');
  }
  if (type === 'story' && f.story) {
    score += 2;
    reasons.push('연구자가 입력한 이야기가 있어요');
  }
  if (type === 'time-saver') {
    score += 1;
    reasons.push('시간·보관 팁이 있어요');
  }
  if (type === 'expert-view') {
    // 관찰(가설): 직함을 앞세운 숏폼은 사례에서 약했고, 구체적인 문제를 푸는 전문가 영상은 강했다 (reels-analysis C08·C10·C14)
    score -= 0.5;
    reasons.push('직함을 앞세운 첫 문장은 사례에서 약했어요 — 이름은 팁 카드·서명으로 보여 주는 편을 추천');
  }
  if (type === 'myth' && f.misconception) {
    score += 1;
    reasons.push('"정말 그럴까?" 형 질문이 사례에서 꾸준히 강했어요(관찰)');
  }
  // Instagram 공식 권고: 첫 3초 안에 관심을 끈다 (한국어 음성 약 7자/초 기준)
  const len = compactLength(built.line);
  const secs = len / 7;
  if (secs > 6) {
    score -= 2;
    reasons.push(`첫 문장이 길어요(약 ${secs.toFixed(1)}초) — 첫 3초 안에 끝나도록 줄이면 좋아요`);
  } else if (secs > 3.6) {
    score -= 1;
    reasons.push(`첫 문장이 3초를 조금 넘어요(약 ${secs.toFixed(1)}초)`);
  }
  const recent = opts.recent ?? [];
  const repeats = recent.filter((r) => r.hookType === type).length;
  if (repeats >= 2) {
    score -= 2;
    reasons.push(`최근 ${recent.length}편 중 ${repeats}편이 같은 훅이에요 — 같은 상황이 반복되면 플랫폼이 '반복 콘텐츠'로 볼 수 있어요`);
  }
  if (built.needsReview.length) score -= 0.5;
  return { type, label: info.label, available: true, ...built, reason: reasons.join(' · ') || '기본 후보', score };
}

/** 레시피 자료로 만들 수 있는 훅 후보를 추천 순서로 돌려준다 (만들 수 없는 유형은 뒤에, 이유와 함께). */
export function suggestHooks(recipe: RecipeInput, opts: HookOptions = {}): HookCandidate[] {
  return HOOK_TYPES.map((t) => hookCandidate(recipe, t, opts)).sort((a, b) => b.score - a.score || HOOK_TYPES.indexOf(a.type) - HOOK_TYPES.indexOf(b.type));
}

/** 훅 문장에 원본에 없는 분량·시간·온도가 들어가지 않았는지 (AI 후보 검증용) */
export function hookLineIssues(recipe: RecipeInput, line: string): string[] {
  const source = new Set(extractQuantities(recipeText(recipe)).map((q) => q.normalized));
  return extractQuantities(line)
    .filter((q) => !source.has(q.normalized))
    .map((q) => `원본에 없는 분량·시간·온도 "${q.raw}"`);
}
