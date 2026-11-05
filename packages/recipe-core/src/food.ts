import type { RecipeInput } from './types.ts';

/**
 * 레시피를 3D 음식 모델로 '간단하게' 표현하기 위한 규칙.
 * 요리 이름·재료·조리 순서의 단어로 음식 종류, 조리 도구, 색을 고른다.
 */
export const FOOD_KINDS = ['pancake', 'egg', 'greens', 'soup', 'rice', 'noodles', 'stirfry', 'generic'] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];

export const FOOD_KIND_LABELS: Record<FoodKind, string> = {
  pancake: '전·부침개',
  egg: '달걀 요리',
  greens: '나물·채소',
  soup: '국·찌개',
  rice: '밥·덮밥',
  noodles: '면 요리',
  stirfry: '볶음',
  generic: '기타 (접시 요리)',
};

/** 조리 도구 */
export type Vessel = 'pan' | 'pot';

export interface FoodProfile {
  kind: FoodKind;
  vessel: Vessel;
  /** 날것 → 익은 색 */
  rawColor: string;
  cookedColor: string;
  /** 덮밥·비빔밥: 볶은 고명을 팬에서 만들고, 완성은 밥 위에 얹는다 */
  topping?: boolean;
  /** 위에 흩뿌려지는 건더기 색 (김치·파 등) */
  bits: string[];
  /** 건더기 조각: 재료마다 실제 썬 모양 (고추는 송송 썬 고리, 두부는 깍둑, 청국장은 콩알 등) */
  pieces: FoodPiece[];
  /** 물·국물 색 (냄비 요리) */
  liquidColor?: string;
}

const KIND_RULES: { kind: FoodKind; words: string[] }[] = [
  { kind: 'pancake', words: ['전', '부침', '부쳐', '부친', '팬케이크', '지짐', '빈대떡'] },
  { kind: 'egg', words: ['달걀', '계란', '메추리알'] },
  { kind: 'noodles', words: ['국수', '면', '라면', '파스타', '우동', '냉면'] },
  { kind: 'soup', words: ['국', '찌개', '탕', '전골', '스프', '수프'] },
  { kind: 'rice', words: ['밥', '덮밥', '비빔', '죽', '리조또'] },
  { kind: 'greens', words: ['나물', '시금치', '데치', '데친', '무침', '샐러드', '겉절이'] },
  { kind: 'stirfry', words: ['볶음', '볶아', '볶는', '볶은', '정과', '강정', '튀김', '튀겨', '튀길'] },
];
/** 종류 판단을 헷갈리게 하는 단어 (설탕의 '탕', 국간장의 '국', 청국장의 '국' 등) */
const KIND_NOISE = /설탕|국간장|국자|면수|전체|전자레인지|청국장|국물/g;

/** 썬 모양 */
export type PieceShape = 'chunk' | 'cube' | 'ring' | 'leaf' | 'bean' | 'slice' | 'strip' | 'nut' | 'seed' | 'curl';
export interface FoodPiece {
  shape: PieceShape;
  color: string;
}

/**
 * 재료 단어 → 3D 건더기 모양. 앞 규칙이 먼저 (청양고추는 '고추'보다 앞).
 * 고춧가루·간장처럼 모양이 없는 양념은 넣지 않는다 (국물·양념 색으로만).
 */
