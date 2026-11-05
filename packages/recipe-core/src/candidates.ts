import { BRAND } from './brand.ts';
import { causeEffect, findSensory } from './korean.ts';
import { splitSentences } from './format.ts';
import { suggestHooks, type HookCandidate, type HookType, type RecentFormat } from './hooks.ts';
import { STYLE_IDS, STYLE_INFO, buildStyledScript, type StyleId } from './styles.ts';
import { estimateScriptSeconds } from './generator/template.ts';
import { VISUAL_LABELS, type Category, type RecipeInput, type Script, type Visual } from './types.ts';

/**
 * 콘텐츠 후보 3가지: 연출 유형·훅 유형·첫 화면이 모두 서로 다르다.
 * 비용 0원 규칙 엔진. (유료 AI 후보는 승인 후 같은 자리에 붙인다)
 */
export interface ContentCandidate {
  /** `${style}:${hookType}` */
  key: string;
  style: StyleId;
  styleLabel: string;
  hookType: HookType;
  hookLabel: string;
  title: string;
  firstLine: string;
  firstVisual: Visual | undefined;
  firstScreen: string;
  /** 핵심 장면 3개: 첫 장면, 핵심 지식 장면, 마무리 */
  keyScenes: { label: string; line: string; visual?: string }[];
  estimatedSeconds: number;
  /** 이 후보를 추천하는 이유 */
  reason: string;
  /** 연구자가 확인할 점 */
  needsReview: string[];
  script: Script;
}

export interface CandidateOptions {
  /** 이미 보여 준 후보 key (다른 후보 보기) */
  exclude?: string[];
  recent?: RecentFormat[];
  count?: number;
}

const CATEGORY_STYLE: Record<Category, Partial<Record<StyleId, number>>> = {
  science: { experiment: 0.5, problem: 0.3 },
  fix: { problem: 0.5, comedy: 0.3 },
  compare: { experiment: 0.5, 'before-after': 0.3 },
  tradition: { story: 0.5, 'before-after': 0.3 },
};

/** 이 레시피 자료로 각 연출 유형이 얼마나 잘 만들어지는지 */
export function styleScores(recipe: RecipeInput, recent: RecentFormat[] = []): Record<StyleId, { score: number; reason: string; ready: boolean }> {
  const principle = splitSentences(recipe.principle);
  const hasCause = principle.some((s) => causeEffect(s));
  const sensory = findSensory([recipe.topic, recipe.principle, ...recipe.tips].join(' '));
  const out = {} as Record<StyleId, { score: number; reason: string; ready: boolean }>;
  const base: Record<StyleId, [number, string]> = {
    problem: recipe.commonMistake ? [2, '연구자가 입력한 흔한 실수가 있어요'] : [0.4, '흔한 실수가 입력되지 않았어요'],
    comedy: [1.5, '맛조수 캐릭터를 보여 주기 좋아요'],
    experiment: hasCause ? [1.5, '"~하면 ~한다" 원리를 비교로 보여 줄 수 있어요'] : [0.4, '비교할 원리 문장이 없어요'],
    'before-after': [1.2, '완성 모습을 먼저 보여 줄 수 있어요'],
    sensory: sensory.length ? [1, `원본에 "${sensory[0]!.stem}" 같은 식감 표현이 있어요`] : [0.2, '식감 표현이 없어요'],
    story: recipe.story ? [2, '연구자가 입력한 음식 이야기가 있어요'] : [0.2, '음식 이야기가 입력되지 않았어요'],
  };
  for (const id of STYLE_IDS) {
    let [score, reason] = base[id];
    // 꼭 필요한 자료(실수·이야기·식감 표현·원리 문장)가 없으면 후보로 내지 않는다 (제목이 없는 내용을 약속하지 않게)
    const ready = base[id][0] >= 0.5;
    score += CATEGORY_STYLE[recipe.category][id] ?? 0;
    const repeats = recent.slice(0, 3).filter((r) => r.style === id).length;
    if (repeats >= 2) {
      score -= 1;
      reason += ` · 최근 ${repeats}편이 같은 유형이라 순위를 낮췄어요`;
    }
    out[id] = { score, reason, ready };
  }
  return out;
}

const dishOf = (r: RecipeInput) => r.dishName || r.topic;

/** 후보 제목: 원본에 있는 내용만 쓴다 (결과를 보장하는 표현 없이) */
export function candidateTitle(recipe: RecipeInput, style: StyleId): string {
  const dish = dishOf(recipe);
  const sensory = findSensory([recipe.topic, recipe.principle, ...recipe.tips].join(' '))[0];
  switch (style) {
    case 'problem':
      return `${dish}, 이 실수만 피하세요`;
    case 'comedy':
      return `맛조수의 ${dish} 도전기`;
    case 'experiment':
      return `${dish} 실험: 이 단계가 맛을 바꿀까?`;
    case 'before-after':
      return `${dish}, 완성부터 보고 시작해요`;
    case 'sensory':
      return sensory ? `${sensory.modifier} ${dish}의 비결` : `${dish}의 비결`;
    case 'story':
      return `${dish}에 담긴 이야기`;
  }
}

