import { z } from 'zod';

/** 캐릭터 기본 감정 6종 (브랜드 가이드 고정 규격) */
export const EMOTIONS = ['joy', 'embarrassed', 'curious', 'confident', 'surprised', 'disappointed'] as const;
export const EmotionSchema = z.enum(EMOTIONS);
export type Emotion = z.infer<typeof EmotionSchema>;

export const EMOTION_LABELS: Record<Emotion, string> = {
  joy: '기쁨',
  embarrassed: '당황',
  curious: '궁금함',
  confident: '자신감',
  surprised: '놀람',
  disappointed: '실망',
};

export const CATEGORIES = ['science', 'fix', 'compare', 'tradition'] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  science: '요리 과학',
  fix: '실패 해결',
  compare: '재료 비교·조리 기술',
  tradition: '전통조리·음식문화',
};

/**
 * 영상 포맷: 10주 실험에서 비교할 두 가지 유형.
 * 'comedy'는 저장된 레시피와 맞추려고 id를 그대로 두고, 이름만 '캐릭터 문답형'으로 바꿨다 (맛조수가 실수하는 코미디 → 시청자 대신 묻는 문답, styles.ts)
 */
export const FORMATS = ['explainer', 'comedy'] as const;
export const FormatSchema = z.enum(FORMATS);
export type Format = z.infer<typeof FormatSchema>;

export const FORMAT_LABELS: Record<Format, string> = {
  explainer: '실험 설명형',
  comedy: '캐릭터 문답형',
};