const PIECE_WORDS: { words: string[]; piece: FoodPiece }[] = [
  { words: ['청양고추', '풋고추', '꽈리고추'], piece: { shape: 'ring', color: '#3E8E2E' } },
  { words: ['홍고추'], piece: { shape: 'ring', color: '#C9302A' } },
  { words: ['대파', '쪽파', '실파'], piece: { shape: 'ring', color: '#6DB04F' } },
  { words: ['김치'], piece: { shape: 'leaf', color: '#C8452E' } },
  { words: ['배추'], piece: { shape: 'leaf', color: '#D3E2A2' } },
  { words: ['시금치', '부추', '깻잎', '쑥갓', '상추', '나물'], piece: { shape: 'leaf', color: '#4E9A3A' } },
  { words: ['청국장'], piece: { shape: 'bean', color: '#86562C' } },
  { words: ['콩나물', '숙주'], piece: { shape: 'strip', color: '#F2EBC9' } },
  { words: ['콩'], piece: { shape: 'bean', color: '#D9B77A' } },
  { words: ['두부'], piece: { shape: 'cube', color: '#F4EEDC' } },
  { words: ['양파'], piece: { shape: 'strip', color: '#EFE4C8' } },
  { words: ['마늘'], piece: { shape: 'slice', color: '#F3EBD8' } },
  { words: ['당근'], piece: { shape: 'strip', color: '#F08A2C' } },
  { words: ['애호박', '오이'], piece: { shape: 'slice', color: '#A9C96A' } },
  { words: ['호박', '감자', '고구마', '무'], piece: { shape: 'cube', color: '#E8C977' } },
  { words: ['버섯'], piece: { shape: 'slice', color: '#9C7652' } },
  { words: ['돼지', '소고기', '고기', '베이컨', '햄', '닭'], piece: { shape: 'strip', color: '#A95E44' } },
  { words: ['어묵'], piece: { shape: 'strip', color: '#E2B47A' } },
  { words: ['새우'], piece: { shape: 'curl', color: '#F28A6A' } },
  { words: ['오징어'], piece: { shape: 'ring', color: '#F4E6DA' } },
  { words: ['호두', '땅콩', '밤', '잣', '아몬드'], piece: { shape: 'nut', color: '#A9733F' } },
  { words: ['브로콜리'], piece: { shape: 'chunk', color: '#4E8A34' } },
  { words: ['참깨', '들깨', '깨'], piece: { shape: 'seed', color: '#EBDDB2' } },
];
/** 양념 이름 안의 재료 단어는 건더기가 아니다 (고춧가루의 '고추', 파프리카가루 등) */
const NOT_PIECE = /가루|장$|기름|소스|액젓|즙|육수|물$/;

export function ingredientPiece(name: string): FoodPiece | null {
  if (NOT_PIECE.test(name) && !name.includes('청국장')) return null;
  // 그냥 '파'·'다진 파' (파스타·파프리카는 아님)
  if (/(^|\s)파$/.test(name.trim())) return { shape: 'ring', color: '#6DB04F' };
  return PIECE_WORDS.find((p) => includesAny(name, p.words))?.piece ?? null;
}

/** 재료 단어 → 대표 색 (건더기·국물 색에 사용) */
const COLOR_WORDS: { words: string[]; color: string }[] = [
  // 앞에 있는 규칙이 먼저: 청양고추·풋고추는 초록, 그 밖의 고추는 빨강
  { words: ['청양고추', '풋고추', '꽈리고추'], color: '#3E8E2E' },
  { words: ['청국장', '된장'], color: '#8A5A2B' },
  { words: ['김치', '고추장', '고춧가루', '고추'], color: '#D9472B' },
  { words: ['시금치', '대파', '쪽파', '실파', '부추', '깻잎', '쑥갓', '상추', '배추', '나물', '오이', '브로콜리'], color: '#4E9A3A' },
  { words: ['당근', '호박'], color: '#F08A2C' },
  { words: ['양파', '마늘', '두부', '무'], color: '#F3EBD8' },
  { words: ['버섯'], color: '#9C7652' },
  { words: ['돼지', '소고기', '고기', '베이컨', '햄'], color: '#B5654B' },
  { words: ['새우', '오징어', '해물'], color: '#F29A7E' },
  { words: ['감자'], color: '#E8C977' },
  { words: ['들깨'], color: '#D8C6A0' },
  { words: ['참깨', '깨'], color: '#E9D8A6' },
  { words: ['호두', '땅콩', '밤', '잣', '아몬드'], color: '#A9733F' },
  { words: ['고사리'], color: '#7A5A3A' },
  { words: ['생크림', '우유', '치즈'], color: '#F6F0E2' },
  { words: ['스파게티', '국수', '파스타', '소면'], color: '#F2DC9B' },
];

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

/**
 * 요리 이름에서 종류 찾기. 한국 음식 이름은 맨 뒤 말이 종류다
 * (청국장덮밥 → 덮밥, 김치찌개 → 찌개, 잔치국수 → 국수). 그래서 이름 끝에 가장 가까운 말로 정한다.
 */
function kindByHead(name: string): FoodKind | null {
  let best: { kind: FoodKind; end: number; len: number } | null = null;
  for (const rule of KIND_RULES) {
    for (const w of rule.words) {
      const at = name.lastIndexOf(w);
      if (at < 0) continue;
      const end = at + w.length;
      if (!best || end > best.end || (end === best.end && w.length > best.len)) best = { kind: rule.kind, end, len: w.length };
    }
  }
  return best?.kind ?? null;
}

