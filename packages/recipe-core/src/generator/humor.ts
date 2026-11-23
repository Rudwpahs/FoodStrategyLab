import type { Gag, RecipeInput, Script } from '../types.ts';

/**
 * 웃음 형식과 돌려쓰기 (2026-11-23, 사용자: "모든 영상이 진지한 엉뚱 가이드일 필요는 없다. 컬투쇼처럼 다른 웃음도").
 * 근거: docs/research/content-strategy/persona-2026-11.md 9절 '웃음 형식과 돌려쓰기'.
 * - 유머는 주의·호감을 올리지만 출처 신뢰도를 깎는다 (Eisend 2009 메타분석) → 웃음 형식은 10편 중 3~4편만.
 * - 유머 광고는 빨리 닳고 여러 버전을 돌려야 한다 (Ipsos), B급은 간헐적으로 (전문가 의견) → 같은 형식은 간격을 둔다.
 * - 최적 비율·간격을 잰 연구는 없다: 아래 숫자는 안전한 시작값이다.
 * 형식 정의(구성·지킬 것)는 story.ts STORY_TYPE_INFO. 이 파일은 story.ts를 부르지 않는다 (서로 부르면 순환).
 */
export const HUMOR_TYPES = ['deadpan', 'wordplay', 'documentary', 'listener-story', 'town-rules', 'relatable', 'vague-vs-note'] as const;
export type HumorType = (typeof HUMOR_TYPES)[number];
export const isHumorType = (t: unknown): t is HumorType => (HUMOR_TYPES as readonly unknown[]).includes(t);

/** 돌려쓰기 규칙 (최근 영상 기준, 새것부터) */
export const HUMOR_ROTATION = {
  /** 최근 이만큼 가운데 */
  window: 10,
  /** 웃음 형식이 이만큼 이상이면 이번에는 웃음 형식을 내지 않는다 (10편 중 3~4편) */
  blockAt: 4,
  /** 같은 웃음 형식은 최근 이만큼 안에 한 번까지 */
  sameTypeGap: 6,
  /** 진지한 엉뚱 가이드는 가장 '큰' 웃음이라 가장 빨리 닳는다: 최근 이만큼 안에 한 번까지 */
  deadpanGap: 8,
} as const;

export interface HumorRotation {
  /** 이번에 내도 되는 웃음 형식 (돌려쓰기만 본 것, 원본 조건은 availableStoryTypes) */
  allowed: HumorType[];
  /** 모두 막힌 이유 (막히지 않았으면 null) */
  blocked: string | null;
}

/**
 * 최근 영상의 형식(새것부터)으로 이번에 낼 수 있는 웃음 형식을 정한다.
 * - 최근 10편 중 웃음 형식이 4편 이상이면 없음
 * - 바로 앞 영상이 웃음 형식이면 없음 (웃음 형식끼리 연달아 내지 않는다)
 * - 같은 웃음 형식은 최근 6편 안에 한 번까지, 엉뚱 가이드는 최근 8편 안에 한 번까지
 */
export function humorRotation(history: readonly string[]): HumorRotation {
  const r = HUMOR_ROTATION;
  const humorCount = history.slice(0, r.window).filter(isHumorType).length;
  if (humorCount >= r.blockAt) return { allowed: [], blocked: `최근 ${r.window}편 중 웃음 형식이 ${humorCount}편이라 이번에는 정보형만 써요` };
  if (isHumorType(history[0])) return { allowed: [], blocked: '바로 앞 영상이 웃음 형식이라 이번에는 정보형만 써요' };
  const allowed = HUMOR_TYPES.filter((t) => !history.slice(0, t === 'deadpan' ? r.deadpanGap : r.sameTypeGap).includes(t));
  return { allowed, blocked: allowed.length ? null : '웃음 형식을 모두 최근에 써서 이번에는 정보형만 써요' };
}

