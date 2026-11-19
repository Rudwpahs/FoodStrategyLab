import { z } from 'zod';
import { BRAND } from '../brand.ts';
import { formatIngredient, splitSentences } from '../format.ts';
import { checkScript, type Issue } from '../fidelity.ts';
import { findHealthClaims } from '../wordLists.ts';
import { CATEGORY_LABELS, EMOTIONS, PLACES, ScriptSchema, VISUALS, type Place, type RecipeInput, type Script } from '../types.ts';
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
    hookIdeas: '"이 단계 하나로 결과가 달라져요" / "두 방법, 어디서 갈릴까요?" / "남은 재료, 이렇게 쓰면 돼요" / "도시락 반찬이라면 이것만 짚어요" 같은 실용·비교형',
  },
  'hobby-learner': {
    label: '4·50대 요리 취미·배우는 사람',
    short: '4050 요리 배우는 분',
    // 근거: 중장년은 전문성을 더 중시, 50세 이상 여성이 가장 많이 딴 자격증이 한식조리기능사, 중장년 여성층이 보는 경력 셰프 채널의 담백한 설명, 궁중·전통 요리 쇼츠의 반응
    cares: '왜 그렇게 하는지 원리, 조리기능장의 정석, 흔한 방법과 정석의 차이, 전통 음식·손님상·명절, 제대로 된 깊은 맛, 연구자에게 직접 듣는 답',
    voice: '차분하고 정확하게, 이유를 먼저. 어려운 말은 쉬운 말로 풀되 가르치려 들거나 어린아이에게 하듯 말하지 않는다. 해요체',
    hookIdeas: '"조리기능장은 이 단계를 왜 먼저 할까요?" / "흔한 방법과 정석, 차이는 이 한 가지예요" / "예부터 이렇게 한 데는 이유가 있어요"(원본 이야기가 있을 때) 같은 원리·정석형',
  },
};

/**
 * 영상 형식 (예전 이름: 이야기 갈래). 한 번에 쓰는 대본들은 서로 다른 형식이어야 하고, 형식마다 장면 구성이 다르다.
 * 2026-11-19 사용자 지적("수사 파일·내기는 유치하다, 레파토리가 똑같다")과 조사로 추리·내기·구출·선물·시간 싸움을 뺐다.
 * 형식별 근거·맞는 시청자는 조사 문서 2장.
 */
