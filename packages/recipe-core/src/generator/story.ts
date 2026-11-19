import { z } from 'zod';
import { BRAND } from '../brand.ts';
import { formatIngredient, splitSentences } from '../format.ts';
import { checkScript, type Issue } from '../fidelity.ts';
import { findHealthClaims } from '../wordLists.ts';
import { CATEGORY_LABELS, EMOTIONS, PLACES, ScriptSchema, VISUALS, type Place, type RecipeInput, type Script } from '../types.ts';
import { enforceSourceData } from './prompt.ts';
import { estimateScriptSeconds } from './template.ts';

/**
 * AI 이야기 대본: 레시피 하나로 이야기가 서로 다른 짧은 영상 대본 몇 개를 쓴다 (서버가 Claude로 부른다).
 * 템플릿·연출 엔진 대본은 문장 틀이 정해져 있어 영상마다 대사·구성이 비슷해진다. 이야기 대본은 매번 새로 쓰되,
 * 원본 레시피의 재료·분량·순서는 그대로 지킨다 (재료·순서 카드는 enforceSourceData가 원본으로 고정, 숫자는 checkScript가 검사).
 */

/** 이야기 갈래. 한 번에 쓰는 대본들은 서로 다른 갈래여야 한다 */
export const STORY_TYPES = ['mystery', 'rescue', 'bet', 'gift', 'myth', 'race', 'memory'] as const;
export type StoryType = (typeof STORY_TYPES)[number];

export const STORY_TYPE_INFO: Record<StoryType, { label: string; guide: string }> = {
  mystery: { label: '추리', guide: '이상한 결과(질척함·탄 맛 등)로 시작해, 단서를 따라가다 선생님 노트에서 범인(원인)을 찾는다' },
  rescue: { label: '구출 작전', guide: '맛조수가 망치기 직전인 요리를 선생님 팁으로 되살린다. 위기 → 반전 → 안도' },
  bet: { label: '내기', guide: '맛조수가 "이건 대충 해도 돼요" 같은 내기를 걸었다가 지고, 제대로 된 방법을 배운다' },
  gift: { label: '선물', guide: '맛조수가 누군가(친구·할머니·동료 로봇 등 캐릭터 세계 안의 인물)에게 이 요리를 해 주고 싶어 한다. 작은 감동으로 끝난다' },
  myth: { label: '오해 깨기', guide: '흔히 믿는 방법을 맛조수가 자신 있게 하다가, 선생님 노트로 오해가 깨진다 (원본의 흔한 오해·실수가 있을 때)' },
  race: { label: '시간 싸움', guide: '"빨리 해야 해!" 상황에서 서두르다 꼬이고, 핵심 한 가지만 지키면 된다는 걸 깨닫는다' },
  memory: { label: '추억', guide: '원본 자료의 "이야기"(음식에 얽힌 이야기)를 바탕으로 한다. 원본에 이야기가 있을 때만 고른다' },
};

/**
 * 시청 대상 (사용자 지정, 2026-11-19): 2·30대 젊은 주부, 4·50대 요리 취미·배우는 사람.
 * 첫 대사(훅)를 그 사람이 신경 쓰는 것으로 시작한다. 숫자(시간·가격 등)는 원본에 있을 때만.
 */
