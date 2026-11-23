import { z } from 'zod';
import { BRAND } from '../brand.ts';
import { formatIngredient, splitSentences } from '../format.ts';
import { checkScript, type Issue } from '../fidelity.ts';
import { findHealthClaims } from '../wordLists.ts';
import { CATEGORY_LABELS, EMOTIONS, GAGS, PLACES, SCENE_TYPES, ScriptSchema, VISUALS, type Place, type RecipeInput, type Script } from '../types.ts';
import { gagFromLine, gagMenu, gagPlan } from '../gags.ts';
import {
  DOC_CUES,
  FAMILY_QUOTE,
  LETTER_FICTION,
  LETTER_REAL,
  PEOPLE_LABELS,
  WORDPLAY_TURN,
  findFakeRealStory,
  findSufferingFood,
  isHumorType,
  isLetterTitle,
  measuredIngredients,
  pickHumorType,
  wordplayWords,
} from './humor.ts';
import { DEFAULT_PERSONA, PERSONAS, SENSORY_RULE, findFakeExperience, limitLineInstruction, type PersonaId } from './persona.ts';
import { enforceSourceData } from './prompt.ts';
import { estimateScriptSeconds } from './template.ts';

/**
 * AI 이야기 대본: 레시피 하나로 형식이 서로 다른 짧은 영상 대본 몇 개를 쓴다 (서버가 Claude로 부른다).
 * 템플릿·연출 엔진 대본은 문장 틀이 정해져 있어 영상마다 대사·구성이 비슷해진다. 이야기 대본은 매번 새로 쓰되,
 * 원본 레시피의 재료·분량·순서는 그대로 지킨다 (재료·순서 카드는 enforceSourceData가 원본으로 고정, 숫자는 checkScript가 검사).
 * 시청자·형식·말투의 근거: docs/research/content-strategy/audience-story-2026-11.md
 */

/**
 * 시청 대상 (사용자 지정, 2026-11-19): 2·30대 젊은 주부, 4·50대 요리 취미·배우는 사람.
 * 관심사·말투·훅은 조사 근거로 정했다 (조사 문서 1장). 숫자(시간·가격 등)는 원본에 있을 때만.
 */
