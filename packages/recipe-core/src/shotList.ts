import { formatIngredient } from './format.ts';
import { estimateSceneSeconds } from './generator/template.ts';
import { josa } from './korean.ts';
import { clipGroups } from './reelPrompts.ts';
import type { RecipeInput, Scene, Script } from './types.ts';

/**
 * 촬영 목록: 영상 묶음(clipGroups, 약 8초)마다 연구자가 휴대폰으로 찍을 장면을 쉬운 말로 알려 준다.
 * 진짜 음식이 화면에 나오면 끝까지 보는 사람이 많아서, 3D 대신 실제 촬영 영상을 넣는 것이 가장 큰 개선이다.
 *
 * 원칙: 재료·분량·순서 문장은 원본 레시피 글자 그대로 옮긴다 (줄이거나 바꾸지 않는다).
 */
export type FilmShotKind = 'dish' | 'step' | 'closeup' | 'ingredients';

export interface FilmShot {
  /** 묶음 번호 (1부터, 화면의 '장면 묶음' 번호와 같다) */
  group: number;
  /** 이 묶음의 장면 id (첫 id에 영상을 올린다) */
  sceneIds: string[];
  kind: FilmShotKind;
  /** 한눈에 보는 제목 (예: '완성 요리 · 위에서') */
  title: string;
  /** 찍을 장면 설명 (쉬운 말) */
  instruction: string;
  /** 원본 레시피에서 그대로 옮긴 글 (조리 순서 문장·재료). 찍을 때 보는 참고 */
  quote: string[];
  /** 몇 초쯤 찍으면 되는지 (3~8초) */
  seconds: number;
  /** 한 줄 요령 */
  tip: string;
}

/** 모든 촬영에 공통인 요령 (화면 맨 위에 한 번) */
export const SHOT_TIPS = [
  '휴대폰은 세로로 들어 주세요 (가로 말고 세로).',
  '손만 나와도 괜찮아요. 얼굴은 안 나와도 돼요.',
  '소리를 켜고 찍어 주세요. 지글지글 소리가 목소리 밑에 작게 깔려요.',
  '찍는 동안 말은 안 해도 돼요. 목소리는 맛조수가 넣어요.',
] as const;

const MIN_SECONDS = 3;
const MAX_SECONDS = 8;

/** 불·소리가 보이는 손동작 (조리 장면에서 이 말이 있는 단계를 먼저, 없으면 손동작이 보이는 단계를 고른다) */
const HEAT_WORDS = /부치|부친|굽|구워|튀기|튀겨|볶|끓|데치|데쳐|뒤집|지져|조리|조려/;
const HAND_WORDS = /버무|무치|무쳐|섞|붓|부어|썰|썬|펴|말아|빚/;

/** 가까이 찍을 순간: 레시피·장면 글에 있는 말로 고른다 (먼저 맞는 것) */
const MOMENTS: { test: RegExp; what: string }[] = [
  { test: /부치|부친|지져|굽|구워|튀기|튀겨|기름|노릇|지글/, what: '팬에서 지글지글 익는 모습 (소리도 함께)' },
  { test: /끓|보글|국물|육수|찌개|탕/, what: '냄비에서 보글보글 끓는 모습' },
  { test: /볶/, what: '팬에서 재료를 볶는 손동작' },
  { test: /데치|데쳐|찬물|헹구|헹궈/, what: '끓는 물에 데치거나 찬물에 헹구는 순간' },
  { test: /바삭|식감|쫄깃|아삭|촉촉|부드러/, what: '젓가락으로 집거나 잘라서 식감이 보이는 순간' },
  { test: /반죽|농도|걸쭉|묽/, what: '반죽을 떠서 흘려 보이는 농도' },
  { test: /윤기|소스|양념|조림|졸이/, what: '양념이 묻어 윤기가 도는 모습' },
];
const DEFAULT_MOMENT = '이 장면에서 가장 중요한 순간';

const clampSeconds = (s: number) => Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.ceil(s)));

/** 원본 조리 순서 중 이 장면이 보여 주는 문장 (장면 카드가 원본 문장이면 그것, 아니면 원본 전체) */
function stepsFor(scene: Scene, recipe: RecipeInput): string[] {
  const shown = (scene.cardItems ?? []).filter((c) => recipe.steps.includes(c));
  return shown.length ? shown : recipe.steps;
}

/** 묶음이 어떤 촬영인지: 조리 > 재료 > 첫 장면·결과·마무리(완성 요리) > 설명·팁(가까이) */
function kindOf(scenes: Scene[], isFirst: boolean, isLast: boolean): FilmShotKind {
  if (scenes.some((s) => s.type === 'steps')) return 'step';
  if (scenes.some((s) => s.type === 'ingredients')) return 'ingredients';
  if (isFirst || isLast || scenes.some((s) => s.visual === 'result' || s.type === 'outro' || s.type === 'intro')) return 'dish';
  return 'closeup';
}

