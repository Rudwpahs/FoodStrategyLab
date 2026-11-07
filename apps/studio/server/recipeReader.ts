import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CATEGORIES, RecipeInputSchema, type RecipeInput } from '@mat-lab/recipe-core';
import type { Db } from './db.ts';
import { HttpError } from './repo.ts';

/**
 * 레시피 사진·파일 읽기 (Claude API).
 * - 재료·분량·순서·팁은 "적힌 그대로" 옮긴다 (원본 보존 원칙). 안 보이는 글자는 추측하지 않고 problems에 적는다.
 * - 원본에 없는 주제·핵심 원리·흔한 실수는 AI 제안으로 만들고, 화면에 "AI 제안 · 확인 필요"로 표시한다.
 * - 기본 모델은 손글씨를 가장 잘 읽는 Claude Opus 5.5 (사진 한 장 약 $0.13 추정). CLAUDE_MODEL로 바꿀 수 있다(예: claude-haiku-5-5, 약 $0.002).
 *   달마다 쓸 수 있는 금액 한도가 있다 (CLAUDE_MONTHLY_BUDGET_USD, 기본 $20).
 */

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const MAX_FILES = 4;

/** 1백만 토큰당 달러 (입력, 출력). 2026-11 기준, 모르는 모델은 가장 비싼 값으로 계산해 한도를 넘지 않게 한다 */
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};
const priceOf = (model: string): [number, number] => PRICES[model] ?? [10, 50];

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [i, o] = priceOf(model);
  return (inputTokens * i + outputTokens * o) / 1_000_000;
}

/** Claude가 돌려줄 형태 (구조화 출력) */
export const ExtractedRecipeSchema = z.object({
  isRecipe: z.boolean().describe('자료가 요리 레시피인지'),
  dishName: z.string().describe('요리 이름. 적힌 그대로. 없으면 빈 문자열'),
  ingredients: z
    .array(
      z.object({
        name: z.string().describe('재료 이름, 적힌 그대로'),
        amount: z.string().describe('분량과 단위, 적힌 그대로 (예: "2큰술", "200g", "약간"). 없으면 빈 문자열'),
        group: z.string().describe('재료 묶음 이름 (예: "양념", "소스"). 없으면 빈 문자열'),
      }),
    )
    .describe('재료 목록, 적힌 순서대로'),
  steps: z.array(z.string()).describe('조리 순서, 적힌 순서와 문장 그대로 (번호는 빼기)'),
  tips: z.array(z.string()).describe('자료에 적힌 팁·주의사항 그대로. 없으면 빈 배열'),
  mistakeFromSource: z.string().describe('자료에 실패·주의 사례가 적혀 있으면 그 문장 그대로, 없으면 빈 문자열'),
  storyFromSource: z.string().describe('자료에 음식 유래·추억 이야기가 적혀 있으면 그 문장 그대로, 없으면 빈 문자열'),
  otherNotes: z.string().describe('위에 넣지 못한, 자료에 적힌 다른 글'),
  problems: z.array(z.string()).describe('읽기 어려웠거나 확실하지 않은 부분 (예: "3번 단계 분량이 흐려서 읽지 못함")'),
  suggestion: z
    .object({
      topic: z.string().describe('숏폼 주제가 될 질문 한 문장 (예: "김치전은 왜 금방 눅눅해질까?")'),
      principle: z.string().describe('이 레시피의 핵심 조리 원리 한 문장, 50자 이내. "~하면 ~한다" 꼴로 (영상에서 소리 내어 읽으므로 짧게)'),
      commonMistake: z.string().describe('이 요리에서 흔한 실수 한 문장'),
      category: z.enum(CATEGORIES).describe('science=요리 과학, fix=실패 해결, compare=재료 비교·조리 기술, tradition=전통조리·음식문화'),
    })
    .describe('자료에 없는 부분을 위한 제안. 연구자가 확인한다'),
});
export type ExtractedRecipe = z.infer<typeof ExtractedRecipeSchema>;