export const AUDIENCES = ['young-home', 'hobby-learner'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_INFO: Record<Audience, { label: string; short: string; cares: string; voice: string; hookIdeas: string }> = {
  'young-home': {
    label: '2·30대 젊은 주부',
    short: '2030 주부',
    // 근거: 고물가 속 집밥·냉털 콘텐츠가 2030 중심으로 인기, 제철 검색은 19~39세에서 늘었다, 저장되는 건 따라 할 수 있는 방법·비교, 인스타그램은 DM 공유가 가장 많다
    cares: '실패 없이 한 번에 되는 요령 하나, 집에 있는 재료·남은 재료 쓰기, 가족·아이 반찬과 도시락, 장보기·보관, 제철 재료, 저장해 두고 다시 볼 만한 정리',
    voice: '또래 진행자처럼 담백하게: 공감은 짧게 한마디, 바로 요점. 해요체. 호들갑·유행어·억지 농담 없이',
    hookIdeas: '실용·비교형: 결과를 바꾸는 단계 하나, 두 방법이 갈리는 지점, 남은 재료 쓰는 법, 도시락·가족 반찬에서 짚을 점',
  },
  'hobby-learner': {
    label: '4·50대 요리 취미·배우는 사람',
    short: '4050 요리 배우는 분',
    // 근거: 중장년은 전문성을 더 중시, 50세 이상 여성이 가장 많이 딴 자격증이 한식조리기능사, 중장년 여성층이 보는 경력 셰프 채널의 담백한 설명, 궁중·전통 요리 쇼츠의 반응
    cares: '왜 그렇게 하는지 원리, 조리기능장의 정석, 흔한 방법과 정석의 차이, 전통 음식·손님상·명절, 제대로 된 깊은 맛, 연구자에게 직접 듣는 답',
    voice: '차분하고 정확하게, 이유를 먼저. 어려운 말은 쉬운 말로 풀되 가르치려 들거나 어린아이에게 하듯 말하지 않는다. 해요체',
    hookIdeas: '원리·정석형: 이 단계를 먼저 하는 이유, 흔한 방법과 정석의 차이 한 가지, 예부터 그렇게 해 온 까닭(원본 이야기가 있을 때)',
  },
};

/**
 * 영상 형식 (예전 이름: 이야기 갈래). 한 번에 쓰는 대본들은 서로 다른 형식이어야 하고, 형식마다 장면 구성이 다르다.
 * 2026-11-19 사용자 지적("수사 파일·내기는 유치하다, 레파토리가 똑같다")과 조사로 추리·내기·구출·선물·시간 싸움을 뺐다.
 * 형식별 근거·맞는 시청자는 조사 문서 2장.
 */
export const STORY_TYPES = [
  'one-fix',
  'compare',
  'standard',
  'why',
  'quick',
  'occasion',
  'season',
  'leftover',
  'qa',
  'heritage',
  // 웃음 형식 (humor.ts HUMOR_TYPES, 돌려쓰기로 10편 중 3~4편만): 근거는 persona 문서 9절
  'deadpan',
  'wordplay',
  'documentary',
  'listener-story',
  'town-rules',
  'relatable',
  'vague-vs-note',
] as const;
export type StoryType = (typeof STORY_TYPES)[number];

export interface StoryTypeInfo {
  label: string;
  /** 장면 구성 (순서) */
  beats: string;
  /** 쓸 때 지킬 것 */
  guide: string;
  /** 잘 맞는 시청자 */
  fits: readonly Audience[];
}

export const STORY_TYPE_INFO: Record<StoryType, StoryTypeInfo> = {
  'one-fix': {
    label: '실패 원인 하나',
    beats: '흔히 겪는 결과(원본의 흔한 실수) → 원인 한 가지 → 선생님 노트의 원리 → 재료·조리 → 고친 결과',
    guide: '원본의 흔한 실수를 그대로 쓰고 원인은 하나만 짚는다. 맛조수가 망치는 연기나 비명 대신 "이렇게 되는 경우가 많아요"처럼 담담하게',
    fits: ['young-home', 'hobby-learner'],
  },
  compare: {
    label: '두 방법 비교',
    beats: '두 방법(또는 한 단계를 할 때·안 할 때)을 나란히 → 어디서 갈리는지 → 원리 → 원본 방법으로 조리 → 차이 한 줄 정리',
    guide: '비교 화면(visual "compare")을 쓴다. "해 봤더니", "결과가 나왔다"처럼 실제로 실험한 것처럼 말하지 말고, 원본 원리로 차이를 설명한다',
    fits: ['young-home', 'hobby-learner'],
  },
  standard: {
    label: '조리기능장의 정석',
    beats: '흔한 방법 또는 질문 → 조리기능장은 여기서 이렇게 한다(원본 팁·원리) → 이유 → 재료·조리 → 정석 한 줄 정리',
    guide: '"흔한 방법"은 원본의 흔한 실수·오해에 있을 때만 말한다. 없으면 정석 한 가지를 바로 짚는다',
    fits: ['hobby-learner'],
  },
  why: {
    label: '이 단계는 왜?',
    beats: '질문(왜 이 단계를 할까?) → 답(원리) → 그 단계 조리 장면 → 재료·나머지 순서 → 기억할 한 문장',
    guide: '원리 하나만 깊게. 어려운 말은 쉬운 말로 푼다',
    fits: ['hobby-learner', 'young-home'],
  },
  quick: {
    label: '한눈에 레시피',
    beats: '완성 모습 → 재료 → 순서를 빠른 호흡으로 → 놓치면 안 되는 포인트 하나 → 마무리',
    guide: '대사는 짧게 끊고 설명은 포인트 하나에만. 저장해 두고 따라 하기 좋게',
    fits: ['young-home'],
  },
  occasion: {
    label: '언제 내면 좋을까',
    beats: '쓰임 상황(손님상·가족 반찬·도시락·명절 등) → 그 상황에 맞는 이유(원본 근거) → 재료·조리 → 차려 낸 모습',
    guide: '상황은 시청자의 상황으로, 제안하듯 말한다("손님 오는 날이라면"). 누가 먹고 좋아했다는 지어낸 반응·후기, 원본에 없는 효능·보관 기간은 쓰지 않는다',
    fits: ['young-home', 'hobby-learner'],
  },
  season: {
    label: '제철 이야기',
    beats: '계절·제철 재료 → 이 재료를 이렇게 다루는 이유(원리) → 재료·조리 → 계절로 이어지는 마무리',
    guide: '계절·제철 정보는 원본에 있는 것만 쓴다',
    fits: ['young-home', 'hobby-learner'],
  },
  leftover: {
    label: '보관·남은 재료',
    beats: '남은 재료나 보관 고민 → 원본의 보관·손질 팁 → 재료·조리 → 다음에 쓸 때 한 줄',
    guide: '보관·손질·남은 재료 내용은 원본에 있는 것만. 보관 기간 같은 숫자는 원본 그대로만',
    fits: ['young-home'],
  },
  qa: {
    label: '선생님께 묻다',
    beats: '시청자가 할 법한 질문 하나 → 연구자 답변 원문 내용 → 그 답이 보이는 조리 장면 → 재료 → 정리',
    guide: '답은 원본 "전문가답변"에 있는 내용만 바꾸지 않고 전한다. "댓글로 받은 질문"처럼 실제로 받은 질문인 척하지 않는다',
    fits: ['hobby-learner', 'young-home'],
  },
  /**
   * 사용자 지정 (2026-11-23, 예시 영상 '엘리베이터 놓치는 사람을 위한 가이드'): 흔한 상황으로 훅 → 말도 안 되는 방법을
   * 당연하다는 듯 진지하게 늘어놓기 → "물론 농담이고" 하고 진짜 방법(원본)으로. 웃음은 부조화가 풀리는 순간에서 나온다
   * (부조화-해소 이론). 엉뚱한 부분은 누구도 믿지 않을 만큼 불가능하고 해가 없어야 한다: 그럴듯한 틀린 요리 팁은
   * 정정해도 기억에 남고(계속된 영향 효과), 위험한 장난(불·기름·칼·가스)은 따라 할 수 있어 쓰지 않는다 (해가 없어야 웃긴다, 무해한 위반 이론).
   */
  deadpan: {
    label: '진지한 엉뚱 가이드',
    beats: '누구나 겪는 흔한 상황(훅) → 말도 안 되는 방법 2~3단계(type "gag", 장면마다 그림 gag 하나)를 상식인 것처럼 담담하게, 점점 더 크게 → 농담이라고 분명히 밝히는 한 줄 → 진짜 방법(원본 원리·재료·순서) → 정리',
    guide:
      '엉뚱한 단계는 물리적으로 불가능하거나 터무니없는 일(집채만 한 도구, 엉뚱한 장소, 말도 안 되는 규모)로, 누구도 진짜로 믿지 않게. 말투는 끝까지 진지하고 태연하게 (웃기려는 티·비명·느낌표 금지). ' +
      '엉뚱한 부분에는 재료 이름·분량·시간·온도를 넣지 마. 그럴듯한 틀린 요리 팁(예: 실제로 해 볼 법한 잘못된 순서·양)도 쓰지 마. ' +
      '불·기름·뜨거운 물·칼·가스·전기·폭발·날고기 위생·아이·동물을 다치게 하는 장난은 절대 쓰지 마 (따라 할 수 있다). ' +
      '엉뚱한 단계는 type "gag"로 쓰고, 대사 내용과 맞는 그림(gag)을 장면마다 다르게 골라 (그림 목록은 시스템 지시의 gag). 엉뚱한 장면을 tip·explain으로 쓰지 마 (연구자 카드가 붙어 답이 미리 보여). ' +
      '전환 줄에서 지금까지는 농담이라고 분명히 말하고, 그 뒤는 원본 그대로 정확하게. 연구자 노트·팁(explain·tip)은 전환 줄 뒤에만.',
    fits: ['young-home', 'hobby-learner'],
  },
  heritage: {
    label: '음식 이야기',
    beats: '이 음식에 얽힌 이야기·전통 → 예부터 이렇게 한 이유(원리) → 재료·조리 → 오늘 식탁으로 이어지는 마무리',
    guide: '유래·역사·추억은 원본 "이야기"에 있는 것만. 없으면 이야기를 지어내지 말고 전통 방식의 이유(원리)만 말한다',
    fits: ['hobby-learner'],
  },
  /**
   * 아래는 2026-11-23에 더한 웃음 형식 (사용자: "엉뚱 가이드만 말고 다른 웃음도, 내가 든 것에 얽매이지 말고 정해라").
   * 지시문은 예문 대신 설명으로 쓴다 (따옴표로 든 말은 작가가 그대로 베낀다). 웃음의 정점은 진짜 정보에 붙인다:
   * 웃긴 것과 정보가 따로 놀면 웃긴 장면만 기억난다 (Schmidt 1994). "아하" 하고 풀리는 웃음만 유능함 인상을 올린다 (Hoang 외 2023, Howe 외 2023).
   */
  wordplay: {
    label: '글자 그대로',
    beats: '요리 말 하나를 꺼냄(훅) → 그 말의 다른 뜻을 글자 그대로 보여 주는 장면 1~2개(type "gag", 장면마다 그림 gag 하나) → 그 뜻이 아니라고 밝히는 전환 한 줄 → 요리에서의 진짜 뜻과 원본 원리·재료·순서 → 처음 말로 돌아가는 정리 한 줄',
    guide:
      '원본 조리순서·팁에 실제로 나오는 요리 말 하나만 고른다 (사용자 메시지의 말장난 후보 가운데서). 맛조수가 뜻을 몰라 틀리는 게 아니라, 다른 뜻을 알면서 일부러 보여 주는 말놀이다: 실수·착각·헷갈렸다는 말은 쓰지 마. ' +
      '다른 뜻 장면은 그 뜻을 그대로 그린 일(우체통으로 보내는 일, 부채로 바람을 보내는 일처럼)로 담담하게, 재료 이름·분량·시간·온도 없이. 다른 뜻 장면을 tip·explain으로 쓰지 마 (연구자 카드가 붙어 답이 미리 보여). ' +
      '전환 줄에서 그 뜻이 아니라고 분명히 말하고, 그 뒤는 원본 그대로 정확하게. 연구자 노트·팁(explain·tip)은 전환 줄 뒤에만. 말장난은 대본 하나에 낱말 하나, 진짜 뜻과 이어지지 않는 억지 말장난은 쓰지 마',
    fits: ['hobby-learner', 'young-home'],
  },
  documentary: {
    label: '부엌 다큐',
    beats: '자연 다큐 해설자처럼 낮고 느린 관찰로 시작 → 원본 순서대로 팬·냄비 속 변화를 지켜봄(보이는 색·가장자리·거품, 들리는 소리 같은 익음 신호) → 결정적 순간 하나(원본 원리) → 재료·조리 → 다큐식 마무리 한 줄',
    guide:
      '말투는 끝까지 진지하고 차분한 자연 다큐 해설: 현재형으로 지금 눈앞의 변화를 묘사하고, 문장을 짧게 끊어 여운을 둔다. 웃음은 장엄한 말투와 작은 부엌 일의 차이에서만 나오게. ' +
      '해설 내용은 원본 조리순서·원리에 있는 보이거나 들리는 신호만 (원본에 없는 색·소리·시간을 지어내지 마). 맛·향·식감은 맛조수가 느낀 것처럼 말하지 마. ' +
      '음식을 아프거나 괴로워하는 생명처럼 그리지 마 (비명·고통·희생 같은 말 금지). 지켜보는 대상은 변화이지 인물이 아니다. 조리 장면은 visual "sizzle"이 잘 맞는다',
    fits: ['hobby-learner', 'young-home'],
  },
  'listener-story': {
    label: '사연 한 통',
    beats: '사연 카드로 시작(오늘 사연 한 통) → 평범한 부엌 상황 → 작은 일이 조금씩 커짐 → 한 줄 반전(원인은 원본의 흔한 실수였다) → 맛조수의 짧고 담담한 반응 한마디 → 진짜 해결(원본 원리·재료·조리) → 사연으로 돌아가는 정리',
    guide:
      '라디오 사연처럼 태연하게 읽어 주는 형식. 사연은 둘 중 하나만: ' +
      `(가) 원본 "전문가답변"에 실제로 있는 질문·일화 — 사연 카드 cardTitle "${LETTER_REAL}", cardItems에 답변 원문 문장을 바꾸지 않고. ` +
      `(나) 그 밖에는 누가 봐도 꾸민 가상 이야기 — 사연 카드 cardTitle "${LETTER_FICTION}", 인물은 이름 없이 어느 집 정도로, 내용은 원본 "흔한실수"를 짧은 장면으로 늘린 것. ` +
      '가상 이야기를 진짜처럼 소개하지 마: 누가 보냈다, 실제로 있었던 일, 제보, 청취자, 실화 같은 말 금지. 사연 카드는 type "question" 장면 하나에만. ' +
      '사연 속 틀린 방법은 원본의 흔한 실수 하나만이고 반전 뒤 바로 바로잡는다. 불을 키우거나 기름을 붓는 행동은 따라 할 만큼 자세히 쓰지 마. 맛조수 자신의 사연·경험으로 쓰지 마. 반응은 놀라거나 비웃지 말고 담담하게. 사연 속 숫자는 원본에 있을 때만',
    fits: ['hobby-learner', 'young-home'],
  },
  'town-rules': {
    label: '이 연구소에서는',
    beats: '이 연구소의 규칙을 선언하며 시작 → 규칙 2~3개를 하나씩 담담하게 선언(규칙마다 원본 팁·순서·원리·흔한 실수 하나) → 가장 중요한 규칙(핵심) → 그 규칙의 이유 한 줄(원본 원리) → 재료·조리 → 규칙으로 맺는 정리',
    guide:
      '자기 동네의 규칙을 엄숙하게 선언하는 해외 밈을 연구소판으로: 연구소를 주어로, 여기서는 하지 않는 일과 하는 일을 짧은 평서문으로 선언한다. 단호하지만 해요체, 과장 없이. 규칙 선언에서는 연구소를 짧게만 부르고, 연구소 정식 이름은 마지막 장면의 한 번만. ' +
      '같은 첫머리를 규칙마다 되풀이해도 되지만 규칙 내용은 모두 원본 조리순서·팁·원리·흔한 실수에서 나온 것만 (지어낸 규칙·원본에 없는 숫자 금지). 규칙은 점점 중요한 쪽으로 쌓아 마지막이 핵심 규칙이 되게. 이유는 한 줄만. ' +
      '시청자를 혼내거나 겁주는 말투는 쓰지 마 (웃음은 엄숙한 형식에서, 정보는 규칙 내용에서)',
    fits: ['young-home', 'hobby-learner'],
  },
  relatable: {
    label: '이럴 때 꼭 있는 일',
    beats: '이 요리를 할 때 꼭 있는 일 목록을 예고 → 누구나 아는 부엌 상황 1~2개(짧게, 장면마다 하나) → 마지막 상황 = 원본의 흔한 실수 → 기분 탓이 아니라 이유가 있다(원본 원리) → 해결(재료·조리) → 정리',
    guide:
      '목록은 사람이 아니라 상황이다: 어떤 사람의 특징·유형으로 묶지 말고 부엌에서 생기는 일로. 앞 상황들은 원본에 없는 흔한 일이므로 사실 주장·분량·시간 없이 가볍게 (누가 먹고 반응했다는 지어낸 이야기도 금지). ' +
      '마지막 항목만 원본 흔한 실수이고, 거기서 정보로 넘어간다. 항목은 2~3개, 장면마다 하나씩 빠른 호흡으로',
    fits: ['young-home'],
  },
  'vague-vs-note': {
    label: '적당히의 나라',
    beats: '집에서 흔히 듣는 어림 말(적당히·눈대중·알아서)로 시작 → 그 말과 노트의 정확한 분량을 나란히 → 재료 카드(원본 분량 그대로) → 분량이 중요한 이유(원본 원리) → 조리 → 감은 이 분량에서 시작하면 된다는 정리',
    guide:
      '어림 말은 흔히 듣는 말로만 쓰고 특정 인물이 한 말로 지어내지 마 (가족이 했다는 인용 금지, 연구자 가족 이야기는 원본 이야기·전문가답변에 있을 때만). 그 말을 놀리지 말고 따뜻하게: 오랜 감도 결국 이런 분량에서 나온다는 쪽으로. ' +
      '분량은 원본 재료 문자열 그대로만 말하고, 원본에 분량이 비었거나 어림으로 적힌 재료는 숫자로 바꾸지 마. 맛조수는 어림하지 않고 노트의 숫자를 읽는 쪽이다',
    fits: ['young-home', 'hobby-learner'],
  },
};

/** 2026-11-19 전에 쓰던 갈래 (저장된 초안의 이름표용, 새로 쓰지 않는다) */
const LEGACY_STORY_TYPE_LABELS: Record<string, string> = {
  mystery: '추리(예전)',
  rescue: '구출 작전(예전)',
  bet: '내기(예전)',
  gift: '선물(예전)',
  myth: '오해 깨기(예전)',
  race: '시간 싸움(예전)',
  memory: '추억(예전)',
};

/** 형식 이름표 (예전 갈래도 읽을 수 있게) */
export function storyTypeLabel(type: string | undefined): string {
  if (!type) return '';
  return (STORY_TYPE_INFO as Record<string, StoryTypeInfo | undefined>)[type]?.label ?? LEGACY_STORY_TYPE_LABELS[type] ?? type;
}

/** 예전 템플릿에서 너무 자주 나와 영상이 다 똑같이 들리게 만든 말 (이야기 대본에서는 쓰지 않는다) */
export const STORY_BANNED_PHRASES = [
  '오늘의 실험',
  '준비물은 이거예요',
  '부터 보여 드릴게요',
  '대체 왜 이렇게 된 거죠',
  '오늘의 실험 끝',
  '여러분도 해 보세요',
  '꼭 따라 해 보세요',
  '안녕하세요',
] as const;

/**
 * 어른 시청자에게 유치하게 들리는 구도·말 (사용자 지적 2026-11-19, 조사 문서 1-4장).
 * 낱말 일부만 겹치는 말("꺼내기", "추려")은 걸리지 않게 앞뒤를 본다.
 */
export const CHILDISH_FRAMING: readonly { word: string; re: RegExp }[] = [
  { word: '범인', re: /범인/ },
  { word: '수사', re: /수사/ },
  { word: '사건', re: /사건/ },
  { word: '단서', re: /단서/ },
  { word: '용의자', re: /용의자/ },
  { word: '추리', re: /추리(?=[를는가도요!?.,\s]|$|해|하)/ },
  { word: '내기', re: /(^|[\s"'“‘(])내기(?=[를에는가도요!?.,\s]|$)|에 걸었/ },
  { word: '작전', re: /작전/ },
  { word: '미션', re: /미션/ },
  { word: '출동', re: /출동/ },
  { word: '으악', re: /으악/ },
  { word: '헉', re: /(^|[\s"'“‘(])헉(?=[!?.,\s]|$)/ },
  { word: '짜잔', re: /짜잔/ },
  { word: '두둥', re: /두둥/ },
];

/** 대사에 들어간 유치한 구도·말 */
export function findChildishFraming(text: string): string[] {
  return CHILDISH_FRAMING.filter((c) => c.re.test(text)).map((c) => c.word);
}

/** 대본 전체 느낌표가 이보다 많으면 호들갑스럽게 들린다 (과장·반복이 반감을 산다는 조사, 조사 문서 1-4장) */
export const MAX_EXCLAMATIONS = 3;

/** 장면의 자리. 형식마다 순서가 다르다 (예전의 훅·갈등·전환·해결·보상 한 가지 흐름을 모든 대본이 따르던 것을 없앴다) */
export const STORY_BEATS = ['hook', 'context', 'point', 'method', 'close'] as const;

/** Claude에게 받는 형식 (구조화 출력) */
export const StorySceneDraftSchema = z.object({
  beat: z.enum(STORY_BEATS).describe('이 장면의 자리: hook 첫 장면 · context 상황·질문 · point 핵심(원리·차이·이유) · method 재료·조리 · close 마무리'),
  type: z.enum(SCENE_TYPES).describe('gag는 진지한 엉뚱 가이드(deadpan)의 말도 안 되는 단계와 글자 그대로(wordplay)의 다른 뜻 장면에만'),
  emotion: z.enum(EMOTIONS),
  gag: z.enum(GAGS).optional().describe('type "gag" 장면의 그림 (대사 내용과 맞게, 장면마다 다르게)'),
  visual: z.enum(VISUALS).optional(),
  place: z.enum(PLACES),
  line: z.string().describe('맛조수가 소리 내어 말하는 대사 (해요체, 한두 문장)'),
  cardTitle: z.string().optional(),
  cardItems: z.array(z.string()).optional(),
});
export const StoryDraftSchema = z.object({
  title: z.string().describe('영상 제목 (궁금하게, 25자 안팎)'),
  storyType: z.enum(STORY_TYPES).describe('영상 형식'),
  audience: z.enum(AUDIENCES).describe('이 대본이 노리는 시청자'),
  logline: z.string().describe('이 영상을 한 문장으로'),
  scenes: z.array(StorySceneDraftSchema),
});
export const StoryOutputSchema = z.object({ stories: z.array(StoryDraftSchema) });
/** Claude에게는 audience를 꼭 받지만, 예전에 저장한 초안·수정 요청 초안에는 없을 수 있다 */
export type StoryDraft = Omit<z.infer<typeof StoryDraftSchema>, 'audience'> & { audience?: Audience };

/** 팬·불이 있는 무대 (조리 장면은 여기서만) */
const FIRE_PLACES: readonly Place[] = ['kitchen', 'lab'];

/** 장면이 펼쳐질 곳을 고르는 기준 (3D 무대) */
const PLACE_GUIDE: Record<Place, string> = {
  kitchen: '주방 조리대: 굽기·볶기·조리 장면',
  market: '시장 가판대: 재료 고르기·재료 소개',
  dining: '식탁: 완성·맛보기·차려 낸 모습',
  pantry: '찬장·냉장고 앞: 재료 꺼내기·준비·보관',
  lab: '연구실 칠판: 원리 설명·선생님 노트',
};

const audienceLabels = (list: readonly Audience[]) => list.map((a) => AUDIENCE_INFO[a].short).join('·');

/** 등장인물 부분의 맛조수 성격 (persona.ts). 지금 설정(calm-host)은 예전 글자 그대로 */
function characterLines(persona: PersonaId): string {
  const p = PERSONAS[persona];
  if (persona === 'calm-host') return `- ${BRAND.character}: ${p.traits[0]}`;
  return [`- ${BRAND.character} (이번 대본의 성격: ${p.label}):`, ...p.traits.map((t) => `  - ${t}`), ...(p.sensoryRule ? [`  - ${SENSORY_RULE}`] : [])].join('\n');
}

/** 시스템 프롬프트 (레시피와 무관해 캐시된다). persona: 맛조수 성격 (기본은 지금 설정) */
export function storySystem(persona: PersonaId = DEFAULT_PERSONA): string {
  return `너는 요리 숏폼 채널 "${BRAND.labName}"의 구성 작가야. 30~40초짜리 세로 영상 대본을 써. 시청자는 어른이야.

## 등장인물 (말투 기준)
${characterLines(persona)}
  - 출처 말하기: 원리 카드에 이미 "${BRAND.notePhrase}"가 뜨므로 대사로 출처를 말하는 건 대본 하나에 많아야 한 번. 말할 때도 매번 같은 틀("선생님 노트를 보면")을 쓰지 말고 대본마다 새로 지어 (선생님을 주어로, 방법을 주어로, 또는 출처 없이 원리만). 대본 여러 개에서 같은 출처 문장이 되풀이되면 안 돼.
  - 말투 (마케팅 연구 근거, 2026-11-19 사용자 결정 "마케팅학에 나온 대로"): 두 시청자 모두 해요체. 해요체가 합쇼체보다 호감이 높고 음성에서 차이가 더 크다(국내 광고언어 실험). 낯선 브랜드의 과한 친근체(반말·이모지)는 신뢰를 깎는다(Gretry 외 2017).
    · 반말·아기 말투(~용, ~쥬, ~했지 뭐예요)·유행어·감탄사 연발 금지. 문장마다 "~거든요"를 되풀이하지 마.
    · 조리 안내는 부드러운 권유형("~해 주세요", "~해 보세요"). "반드시 ~하세요!" 같은 단정 명령은 쓰지 마 (귀여운 캐릭터 + 단정 명령은 역효과, Chang 외 2021).
  - 반응: 짧고 자연스럽게, 대본 하나에 많아야 한 번 ("오, 그래서였네요" 정도). 비명·과장 감탄·호들갑·자기 비하는 쓰지 마.
  - 실수: 맛조수는 실수하지 않는다 (실수 효과는 유능함이 먼저 인정된 사람에게만 생기고, 유머·실수는 신뢰를 깎는다: Aronson 1966, Eisend 2009 메타분석). 실패는 one-fix·listener-story·relatable 형식에서만, 주어를 "많이들 이렇게 되죠"처럼 일반 사례로 두고, 바로 원인 한 가지와 선생님 노트를 붙인다.
- ${BRAND.callName}: ${BRAND.researcherTitle} ${BRAND.researcher}. 화면에 직접 나오지 않고, 맛조수가 "${BRAND.callName}"이라고 부르며 선생님의 노트·팁을 전한다.

## 시청자 (누구를 위한 영상인지 정하고 써)
${AUDIENCES.map((a) => `- ${a} = ${AUDIENCE_INFO[a].label}: 관심 — ${AUDIENCE_INFO[a].cares}. 말투 — ${AUDIENCE_INFO[a].voice}. 훅 예 — ${AUDIENCE_INFO[a].hookIdeas}`).join('\n')}
- 대본마다 audience를 하나 정하고, 첫 대사부터 그 사람의 관심사로 말을 걸어. 대본을 여러 개 쓰면 두 시청자가 모두 들어가야 해.
- hobby-learner 대본이 있으면 그중 하나는 첫 대사에서 조리기능장의 방법·정석을 내세워 (예: 조리기능장이 먼저 하는 한 가지, 흔한 방법과 정석의 차이). 매번 "조리기능장은 ~"으로 시작하지 말고 문장 틀을 새로 지어. 선생님 경험은 지어내지 말고.
- 훅 방향은 방향만 보여 주는 거야. 이 지시문에 따옴표로 든 말이나 예시 틀을 대사에 그대로 쓰지 마 (그대로 쓰면 모든 영상이 같은 말로 시작하게 돼). 이 요리에 맞게 새로 써. "10분", "천 원" 같은 시간·가격은 원본에 있을 때만.

## 구성 규칙 (가장 중요)
1. 대본마다 형식(storyType)을 하나 고르고 그 형식의 구성을 따라 (형식 목록은 사용자 메시지에 있어). 형식마다 장면 순서가 달라야 해. 모든 대본이 "실패 → 선생님 노트 → 해결 → 행복한 결말"이 되면 안 돼. 장면마다 beat(hook·context·point·method·close)를 적어.
2. 첫 대사는 이 영상이 줄 정보 하나를 바로 약속해 (형식에 맞게: 질문, 두 방법, 정석 한 줄, 쓰임 상황, 계절). 공백 빼고 25자 안으로 짧게 (첫 3초에 넘길지 정해진다). 인사·자기소개·"오늘은 ~ 만들어요" 같은 시작은 금지. 첫 장면 visual도 형식에 맞게: 완성 먼저(result), 비교(compare), 조리 클로즈업(sizzle). 실패 클로즈업(fail·fail-closeup)은 one-fix에서만 (listener-story·relatable은 반전 뒤 장면에서만).
3. 대본끼리 형식, 첫 대사, 장면 순서, 마지막 대사가 모두 달라야 해. 같은 문장 틀을 돌려 쓰지 마. 첫 대사의 첫 어절도 대본끼리 겹치지 않게 (예: "조리기능장은 ~"으로 시작하는 첫 대사는 많아야 하나). 실패에서 시작하는 대본(one-fix, 첫 장면이 mistake나 실패 화면)은 한 번에 많아야 하나.
4. 어른 시청자에게 유치하게 느껴지는 구도는 쓰지 마: 추리·수사·범인·사건·단서, 내기, 구출 작전·미션·출동, 맛조수 세계의 가상 인물(친구 로봇·할머니 등)과 그들의 감동 반응(listener-story의 "${LETTER_FICTION}" 카드 속 이름 없는 인물만 예외), 과장된 위기("큰일 났어요!"). 재미는 정보의 반전(생각과 다른 원리, 의외의 차이)에서, 따뜻함은 시청자의 실제 상황(가족 반찬·손님상·도시락)에서 나오게 해.
5. 설명문을 읽는 말투도, 어린이 방송 말투도 아니게: 옆에서 요점을 짚어 주는 진행자처럼. 느낌표는 대본 전체에 ${MAX_EXCLAMATIONS}개 이하.
6. 아래 말은 쓰지 마 (예전 영상에서 너무 반복됐어): ${STORY_BANNED_PHRASES.map((p) => `"${p.trim()}"`).join(', ')}. 유치하게 들리는 말도 쓰지 마: ${CHILDISH_FRAMING.map((c) => `"${c.word}"`).join(', ')}.
6-1. 대본마다 "친구한테 보내고 싶은" 한 가지를 꼭 넣어: 원본의 핵심원리·팁·흔한 실수 가운데 하나를, 몰랐던 사람이 "아 그래서였구나" 할 한 문장으로 또렷하게 (인스타그램은 보내기(공유)를 가장 중요하게 본다). 원본에 없는 사실로 만들지 마.
7. 마지막 장면은 그 형식의 마무리(정리 한 줄·차려 낸 모습·다음에 쓸 때 등)로 끝내고, 그 대사 안에 "${BRAND.labName}"을 자연스럽게 한 번 넣어 (대본마다 다른 문장으로). 연구소 이름은 대본 전체에서 그 한 번만.

## 사실 규칙 (어기면 그 대본은 버려짐)
8. 요리 지식(재료·분량·시간·온도·순서·원리·팁·계절·보관)은 아래 원본 자료에 있는 것만 써. 원본에 없는 숫자를 만들지 마. 숫자뿐 아니라 "한 장·한 알·한 줌·한 입·한 숟가락·두 번" 같은 개수·분량 말도 원본에 없으면 쓰지 마 (분량 검사에서 막혀 그 대본은 버려져). "하나 더", "한가득"처럼 돌려 말해.
9. 재료 장면(type "ingredients")을 꼭 하나 넣고 cardTitle은 "재료", cardItems는 원본 재료 문자열을 하나도 빼지 말고 그대로 써.
10. 조리 장면(type "steps")을 꼭 하나 넣고 cardItems는 원본 조리순서 문장을 순서대로 그대로 써 (최대 5개, 앞에서부터).
11. 원리 장면(type "explain")의 cardTitle은 "${BRAND.notePhrase}"로 하고, 원본의 핵심원리를 말해.
12. ${BRAND.researcher} 선생님이 실제로 겪은 일·한 말을 지어내지 마. 선생님 경험은 원본의 "이야기"·"전문가답변"에 있을 때만, 그 내용 그대로.
13. 지어낸 인물·사건·후기("아이가 잘 먹었어요", "손님이 감탄했어요")는 쓰지 마. 예외는 listener-story에서 사연 카드에 "${LETTER_FICTION}"이라고 밝힌 꾸민 이야기 하나뿐이고, 그것도 진짜 있었던 일처럼 말하면 안 돼. "실험 결과", "연구로 증명", "해 봤더니" 같은 가짜 사실 표현, 건강 효능 주장도 금지.

## 형식
- 장면 6~8개. 대사는 공백 빼고 대본 전체 170~220자 (실제 목소리로 약 32~40초). 270자를 넘으면 영상이 45초를 넘어 지루해져. 한 장면 대사는 한두 문장, 짧고 말하기 쉽게.
- type: ${SCENE_TYPES.join(' | ')}
  - gag: 진지한 엉뚱 가이드(deadpan)의 말도 안 되는 단계와 글자 그대로(wordplay)의 다른 뜻 장면에만. 카드(cardTitle·cardItems)·분량·재료 이름 없이 대사만. 화면은 아래 gag 그림으로 바뀌고 "농담" 표시가 붙어. 농담이라고(그 뜻이 아니라고) 밝히는 전환 줄보다 앞에만 써.
  - 사연 카드: listener-story에서만 type "question" 장면 하나에 cardTitle "${LETTER_FICTION}"(꾸민 이야기) 또는 "${LETTER_REAL}"(원본 전문가답변 그대로)을 쓰면 화면에 편지 모양 카드가 떠. 다른 형식에는 이 이름을 쓰지 마.
- gag(type "gag" 장면에 필수): 대사가 말하는 엉뚱한 일(또는 낱말의 다른 뜻)을 그대로 보여 줄 그림. 한 대본에서 같은 그림을 두 번 쓰지 마. 그 장면은 이 그림들로 보여 줄 수 있는 일로 지어:
${gagMenu()}
- emotion: ${EMOTIONS.join(' | ')} (surprised·embarrassed는 아껴 써)
- visual(선택): result(완성 음식 먼저) | fail(맛조수 옆 실패 접시 — one-fix·listener-story·relatable의 흔한 실패에만, 농담 장면에는 쓰지 마) | fail-closeup(실패 음식 클로즈업) | compare(비교) | sizzle(조리 클로즈업) | react(맛조수 반응 클로즈업) | signature(마지막 서명 카드, 마지막 장면에만). type "gag" 장면에는 visual을 쓰지 마.
- place(필수): 대본 하나에 2~3곳을 써서 무대가 바뀌게 해 (너무 자주 옮기지 마). 조리 장면(type "steps", visual "sizzle")은 불이 있는 kitchen이나 lab에서만.
${PLACES.map((p) => `  - ${p}: ${PLACE_GUIDE[p]}`).join('\n')}
- 대사에는 숫자를 원본 표기 그대로 써 (예: "설탕 2큰술").`;
}

/** 사용자 프롬프트: 원본 자료 + 이번에 쓸 개수·피할 것 */
export function storyUser(
  recipe: RecipeInput,
  opts: {
    count: number;
    avoidTitles?: string[];
    expertAnswers?: string[];
    recent?: RecentStory[];
    /** 최근에 실제로 만든 영상의 형식 (새것부터, 웃음 돌려쓰기용). 비우면 recent의 형식을 쓴다 */
    recentVideos?: string[];
    realClips?: number;
    persona?: PersonaId;
    mustInclude?: StoryType;
    mustAudience?: Audience;
  },
): string {
  const source = storySourceData(recipe, opts.expertAnswers);
  const recent = opts.recent ?? [];
  const overused = overusedTypes(recent);
  const all = availableStoryTypes(recipe, { expertAnswers: opts.expertAnswers, realClips: opts.realClips });
  // 꼭 쓸 형식(견본·사용자가 고른 형식)은 최근에 많이 썼어도, 웃음 돌려쓰기에 막혀도 넣는다
  const must = opts.mustInclude && all.includes(opts.mustInclude) ? opts.mustInclude : undefined;
  // 웃음 형식은 돌려쓰기(humor.ts)를 통과한 것 하나까지만 보여 준다. 꼭 쓸 형식이 웃음 형식이면 그것 하나만
  const humor = must && isHumorType(must) ? must : pickHumorType(all, opts.recentVideos ?? recent.map((r) => r.storyType), { seed: recipe.dishName, expertAnswers: opts.expertAnswers });
  const pool = all.filter((t) => !isHumorType(t) || t === humor);
  // 다른 형식이 남아 있을 때만 최근에 많이 쓴 형식을 뺀다 (웃음 형식은 돌려쓰기가 이미 골랐으므로 남긴다)
  const fresh = pool.filter((t) => !overused.includes(t) || t === humor);
  const rest = fresh.length >= opts.count ? fresh : pool;
  const types = must && !rest.includes(must) ? [must, ...rest] : rest;
  const humorLine = humor
    ? `\n- 웃음 형식은 이번 묶음에 ${humor}(${STORY_TYPE_INFO[humor].label}) 하나뿐이고 많아야 대본 하나에만 써. 나머지 대본은 정보형으로, 웃기려 하지 말고 정보의 반전으로만 재미를 줘.${humor === 'wordplay' ? wordplayHint(recipe) : ''}`
    : '';
  const mustWho = opts.mustAudience && AUDIENCES.includes(opts.mustAudience) ? opts.mustAudience : undefined;
  const avoid = opts.avoidTitles?.length ? `\n- 이미 쓴 제목과 비슷한 대본은 피해: ${opts.avoidTitles.map((t) => `"${t}"`).join(', ')}` : '';
  const motifs = repeatedMotifs(recent, [recipe.dishName, recipe.topic]);
  const phrases = repeatedPhrases(recent.map((r) => r.lines ?? []), [recipe.dishName]);
  const account = recent.length
    ? `\n- 이 계정의 최근 대본 ${recent.length}개 (계정 전체가 같은 영상처럼 보이지 않게, 이것들과 다른 형식·첫 대사로):\n${recent.map((r) => `  - [${storyTypeLabel(r.storyType)}] ${r.title} / 첫 대사: ${r.firstLine}`).join('\n')}` +
      (motifs.length ? `\n- 최근에 자주 나온 소재라 이번에는 쓰지 마: ${motifs.map((m) => `"${m}"`).join(', ')}` : '') +
      (phrases.length ? `\n- 최근 대본마다 되풀이된 표현이라 이번에는 쓰지 마 (비슷하게 돌려 쓰지도 마): ${phrases.map((m) => `"${m}"`).join(', ')}` : '')
    : '';
  const limit = limitLineInstruction(opts.persona ?? DEFAULT_PERSONA, recent.map((r) => r.lines ?? [r.firstLine]));
  return `아래 원본 자료로 형식이 서로 다른 대본 ${opts.count}개를 써.
## 고를 수 있는 형식 (storyType — 이름: 구성 / 지킬 것 / 잘 맞는 시청자)
${types.map((t) => `- ${t}(${STORY_TYPE_INFO[t].label}): ${STORY_TYPE_INFO[t].beats} / ${STORY_TYPE_INFO[t].guide} / ${audienceLabels(STORY_TYPE_INFO[t].fits)}`).join('\n')}
${mustLine(must, mustWho)}${humorLine}${avoid}${account}${limit}

## 원본 자료
${JSON.stringify(source, null, 2)}`;
}

/** 글자 그대로: 원본에 나오는 말장난 후보와 그 다른 뜻 (그림 이름까지) */
function wordplayHint(recipe: RecipeInput): string {
  const words = wordplayWords(recipe);
  return words.length ? `\n- 말장난 후보 (원본에 나오는 요리 말 — 다른 뜻 / 맞는 그림): ${words.map((w) => `${w.word} — ${w.other} / ${w.gags.join('·')}`).join('; ')}` : '';
}

/**
 * 꼭 써야 하는 대본 한 줄 (견본·사용자가 고른 형식·시청자). 형식만 강제하면 작가가 다른 시청자로 써서,
 * '바삭한 김치전:young-home:deadpan' 요청이 4050 대본으로, 호두정과 4050 요청이 2030 대본으로 나왔다 (2026-11-23 견본).
 */
function mustLine(type: StoryType | undefined, audience: Audience | undefined): string {
  if (type && audience)
    return `\n- 대본 가운데 하나는 반드시 형식 ${type}(${STORY_TYPE_INFO[type].label})로, 시청자 ${audience}(${AUDIENCE_INFO[audience].label})를 위해 써. 그 대본의 storyType은 "${type}", audience는 "${audience}"이고, 첫 대사부터 그 시청자의 관심사로 말을 걸어.`;
  if (type) return `\n- 대본 가운데 하나는 반드시 형식 ${type}(${STORY_TYPE_INFO[type].label})로 써.`;
  if (audience) return `\n- 대본 가운데 하나는 반드시 시청자 ${audience}(${AUDIENCE_INFO[audience].label})를 위해 써 (audience "${audience}").`;
  return '';
}

/** Claude에게 보내는 원본 자료 (이야기 쓰기·수정 요청 반영이 같이 쓴다) */
export function storySourceData(recipe: RecipeInput, expertAnswers?: string[]) {
  return {
    주제: recipe.topic,
    요리: recipe.dishName,
    분류: CATEGORY_LABELS[recipe.category],
    재료: recipe.ingredients.map(formatIngredient),
    조리순서: recipe.steps,
    핵심원리: recipe.principle,
    전문가팁: recipe.tips,
    흔한실수: recipe.commonMistake || undefined,
    흔한오해: recipe.misconception || undefined,
    이야기: recipe.story || undefined,
    전문가답변: expertAnswers?.length ? expertAnswers : undefined,
  };
}

/** 계정의 최근 대본 (다른 콘텐츠 것 포함): 계정 전체의 반복을 막는다 */
export interface RecentStory {
  storyType: string;
  title: string;
  firstLine: string;
  /** 대사 전체 (있으면 대본끼리 되풀이된 표현을 찾는다) */
  lines?: string[];
}

/** 최근 대본에서 2번 넘게 쓴 형식 (견본 4편이 모두 '범인 찾기' 추리였다) */
export function overusedTypes(recent: RecentStory[]): StoryType[] {
  const n: Record<string, number> = {};
  for (const r of recent) n[r.storyType] = (n[r.storyType] ?? 0) + 1;
  // 실패 원인형은 4~5편에 1편 이하 (실패를 자주 보여 주면 전문성 신뢰가 깎인다: 자문 결과 2026-11-19, 운영값)
  const failRecently = recent.slice(0, 4).some((r) => r.storyType === 'one-fix');
  // 직전 영상과 같은 형식도 이번에는 피한다 (견본 4편 중 3편이 '이 단계는 왜?'였다: 2026-11-20)
  const last = recent[0]?.storyType;
  return STORY_TYPES.filter((t) => t === last || (t === 'one-fix' && failRecently) || (n[t] ?? 0) > 2 || (recent.length >= 3 && (n[t] ?? 0) / recent.length > 0.4));
}

/** 최근 제목·첫 대사에 여러 번 나온 낱말 (요리 이름 제외). 예: "범인", "할머니" */
export function repeatedMotifs(recent: RecentStory[], exclude: string[] = []): string[] {
  const n = new Map<string, number>();
  for (const r of recent) {
    const words = new Set(`${r.title} ${r.firstLine}`.split(/[\s,.!?…~'"“”‘’()]+/).map((w) => w.replace(/(은|는|이|가|을|를|의|에|도|만|요|께|한테|으로|로|이에요|예요)$/, '')).filter((w) => w.length >= 2));
    for (const w of words) n.set(w, (n.get(w) ?? 0) + 1);
  }
  const skip = exclude.filter(Boolean).flatMap((e) => e.split(/[\s,?!]+/)).filter((w) => w.length >= 2);
  return [...n.entries()].filter(([w, c]) => c >= 2 && !skip.some((x) => x.includes(w) || w.includes(x))).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
}

/**
 * 여러 대본에 되풀이된 두 어절 표현 (예: 4편 모두 "선생님 노트를 보면"). 대본 minStories개 이상에 나온 것만.
 * 연구소 이름(마지막 장면에 꼭 넣는 말)·요리 이름·숫자가 든 표현(원본 분량)은 뺀다.
 */
export function repeatedPhrases(scripts: string[][], exclude: string[] = [], minStories = 2): string[] {
  const norm = (w: string) => w.replace(/[,.!?…~'"“”‘’()]/g, '');
  const skip = [BRAND.labName, ...exclude].filter(Boolean).flatMap((e) => e.split(/\s+/)).filter((w) => w.length >= 2);
  const n = new Map<string, number>();
  for (const lines of scripts) {
    const seen = new Set<string>();
    for (const line of lines) {
      const words = line.split(/\s+/).map(norm).filter(Boolean);
      for (let i = 0; i + 1 < words.length; i++) {
        const a = words[i]!;
        const b = words[i + 1]!;
        if (/\d/.test(a + b) || skip.some((x) => a.includes(x) || b.includes(x))) continue;
        if (a.length + b.length < 5) continue;
        seen.add(`${a} ${b}`);
      }
    }
    for (const k of seen) n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.entries()].filter(([, c]) => c >= minStories).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k]) => k);
}

const SEASON_WORDS = /제철|봄|여름|가을|겨울|명절|설날|추석|김장/;
const KEEPING_WORDS = /보관|냉장|냉동|남은|남으면|소분|손질|고르|고를|장볼|장 볼/;

/** 원본에 근거가 있어야 쓸 수 있는 형식을 거른다 (형식을 위해 사실을 지어내지 않게) */
/**
 * '두 방법 비교'는 실제로 두 방법을 찍은 영상이 있을 때만 (사용자 결정 2026-11-19: 3D 비교 화면은 차이가 약해 설득력이 없었다).
 * realClips = 연구자가 올린 실제 촬영(사진·영상) 장면 수. 2개 이상이면 비교 형식을 열어 준다.
 */
export const COMPARE_MIN_REAL_CLIPS = 2;

export function availableStoryTypes(recipe: RecipeInput, opts: { expertAnswers?: string[]; realClips?: number } = {}): StoryType[] {
  const text = [recipe.topic, recipe.dishName, recipe.principle, recipe.story, recipe.commonMistake, recipe.misconception, ...recipe.tips, ...recipe.steps].filter(Boolean).join(' ');
  return STORY_TYPES.filter((t) => {
    if (t === 'one-fix') return Boolean(recipe.commonMistake?.trim() || recipe.category === 'fix');
    if (t === 'standard') return Boolean(recipe.tips.length || recipe.commonMistake?.trim() || recipe.misconception?.trim());
    if (t === 'why') return Boolean(recipe.principle?.trim());
    if (t === 'compare') return Boolean(recipe.principle?.trim()) && (opts.realClips ?? 0) >= COMPARE_MIN_REAL_CLIPS;
    if (t === 'quick') return recipe.steps.length >= 2;
    if (t === 'season') return SEASON_WORDS.test(text);
    if (t === 'leftover') return KEEPING_WORDS.test(text);
    if (t === 'qa') return Boolean(opts.expertAnswers?.some((a) => a.trim()));
    if (t === 'heritage') return Boolean(recipe.story?.trim() || recipe.category === 'tradition');
    // 웃음 형식: 웃음거리가 원본 안에 있어야 한다 (형식을 위해 사실을 지어내지 않게)
    // 글자 그대로: 원본 순서·팁에 다른 뜻이 있는 요리 말이 나올 때
    if (t === 'wordplay') return wordplayWords(recipe).length > 0;
    // 부엌 다큐: 원본 순서에 보이거나 들리는 익음 신호가 있을 때 (해설할 거리)
    if (t === 'documentary') return recipe.steps.length >= 2 && DOC_CUES.test(recipe.steps.join(' '));
    // 사연 한 통: 연구자 답변(진짜 질문) 또는 흔한 실수(가상 사연의 재료)가 있을 때
    if (t === 'listener-story') return Boolean(opts.expertAnswers?.some((a) => a.trim()) || recipe.commonMistake?.trim());
    // 이 연구소에서는: 규칙으로 선언할 원본 내용(팁·흔한 실수·원리)이 셋 이상
    if (t === 'town-rules') return recipe.tips.length + (recipe.commonMistake?.trim() ? 1 : 0) + (recipe.principle?.trim() ? 1 : 0) + Math.min(recipe.steps.length, 2) >= 4 && recipe.tips.length >= 1;
    // 이럴 때 꼭 있는 일: 마지막 항목이 될 원본 흔한 실수가 있을 때
    if (t === 'relatable') return Boolean(recipe.commonMistake?.trim());
    // 적당히의 나라: 숫자로 적힌 분량이 둘 이상일 때 (어림으로 적힌 레시피면 웃음도 정보도 약하다)
    if (t === 'vague-vs-note') return measuredIngredients(recipe) >= 2;
    return true;
  });
}

export interface StoryCandidate {
  /** 'story-1'처럼 프로젝트 안에서 고유 */
  id: string;
  storyType: StoryType;
  /** 노리는 시청자 (예전에 저장한 초안에는 없을 수 있다) */
  audience?: Audience;
  logline: string;
  script: Script;
  seconds: number;
  /** 원본 대조 결과 (error가 있으면 만들 수 없음) */
  issues: Issue[];
  /** 원본으로 되돌린 카드 등 */
  notes: string[];
  /** 반복 문구·길이 등 품질 경고 */
  warnings: string[];
}

/** 이야기 대본으로 만든 Script의 style (연출 엔진 대본과 구분, 팁 장면을 강제하지 않는다) */
export const AI_STORY_STYLE = 'ai-story';

/** Claude가 낸 이야기 하나를 대본으로 바꾸고 원본 대조·품질 검사를 한다 */
export function finalizeStory(recipe: RecipeInput, draft: StoryDraft, id: string, opts: { expertAnswers?: string[] } = {}): StoryCandidate | { id: string; error: string } {
  const last = draft.scenes.length - 1;
  const gagNotes: string[] = [];
  const drafted = letterScenes({ ...draft, scenes: gagScenes(draft, gagNotes) }, gagNotes, opts.expertAnswers);
  const gags = gagPlan(drafted.map((s) => ({ type: s.type, line: s.line, gag: s.gag })));
  const raw = {
    title: draft.title.trim(),
    style: AI_STORY_STYLE,
    hookType: draft.storyType,
    scenes: drafted.map((s, i) => ({
      id: `s${i + 1}`,
      type: s.type,
      emotion: s.emotion,
      line: s.line.trim(),
      // 농담 장면에는 카드를 붙이지 않는다 (연구자 카드가 농담을 조언처럼 보이게 하거나 진짜 답을 미리 보여 준다)
      ...(s.type !== 'gag' && s.cardTitle?.trim() ? { cardTitle: s.cardTitle.trim() } : {}),
      ...(s.type !== 'gag' && s.cardItems?.length ? { cardItems: s.cardItems.map((c) => c.trim()).filter(Boolean) } : {}),
      ...(s.type === 'gag' ? { gag: gags[i]! } : {}),
      // 서명 카드는 마지막 장면에만 (중간에 나오면 영상이 끝난 것처럼 보인다). 농담 장면은 그림이 화면 전체라 연출을 쓰지 않는다
      ...(s.type !== 'gag' && s.visual && (s.visual !== 'signature' || i === last) ? { visual: s.visual } : {}),
      // 불이 없는 무대(시장·식탁·찬장)에서는 팬·불이 그려지지 않으므로 조리 장면은 주방으로 옮긴다
      place: (s.type === 'steps' || s.visual === 'sizzle') && !FIRE_PLACES.includes(s.place) ? 'kitchen' : s.place,
      ...(i === 0 ? { hook: true } : {}),
    })),
  };
  const parsed = ScriptSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { id, error: `대본 구조 오류 (${first?.path.join('.') || '전체'}): ${first?.message ?? '알 수 없음'}` };
  }
  const warnings: string[] = [];
  let script = parsed.data;
  if (!script.scenes.some((s) => s.type === 'ingredients')) return { id, error: '재료 장면이 없어요' };
  if (recipe.steps.length && !script.scenes.some((s) => s.type === 'steps')) return { id, error: '조리 순서 장면이 없어요' };
  const enforced = enforceSourceData(recipe, script);
  script = pinExpertCards(recipe, enforced.script, enforced.notes);
  const all = script.scenes.map((s) => s.line).join('\n');
  const banned = STORY_BANNED_PHRASES.filter((p) => all.includes(p));
  if (banned.length) warnings.push(`반복되던 말이 들어 있어요: ${banned.map((b) => `"${b.trim()}"`).join(', ')}`);
  const childish = findChildishFraming(`${script.title}\n${all}`);
  if (childish.length) warnings.push(`어른 시청자에게 유치하게 들릴 수 있는 말: ${childish.map((w) => `"${w}"`).join(', ')}`);
  const bangs = (all.match(/!/g) ?? []).length;
  if (bangs > MAX_EXCLAMATIONS) warnings.push(`느낌표가 ${bangs}개예요: 호들갑스럽게 들릴 수 있어요 (${MAX_EXCLAMATIONS}개 이하)`);
  const claims = findHealthClaims(all);
  if (claims.length) warnings.push(`건강 효능처럼 들리는 말: ${claims.join(', ')}`);
  if (draft.storyType === 'deadpan') {
    const danger = findDeadpanDanger(all);
    if (danger.length) warnings.push(`엉뚱 가이드에 따라 하면 위험한 장난이 들어 있어요: ${danger.map((d) => `"${d}"`).join(', ')}`);
    if (!DEADPAN_TURN.test(all)) warnings.push('엉뚱한 부분이 농담이라고 밝히는 줄이 없어요 (시청자가 진짜로 믿을 수 있어요)');
  }
  const extraIssues: Issue[] = [];
  if (draft.storyType === 'wordplay') {
    const danger = findDeadpanDanger(all);
    if (danger.length) warnings.push(`말장난 장면에 따라 하면 위험한 일이 들어 있어요: ${danger.map((d) => `"${d}"`).join(', ')}`);
    if (!WORDPLAY_TURN.test(all)) warnings.push('다른 뜻 장면 뒤에 "그 뜻이 아니다"라고 밝히는 줄이 없어요 (말장난이 진짜 뜻처럼 남을 수 있어요)');
  }
  if (draft.storyType === 'documentary') {
    const hurt = findSufferingFood(all);
    if (hurt.length) warnings.push(`음식을 아파하는 생명처럼 그리는 말: ${hurt.map((h) => `"${h}"`).join(', ')} (먹고 싶은 마음이 줄어요)`);
  }
  if (draft.storyType === 'listener-story') {
    const letter = script.scenes.find((s) => isLetterTitle(s.cardTitle));
    const fakeReal = findFakeRealStory(`${script.title}\n${all}`);
    // 꾸민 사연을 진짜처럼 소개하면 만들 수 없다 (가짜 후기·제보와 같다: 원칙)
    if (fakeReal.length && letter?.cardTitle === LETTER_FICTION)
      extraIssues.push({ level: 'error', code: 'claim', sceneId: letter.id, message: `가상 사연인데 진짜 받은 사연처럼 들리는 말이 있습니다: ${fakeReal.map((f) => `"${f}"`).join(', ')}. 지어낸 이야기를 진짜처럼 소개할 수 없습니다.` });
    else if (fakeReal.length) warnings.push(`사연을 누가 보낸 것처럼 들리는 말: ${fakeReal.map((f) => `"${f}"`).join(', ')}`);
  }
  if (draft.storyType === 'relatable' && PEOPLE_LABELS.test(all)) warnings.push('사람을 유형으로 묶는 말이 있어요: 사람 대신 부엌에서 생기는 상황으로 써 주세요');
  if (draft.storyType === 'vague-vs-note') {
    const quote = all.match(FAMILY_QUOTE)?.[0];
    const grounded = [recipe.story ?? '', ...(opts.expertAnswers ?? [])].join(' ');
    if (quote && !grounded.includes(quote.match(/엄마|어머니|시어머니|할머니/)?.[0] ?? '\u0000'))
      warnings.push(`가족이 한 말처럼 지어낸 인용: "${quote}" (흔히 듣는 말로만 써 주세요)`);
  }
  const fake = findFakeExperience(all);
  if (fake.length) warnings.push(`맛조수가 직접 해 보거나 맛본 것처럼 들리는 말(AI라 그런 경험이 없어요): ${fake.map((f) => `"${f}"`).join(', ')}`);
  const labCount = all.split(BRAND.labName).length - 1;
  if (labCount === 0) warnings.push(`마지막 대사에 "${BRAND.labName}"이 없어요`);
  if (labCount > 1) warnings.push(`"${BRAND.labName}"을 ${labCount}번 말해요 (한 번이면 충분해요)`);
  const firstChars = (script.scenes[0]?.line ?? '').replace(/\s/g, '').length;
  if (firstChars > 30) warnings.push(`첫 대사가 ${firstChars}자예요: 첫 3초 안에 끝나게 더 짧게 (25자 안팎)`);
  const places = new Set(script.scenes.map((s) => s.place).filter(Boolean));
  if (places.size < 2) warnings.push('무대가 한 곳뿐이에요');
  const seconds = estimateScriptSeconds(script);
  if (seconds < 20) warnings.push(`예상 길이 ${Math.round(seconds)}초: 너무 짧아요`);
  // 실제 목소리는 글자 수 어림보다 20%쯤 느리다 (견본: 어림 39초 → 실제 47초)
  if (seconds > 40) warnings.push(`예상 길이 ${Math.round(seconds)}초: 너무 길어요`);
  return {
    id,
    storyType: draft.storyType,
    ...(draft.audience ? { audience: draft.audience } : {}),
    logline: draft.logline.trim(),
    script,
    seconds: Math.round(seconds),
    issues: [...checkScript(recipe, script), ...extraIssues],
    notes: [...gagNotes, ...enforced.notes],
    warnings,
  };
}

/**
 * 연구자 이름이 붙는 카드(원리 노트·한 줄 팁)는 원본 문장으로만 채운다.
 * 카드 글이 비면 화면이 대사를 대신 보여 주는데, 이야기 대본에서는 맛조수의 말("와삭!")이 연구자 팁처럼 보이게 된다 (견본에서 발견).
 * - 팁 장면: 원본 팁 중 대사와 가장 많이 겹치는 것. 원본에 팁이 없으면 원리 장면으로 바꾼다
 * - 원리 장면: 원본 핵심원리 문장만 남기고, 없으면 첫 문장
 */
function pinExpertCards(recipe: RecipeInput, script: Script, notes: string[]): Script {
  const principle = splitSentences(recipe.principle ?? '');
  const overlap = (a: string, b: string) => [...new Set(a.replace(/\s/g, ''))].filter((ch) => b.includes(ch)).length;
  const scenes = script.scenes.map((sc) => {
    if (sc.type === 'tip') {
      if (!recipe.tips.length) {
        if (!principle.length) return { ...sc, type: 'question' as const, cardTitle: undefined, cardItems: undefined };
        notes.push(`${sc.id} 장면: 원본에 팁이 없어 원리 노트 카드로 바꿨습니다.`);
        return { ...sc, type: 'explain' as const, cardTitle: BRAND.notePhrase, cardItems: [principle[0]!] };
      }
      const tip = [...recipe.tips].sort((a, b) => overlap(b, sc.line) - overlap(a, sc.line))[0]!;
      if (JSON.stringify(sc.cardItems ?? []) !== JSON.stringify([tip])) notes.push(`${sc.id} 장면의 팁 카드를 원본 팁 문장으로 맞췄습니다.`);
      return { ...sc, cardTitle: BRAND.tipPhrase, cardItems: [tip] };
    }
    if (sc.type === 'explain' && principle.length) {
      const kept = (sc.cardItems ?? []).filter((it) => principle.some((p) => p.includes(it) || it.includes(p)));
      if (kept.length !== (sc.cardItems ?? []).length || !kept.length) notes.push(`${sc.id} 장면의 노트 카드를 원본 원리 문장으로 맞췄습니다.`);
      return { ...sc, cardTitle: BRAND.notePhrase, cardItems: kept.length ? kept : [principle[0]!] };
    }
    return sc;
  });
  return { ...script, scenes };
}

type DraftScene = StoryDraft['scenes'][number];

/**
 * 농담 장면 정리 (안전망).
 * - 엉뚱 가이드(deadpan): 농담이라고 밝히는 줄(DEADPAN_TURN)보다 앞의 tip·explain 장면은 농담 장면(gag)으로 바꾼다.
 *   견본에서 작가가 엉뚱한 단계를 tip으로 적어, 진짜 '한 줄 팁' 카드가 농담 중에 떠 답을 미리 보여 줬다 (2026-11-23).
 *   연구자 카드(노트·팁)는 전환 줄 뒤에만 나온다. 첫 장면(훅)은 흔한 상황이라 바꾸지 않는다.
 * - 다른 형식: 농담 장면이 있으면 질문 장면으로 되돌린다 (엉뚱한 그림은 엉뚱 가이드에만).
 */
function gagScenes(draft: StoryDraft, notes: string[]): DraftScene[] {
  if (!GAG_STORY_TYPES.includes(draft.storyType)) {
    return draft.scenes.map((s, i) => {
      if (s.type !== 'gag') return s;
      notes.push(`s${i + 1} 장면: 농담 장면은 진지한 엉뚱 가이드·글자 그대로에만 써서 질문 장면으로 바꿨습니다.`);
      return { ...s, type: 'question' as const, gag: undefined };
    });
  }
  const turnRe = draft.storyType === 'wordplay' ? WORDPLAY_TURN : DEADPAN_TURN;
  const turn = draft.scenes.findIndex((s, i) => i > 0 && turnRe.test(s.line));
  return draft.scenes.map((s, i) => {
    // 농담 그림은 전환 줄보다 앞에만: 진짜 방법(진짜 뜻)을 말하는 동안 엉뚱한 그림이 뜨면 정보가 농담처럼 보인다
    if (turn > 0 && i >= turn && s.type === 'gag') {
      notes.push(`s${i + 1} 장면: 농담이라고 밝힌 뒤의 장면이라 농담 그림을 빼고 질문 장면으로 바꿨습니다.`);
      return { ...s, type: 'question' as const, gag: undefined };
    }
    // 질문·실수처럼 적었어도 대사가 엉뚱한 곳(사막·달 등)을 말하면 그림을 보여 주려고 농담 장면으로
    const absurd = s.type !== 'ingredients' && s.type !== 'steps' && s.type !== 'gag' && s.type !== 'outro' && gagFromLine(s.line) !== null;
    if (turn > 0 && i > 0 && i < turn && (s.type === 'tip' || s.type === 'explain' || absurd)) {
      notes.push(`s${i + 1} 장면: 농담이라고 밝히기 전 장면이라 농담 장면으로 바꾸고 연구자 카드를 뺐습니다.`);
      return { ...s, type: 'gag' as const, cardTitle: undefined, cardItems: undefined, visual: undefined };
    }
    return s;
  });
}

/** 농담 그림 장면(type "gag")을 쓸 수 있는 형식 */
export const GAG_STORY_TYPES: readonly StoryType[] = ['deadpan', 'wordplay'];

/**
 * 사연 카드 정리 (안전망, 사연 한 통 형식).
 * - 사연 카드("가상 사연"·"선생님이 받은 질문")는 대본에 하나, 질문·첫 장면 종류에만. 없으면 첫 이야기 장면에 "가상 사연" 카드를 붙인다
 *   (꾸민 이야기를 표시 없이 내보내지 않게).
 * - "선생님이 받은 질문"은 카드 글이 연구자 답변 원문에 그대로 있을 때만. 아니면 "가상 사연"으로 바꾼다 (지어낸 사연을 진짜처럼 보이게 하지 않게).
 * - 다른 형식에 사연 카드 이름이 있으면 뺀다.
 */
function letterScenes(draft: StoryDraft, notes: string[], expertAnswers: string[] = []): DraftScene[] {
  if (draft.storyType !== 'listener-story') {
    return draft.scenes.map((s, i) => {
      if (!isLetterTitle(s.cardTitle)) return s;
      notes.push(`s${i + 1} 장면: 사연 카드는 사연 한 통 형식에만 써서 카드 이름을 뺐습니다.`);
      return { ...s, cardTitle: undefined };
    });
  }
  const infoTypes: readonly string[] = ['explain', 'tip', 'ingredients', 'steps', 'outro'];
  const firstInfo = draft.scenes.findIndex((s) => infoTypes.includes(s.type));
  let at = draft.scenes.findIndex((s) => isLetterTitle(s.cardTitle));
  const scenes = draft.scenes.map((s, i) => (i !== at && isLetterTitle(s.cardTitle) ? { ...s, cardTitle: undefined } : s));
  if (at < 0) {
    const storyEnd = firstInfo < 0 ? scenes.length : firstInfo;
    at = scenes.findIndex((s, i) => i < storyEnd && (s.type === 'question' || s.type === 'intro' || s.type === 'mistake'));
    if (at < 0) at = 0;
    notes.push(`s${at + 1} 장면: 사연 카드가 없어 "${LETTER_FICTION}" 카드를 붙였습니다 (꾸민 이야기는 표시해야 해요).`);
    scenes[at] = { ...scenes[at]!, cardTitle: LETTER_FICTION, cardItems: undefined };
  }
  let letter = scenes[at]!;
  // 사연 카드는 질문 장면 모양으로 (원리·팁 장면이면 연구자 카드가 덮어쓴다)
  if (!['question', 'intro', 'mistake'].includes(letter.type)) letter = { ...letter, type: 'question', gag: undefined, visual: undefined };
  if (letter.cardTitle?.trim() === LETTER_REAL) {
    const norm = (t: string) => t.replace(/[\s"'“”‘’.,!?…~]/g, '');
    const answers = expertAnswers.map(norm).filter(Boolean);
    const items = (letter.cardItems ?? []).map(norm).filter(Boolean);
    const real = items.length > 0 && items.every((it) => it.length >= 6 && answers.some((a) => a.includes(it)));
    if (!real) {
      notes.push(`s${at + 1} 장면: 카드 글이 연구자 답변 원문에 없어 "${LETTER_REAL}" 대신 "${LETTER_FICTION}"으로 바꿨습니다.`);
      letter = { ...letter, cardTitle: LETTER_FICTION, cardItems: undefined };
    }
  } else letter = { ...letter, cardTitle: LETTER_FICTION };
  scenes[at] = letter;
  return scenes;
}

/** 엉뚱 가이드: 농담이라고 밝히는 줄 (농담·장난·물론 아니고·진짜 방법·사실은) */
export const DEADPAN_TURN = /농담|장난|물론\s?아니|진짜\s?(방법|정석)|사실은|사실\s?이건|진지하게\s?말하면/;
/** 엉뚱 가이드에 넣으면 안 되는 위험한 장난 (따라 할 수 있는 것) */
const DEADPAN_DANGER = [/터트|터뜨|폭발|불을\s?붙|불\s?속에|불에\s?(기름|물)|기름에\s?물|물을\s?(기름|팬)에|가스를|전기를|감전|칼을\s?(던|돌|입)|맨손으로\s?(불|기름|끓)/];

export function findDeadpanDanger(text: string): string[] {
  return DEADPAN_DANGER.map((re) => text.match(re)?.[0]).filter((m): m is string => Boolean(m));
}

/** 원본 대조에서 막히는 문제(분량·재료·순서 오류)가 있는지 */
export function storyBlocked(c: Pick<StoryCandidate, 'issues'>): boolean {
  return c.issues.some((i) => i.level === 'error');
}
