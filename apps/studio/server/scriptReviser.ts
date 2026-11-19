import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ReviseOutputSchema, reviseSystem, reviseUser, type RecipeInput, type ReviseOutput, type Script } from '@mat-lab/recipe-core';
import type { Db } from './db.ts';
import { DEFAULT_MODEL, aiConfigured, claudeError, costUsd, recordUsage, reserveBudget } from './claudeUsage.ts';
import { rewriteCostUsd, type RewriteUsage } from './humanize.ts';
import { HttpError } from './repo.ts';

/**
 * 쉬운 말 수정 요청을 Claude 1콜로 대본에 반영한다 (받아 오기만. 검사는 recipe-core의 checkRevision).
 * 월 한도는 다른 Claude 기능과 같이 쓰고, 사용 기록은 purpose 'revise'로 남긴다.
 */

export type ReviseCallFn = (req: { model: string; system: string; user: string }) => Promise<{ output: ReviseOutput | null; usage: RewriteUsage; stopReason: string | null }>;

/** 한 번에 받을 수 있는 출력 토큰 (생각 + 대본 1개) */
export const REVISE_MAX_TOKENS = 8000;

let client: Anthropic | null = null;

export const claudeRevise: ReviseCallFn = async ({ model, system, user }) => {
  client ??= new Anthropic();
  const res = await client.messages.parse({
    model,
    max_tokens: REVISE_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'medium', format: zodOutputFormat(ReviseOutputSchema) },
  });
  return {
    output: res.parsed_output ?? null,
    usage: {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
    },
    stopReason: res.stop_reason,
  };
};

export class ScriptReviser {
  constructor(
    private db: Db,
    private call: ReviseCallFn = claudeRevise,
  ) {}

  /** AI를 쓸 수 있는지 (화면에서 수정 요청 칸을 보여 줄지) */
  available(): boolean {
    return this.call !== claudeRevise || aiConfigured();
  }

  async revise(recipe: RecipeInput, script: Script, request: string, opts: { expertAnswers?: string[] } = {}): Promise<{ output: ReviseOutput; costUsd: number }> {
    if (!this.available()) throw new HttpError(409, 'Claude API가 아직 설정되지 않아 말로 고치기를 쓸 수 없어요. [대본 직접 고치기]에서 고쳐 주세요.');
    const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    const system = reviseSystem();
    const user = reviseUser(recipe, script, request, opts);
    const release = reserveBudget(this.db, costUsd(model, system.length + user.length, REVISE_MAX_TOKENS));
    let out;
    try {
      out = await this.call({ model, system, user });
    } catch (e) {
      throw claudeError(e);
    } finally {
      release();
    }
    const cost = rewriteCostUsd(model, out.usage);
    recordUsage(this.db, 'revise', model, out.usage.inputTokens + out.usage.cacheWriteTokens + out.usage.cacheReadTokens, out.usage.outputTokens, cost);
    if (out.stopReason === 'refusal') throw new HttpError(422, '이 요청으로는 대본을 고칠 수 없다는 답을 받았어요. 다른 말로 적어 주세요.');
    if (!out.output?.story?.scenes?.length) throw new HttpError(502, '고친 대본을 받지 못했어요. 다시 시도해 주세요.');
    return { output: out.output, costUsd: cost };
  }
}
