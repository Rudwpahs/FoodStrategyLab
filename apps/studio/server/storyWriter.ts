import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { StoryOutputSchema, storySystem, storyUser, type Audience, type PersonaId, type StoryType, type RecentStory, type RecipeInput, type StoryDraft } from '@mat-lab/recipe-core';
import type { Db } from './db.ts';
import { DEFAULT_MODEL, aiConfigured, claudeError, costUsd, recordUsage, reserveBudget } from './claudeUsage.ts';
import { rewriteCostUsd, type RewriteUsage } from './humanize.ts';
import { HttpError } from './repo.ts';

/**
 * AI 이야기 대본 작가: 레시피 하나로 이야기가 서로 다른 대본 몇 개를 Claude 1콜로 받는다.
 * 원본 대조·품질 검사는 recipe-core의 finalizeStory가 한다 (여기서는 받아 오기만).
 * 월 한도는 다른 Claude 기능과 같이 쓴다 (호출 전에 넉넉한 예상 금액을 잡아 두고, 끝나면 실제 금액을 기록).
 */

export type StoryCallFn = (req: { model: string; system: string; user: string }) => Promise<{ drafts: StoryDraft[] | null; usage: RewriteUsage; stopReason: string | null }>;

/** 한 번에 받을 수 있는 출력 토큰 (생각 + 대본 3개) */
export const STORY_MAX_TOKENS = 16000;
/** 한 번에 쓰는 이야기 개수 */
export const STORY_COUNT = 3;

let client: Anthropic | null = null;

export const claudeStories: StoryCallFn = async ({ model, system, user }) => {
  client ??= new Anthropic();
  const res = await client.messages.parse({
    model,
    max_tokens: STORY_MAX_TOKENS,
    // 이야기 구성은 생각을 조금 하게 둔다 (문장 틀 돌려쓰기를 줄이려고)
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'medium', format: zodOutputFormat(StoryOutputSchema) },
  });
  return {
    drafts: res.parsed_output?.stories ?? null,
    usage: {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
    },
    stopReason: res.stop_reason,
  };
};

export class StoryWriter {
  constructor(
    private db: Db,
    private call: StoryCallFn = claudeStories,
  ) {}

  /** AI를 쓸 수 있는지 (화면에서 버튼을 보여 줄지) */
  available(): boolean {
    return this.call !== claudeStories || aiConfigured();
  }

  /** persona: 맛조수 성격 (견본 비교용. 비우면 기본 설정) */
  async write(recipe: RecipeInput, opts: { avoidTitles?: string[]; expertAnswers?: string[]; recent?: RecentStory[]; recentVideos?: string[]; realClips?: number; persona?: PersonaId; mustInclude?: StoryType; mustAudience?: Audience } = {}): Promise<{ drafts: StoryDraft[]; costUsd: number }> {
    if (!this.available()) throw new HttpError(409, 'Claude API가 아직 설정되지 않았어요. 서버에 ANTHROPIC_API_KEY를 넣어 주세요.');
    const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    const system = storySystem(opts.persona);
    const user = storyUser(recipe, { count: STORY_COUNT, ...opts });
    const release = reserveBudget(this.db, costUsd(model, system.length + user.length, STORY_MAX_TOKENS));
    let out;
    try {
      out = await this.call({ model, system, user });
    } catch (e) {
      throw claudeError(e);
    } finally {
      release();
    }
    const cost = rewriteCostUsd(model, out.usage);
    recordUsage(this.db, 'story', model, out.usage.inputTokens + out.usage.cacheWriteTokens + out.usage.cacheReadTokens, out.usage.outputTokens, cost);
    if (out.stopReason === 'refusal') throw new HttpError(422, '이 레시피로는 이야기를 쓸 수 없다는 답을 받았어요.');
    if (!out.drafts?.length) throw new HttpError(502, '이야기 대본을 받지 못했어요. 다시 시도해 주세요.');
    return { drafts: out.drafts.slice(0, STORY_COUNT + 1), costUsd: cost };
  }
}
