import { findSensory, type RecipeInput } from '@mat-lab/recipe-core';

/**
 * 화면 자막의 겉모양 규칙 (순수 함수): 강조할 낱말 고르기, 줄 나누기·글자 크기.
 * 자막을 어떻게 끊고 언제 보이는지(captionGroups, timeline.ts)는 SRT와 같아야 하므로 여기서 건드리지 않는다.
 */

// ── 강조 낱말 ──

/** 강조할 낱말을 고를 때 쓰는 이 레시피의 이름들 */
export interface CaptionKeywords {
  /** 요리 이름 (띄어 쓴 이름은 낱말별로) */
  dish: string[];
  /** 원본 재료 이름 */
  ingredients: string[];
}

/** 맛·식감·결과를 말하는 낱말 (공통 식감 목록 findSensory에 더해 숏폼에서 자주 세우는 말) */
const FOOD_WORDS = ['눅눅', '떫', '비린', '질척', '물컹', '퍽퍽', '흐물', '쫄깃', '탱글', '폭신', '노릇', '짭짤', '매콤', '새콤', '불맛', '잡내', '실패', '성공', '완성', '꿀팁', '비법', '비결', '핵심'];

/** 이름 뒤에 붙는 조사·짧은 끝말 (한 글자 재료 '물'이 '물론'에 걸리지 않게) */
const PARTICLE = /^(?:은|는|이|가|을|를|에|에서|에다|으로|로|와|과|도|만|의|이랑|랑|까지|부터|처럼|보다|하고|이에요|예요|이죠|죠|은요|는요|이요|요|이나|나|도요|만요)?$/;

/** 낱말 앞뒤 문장부호를 뗀다 */
const bare = (word: string) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** 재료 이름 정리: 괄호 설명을 빼고 띄어쓰기 없이 (예: '들깨 가루(국산)' → '들깨가루') */
const cleanName = (name: string) => name.replace(/\([^)]*\)/g, '').replace(/\s+/g, '').trim();

export function captionKeywords(recipe: Pick<RecipeInput, 'dishName' | 'ingredients'> | undefined): CaptionKeywords {
  if (!recipe) return { dish: [], ingredients: [] };
  const dishWhole = cleanName(recipe.dishName ?? '');
  const dishParts = (recipe.dishName ?? '').split(/\s+/).map(cleanName).filter((w) => w.length >= 2);
  const dish = [...new Set([dishWhole, ...dishParts].filter(Boolean))];
  // 띄어 쓴 재료 이름은 붙인 이름과 마지막 낱말(머리 명사)도: '잘 익은 김치' → '잘익은김치', '김치'
  const ingredients = [
    ...new Set(
      (recipe.ingredients ?? []).flatMap((i) => {
        const parts = i.name.replace(/\([^)]*\)/g, '').trim().split(/\s+/).filter(Boolean);
        return [cleanName(i.name), parts.length > 1 ? parts.at(-1)! : ''].filter(Boolean);
      }),
    ),
  ];
  return { dish, ingredients };
}

/** 낱말이 이름으로 시작하는지 (두 글자 이상은 뒤에 뭐가 붙어도, 한 글자는 조사만 붙을 때) */
const startsWithName = (word: string, name: string) => word.startsWith(name) && (name.length >= 2 || PARTICLE.test(word.slice(name.length)));

/** 강조 우선순위: 숫자+단위 > 요리 이름 > 재료 > 맛·식감 말. 0이면 강조하지 않는다 */
function keywordRank(word: string, keywords: CaptionKeywords): number {
  const w = bare(word);
  if (!w) return 0;
  if (/\p{N}/u.test(w)) return 4;
  if (keywords.dish.some((d) => startsWithName(w, d))) return 3;
  if (keywords.ingredients.some((n) => startsWithName(w, n))) return 2;
  if (findSensory(w).length || FOOD_WORDS.some((f) => w.includes(f))) return 1;
  return 0;
}

/**
 * 자막 한 묶음(1~3어절)에서 브랜드 색으로 강조할 낱말을 고른다. 결과는 낱말마다 true/false.
 * 다 칠하면 강조가 아니므로 묶음의 어절 수보다 적게(한 어절짜리는 그 하나, 아니면 최대 2개) 고르고,
 * 넘치면 우선순위가 높은 것 → 앞에 있는 것 순서로 남긴다.
 */