/** 같은 입력이면 늘 같은 0~1 값 (요리마다 다른 웃음 형식이 먼저 오게) */
function hashSeed(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/**
 * 이번 묶음에 넣을 웃음 형식 하나 (없으면 undefined). 원본으로 쓸 수 있는 형식(available) 가운데 돌려쓰기를 통과한 것에서:
 * 1) 연구자 답변이 있으면 사연 한 통(답변판)을 먼저 (진짜 이야기가 가장 강하고 원칙에도 가장 안전, 조사 7-5)
 * 2) 오래 안 쓴 형식 먼저 (최근 기록에 없으면 가장 앞)
 * 3) 같으면 요리 이름으로 고정 순서를 섞는다 (영상마다 같은 형식이 먼저 오지 않게)
 */
export function pickHumorType(available: readonly string[], history: readonly string[], opts: { seed?: string; expertAnswers?: string[] } = {}): HumorType | undefined {
  const { allowed } = humorRotation(history);
  const pool = allowed.filter((t) => available.includes(t));
  if (!pool.length) return undefined;
  if (opts.expertAnswers?.some((a) => a.trim()) && pool.includes('listener-story')) return 'listener-story';
  const lastUse = (t: HumorType) => {
    const i = history.indexOf(t);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return [...pool].sort((a, b) => lastUse(b) - lastUse(a) || hashSeed(`${opts.seed ?? ''}:${a}`) - hashSeed(`${opts.seed ?? ''}:${b}`))[0];
}

// ───────── 글자 그대로 (wordplay) ─────────

/**
 * 말장난 후보: 요리 말 + 그 말의 다른 뜻 (표준국어대사전에 따로 있는 뜻만). 원본 조리순서·팁에 그 말이 나올 때만 쓴다.
 * 다른 뜻이 위험한 행동(물·기름 튀기기 등)이거나 사람을 깎는 말(들볶다 등)인 낱말은 넣지 않았다.
 * gags: 그 다른 뜻을 그대로 보여 주는 농담 그림
 */
export interface WordplayWord {
  word: string;
  re: RegExp;
  /** 요리 밖의 다른 뜻 (작가에게 보여 준다) */
  other: string;
  gags: readonly Gag[];
}
export const WORDPLAY_WORDS: readonly WordplayWord[] = [
  { word: '부치다', re: /부치|부쳐|부친/, other: '편지·소포를 우체국으로 보내다, 부채를 흔들어 바람을 일으키다', gags: ['mailbox', 'hand-fan'] },
  { word: '재우다', re: /재우|재워|재운/, other: '아이를 잠들게 하다', gags: ['bedtime'] },
  { word: '식히다', re: /식히|식혀|식힘/, other: '머리를 식히다(쉬면서 생각을 가라앉히다)', gags: ['hand-fan', 'north-pole'] },
  { word: '졸이다', re: /졸이|졸여|졸인/, other: '마음을 졸이다(조마조마해하다)', gags: ['roller-coaster'] },
  { word: '뜸 들이다', re: /뜸을?\s?들/, other: '말이나 일을 바로 하지 않고 머뭇거리다', gags: ['magnifier'] },
  { word: '숨이 죽다', re: /숨이?\s?죽|숨을?\s?죽/, other: '숨을 죽이다(소리 내지 않고 조용히 하다)', gags: ['camping'] },
  { word: '썰다', re: /썰(고|어|기|다|은)|썬다|썰 /, other: '썰을 풀다(이야기를 늘어놓다)', gags: ['camping'] },
  { word: '간을 보다', re: /간을?\s?(보|봐|맞)/, other: '남의 속마음을 슬쩍 떠보다', gags: ['magnifier'] },
  { word: '익히다', re: /익히|익혀/, other: '얼굴·기술을 익히다(낯익게 하다, 배워 몸에 붙이다)', gags: ['magnifier'] },
  { word: '불리다', re: /불려|불리|불린/, other: '이름이 불리다', gags: ['mailbox'] },
];

/** 원본 조리순서·팁·원리에 나오는 말장난 후보 */
export function wordplayWords(recipe: Pick<RecipeInput, 'steps' | 'tips' | 'principle'>): WordplayWord[] {
  const text = [...recipe.steps, ...recipe.tips, recipe.principle ?? ''].join(' ');
  return WORDPLAY_WORDS.filter((w) => w.re.test(text));
}

/** 글자 그대로: 그 뜻이 아니라고 밝히는 전환 줄 (농담·물론 아니고·진짜 뜻·요리에서 말하는·사실은) */
export const WORDPLAY_TURN = /농담|장난|물론\s?(그|아니)|그\s?(뜻|말|부치다|재우다|식히다|졸이다)[은는이가]?\s?아니|진짜\s?뜻|원래\s?뜻|요리(에서|에선|할\s?때)\s?(말하는|쓰는|는|의)|부엌(에서|에선)\s?(말하는|쓰는|는|의)|사실은/;

// ───────── 부엌 다큐 (documentary) ─────────

/** 원본 순서에 보이거나 들리는 익음 신호가 있어야 다큐 해설거리가 있다 */
export const DOC_CUES = /노릇|투명|색이|색깔|빛깔|거품|가장자리|보글|지글|자글|끓어오르|끓으면|끓는|김이|부풀|숨이\s?죽|윤기|떠오르|소리|갈색|맑아|걸쭉|되직|말랑|단단|바삭|굳/;

/** 음식을 아파하는 생명처럼 그리는 말 (얼굴 있는 음식은 먹고 싶은 마음을 줄인다: Schroll 2023). 요리 말 '숨이 죽다'는 뺀다 */
export const SUFFERING_FOOD = /비명|아파(요|하|서)|아프(다|게|대)|괴로|고통|살려|울부짖|몸부림|희생|죽어\s?가|숨을\s?거두|눈물을\s?흘리|불쌍/;
export function findSufferingFood(text: string): string[] {
  return [...text.matchAll(new RegExp(SUFFERING_FOOD.source, 'g'))].map((m) => m[0]);
}

// ───────── 사연 한 통 (listener-story) ─────────

/** 사연 카드 이름: 가상 이야기 / 연구자 실제 답변 (화면 SceneCard가 편지 모양으로 그린다) */
export const LETTER_FICTION = '가상 사연';
export const LETTER_REAL = '선생님이 받은 질문';
export const LETTER_TITLES = [LETTER_FICTION, LETTER_REAL] as const;
export const isLetterTitle = (t: string | undefined): boolean => Boolean(t && (LETTER_TITLES as readonly string[]).includes(t.trim()));

/** 지어낸 사연을 진짜처럼 보이게 하는 말 (가짜 후기·제보처럼 보이면 원칙 위반) */
export const FAKE_REAL_STORY = /보내\s?주신|보내주신|보내\s?온|보내온|제보|청취자|실화|실제로\s?있었던|실제\s?사연|사연을\s?보내|구독자\s?(님|분)?(의|이|께서)\s?(사연|이야기)/;
export function findFakeRealStory(text: string): string[] {
  return [...text.matchAll(new RegExp(FAKE_REAL_STORY.source, 'g'))].map((m) => m[0]);
}

/**
 * '가상 사연' 표시를 붙일 장면 (영상 화면): 사연 카드가 "가상 사연"이면 영상 처음부터 진짜 정보(노트·팁·재료·순서)가 나오기 전까지.
 * 카드가 첫 화면 규칙·실제 촬영 영상에 가려져도 꾸민 이야기라는 표시는 늘 보이게 한다.
 */
export function fictionStoryScenes(script: Pick<Script, 'scenes'>): number[] {
  const at = script.scenes.findIndex((s) => s.cardTitle?.trim() === LETTER_FICTION);
  if (at < 0) return [];
  const info = script.scenes.findIndex((s, i) => i > at && (s.type === 'explain' || s.type === 'tip' || s.type === 'ingredients' || s.type === 'steps' || s.type === 'outro'));
  const end = info < 0 ? script.scenes.length : info;
  return Array.from({ length: end }, (_, i) => i);
}

// ───────── 이럴 때 꼭 있는 일 (relatable) ─────────

/** 사람을 유형으로 규정하는 말 (상황 대신 사람을 묶으면 반감: 조사 2-형식 2) */
export const PEOPLE_LABELS = /사람\s?(특징|유형)|[가-힣]+\s?유형|[가-힣]+러\s?특징|MBTI|[가-힣]충(?=[\s,.!?]|$)/;

// ───────── 적당히의 나라 (vague-vs-note) ─────────

/** 집안 어른의 말을 지어 인용하는 것 (원본 이야기·답변에 없으면 경고) */
export const FAMILY_QUOTE = /(엄마|어머니|시어머니|친정\s?엄마|할머니|외할머니|시어머님)(가|께서|는|께선|의)?\s?[^.?!]{0,16}(말씀|하셨|하시|그러셨|이라고|라고)/;

/** 분량이 숫자로 적힌 재료 수 (적당히의 나라는 2개 이상일 때만) */
export function measuredIngredients(recipe: Pick<RecipeInput, 'ingredients'>): number {
  return recipe.ingredients.filter((i) => /\d/.test(i.amount ?? '')).length;
}