export const AUDIENCES = ['young-home', 'hobby-learner'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_INFO: Record<Audience, { label: string; short: string; cares: string; voice: string; hookIdeas: string }> = {
  'young-home': {
    label: '2·30대 젊은 주부',
    short: '2030 주부',
    cares: '실패 없이 한 번에 성공하기, 가족·아이 반찬과 간식, 재료를 버리지 않기, 손이 덜 가는 방법, 이것 하나만 지키면 되는 요령',
    voice: '친구처럼 빠르고 공감하는 말투 ("저만 이래요?", "이거 하나면 돼요")',
    hookIdeas: '"매번 망하던 그거, 이유가 있었어요" / "아이가 남기던 반찬이 달라진 이유" / "이 단계 빼면 꼭 실패해요" 같은 공감·실패 방지형',
  },
  'hobby-learner': {
    label: '4·50대 요리 취미·배우는 사람',
    short: '4050 요리 배우는 분',
    cares: '왜 그렇게 하는지 원리, 제대로 된 정석, 조리기능장의 방법, 많이들 틀리는 지점, 전통 음식·손님상, 깊은 맛',
    voice: '차분하게 궁금증을 짚는 말투, 전문가 시선 ("조리기능장은 여기서 다르게 해요")',
    hookIdeas: '"대부분 여기서 틀려요" / "조리기능장은 왜 이걸 먼저 할까요?" / "정석은 따로 있었어요" 같은 원리·정석형',
  },
};

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

/** Claude에게 받는 형식 (구조화 출력) */
export const StorySceneDraftSchema = z.object({
  beat: z.enum(['hook', 'conflict', 'turn', 'solve', 'payoff']).describe('이야기에서 이 장면의 자리: 훅·갈등·전환·해결·보상'),
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
  storyType: z.enum(STORY_TYPES),
  audience: z.enum(AUDIENCES).describe('이 대본이 노리는 시청자'),
  logline: z.string().describe('이 이야기를 한 문장으로'),
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
  dining: '식탁: 완성·맛보기·누군가에게 대접',
  pantry: '찬장·냉장고 앞: 재료 꺼내기·준비·실수 발견',
  lab: '연구실 칠판: 원리 설명·선생님 노트',
};

/** 시스템 프롬프트 (레시피와 무관해 캐시된다) */
export function storySystem(): string {
  return `너는 요리 숏폼 채널 "${BRAND.labName}"의 이야기 작가야. 30~40초짜리 세로 영상 대본을 써.

## 등장인물
- ${BRAND.character}: 연구소의 3D 캐릭터 조수. 호기심 많고 성급하고, 자신만만하다가 자주 실수하지만 금방 배운다. 시청자 대신 질문하고, 리액션이 크다. 친근한 해요체.
- ${BRAND.callName}: ${BRAND.researcherTitle} ${BRAND.researcher}. 화면에 직접 나오지 않고, 맛조수가 "${BRAND.callName}"이라고 부르며 선생님의 노트·팁을 전한다.

## 시청자 (누구를 위한 영상인지 정하고 써)
${AUDIENCES.map((a) => `- ${a} = ${AUDIENCE_INFO[a].label}: 관심 — ${AUDIENCE_INFO[a].cares}. 말투 — ${AUDIENCE_INFO[a].voice}. 훅 예 — ${AUDIENCE_INFO[a].hookIdeas}`).join('\n')}
- 대본마다 audience를 하나 정하고, 첫 대사부터 그 사람의 관심사로 말을 걸어. 대본을 여러 개 쓰면 두 시청자가 모두 들어가야 해.
- 훅 예시는 방향만 보여 주는 거야. 그대로 베끼지 말고 이 요리에 맞게 새로 써. "10분", "천 원" 같은 시간·가격은 원본에 있을 때만.

## 이야기 규칙 (가장 중요)
1. 모든 대본은 진짜 이야기여야 해: 훅(첫 장면, 2초 안에 궁금하게) → 갈등(실수·의문·위기·내기) → 전환(선생님 노트의 원리로 깨달음) → 해결(핵심 조리) → 보상(완성·반응·여운). 장면마다 beat를 적어.
2. 첫 대사는 사건이나 질문으로 시작하고 공백 빼고 25자 안으로 짧게 해 (첫 3초에 넘길지 정해진다). 첫 장면은 결과(visual "result")나 문제 순간("fail-closeup")을 바로 보여 줘. 인사·자기소개·"오늘은 ~ 만들어요" 같은 시작은 금지.
3. 대본끼리 이야기 갈래(storyType), 첫 대사, 장면 순서, 마지막 대사가 모두 달라야 해. 같은 문장 틀을 돌려 쓰지 마.
4. 맛조수의 성격이 드러나는 구체적인 말·행동을 넣어 (예: 냄새 맡고 놀라기, 혼잣말, 작은 허세). 설명문을 읽는 말투가 되면 안 돼.
5. 재미(반전·과장된 리액션·웃긴 실수) 또는 감동(누군가를 위한 마음, 작은 성취) 중 적어도 하나가 확실해야 해.
6. 아래 말은 쓰지 마 (예전 영상에서 너무 반복됐어): ${STORY_BANNED_PHRASES.map((p) => `"${p.trim()}"`).join(', ')}.
6-1. 대본마다 "친구한테 보내고 싶은" 한 가지를 꼭 넣어: 원본의 핵심원리·팁·흔한 실수 가운데 하나를, 몰랐던 사람이 "아 그래서였구나" 할 한 문장으로 또렷하게 (인스타그램은 보내기(공유)를 가장 중요하게 본다). 원본에 없는 사실로 만들지 마.
7. 마지막 장면은 이야기의 여운으로 끝내고, 그 대사 안에 "${BRAND.labName}"을 자연스럽게 한 번 넣어 (대본마다 다른 문장으로). 연구소 이름은 대본 전체에서 그 한 번만.

## 사실 규칙 (어기면 그 대본은 버려짐)
8. 요리 지식(재료·분량·시간·온도·순서·원리·팁)은 아래 원본 자료에 있는 것만 써. 원본에 없는 숫자를 만들지 마.
9. 재료 장면(type "ingredients")을 꼭 하나 넣고 cardTitle은 "재료", cardItems는 원본 재료 문자열을 하나도 빼지 말고 그대로 써.
10. 조리 장면(type "steps")을 꼭 하나 넣고 cardItems는 원본 조리순서 문장을 순서대로 그대로 써 (최대 5개, 앞에서부터).
11. 원리 장면(type "explain")의 cardTitle은 "${BRAND.notePhrase}"로 하고, 원본의 핵심원리를 말해.
12. ${BRAND.researcher} 선생님이 실제로 겪은 일·한 말을 지어내지 마. 선생님 경험은 원본의 "이야기"·"전문가답변"에 있을 때만, 그 내용 그대로.
13. 맛조수와 그 주변 인물(친구·할머니 등)의 이야기는 지어내도 돼. 다만 "실험 결과", "연구로 증명" 같은 가짜 사실 표현, 건강 효능 주장은 금지.

## 형식
- 장면 6~8개. 대사는 공백 빼고 대본 전체 170~220자 (실제 목소리로 약 32~40초). 270자를 넘으면 영상이 45초를 넘어 지루해져. 한 장면 대사는 한두 문장, 짧고 말하기 쉽게.
- type: intro | question | mistake | explain | ingredients | steps | tip | outro
- emotion: ${EMOTIONS.join(' | ')}
- visual(선택): result(완성 음식 먼저) | fail(맛조수가 든 실패 접시) | fail-closeup(실패 음식 클로즈업) | compare(비교) | sizzle(조리 클로즈업) | react(맛조수 반응 클로즈업) | signature(마지막 서명 카드, 마지막 장면에만)
- place(필수): 대본 하나에 2~3곳을 써서 무대가 바뀌게 해 (너무 자주 옮기지 마). 조리 장면(type "steps", visual "sizzle")은 불이 있는 kitchen이나 lab에서만.
${PLACES.map((p) => `  - ${p}: ${PLACE_GUIDE[p]}`).join('\n')}
- 대사에는 숫자를 원본 표기 그대로 써 (예: "설탕 2큰술").`;
}

/** 사용자 프롬프트: 원본 자료 + 이번에 쓸 개수·피할 것 */
export function storyUser(recipe: RecipeInput, opts: { count: number; avoidTitles?: string[]; expertAnswers?: string[] }): string {
  const source = storySourceData(recipe, opts.expertAnswers);
  const types = availableStoryTypes(recipe);
  const avoid = opts.avoidTitles?.length ? `\n- 이미 쓴 제목과 비슷한 이야기는 피해: ${opts.avoidTitles.map((t) => `"${t}"`).join(', ')}` : '';
  return `아래 원본 자료로 이야기가 서로 다른 대본 ${opts.count}개를 써.
- 고를 수 있는 이야기 갈래: ${types.map((t) => `${t}(${STORY_TYPE_INFO[t].label}: ${STORY_TYPE_INFO[t].guide})`).join(' / ')}${avoid}

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

/** 원본에 재료가 있어야 쓸 수 있는 갈래를 거른다 */
export function availableStoryTypes(recipe: RecipeInput): StoryType[] {
  return STORY_TYPES.filter((t) => {
    if (t === 'memory') return Boolean(recipe.story?.trim());
    if (t === 'myth') return Boolean(recipe.misconception?.trim() || recipe.commonMistake?.trim());
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