export function pickHighlights(words: string[], keywords: CaptionKeywords): boolean[] {
  const limit = words.length <= 1 ? 1 : Math.min(2, words.length - 1);
  const ranked = words
    .map((word, i) => ({ i, rank: keywordRank(word, keywords) }))
    .filter((x) => x.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.i - b.i)
    .slice(0, limit);
  const keep = new Set(ranked.map((x) => x.i));
  return words.map((_, i) => keep.has(i));
}

// ── 줄 나누기·글자 크기 ──

/**
 * Pretendard 900 굵기의 글자 폭 (글자 크기 대비). 헤드리스 크롬에서 잰 값보다 조금 넉넉하게:
 * 한글 0.864, 숫자 0.70, 영문 0.6~1.05(평균 0.75), 띄어쓰기 0.22, 쉼표·마침표 0.31, 물음표 0.58.
 */
function charEm(ch: string): number {
  if (/[가-힣㄰-㆏]/.test(ch)) return 0.88;
  if (/[0-9]/.test(ch)) return 0.72;
  if (ch === ' ') return 0.23;
  if (/[.,!·'":;]/.test(ch)) return 0.36;
  if (/[a-z]/.test(ch)) return 0.7;
  if (/[A-Z]/.test(ch)) return 0.85;
  return 1.0;
}

/** 글자 크기 1일 때 문구의 폭 */
export const textEm = (text: string) => [...text].reduce((sum, ch) => sum + charEm(ch), 0);

export interface CaptionLayoutOptions {
  /** 바라는 글자 크기(px) */
  size: number;
  /** 한 줄 최대 폭(px), 테두리 포함 */
  maxWidth: number;
  /** 자막 전체 최대 높이(px), 튀어나올 때 커지는 만큼 포함 */
  maxHeight: number;
  lineHeight: number;
  /** 글자 크기 대비 테두리 두께 (바깥으로 절반이 나간다) */
  strokeEm: number;
  /** 튀어나올 때 가장 커지는 배율 */
  popScale: number;
  /** 이보다 작게는 줄이지 않는다 */
  minSize?: number;
}

export interface CaptionLayout {
  /** 줄마다 들어가는 낱말 번호 (최대 2줄) */
  lines: number[][];
  fontSize: number;
}

/** 줄 하나의 폭(px): 글자 + 양옆 테두리 */
const lineWidth = (words: string[], size: number, strokeEm: number) => (textEm(words.join(' ')) + strokeEm) * size;

/**
 * 자막 묶음을 최대 2줄로 나누고 글자 크기를 정한다.
 * - 낱말 단위로만 나눈다 (낱말 가운데·글자 가운데서 끊지 않는다).
 * - 한 줄에 들어가면 한 줄, 아니면 두 줄을 비슷한 길이로. 그래도 넘치면(아주 긴 낱말) 들어갈 때까지 글자를 줄인다.
 * - 두 줄일 때도 튀어나오는 크기까지 합쳐 maxHeight(얼굴 피하기 계산의 자막 높이)를 넘지 않는다.
 */
export function layoutCaption(words: string[], o: CaptionLayoutOptions): CaptionLayout {
  const n = words.length;
  const all = words.map((_, i) => i);
  const minSize = o.minSize ?? 40;
  const fitsHeight = (lines: number, size: number) => lines * size * o.lineHeight * o.popScale <= o.maxHeight;
  for (let size = o.size; size >= minSize; size -= 2) {
    if (lineWidth(words, size, o.strokeEm) <= o.maxWidth && fitsHeight(1, size)) return { lines: [all], fontSize: size };
    if (n < 2 || !fitsHeight(2, size)) continue;
    // 두 줄: 긴 줄이 가장 짧아지는 자리에서 나눈다 (같으면 아랫줄이 긴 쪽 — 위가 가벼워 보이게)
    let split = -1;
    let widest = Infinity;
    for (let k = 1; k < n; k++) {
      const w = Math.max(lineWidth(words.slice(0, k), size, o.strokeEm), lineWidth(words.slice(k), size, o.strokeEm));
      if (w <= widest) {
        widest = w;
        split = k;
      }
    }
    if (widest <= o.maxWidth) return { lines: [all.slice(0, split), all.slice(split)], fontSize: size };
  }
  // 최소 크기로도 안 들어가는 극단적인 경우: 최소 크기·두 줄(낱말이 하나면 한 줄)
  if (n < 2) return { lines: [all], fontSize: minSize };
  const half = Math.ceil(n / 2);
  return { lines: [all.slice(0, half), all.slice(half)], fontSize: minSize };
}