/** 요리 이름을 가장 먼저 보고, 없으면 재료·순서에서 찾는다. */
export function inferFoodKind(recipe: Pick<RecipeInput, 'dishName' | 'topic' | 'ingredients' | 'steps'>): FoodKind {
  // 요리 이름(띄어쓰기 앞 첫 덩어리 기준)을 먼저, 그다음 주제 문장
  for (const text of [recipe.dishName, recipe.topic]) {
    const kind = kindByHead(text.replace(KIND_NOISE, '').split(/[\s,.!?]/).filter(Boolean)[0] ?? '');
    if (kind) return kind;
  }
  const name = `${recipe.dishName} ${recipe.topic}`.replace(KIND_NOISE, '');
  for (const rule of KIND_RULES) if (includesAny(name, rule.words)) return rule.kind;
  const rest = [...recipe.ingredients.map((i) => i.name), ...recipe.steps].join(' ').replace(KIND_NOISE, '');
  for (const rule of KIND_RULES) if (includesAny(rest, rule.words)) return rule.kind;
  return 'generic';
}

export function ingredientColor(name: string): string | null {
  return COLOR_WORDS.find((c) => includesAny(name, c.words))?.color ?? null;
}

const BASE: Record<FoodKind, Omit<FoodProfile, 'kind' | 'bits' | 'pieces'>> = {
  pancake: { vessel: 'pan', rawColor: '#F2DDAA', cookedColor: '#D9963A' },
  egg: { vessel: 'pot', rawColor: '#FFFDF6', cookedColor: '#FFF8EC', liquidColor: '#BFE3F2' },
  greens: { vessel: 'pot', rawColor: '#5DB045', cookedColor: '#3E8E35', liquidColor: '#BFE3F2' },
  soup: { vessel: 'pot', rawColor: '#E9C88E', cookedColor: '#D98A4E', liquidColor: '#E0A15E' },
  rice: { vessel: 'pot', rawColor: '#FFFFFF', cookedColor: '#FFFDF5' },
  noodles: { vessel: 'pot', rawColor: '#F6E3A8', cookedColor: '#F2D68A', liquidColor: '#E8C48A' },
  stirfry: { vessel: 'pan', rawColor: '#E7C79A', cookedColor: '#B8743E' },
  generic: { vessel: 'pan', rawColor: '#E8CFA0', cookedColor: '#C9853F' },
};

export function foodProfile(recipe: RecipeInput): FoodProfile {
  const kind = recipe.foodKind && recipe.foodKind !== 'auto' ? recipe.foodKind : inferFoodKind(recipe);
  const base = BASE[kind];
  const bits = [...new Set(recipe.ingredients.map((i) => ingredientColor(i.name)).filter((c): c is string => c !== null))].slice(0, 3);
  // 건더기 모양: 원본 재료 순서대로, 같은 모양·색은 한 번만, 깨는 마지막(고명)
  const seenPiece = new Set<string>();
  const pieces = recipe.ingredients
    .map((i) => ingredientPiece(i.name))
    .filter((p): p is FoodPiece => {
      if (!p || seenPiece.has(p.shape + p.color)) return false;
      seenPiece.add(p.shape + p.color);
      return true;
    })
    .sort((a, b) => Number(a.shape === 'seed') - Number(b.shape === 'seed'))
    .slice(0, 5);
  const profile: FoodProfile = { kind, ...base, bits, pieces };
  // 덮밥·비빔밥: 고명을 팬에 볶고(재료 색), 완성 그릇은 밥 위에 고명
  if (kind === 'rice' && /덮밥|비빔밥|볶음밥/.test(`${recipe.dishName} ${recipe.topic}`)) {
    profile.topping = true;
    profile.vessel = 'pan';
    profile.rawColor = '#C9A574';
    profile.cookedColor = bits.includes('#8A5A2B') ? '#8A5A2B' : '#B8743E';
  }
  // 국물이 빨간 재료(김치·고추장)로 만든 국은 국물도 붉게
  if (kind === 'soup' && bits.includes('#D9472B')) profile.liquidColor = '#C8502E';
  // 김치전처럼 붉은 재료가 들어간 전은 반죽도 붉은 기
  if (kind === 'pancake' && bits.includes('#D9472B')) {
    profile.rawColor = '#F0B98E';
    profile.cookedColor = '#CF8A3E';
  }
  if (kind === 'greens' && bits[0]) profile.cookedColor = bits[0];
  // 들깨·크림이 들어간 면 요리는 국물을 크림색으로
  if (kind === 'noodles' && (bits.includes('#D8C6A0') || bits.includes('#F6F0E2'))) profile.liquidColor = '#E6D7B6';
  // 견과류 위주 요리는 견과 색으로
  if (bits[0] === '#A9733F' && (kind === 'generic' || kind === 'stirfry')) {
    profile.rawColor = '#C99A62';
    profile.cookedColor = '#9A5E2A';
  }
  return profile;
}

