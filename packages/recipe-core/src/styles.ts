import { BRAND } from './brand.ts';
import { formatIngredient, splitSentences } from './format.ts';
import { HOOK_TYPES, hookCandidate, suggestHooks, type HookCandidate, type HookType } from './hooks.ts';
import { MAX_STEPS_ON_CARD } from './generator/template.ts';
import { causeEffect, spoken } from './korean.ts';
import { normalizeText } from './text.ts';
import type { RecipeInput, Scene, Script } from './types.ts';

/**
 * 연출 유형(편집 문법) 6종. 장면 구조만 정하고, 장면 길이는 대사 길이(음성)에 맞춰 정해진다.
 * 근거: docs/research/content-strategy/editing-playbook.md
 */
export const STYLE_IDS = ['problem', 'comedy', 'experiment', 'before-after', 'sensory', 'story'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export interface StyleInfo {
  label: string;
  summary: string;
  /** 장면 흐름 */
  beats: string[];
  /** 권장 길이(초) — 강제하지 않는다 */
  seconds: [number, number];
  /** 필요한 화면 소재 */
  visuals: string;
  sound: string;
  captions: string;
  transitions: string;
  /** 잘 맞는 훅 (앞쪽이 우선) */
  hooks: HookType[];
  /** 꼭 있어야 하는 원본 자료 (없으면 다른 장면으로 대신한다) */
  needs: string[];
}

export const STYLE_INFO: Record<StyleId, StyleInfo> = {
  problem: {
    label: '문제 해결형',
    summary: '흔한 실수 → 원인 → 해결법 → 전문가 팁',
    beats: ['훅: 실수·문제', '짧은 브랜드', '원인(연구자 노트)', '재료', '바른 순서', '한 줄 팁', '서명 엔딩'],
    seconds: [25, 40],
    visuals: '실패한 결과, 조리 클로즈업, 완성 접시',
    sound: '실수 순간 짧은 효과음, 해결 장면은 밝게',
    captions: '실수 문장은 빨간 강조, 해결 단계는 번호 카드',
    transitions: '실패 → 원인은 빠르게, 해결 과정은 단계마다 끊기',
    hooks: ['mistake', 'problem-solve', 'skit', 'compare'],
    needs: ['흔한 실수'],
  },
  comedy: {
    label: '캐릭터 코미디형',
    summary: '맛조수의 실수 → 반응 → 연구자 노트로 해결 → 반전 성공',
    beats: ['훅: 맛조수 실수', '당황 반응', '연구자 노트', '다시 조리', '성공 반전', '서명 엔딩'],
    seconds: [25, 40],
    visuals: '실패 음식, 맛조수 반응 클로즈업, 완성 접시',
    sound: '실수·반응에 효과음, 짧은 정적 뒤 해결',
    captions: '맛조수 감탄은 크게, 원리는 연구자 자막 스타일',
    transitions: '반응 클로즈업 → 조리 장면 점프컷',
    hooks: ['skit', 'mistake', 'twist'],
    needs: [],
  },
  experiment: {
    label: '요리 과학 실험형',
    summary: '질문 → 비교(설명용) → 원리 → 과정 → 전문가 정리',
    beats: ['훅: 질문·비교', '짧은 브랜드', '원리 1', '원리 2', '재료', '순서', '전문가 정리', '서명 엔딩'],
    seconds: [30, 45],
    visuals: '좌우 비교(설명용 표시), 조리 클로즈업',
    sound: '공개 순간 효과음',
    captions: '핵심 원리 단어 강조',
    transitions: '비교 → 원리 장면으로 확대 전환',
    hooks: ['experiment', 'compare', 'question', 'surprising-fact'],
    needs: ['"~하면 ~합니다" 형태의 원리 문장'],
  },
  'before-after': {
    label: '전후 비교형',
    summary: '완성 먼저 → 과정 → 차이 비교 → 팁',
    beats: ['훅: 완성 공개', '짧은 브랜드', '재료', '순서', '차이 비교(설명용)', '한 줄 팁', '서명 엔딩'],
    seconds: [25, 40],
    visuals: '완성 접시, 좌우 비교',
    sound: '완성 공개에 효과음',
    captions: '전·후 라벨',
    transitions: '완성 → 처음으로 되감기',
    hooks: ['result-first', 'compare', 'sensory'],
    needs: [],
  },
  sensory: {
    label: '감각 중심형',
    summary: '식감·색 클로즈업 위주, 말은 최소',
    beats: ['훅: 식감·완성', '재료', '순서', '한 줄 팁', '서명 엔딩'],
    seconds: [18, 30],
    visuals: '음식 클로즈업 위주',
    sound: '대사 적게, 조리 소리(실제 녹음이 있을 때만)',
    captions: '짧은 단어 자막',
    transitions: '느린 확대, 부드러운 연결',
    hooks: ['sensory', 'result-first'],
    needs: ['원본 속 식감·맛 표현'],
  },
  story: {
    label: '역사·전통음식 스토리형',
    summary: '이야기 → 원리 → 과정 → 연구자 서명',
    beats: ['훅: 이야기', '짧은 브랜드', '이야기 이어서', '원리', '재료', '순서', '서명 엔딩'],
    seconds: [30, 50],
    visuals: '완성 음식, 이야기 카드',
    sound: '차분한 배경음',
    captions: '이야기는 연구자 자막 스타일',
    transitions: '부드러운 전환',
    hooks: ['story', 'result-first', 'expert-view', 'question'],
    needs: ['음식 이야기·유래 (연구자 입력)'],
  },
};

export interface StyledOptions {
  style: StyleId;
  /** 정하지 않으면 연출 유형에 가장 잘 맞는 훅을 고른다 */
  hookType?: HookType;
}

export interface StyledResult {
  script: Script;
  hook: HookCandidate;
  /** 사용자에게 알릴 점 (빠진 자료, 대신 쓴 장면 등) */
  notes: string[];
}

type Draft = Omit<Scene, 'id'>;

/** 띄어쓰기·문장부호·끝맺음 차이를 빼고, 문장 앞부분이 이미 말한 글에 들어 있는지 */
function alreadySaid(said: string, sentence: string): boolean {
  const s = normalizeText(sentence);
  if (s.length < 4) return false;
  const key = s.slice(0, Math.max(4, Math.min(12, s.length - 2)));
  return normalizeText(said).includes(key);
}

/** 연출 유형에 맞는 훅을 고른다: 지정한 훅 → 연출 선호 훅 → 전체 추천 1순위 */
export function pickHook(recipe: RecipeInput, style: StyleId, hookType?: HookType): HookCandidate {
  const preferred = STYLE_INFO[style].hooks;
  if (hookType) return hookCandidate(recipe, hookType, { preferred });
  // 연출 유형의 대표 훅을 먼저 쓴다 (코미디형이면 상황극). 만들 수 없을 때만 전체 추천에서 고른다.
  const ranked = suggestHooks(recipe, { preferred });
  return preferred.map((t) => ranked.find((h) => h.type === t && h.available)).find(Boolean) ?? ranked.find((h) => h.available)!;
}

/**
 * 연출 유형 + 훅으로 대본을 조립한다. 비용 0원, 원본 문장만 쓴다.
 * 훅 장면에는 hook: true 표시가 붙어, 나중에 훅만 바꿀 수 있다.
 */
export function buildStyledScript(recipe: RecipeInput, opts: StyledOptions): StyledResult {
  const notes: string[] = [];
  const hook = pickHook(recipe, opts.style, opts.hookType);
  if (!hook.available) throw new Error(`${hook.label} 훅을 만들 수 없어요: ${hook.missing}이(가) 필요해요.`);

  const dish = recipe.dishName || recipe.topic;
  // 훅에서 이미 말한 원리·팁 문장은 본문에서 다시 말하지 않는다
  const hookSaid = hook.scenes.map((s) => s.line).join(' ');
  const principle = splitSentences(recipe.principle).filter((s) => !alreadySaid(hookSaid, s));
  const tip = recipe.tips.find((t) => !alreadySaid(hookSaid, t));
  const style = opts.style;
  const body: Draft[] = [];

  // 훅 다음 장면: 주제를 아직 말하지 않았으면 주제를, 말했으면 짧은 연결 문장을 말한다. 연구소 이름은 엔딩 서명에서 말한다
  const topicSaid = alreadySaid(hookSaid, recipe.topic);
  const brand = (): Draft => ({ type: 'intro', emotion: 'joy', line: topicSaid ? '맛 연구소에서 같이 알아봐요!' : `오늘의 실험! ${recipe.topic}`, cardTitle: recipe.topic });
  // 화면 카드는 원본 문장 그대로, 대사는 맛조수 말투(~해요)로
  const explain = (i: number, lead: string = BRAND.noteLead): Draft | null => {
    const s = principle[i];
    if (!s) return null;
    const line = i === 0 ? `${lead} ${spoken(s)}` : spoken(s);
    return { type: 'explain', emotion: i === 0 ? 'surprised' : 'confident', line: line.trim(), cardTitle: BRAND.notePhrase, cardItems: [s] };
  };
  const ingredients = (): Draft | null => {
    if (!recipe.ingredients.length) return null;
    const names = recipe.ingredients.map((i) => i.name);
    return { type: 'ingredients', emotion: 'joy', line: names.length <= 3 ? `준비물은 ${names.join(', ')}!` : '준비물은 이거예요!', cardTitle: '준비물', cardItems: recipe.ingredients.map(formatIngredient) };
  };
  const steps = (line: (n: number, rest: number) => string): Draft | null => {
    if (!recipe.steps.length) return null;
    const shown = recipe.steps.slice(0, MAX_STEPS_ON_CARD);
    const rest = recipe.steps.length - shown.length;
    return { type: 'steps', emotion: 'confident', line: line(shown.length, rest), cardTitle: '조리 순서', cardItems: shown };
  };
  const tipScene = (): Draft | null => (tip ? { type: 'tip', emotion: 'confident', line: `${BRAND.tipLead} ${spoken(tip)}`, cardTitle: BRAND.tipPhrase, cardItems: [tip] } : null);
  const signature = (line: string): Draft => ({ type: 'outro', emotion: 'joy', line, visual: 'signature' });
  // 영상에는 앞의 몇 단계만 보여 줄 때: "딱 5단계"라고 하면 원본(6단계)과 달라지므로 "핵심 5단계, 전체 6단계는 블로그에"로 말한다
  const total = recipe.steps.length;
  const restNote = (rest: number) => (rest > 0 ? `, 전체 ${total}단계는 블로그에` : '');
  const count = (n: number, rest: number) => (rest > 0 ? `핵심 ${n}단계` : `딱 ${n}단계`);

  switch (style) {
    case 'problem': {
      if (!recipe.commonMistake) notes.push('흔한 실수가 입력되지 않아, 실수 대신 원리 중심으로 구성했어요. 연구자에게 실제로 자주 보는 실수를 물어 입력하면 더 좋아요.');
      body.push(brand());
      // 원리 문장이 원인 설명일 수도, 바른 방법일 수도 있어서 "원인은요"로 단정하지 않는다 (실패 장면 뒤에 해결법 문장이 오면 앞뒤가 안 맞았다)
      body.push(explain(0)!);
      body.push(ingredients()!, steps((n, r) => `바른 순서는 ${count(n, r)}${restNote(r)}!`)!, tipScene()!);
      body.push(signature(`다음에 만들 때 꺼내 보게 저장! ${BRAND.signOff}`));
      break;
    }
    case 'comedy': {
      // 훅이 실패 장면일 때만 "왜 이렇게 됐냐"고 묻는다 (질문 훅 뒤에는 이어지는 질문으로)
      const failed = hook.type === 'skit' || hook.type === 'mistake' || hook.type === 'problem-solve';
      const ask = failed ? '대체 왜 이렇게 된 거죠?' : hook.type === 'curiosity-gap' ? '어떤 단계예요?' : '왜 그런 거예요?';
      body.push({ type: 'question', emotion: failed ? 'disappointed' : 'curious', line: `${BRAND.callName}! ${ask}`, visual: 'react' });
      body.push(explain(0, '노트에 답이 있었어요!')!, explain(1)!);
      body.push(steps((n, r) => `${failed ? '이번엔 제대로!' : '그럼 만들어 볼게요!'} ${count(n, r)}${restNote(r)}!`)!);
      body.push(signature(`${failed ? '대성공! ' : ''}${BRAND.signOff}`));
      break;
    }
    case 'experiment': {
      body.push(brand());
      body.push({ ...explain(0)!, visual: 'sizzle' }, explain(1)!);
      body.push(ingredients()!, steps((n, r) => `순서는 ${count(n, r)}${restNote(r)}!`)!, tipScene()!);
      body.push(signature(`실험 노트는 저장해 두세요! ${BRAND.signOff}`));
      break;
    }
    case 'before-after': {
      body.push(brand(), ingredients()!, steps((n, r) => `만드는 법은 ${count(n, r)}${restNote(r)}!`)!);
      const ce = splitSentences(recipe.principle).map(causeEffect).find(Boolean);
      if (ce) {
        body.push({ type: 'explain', emotion: 'surprised', line: `${BRAND.noteLead} ${ce.cause} ${spoken(ce.effect)}`, visual: 'compare', cardTitle: `${dish} 비교`, cardItems: ['건너뛰면', '노트대로 하면'] });
        notes.push('비교 장면은 실제 실험 영상이 아닌 설명용 연출입니다. 화면에 "설명용 연출"이 표시돼요.');
      } else {
        body.push(explain(0)!);
      }
      body.push(tipScene()!, signature(`완성 사진처럼 만들었다면 저장! ${BRAND.signOff}`));
      break;
    }
    case 'sensory': {
      body.push(ingredients()!, steps((n, r) => (r > 0 ? `핵심 ${n}단계${restNote(r)}!` : `${n}단계면 끝!`))!, tipScene()!);
      body.push(signature(`저장해 두고 만들어 보세요! ${BRAND.signOff}`));
      break;
    }
    case 'story': {
      const story = splitSentences(recipe.story ?? '');
      body.push(brand());
      if (story.length > 1) body.push({ type: 'explain', emotion: 'curious', line: story.slice(1, 3).join(' '), cardTitle: '맛 연구소 이야기' });
      else notes.push('이야기가 짧아 이야기 장면 하나로 구성했어요. 연구자의 경험담을 더 입력하면 이야기 장면이 늘어나요.');
      body.push(explain(0)!, ingredients()!, steps((n, r) => `만드는 법은 ${n}단계${restNote(r)}!`)!);
      body.push(signature(`이야기가 있는 요리였어요. ${BRAND.signOff}`));
      break;
    }
  }

  const drafts = [...hook.scenes, ...body.filter((d): d is Draft => Boolean(d))].slice(0, 12);
  const scenes = drafts.map((d, i) => ({ id: `s${i + 1}`, ...d }));
  if (scenes.length < 3) throw new Error('원본 자료가 부족해 대본을 만들 수 없어요. 재료·순서·원리를 입력해 주세요.');
  for (const n of hook.needsReview) notes.push(n);
  return { script: { title: recipe.topic, style, hookType: hook.type, scenes }, hook, notes };
}

/**
 * 지금 대본의 훅만 바꾼다. 훅 장면(hook: true)만 새로 만들고 나머지 장면은 그대로 둔다.
 * (그대로 둔 장면은 음성을 다시 만들지 않는다)
 */
export function applyHook(script: Script, recipe: RecipeInput, type: HookType): { script: Script; hook: HookCandidate } {
  const preferred = script.style && (STYLE_IDS as readonly string[]).includes(script.style) ? STYLE_INFO[script.style as StyleId].hooks : undefined;
  const hook = hookCandidate(recipe, type, { preferred });
  if (!hook.available) throw new Error(`${hook.label} 훅을 만들 수 없어요: ${hook.missing}이(가) 필요해요.`);
  let lead = 0;
  while (lead < script.scenes.length && script.scenes[lead]!.hook) lead++;
  const rest = script.scenes.slice(lead);
  if (hook.scenes.length + rest.length > 12) {
    throw new Error('장면이 12개를 넘게 돼요. 장면 하나를 지운 뒤 다시 바꿔 주세요.');
  }
  // 새 훅 장면은 항상 새 번호를 쓴다: 예전 훅 장면에 올린 클립이 새 훅에 잘못 붙지 않게 (음성은 대사로 찾으므로 그대로 재사용)
  const used = new Set(script.scenes.map((s) => s.id));
  let n = 1;
  const freshId = () => {
    while (used.has(`h${n}`)) n++;
    used.add(`h${n}`);
    return `h${n}`;
  };
  const scenes = [...hook.scenes.map((d) => ({ id: freshId(), ...d })), ...rest];
  return { script: { ...script, hookType: type, scenes }, hook };
}

export function isHookType(v: unknown): v is HookType {
  return typeof v === 'string' && (HOOK_TYPES as readonly string[]).includes(v);
}
export function isStyleId(v: unknown): v is StyleId {
  return typeof v === 'string' && (STYLE_IDS as readonly string[]).includes(v);
}