export const STORY_TYPES = ['one-fix', 'compare', 'standard', 'why', 'quick', 'occasion', 'season', 'leftover', 'qa', 'heritage'] as const;
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
  heritage: {
    label: '음식 이야기',
    beats: '이 음식에 얽힌 이야기·전통 → 예부터 이렇게 한 이유(원리) → 재료·조리 → 오늘 식탁으로 이어지는 마무리',
    guide: '유래·역사·추억은 원본 "이야기"에 있는 것만. 없으면 이야기를 지어내지 말고 전통 방식의 이유(원리)만 말한다',
    fits: ['hobby-learner'],
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
  type: z.enum(['intro', 'question', 'mistake', 'explain', 'ingredients', 'steps', 'tip', 'outro']),
  emotion: z.enum(EMOTIONS),
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

/** 시스템 프롬프트 (레시피와 무관해 캐시된다) */
export function storySystem(): string {
  return `너는 요리 숏폼 채널 "${BRAND.labName}"의 구성 작가야. 30~40초짜리 세로 영상 대본을 써. 시청자는 어른이야.

## 등장인물 (말투 기준)
- ${BRAND.character}: 연구소의 3D 진행자이자 조수. 차분하고 센스 있는 또래 진행자처럼 말한다. 시청자가 궁금해할 것을 대신 묻고, 선생님 노트를 정확히 전한다. 지식의 주인처럼 단정하지 않고 "선생님 노트를 보면"처럼 전한다.
  - 말투: 친근한 해요체(존댓말). 반말·아기 말투·유행어 남발 금지.
  - 반응: 짧고 자연스럽게, 대본 하나에 많아야 한 번 ("오, 그래서였네요" 정도). 비명·과장 감탄·호들갑·자기 비하는 쓰지 마.
  - 실수 연기: one-fix 형식에서 원본의 흔한 실수를 담담하게 보여 줄 때만.
- ${BRAND.callName}: ${BRAND.researcherTitle} ${BRAND.researcher}. 화면에 직접 나오지 않고, 맛조수가 "${BRAND.callName}"이라고 부르며 선생님의 노트·팁을 전한다.

## 시청자 (누구를 위한 영상인지 정하고 써)
${AUDIENCES.map((a) => `- ${a} = ${AUDIENCE_INFO[a].label}: 관심 — ${AUDIENCE_INFO[a].cares}. 말투 — ${AUDIENCE_INFO[a].voice}. 훅 예 — ${AUDIENCE_INFO[a].hookIdeas}`).join('\n')}
- 대본마다 audience를 하나 정하고, 첫 대사부터 그 사람의 관심사로 말을 걸어. 대본을 여러 개 쓰면 두 시청자가 모두 들어가야 해.
- hobby-learner 대본이 있으면 그중 하나는 첫 대사에서 조리기능장의 방법·정석을 내세워 (예: 조리기능장이 먼저 하는 한 가지, 흔한 방법과 정석의 차이). 선생님 경험은 지어내지 말고.
- 훅 예시는 방향만 보여 주는 거야. 그대로 베끼지 말고 이 요리에 맞게 새로 써. "10분", "천 원" 같은 시간·가격은 원본에 있을 때만.

## 구성 규칙 (가장 중요)
1. 대본마다 형식(storyType)을 하나 고르고 그 형식의 구성을 따라 (형식 목록은 사용자 메시지에 있어). 형식마다 장면 순서가 달라야 해. 모든 대본이 "실패 → 선생님 노트 → 해결 → 행복한 결말"이 되면 안 돼. 장면마다 beat(hook·context·point·method·close)를 적어.
2. 첫 대사는 이 영상이 줄 정보 하나를 바로 약속해 (형식에 맞게: 질문, 두 방법, 정석 한 줄, 쓰임 상황, 계절). 공백 빼고 25자 안으로 짧게 (첫 3초에 넘길지 정해진다). 인사·자기소개·"오늘은 ~ 만들어요" 같은 시작은 금지. 첫 장면 visual도 형식에 맞게: 완성 먼저(result), 비교(compare), 조리 클로즈업(sizzle). 실패 클로즈업(fail·fail-closeup)은 one-fix에서만.
3. 대본끼리 형식, 첫 대사, 장면 순서, 마지막 대사가 모두 달라야 해. 같은 문장 틀을 돌려 쓰지 마. 실패에서 시작하는 대본(one-fix, 첫 장면이 mistake나 실패 화면)은 한 번에 많아야 하나.
4. 어른 시청자에게 유치하게 느껴지는 구도는 쓰지 마: 추리·수사·범인·사건·단서, 내기, 구출 작전·미션·출동, 맛조수 세계의 가상 인물(친구 로봇·할머니 등)과 그들의 감동 반응, 과장된 위기("큰일 났어요!"). 재미는 정보의 반전(생각과 다른 원리, 의외의 차이)에서, 따뜻함은 시청자의 실제 상황(가족 반찬·손님상·도시락)에서 나오게 해.
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
13. 지어낸 인물·사건·후기("아이가 잘 먹었어요", "손님이 감탄했어요")는 쓰지 마. "실험 결과", "연구로 증명", "해 봤더니" 같은 가짜 사실 표현, 건강 효능 주장도 금지.

## 형식
- 장면 6~8개. 대사는 공백 빼고 대본 전체 170~220자 (실제 목소리로 약 32~40초). 270자를 넘으면 영상이 45초를 넘어 지루해져. 한 장면 대사는 한두 문장, 짧고 말하기 쉽게.
- type: intro | question | mistake | explain | ingredients | steps | tip | outro
- emotion: ${EMOTIONS.join(' | ')} (surprised·embarrassed는 아껴 써)
- visual(선택): result(완성 음식 먼저) | fail(맛조수가 든 실패 접시) | fail-closeup(실패 음식 클로즈업) | compare(비교) | sizzle(조리 클로즈업) | react(맛조수 반응 클로즈업) | signature(마지막 서명 카드, 마지막 장면에만)
- place(필수): 대본 하나에 2~3곳을 써서 무대가 바뀌게 해 (너무 자주 옮기지 마). 조리 장면(type "steps", visual "sizzle")은 불이 있는 kitchen이나 lab에서만.
${PLACES.map((p) => `  - ${p}: ${PLACE_GUIDE[p]}`).join('\n')}
- 대사에는 숫자를 원본 표기 그대로 써 (예: "설탕 2큰술").`;
}

/** 사용자 프롬프트: 원본 자료 + 이번에 쓸 개수·피할 것 */
export function storyUser(recipe: RecipeInput, opts: { count: number; avoidTitles?: string[]; expertAnswers?: string[]; recent?: RecentStory[]; realClips?: number }): string {
  const source = storySourceData(recipe, opts.expertAnswers);
  const recent = opts.recent ?? [];
  const overused = overusedTypes(recent);
  // 다른 형식이 남아 있을 때만 최근에 많이 쓴 형식을 뺀다
  const all = availableStoryTypes(recipe, { expertAnswers: opts.expertAnswers, realClips: opts.realClips });
  const types = all.filter((t) => !overused.includes(t)).length >= opts.count ? all.filter((t) => !overused.includes(t)) : all;
  const avoid = opts.avoidTitles?.length ? `\n- 이미 쓴 제목과 비슷한 대본은 피해: ${opts.avoidTitles.map((t) => `"${t}"`).join(', ')}` : '';
  const motifs = repeatedMotifs(recent, [recipe.dishName, recipe.topic]);
  const account = recent.length
    ? `\n- 이 계정의 최근 대본 ${recent.length}개 (계정 전체가 같은 영상처럼 보이지 않게, 이것들과 다른 형식·첫 대사로):\n${recent.map((r) => `  - [${storyTypeLabel(r.storyType)}] ${r.title} / 첫 대사: ${r.firstLine}`).join('\n')}` +
      (motifs.length ? `\n- 최근에 자주 나온 소재라 이번에는 쓰지 마: ${motifs.map((m) => `"${m}"`).join(', ')}` : '')
    : '';
  return `아래 원본 자료로 형식이 서로 다른 대본 ${opts.count}개를 써.
## 고를 수 있는 형식 (storyType — 이름: 구성 / 지킬 것 / 잘 맞는 시청자)
${types.map((t) => `- ${t}(${STORY_TYPE_INFO[t].label}): ${STORY_TYPE_INFO[t].beats} / ${STORY_TYPE_INFO[t].guide} / ${audienceLabels(STORY_TYPE_INFO[t].fits)}`).join('\n')}
${avoid}${account}

## 원본 자료
${JSON.stringify(source, null, 2)}`;
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
}

/** 최근 대본에서 2번 넘게 쓴 형식 (견본 4편이 모두 '범인 찾기' 추리였다) */
export function overusedTypes(recent: RecentStory[]): StoryType[] {
  const n: Record<string, number> = {};
  for (const r of recent) n[r.storyType] = (n[r.storyType] ?? 0) + 1;
  return STORY_TYPES.filter((t) => (n[t] ?? 0) > 2 || (recent.length >= 3 && (n[t] ?? 0) / recent.length > 0.4));
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
export function finalizeStory(recipe: RecipeInput, draft: StoryDraft, id: string): StoryCandidate | { id: string; error: string } {
  const last = draft.scenes.length - 1;
  const raw = {
    title: draft.title.trim(),
    style: AI_STORY_STYLE,
    hookType: draft.storyType,
    scenes: draft.scenes.map((s, i) => ({
      id: `s${i + 1}`,
      type: s.type,
      emotion: s.emotion,
      line: s.line.trim(),
      ...(s.cardTitle?.trim() ? { cardTitle: s.cardTitle.trim() } : {}),
      ...(s.cardItems?.length ? { cardItems: s.cardItems.map((c) => c.trim()).filter(Boolean) } : {}),
      // 서명 카드는 마지막 장면에만 (중간에 나오면 영상이 끝난 것처럼 보인다)
      ...(s.visual && (s.visual !== 'signature' || i === last) ? { visual: s.visual } : {}),
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
    issues: checkScript(recipe, script),
    notes: enforced.notes,
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

/** 원본 대조에서 막히는 문제(분량·재료·순서 오류)가 있는지 */
export function storyBlocked(c: Pick<StoryCandidate, 'issues'>): boolean {
  return c.issues.some((i) => i.level === 'error');
}