/** 조리대 위에 놓이는 재료 소품 모양 */
export type PropShape = 'egg' | 'bottle' | 'jar' | 'leaves' | 'bowl' | 'cup' | 'cloves';

export interface IngredientProp {
  label: string;
  shape: PropShape;
  color: string;
  /** 그릇에 손질해 둔 모양 (썬 고추·깍둑 두부 등). 없으면 색만 담긴 그릇 */
  piece?: FoodPiece;
}

const PROP_RULES: { words: string[]; shape: PropShape; color?: string }[] = [
  { words: ['달걀', '계란', '메추리알'], shape: 'egg', color: '#FFF6E6' },
  { words: ['기름', '식용유', '참기름', '들기름', '오일', '간장', '식초', '맛술', '물엿', '올리고당', '참치액', '액젓'], shape: 'bottle' },
  { words: ['국물', '양념', '소스', '장'], shape: 'bowl' },
  { words: ['소금', '설탕', '가루', '후추', '깨'], shape: 'jar' },
  { words: ['육수'], shape: 'cup', color: '#E8D2A8' },
  { words: ['물'], shape: 'cup', color: '#9FD3EE' },
  { words: ['마늘', '생강'], shape: 'cloves', color: '#F3EBD8' },
  { words: ['시금치', '대파', '쪽파', '부추', '깻잎', '상추', '배추', '나물'], shape: 'leaves' },
];

const BOTTLE_COLORS: { words: string[]; color: string }[] = [
  { words: ['참기름', '들기름'], color: '#B9762B' },
  { words: ['올리브', '오일'], color: '#B8B04A' },
  { words: ['참치액', '액젓'], color: '#6B3B22' },
  { words: ['간장'], color: '#4A2A1A' },
  { words: ['식초'], color: '#E8E2C2' },
  { words: ['기름', '식용유'], color: '#F2CF5B' },
];

/** 조리도구는 재료 소품으로 만들지 않는다 */
const TOOL_WORDS = ['키친타올', '키친타월', '타공', '체', '랩', '호일', '종이'];
/** 조리대에 올리는 소품 수 (너무 많으면 화면이 복잡해진다) */
export const MAX_PROPS = 6;

export function ingredientProps(recipe: RecipeInput): IngredientProp[] {
  const seen = new Set<string>();
  const items = recipe.ingredients.filter((ing) => {
    if (TOOL_WORDS.some((w) => (w.length > 1 ? ing.name.startsWith(w) : ing.name === w))) return false;
    if (seen.has(ing.name)) return false;
    seen.add(ing.name);
    return true;
  });
  // 요리 이름에 들어간 재료 → 주재료(그릇·채소·달걀) → 양념(병·통·컵) 순서로 보여준다
  const isSeasoning = (name: string) => ['bottle', 'jar', 'cup'].includes(PROP_RULES.find((r) => includesAny(name, r.words))?.shape ?? 'bowl');
  const dish = recipe.dishName.replace(/\s/g, '');
  const kind = recipe.foodKind && recipe.foodKind !== 'auto' ? recipe.foodKind : inferFoodKind(recipe);
  const isStar = (name: string) =>
    Array.from({ length: Math.max(0, name.length - 1) }, (_, i) => name.slice(i, i + 2)).some((two) => dish.includes(two)) ||
    (kind === 'noodles' && includesAny(name, ['스파게티', '국수', '파스타', '소면', '면']));
  const rank = (name: string) => (isStar(name) ? 0 : isSeasoning(name) ? 2 : 1);
  const ordered = items.map((ing, i) => ({ ing, i })).sort((a, b) => rank(a.ing.name) - rank(b.ing.name) || a.i - b.i).map((x) => x.ing);
  return ordered.slice(0, MAX_PROPS).map((ing) => {
    const label = ing.amount ? `${ing.name} ${ing.amount}` : ing.name;
    const rule = PROP_RULES.find((r) => includesAny(ing.name, r.words));
    const shape = rule?.shape ?? 'bowl';
    let color = rule?.color ?? ingredientColor(ing.name) ?? '#E3C9A0';
    if (shape === 'bottle') color = BOTTLE_COLORS.find((b) => includesAny(ing.name, b.words))?.color ?? '#C9A15A';
    if (shape === 'jar') color = ing.name.includes('후추') ? '#5A4A3A' : ing.name.includes('부침가루') || ing.name.includes('밀가루') ? '#F4ECD8' : '#FFFFFF';
    if (shape === 'leaves') color = ingredientPiece(ing.name)?.color ?? color;
    const piece = shape === 'bowl' ? ingredientPiece(ing.name) : null;
    return piece ? { label, shape, color, piece } : { label, shape, color };
  });
}