export const IngredientSchema = z.object({
  name: z.string().trim().min(1, '재료 이름을 입력하세요'),
  amount: z.string().trim().default(''),
  /** 재료 묶음 (예: 들깨소스, 고명). 비어 있으면 묶음 없음 */
  group: z.string().trim().optional(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

/** 연구자가 입력하는 원본. 이 데이터는 AI가 수정하지 않는다. */
export const RecipeInputSchema = z.object({
  topic: z.string().trim().min(2, '주제를 입력하세요'),
  dishName: z.string().trim().default(''),
  category: CategorySchema.default('science'),
  format: FormatSchema.default('explainer'),
  ingredients: z.array(IngredientSchema).default([]),
  steps: z.array(z.string().trim().min(1)).default([]),
  principle: z.string().trim().min(5, '핵심 조리 원리를 입력하세요'),
  tips: z.array(z.string().trim().min(1)).default([]),
  commonMistake: z.string().trim().default(''),
  source: z.string().trim().default('이희재 조리 노트'),
  /** 사람들이 흔히 잘못 아는 점 (연구자 입력, 오해 반박·반전 훅에 쓴다) */
  misconception: z.string().trim().optional(),
  /** 음식에 얽힌 이야기·유래·추억 (연구자 입력, 스토리 훅에 쓴다) */
  story: z.string().trim().optional(),
  /** 3D 음식 모양. 'auto'면 요리 이름·재료로 추정 */
  foodKind: z.enum(['auto', 'pancake', 'egg', 'greens', 'soup', 'rice', 'noodles', 'stirfry', 'generic']).default('auto'),
});
export type RecipeInput = z.infer<typeof RecipeInputSchema>;

/**
 * gag: '진지한 엉뚱 가이드'(deadpan)의 말도 안 되는 단계. 화면은 고른 그림(gag)으로 바뀌고 '농담' 표시가 붙으며,
 * 연구자 카드(노트·팁)는 절대 붙지 않는다 (진짜 방법보다 먼저 답이 보이거나, 농담이 연구자 조언처럼 보이지 않게).
 * 연출 엔진·템플릿은 만들지 않고 AI 이야기 대본만 쓴다.
 */
export const SCENE_TYPES = ['intro', 'question', 'mistake', 'explain', 'ingredients', 'steps', 'tip', 'outro', 'gag'] as const;
export const SceneTypeSchema = z.enum(SCENE_TYPES);
export type SceneType = z.infer<typeof SceneTypeSchema>;

/**
 * 장면 화면 연출. 비어 있으면 장면 종류(type)에 맞는 기본 화면을 쓴다.
 * result: 완성 음식 먼저 / fail: 맛조수가 든 실패 접시 / fail-closeup: 실패한 음식 클로즈업 / compare: 비교(설명용 연출)
 * sizzle: 조리 중 클로즈업 / react: 캐릭터 반응 클로즈업 / signature: 전문가 서명 카드
 */
export const VISUALS = ['result', 'fail', 'fail-closeup', 'compare', 'sizzle', 'react', 'signature'] as const;
export const VisualSchema = z.enum(VISUALS);
export type Visual = z.infer<typeof VisualSchema>;

export const VISUAL_LABELS: Record<Visual, string> = {
  result: '완성 음식 먼저',
  fail: '맛조수가 든 실패 접시',
  'fail-closeup': '실패한 음식 클로즈업',
  compare: '위아래 비교 · 설명용 연출',
  sizzle: '조리 중 클로즈업',
  react: '맛조수 반응 클로즈업',
  signature: '이희재 연구자 서명 카드',
};

/**
 * 장면이 펼쳐지는 곳 (3D 무대). 비어 있으면 영상 쪽이 장면 종류에 맞춰 고른다.
 * kitchen: 주방 조리대 / market: 시장 가판대(재료 고르기) / dining: 식탁(완성·맛보기) / pantry: 찬장·냉장고 앞(재료 꺼내기) / lab: 연구실 칠판(원리 설명)
 */
export const PLACES = ['kitchen', 'market', 'dining', 'pantry', 'lab'] as const;
export const PlaceSchema = z.enum(PLACES);
export type Place = z.infer<typeof PlaceSchema>;

export const PLACE_LABELS: Record<Place, string> = {
  kitchen: '주방 조리대',
  market: '시장 가판대',
  dining: '식탁',
  pantry: '찬장·냉장고 앞',
  lab: '연구실 칠판',
};

/**
 * 농담 장면(type 'gag')의 그림. 요리(접시)가 터무니없는 곳에서 쓰이고, 맛조수는 옆에서 태연하게 지켜본다.
 * 그림은 packages/video/src/gags (2D 그림, 3D 캔버스 위에 덮는다)
 */
export const GAGS = [
  'desert',
  'moon',
  'rocket',
  'giant-fan',
  'giant-swing',
  'crane',
  'balloon',
  'mountain',
  'ocean',
  'north-pole',
  'camping',
  'magnifier',
  'roller-coaster',
  'parachute',
] as const;
export const GagSchema = z.enum(GAGS);
export type Gag = z.infer<typeof GagSchema>;

export const GAG_LABELS: Record<Gag, string> = {
  desert: '사막 한가운데',
  moon: '달 위',
  rocket: '로켓 타고 우주로',
  'giant-fan': '집채만 한 선풍기',
  'giant-swing': '거대한 그네',
  crane: '타워 크레인',
  balloon: '열기구',
  mountain: '산꼭대기',
  ocean: '바다 위 배',
  'north-pole': '북극 얼음 위',
  camping: '텐트 캠핑',
  magnifier: '커다란 돋보기',
  'roller-coaster': '롤러코스터',
  parachute: '낙하산',
};

export const SceneSchema = z.object({
  id: z.string().min(1),
  type: SceneTypeSchema,
  emotion: EmotionSchema,
  /** 캐릭터가 말하는 대사 (TTS 입력) */
  line: z.string().trim().min(1),
  /** 화면 카드에 표시할 항목 (재료·단계·노트 등) */
  cardTitle: z.string().trim().optional(),
  cardItems: z.array(z.string().trim()).optional(),
  /** 화면 연출 (선택) */
  visual: VisualSchema.optional(),
  /** 장면이 펼쳐지는 곳 (선택, 비어 있으면 장면 종류에 맞춰 영상이 고름) */
  place: PlaceSchema.optional(),
  /** 훅(첫 장면) 여부: 훅을 바꿀 때 이 장면만 다시 만든다 */
  hook: z.boolean().optional(),
  /** 농담 장면(type 'gag')의 그림. 비어 있으면 대사 낱말로 고른다 (gagForScene) */
  gag: GagSchema.optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScriptSchema = z.object({
  title: z.string().trim().min(1),
  /** 연출 유형과 훅 유형 (선택, 연출 엔진으로 만든 대본에만 있음) */
  style: z.string().optional(),
  hookType: z.string().optional(),
  scenes: z.array(SceneSchema).min(3, '장면은 최소 3개가 필요합니다').max(12, '장면은 최대 12개입니다'),
});
export type Script = z.infer<typeof ScriptSchema>;

export const CHECKLIST_ITEMS = [
  { key: 'ingredients', label: '원본 레시피와 재료·분량·순서가 일치한다' },
  { key: 'safety', label: '가열·보관·위생 등 안전 정보를 별도로 확인했다' },
  { key: 'noFakeClaims', label: '가상의 설명을 실험 결과·연구 사실처럼 표현하지 않았다' },
  { key: 'expression', label: '조리 원리와 표현이 정확하다' },
] as const;
export type ChecklistKey = (typeof CHECKLIST_ITEMS)[number]['key'];

/**
 * 생성 AI 클립이 들어간 영상에만 더 묻는 항목 (원칙 1). 프롬프트에 원본 재료를 넣어도 생성 모델은 다른 재료를 그리곤 한다
 * (비서구 음식 오류: CultDiff 2025 등, docs/research/content-strategy/food-realism-2026-11.md). 클립을 직접 보고 확인해야 승인된다.
 */
export const AI_CLIP_CHECK = { key: 'aiClips', label: 'AI 클립에 원본에 없는 재료·분량·조리 모습이 나오지 않는다 (클립을 직접 봤다)' } as const;
export type Checklist = Record<ChecklistKey, boolean>;

export const ChecklistSchema = z.object({
  ingredients: z.boolean(),
  safety: z.boolean(),
  noFakeClaims: z.boolean(),
  expression: z.boolean(),
  /** AI_CLIP_CHECK: 생성 AI 클립이 있을 때만 필요 */
  aiClips: z.boolean().optional(),
});

/** 대본 출처. ai-revise = 쉬운 말 수정 요청을 Claude가 반영한 대본 */
export type ScriptSource = 'template' | 'ai-paste' | 'ai-story' | 'ai-revise' | 'edit';