const SYSTEM = `당신은 요리 연구자(조리기능장)의 레시피 자료를 디지털로 옮기는 기록 담당자입니다.
자료는 손글씨·인쇄물·화면 캡처 사진, PDF, 텍스트일 수 있습니다.

반드시 지킬 것:
- 재료 이름, 분량, 단위, 조리 순서, 팁은 자료에 적힌 그대로 옮깁니다. 바꾸거나 고치거나 보태지 않습니다.
- 분량을 추측해서 채우지 않습니다. 안 보이거나 흐린 글자는 비워 두고 problems에 무엇이 불확실한지 적습니다.
- 맞춤법을 고치거나 문장을 다듬지 않습니다. 줄바꿈으로 끊긴 문장만 이어 붙입니다.
- mistakeFromSource, storyFromSource는 자료에 실제로 적힌 문장만 옮깁니다. 없으면 빈 문자열입니다.
- suggestion은 자료에 없는 주제·원리·흔한 실수를 위한 제안입니다. 일반적으로 알려진 조리 원리만 쓰고, 연구자의 경험이나 수치를 지어내지 않습니다.
- 자료가 레시피가 아니면 isRecipe를 false로 합니다.`;

export interface UploadFile {
  name: string;
  type: string;
  /** base64 */
  data: string;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** 올린 파일을 Claude 메시지 블록으로 바꾼다 (사진·PDF·글) */
export function toContentBlocks(files: UploadFile[], memo: string): Anthropic.ContentBlockParam[] {
  if (files.length === 0 && !memo.trim()) throw new HttpError(400, '레시피 사진이나 파일을 올려 주세요.');
  if (files.length > MAX_FILES) throw new HttpError(400, `파일은 ${MAX_FILES}개까지 올릴 수 있어요.`);
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const f of files) {
    const type = f.type.toLowerCase();
    if ((IMAGE_TYPES as readonly string[]).includes(type)) {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: type as ImageType, data: f.data } });
    } else if (type === 'application/pdf') {
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
    } else if (type.startsWith('text/') || /\.(txt|md)$/i.test(f.name)) {
      const text = Buffer.from(f.data, 'base64').toString('utf8').slice(0, 60_000);
      blocks.push({ type: 'text', text: `[파일: ${f.name}]\n${text}` });
    } else if (/hei[cf]/.test(type) || /\.(heic|heif)$/i.test(f.name)) {
      throw new HttpError(400, `"${f.name}"은(는) 아이폰 사진(HEIC)이에요. 화면을 새로 고친 뒤 다시 골라 주세요 (자동으로 JPG로 바꿔 올려요).`);
    } else {
      throw new HttpError(400, `"${f.name}"은(는) 읽을 수 없는 형식이에요. 사진(JPG·PNG·HEIC), PDF, 텍스트 파일을 올려 주세요.`);
    }
  }
  blocks.push({ type: 'text', text: `${memo.trim() ? `연구자 메모: ${memo.trim()}\n\n` : ''}위 자료의 레시피를 정해진 형식으로 옮겨 주세요.` });
  return blocks;
}

/** AI가 제안한 핵심 원리는 영상에서 소리 내어 읽으므로 한 문장으로 줄인다 (길면 첫 문장만) */
export function shortPrinciple(text: string): string {
  const t = text.trim();
  if (t.length < 5) return '재료의 특성에 맞게 순서와 불 조절을 지키면 맛이 살아난다.';
  if (t.length <= 70) return t;
  const first = t.split(/(?<=[.!?])\s+/)[0]!.trim();
  return first.length >= 5 ? first : t;
}

/** 읽은 결과 → 스튜디오 레시피. 어떤 칸이 AI 제안인지도 돌려준다 */
export function toRecipe(x: ExtractedRecipe, memo = ''): { recipe: RecipeInput; aiFields: string[]; problems: string[] } {
  if (!x.isRecipe) throw new HttpError(422, '레시피로 보이지 않아요. 재료와 만드는 법이 보이게 다시 찍어 주세요.');
  const ingredients = x.ingredients.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), amount: i.amount.trim(), ...(i.group.trim() ? { group: i.group.trim() } : {}) }));
  const steps = x.steps.map((s) => s.trim()).filter(Boolean);
  if (ingredients.length === 0 && steps.length === 0) throw new HttpError(422, '재료나 만드는 법을 읽지 못했어요. 더 밝고 가깝게 다시 찍어 주세요.');
  const aiFields: string[] = ['topic', 'principle', 'category'];
  const mistake = x.mistakeFromSource.trim() || x.suggestion.commonMistake.trim();
  if (!x.mistakeFromSource.trim() && mistake) aiFields.push('commonMistake');
  const draft = {
    topic: x.suggestion.topic.trim() || `${x.dishName.trim() || '오늘의 요리'}, 맛있게 만드는 비결은?`,
    dishName: x.dishName.trim(),
    category: x.suggestion.category,
    format: 'explainer' as const,
    ingredients,
    steps,
    principle: shortPrinciple(x.suggestion.principle),
    tips: x.tips.map((t) => t.trim()).filter(Boolean),
    commonMistake: mistake,
    source: '이희재 레시피 (올린 자료에서 읽음)',
    ...(x.storyFromSource.trim() ? { story: x.storyFromSource.trim() } : {}),
  };
  const recipe = RecipeInputSchema.parse(draft);
  const problems = [...x.problems.map((p) => p.trim()).filter(Boolean)];
  if (x.otherNotes.trim()) problems.push(`자료의 다른 메모: ${x.otherNotes.trim().slice(0, 300)}`);
  if (memo.trim()) problems.push(`올릴 때 메모: ${memo.trim().slice(0, 300)}`);
  return { recipe, aiFields, problems };
}