/** 대본 묶음마다 휴대폰 촬영 안내를 만든다 (순수 함수) */
export function shotList(script: Script, recipe: RecipeInput): FilmShot[] {
  const byId = new Map(script.scenes.map((s) => [s.id, s]));
  const groups = clipGroups(script);
  const dish = (recipe.dishName || recipe.topic).trim();
  const used = new Set<string>();
  return groups.map((ids, gi) => {
    const scenes = ids.map((id) => byId.get(id)!).filter(Boolean);
    const isFirst = gi === 0;
    const isLast = gi === groups.length - 1 && groups.length > 1;
    const kind = kindOf(scenes, isFirst, isLast);
    const seconds = clampSeconds(scenes.reduce((sum, s) => sum + estimateSceneSeconds(s), 0));
    const base = { group: gi + 1, sceneIds: ids, kind, seconds };

    if (kind === 'step') {
      const scene = scenes.find((s) => s.type === 'steps')!;
      const steps = stepsFor(scene, recipe);
      // 문장 끝 동사(마지막 두 어절)가 불 쓰는 동작인 단계 → 어디든 불 쓰는 말 → 손동작 순
      const tail = (t: string) => t.trim().split(/\s+/).slice(-2).join(' ');
      const focus = steps.find((t) => HEAT_WORDS.test(tail(t))) ?? steps.find((t) => HEAT_WORDS.test(t)) ?? steps.find((t) => HAND_WORDS.test(tail(t))) ?? steps[0];
      return {
        ...base,
        title: '조리 과정 · 손 가까이',
        instruction: focus
          ? `이 단계를 하는 손을 가까이 찍어 주세요: “${focus}”${steps.length > 1 ? ' (아래 다른 단계 중 하나여도 괜찮아요)' : ''}`
          : '조리하는 손을 가까이 찍어 주세요.',
        quote: steps,
        tip: '휴대폰을 한곳에 두고 손만 나오게 찍으면 흔들리지 않아요.',
      };
    }
    if (kind === 'ingredients') {
      return {
        ...base,
        title: '재료 · 위에서',
        instruction: '재료를 도마나 쟁반에 한눈에 펼쳐 놓고 바로 위에서 내려다보며 찍어 주세요.',
        quote: recipe.ingredients.map(formatIngredient),
        tip: '휴대폰을 천천히 옆으로 움직이면 재료가 하나씩 보여요.',
      };
    }
    if (kind === 'dish') {
      const finishing = isLast && !isFirst;
      return {
        ...base,
        title: isFirst ? '완성 요리 · 첫 장면' : finishing ? '완성 요리 · 한 입' : '완성 요리 · 45도',
        instruction: isFirst
          ? `영상 첫 장면이에요. 완성된 ${josa(dish, '을/를')} 접시에 담아 위에서 내려다보거나 비스듬히(45도) 찍어 주세요. 휴대폰을 천천히 가까이 가져가면 좋아요.`
          : finishing
            ? `완성된 ${dish}에서 숟가락이나 젓가락으로 한 입 떠 올리는 모습을 찍어 주세요.`
            : `완성된 ${josa(dish, '을/를')} 비스듬히(45도) 찍어 주세요. 김이 나면 더 좋아요.`,
        quote: [],
        tip: '창가 자연광에서 찍으면 더 맛있어 보여요.',
      };
    }
    // 그 장면의 말에서 먼저 찾고, 없으면 레시피 전체에서. 앞에서 이미 고른 순간은 되도록 피한다
    const own = scenes.flatMap((s) => [s.line, ...(s.cardItems ?? [])]).join(' ');
    const all = [own, recipe.principle, ...recipe.steps].join(' ');
    const fresh = (m: (typeof MOMENTS)[number]) => !used.has(m.what);
    const moment = (MOMENTS.find((m) => fresh(m) && m.test.test(own)) ?? MOMENTS.find((m) => m.test.test(own)) ?? MOMENTS.find((m) => fresh(m) && m.test.test(all)) ?? MOMENTS.find((m) => m.test.test(all)))?.what ?? DEFAULT_MOMENT;
    used.add(moment);
    const note = scenes.flatMap((s) => (s.type === 'explain' || s.type === 'tip' ? (s.cardItems ?? []).slice(0, 1) : [])).filter(Boolean);
    return {
      ...base,
      title: '중요한 순간 · 아주 가까이',
      instruction: `${moment}. 휴대폰을 음식 가까이 대고 찍어 주세요.`,
      quote: note,
      tip: '소리를 켜고, 음식에 한 뼘 거리까지 가까이 가 보세요.',
    };
  });
}
