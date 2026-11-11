import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CHANGE_RATE_WARN, findAiTells, humanizeSystem, humanizeUser, rewriteProblems, totalChangeRate, type GateOptions, type HumanizeItem, type HumanizeKind } from '@mat-lab/publishing';
import type { Db } from './db.ts';
import { DEFAULT_MODEL, aiConfigured, assertBudget, claudeError, priceOf, recordUsage } from './claudeUsage.ts';
import { HttpError } from './repo.ts';

/**
 * im-not-ai(Humanize KR) 윤문: 진단(규칙 검사, 0원) → Claude 윤문 1콜 → 게이트(프로그램 검사).
 * 원본 웹 서비스 설계(web-service-spec.md)의 detect → rewrite → fidelity audit 흐름을 따르되,
 * 감사(audit)는 AI가 아니라 결정적 게이트(rewriteProblems)로 한다. 걸린 문장은 원문으로 되돌린다.
 * 결과는 바로 저장하지 않고, 연구자가 전후를 보고 [적용]을 눌러야 반영된다.
 */

const OutputSchema = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string().describe('윤문한 문장. 고칠 곳이 없으면 원문 그대로') })),
  notes: z.string().describe('바꾼 요지 한두 줄 (예: "D-2 중요성 과장 2곳, A-8 이중 피동 1곳")'),
});
type Output = z.infer<typeof OutputSchema>;

export interface RewriteUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}
export type RewriteFn = (req: { model: string; system: string; user: string }) => Promise<{ parsed: Output | null; usage: RewriteUsage; stopReason: string | null }>;

/** 캐시 쓰기 1.25배, 캐시 읽기는 넉넉히 0.1배로 계산한다 (한도를 넘지 않게 높게 잡음) */
export function rewriteCostUsd(model: string, u: RewriteUsage): number {
  const [i, o] = priceOf(model);
  return (u.inputTokens * i + u.cacheWriteTokens * i * 1.25 + u.cacheReadTokens * i * 0.1 + u.outputTokens * o) / 1_000_000;
}

let client: Anthropic | null = null;

/** 실제 Claude 호출. 룰북이 든 긴 시스템 프롬프트는 캐시해서 연달아 누를 때 비용을 줄인다 */
export const claudeRewrite: RewriteFn = async ({ model, system, user }) => {
  client ??= new Anthropic();
  const res = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'medium', format: zodOutputFormat(OutputSchema) },
  });
  return {
    parsed: res.parsed_output ?? null,
    usage: {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
    },
    stopReason: res.stop_reason,
  };
};

export interface HumanizedItem {
  id: string;
  before: string;
  /** 게이트를 통과한 결과 (걸리면 원문) */
  after: string;
  changed: boolean;
  /** 원문으로 되돌린 이유 (Claude가 낸 결과가 게이트에 걸린 경우) */
  reasons: string[];
  /** 게이트에 걸린 Claude 결과 (참고용) */
  rejected?: string;
}

export interface HumanizeResult {
  kind: HumanizeKind;
  items: HumanizedItem[];
  /** 규칙 검사기로 센 AI 티 (전 → 후) */
  tellsBefore: number;
  tellsAfter: number;
  /** 바뀐 문장 기준 변경률 (0~1) */
  changeRate: number;
  costUsd: number;
  notes: string;
  /** 규칙 검사에서 AI 티가 없어 Claude를 부르지 않았을 때 */
  skipped?: string;
  warning?: string;
}

/** 게이트를 다시 검사한다 (적용할 때 화면에서 받은 결과를 그대로 믿지 않는다) */
export function verifyRewrites(kind: HumanizeKind, pairs: { id: string; before: string; after: string }[], keep: string[], ingredients: string[] = []) {
  const opts: GateOptions = { keep, ingredients, spoken: kind === 'script' };
  return pairs.map((p) => ({ ...p, reasons: p.before === p.after ? [] : rewriteProblems(p.before, p.after, opts) }));
}

export class Humanizer {
  constructor(
    private db: Db,
    private call: RewriteFn = claudeRewrite,
  ) {}

  async run(kind: HumanizeKind, items: HumanizeItem[], opts: { keep: string[]; ingredients?: string[]; force?: boolean }): Promise<HumanizeResult> {
    const list = items.filter((i) => i.text.trim());
    if (!list.length) throw new HttpError(400, '다듬을 문장이 없어요.');
    const joined = list.map((i) => i.text).join('\n\n');
    const tells = findAiTells(joined);
    const same = list.map((i) => ({ id: i.id, before: i.text, after: i.text, changed: false, reasons: [] }));
    if (!tells.length && !opts.force) {
      return { kind, items: same, tellsBefore: 0, tellsAfter: 0, changeRate: 0, costUsd: 0, notes: '', skipped: '규칙 검사에서 AI 티가 보이지 않아요. 그래도 Claude로 다듬어 볼 수 있어요 (1회 약 $0.1).' };
    }
    if (this.call === claudeRewrite && !aiConfigured()) throw new HttpError(409, 'Claude API가 아직 설정되지 않았어요. 서버에 ANTHROPIC_API_KEY를 넣어 주세요.');
    assertBudget(this.db);

    const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    let out;
    try {
      out = await this.call({ model, system: humanizeSystem(kind), user: humanizeUser(kind, list, tells) });
    } catch (e) {
      throw claudeError(e);
    }
    const cost = rewriteCostUsd(model, out.usage);
    recordUsage(this.db, `humanize-${kind}`, model, out.usage.inputTokens + out.usage.cacheWriteTokens + out.usage.cacheReadTokens, out.usage.outputTokens, cost);
    if (out.stopReason === 'refusal') throw new HttpError(422, '이 글은 다듬을 수 없다는 답을 받았어요.');
    if (!out.parsed) throw new HttpError(502, '다듬은 결과를 받지 못했어요. 다시 시도해 주세요.');

    const byId = new Map(out.parsed.items.map((i) => [i.id, i.text.trim()]));
    const checked = verifyRewrites(
      kind,
      list.map((i) => ({ id: i.id, before: i.text, after: byId.get(i.id) ?? i.text })),
      opts.keep,
      opts.ingredients,
    );
    const result: HumanizedItem[] = checked.map((c) => {
      const missing = !byId.has(c.id);
      if (missing) return { id: c.id, before: c.before, after: c.before, changed: false, reasons: ['결과를 돌려받지 못했어요'] };
      if (c.reasons.length) return { id: c.id, before: c.before, after: c.before, changed: false, reasons: c.reasons, rejected: c.after };
      return { id: c.id, before: c.before, after: c.after, changed: c.after !== c.before, reasons: [] };
    });
    const changeRate = totalChangeRate(result.filter((r) => r.changed));
    return {
      kind,
      items: result,
      tellsBefore: tells.length,
      tellsAfter: findAiTells(result.map((r) => r.after).join('\n\n')).length,
      changeRate,
      costUsd: cost,
      notes: out.parsed.notes.trim().slice(0, 500),
      ...(changeRate >= CHANGE_RATE_WARN ? { warning: `많이 바뀌었어요 (변경률 ${Math.round(changeRate * 100)}%). 뜻이 그대로인지 꼭 읽어 보고 적용해 주세요.` } : {}),
    };
  }
}