/** Claude에 보내는 부분만 따로 둔다 (시험에서 가짜로 바꾼다) */
export type ParseFn = (req: { model: string; system: string; content: Anthropic.ContentBlockParam[] }) => Promise<{
  parsed: ExtractedRecipe | null;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}>;

let client: Anthropic | null = null;

/** 실제 Claude API 호출 (공식 SDK, 구조화 출력) */
export const claudeParse: ParseFn = async ({ model, system, content }) => {
  client ??= new Anthropic();
  const res = await client.messages.parse({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(ExtractedRecipeSchema) },
  });
  return { parsed: res.parsed_output ?? null, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, stopReason: res.stop_reason };
};

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** 이번 달(한국 시간) 쓴 금액 */
export function monthSpentUsd(db: Db, now = new Date()): number {
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(now);
  const r = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS s FROM ai_usage WHERE month = ?').get(month) as { s: number };
  return Number(r.s);
}

export const monthlyBudgetUsd = () => Number(process.env.CLAUDE_MONTHLY_BUDGET_USD || '20');

export class RecipeReader {
  constructor(
    private db: Db,
    private parse: ParseFn = claudeParse,
  ) {}

  async read(files: UploadFile[], memo = ''): Promise<{ recipe: RecipeInput; aiFields: string[]; problems: string[]; costUsd: number }> {
    if (this.parse === claudeParse && !aiConfigured()) {
      throw new HttpError(409, '레시피 읽기(Claude API)가 아직 설정되지 않았어요. 서버에 ANTHROPIC_API_KEY를 넣어 주세요. 그 전에는 [새로 만들기]의 "직접 입력하기"를 써 주세요.');
    }
    const budget = monthlyBudgetUsd();
    const spent = monthSpentUsd(this.db);
    if (spent >= budget) throw new HttpError(429, `이번 달 레시피 읽기 한도($${budget})를 다 썼어요. 다음 달에 다시 되거나, 관리자가 한도를 올려야 해요. 그동안은 [새로 만들기]의 "직접 입력하기"를 써 주세요.`);
    const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    const content = toContentBlocks(files, memo);
    let out;
    try {
      out = await this.parse({ model, system: SYSTEM, content });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(502, 'Claude API 열쇠가 맞지 않아요. 서버의 ANTHROPIC_API_KEY를 확인해 주세요.');
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Claude API가 잠시 바빠요. 1분 뒤 다시 시도해 주세요.');
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, `자료를 보내지 못했어요 (파일이 너무 크거나 형식이 맞지 않을 수 있어요): ${e.message.slice(0, 200)}`);
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `Claude API 오류 (${e.status ?? '?'}). 잠시 뒤 다시 시도해 주세요.`);
      throw e;
    }
    const cost = costUsd(model, out.inputTokens, out.outputTokens);
    const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date());
    this.db
      .prepare('INSERT INTO ai_usage (created_at, month, purpose, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(new Date().toISOString(), month, 'recipe-read', model, out.inputTokens, out.outputTokens, cost);
    if (out.stopReason === 'refusal') throw new HttpError(422, '이 자료는 읽을 수 없다는 답을 받았어요. 다른 사진으로 다시 시도해 주세요.');
    if (!out.parsed) throw new HttpError(502, '레시피를 정리하지 못했어요. 다시 시도해 주세요.');
    return { ...toRecipe(out.parsed, memo), costUsd: cost };
  }
}