function keyScenes(script: Script): ContentCandidate['keyScenes'] {
  const first = script.scenes[0]!;
  const core = script.scenes.find((s) => !s.hook && (s.type === 'explain' || s.visual === 'compare')) ?? script.scenes[1]!;
  const last = script.scenes.at(-1)!;
  const v = (x?: Visual) => (x ? VISUAL_LABELS[x] : undefined);
  return [
    { label: '첫 장면', line: first.line, visual: v(first.visual) },
    { label: '핵심 장면', line: core.line, visual: v(core.visual) },
    { label: '마무리', line: last.line, visual: v(last.visual) },
  ];
}

/** 서로 다른 후보 3개 (또는 count개)를 고른다. */
export function contentCandidates(recipe: RecipeInput, opts: CandidateOptions = {}): { candidates: ContentCandidate[]; exhausted: boolean } {
  const count = opts.count ?? 3;
  const exclude = new Set(opts.exclude ?? []);
  const scores = styleScores(recipe, opts.recent);
  // 이미 보여 준 연출 유형은 뒤로: "다른 후보 보기"를 누르면 먼저 다른 유형이 나오게
  const shownStyles = new Set([...exclude].map((k) => k.split(':')[0]));
  const styles = [...STYLE_IDS].sort(
    (a, b) => Number(shownStyles.has(a)) - Number(shownStyles.has(b)) || scores[b].score - scores[a].score || STYLE_IDS.indexOf(a) - STYLE_IDS.indexOf(b),
  );
  const usedHooks = new Set<HookType>();
  const usedVisuals = new Set<string>();
  const usedKeys = new Set<string>();
  const picked: ContentCandidate[] = [];

  /**
   * 1차: 연출 유형마다 하나씩, 훅·첫 화면이 모두 다르게.
   * 2차(그래도 모자라면): 같은 연출 유형이라도 아직 안 쓴 훅으로 하나 더 (첫 화면은 겹쳐도 됨).
   */
  for (const pass of [1, 2] as const) {
    for (const style of styles) {
      if (picked.length >= count) break;
      if (!scores[style].ready) continue;
      const ranked = suggestHooks(recipe, { preferred: STYLE_INFO[style].hooks, recent: opts.recent }).filter((h) => h.available);
      // 연출 유형의 대표 훅을 먼저, 그다음 추천 순서
      const ordered: HookCandidate[] = [
        ...STYLE_INFO[style].hooks.map((t) => ranked.find((h) => h.type === t)).filter((h): h is HookCandidate => Boolean(h)),
        ...ranked.filter((h) => !STYLE_INFO[style].hooks.includes(h.type)),
      ];
      for (const hook of ordered) {
        const key = `${style}:${hook.type}`;
        const visual = hook.scenes[0]?.visual ?? 'none';
        if (exclude.has(key) || usedKeys.has(key) || usedHooks.has(hook.type)) continue;
        if (pass === 1 && usedVisuals.has(visual)) continue;
        let built;
        try {
          built = buildStyledScript(recipe, { style, hookType: hook.type });
        } catch {
          continue;
        }
        const title = candidateTitle(recipe, style);
        const script = { ...built.script, title };
        usedHooks.add(hook.type);
        usedVisuals.add(visual);
        usedKeys.add(key);
        picked.push({
          key,
          style,
          styleLabel: STYLE_INFO[style].label,
          hookType: hook.type,
          hookLabel: hook.label,
          title,
          firstLine: hook.line,
          firstVisual: hook.scenes[0]?.visual,
          firstScreen: hook.firstScreen,
          keyScenes: keyScenes(script),
          estimatedSeconds: Math.round(estimateScriptSeconds(script)),
          reason: [...new Set(`${scores[style].reason} · ${hook.reason}`.replace('연구자가 입력한 실제 실수가 있어요', '연구자가 입력한 흔한 실수가 있어요').split(' · '))].join(' · '),
          needsReview: built.notes,
          script,
        });
        break;
      }
    }
    if (picked.length >= count) break;
  }
  return { candidates: picked, exhausted: picked.length < count };
}

/** 고른 후보로 대본을 다시 만든다 (서버에서 사용, 제목 포함) */
export function scriptForCandidate(recipe: RecipeInput, style: StyleId, hookType: HookType): { script: Script; notes: string[]; title: string } {
  const built = buildStyledScript(recipe, { style, hookType });
  const title = candidateTitle(recipe, style);
  return { script: { ...built.script, title }, notes: built.notes, title };
}

/** 인스타그램 설명: 후보 첫 대사로 시작 (매체에 맞는 표현). '검토한'은 승인 후에만. */
export function instagramCaption(recipe: RecipeInput, script: Script, reviewed: boolean, tags: string[]): string {
  const hookLine = script.scenes.find((s) => s.hook)?.line ?? recipe.topic;
  const tip = recipe.tips[0];
  const lines = [
    hookLine,
    '',
    tip ? `💡 ${BRAND.tipPhrase}: ${tip}` : '',
    '전체 재료와 순서는 블로그에 정리했어요. 나중에 만들 때 꺼내 보게 저장해 두세요.',
    '',
    reviewed
      ? `${BRAND.researcherTitle} ${BRAND.researcher}가 검토한 요리 지식을 캐릭터 애니메이션으로 풀었습니다.`
      : `${BRAND.researcherTitle} ${BRAND.researcher}의 요리 지식을 캐릭터 애니메이션으로 풀었습니다. (검수 전 초안)`,
    '🤖 맛조수는 AI 캐릭터이고, 음성은 AI 합성입니다. 조리 지식은 이희재 연구자의 자료입니다.',
    '',
    tags.map((t) => `#${t}`).join(' '),
  ];
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}
