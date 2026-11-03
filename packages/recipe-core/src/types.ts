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

/** 영상 포맷: 10주 실험에서 비교할 두 가지 유형 */
export const FORMATS = ['explainer', 'comedy'] as const;
export const FormatSchema = z.enum(FORMATS);
export type Format = z.infer<typeof FormatSchema>;

export const FORMAT_LABELS: Record<Format, string> = {
  explainer: '실험 설명형',
  comedy: '캐릭터 코미디형',
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

export const SCENE_TYPES = ['intro', 'question', 'mistake', 'explain', 'ingredients', 'steps', 'tip', 'outro'] as const;
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
  fail: '실패한 결과 (맛조수가 들고 있음)',
  'fail-closeup': '실패한 음식 클로즈업',
  compare: '좌우 비교 (설명용 연출)',
  sizzle: '조리 중 클로즈업',
  react: '맛조수 반응 클로즈업',
  signature: '이희재 연구자 서명 카드',
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
  /** 훅(첫 장면) 여부: 훅을 바꿀 때 이 장면만 다시 만든다 */
  hook: z.boolean().optional(),
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
export type Checklist = Record<ChecklistKey, boolean>;

export const ChecklistSchema = z.object({
  ingredients: z.boolean(),
  safety: z.boolean(),
  noFakeClaims: z.boolean(),
  expression: z.boolean(),
});

export const ScriptSourceSchema = z.enum(['template', 'ai-paste', 'edit']);
export type ScriptSource = z.infer<typeof ScriptSourceSchema>;
