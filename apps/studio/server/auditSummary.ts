import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { BRAND } from '@mat-lab/recipe-core';
import type { Db } from './db.ts';
import { DEFAULT_MODEL, aiConfigured, claudeError, costUsd, recordUsage, reserveBudget } from './claudeUsage.ts';
import { rewriteCostUsd, type RewriteUsage } from './humanize.ts';
import { HttpError } from './repo.ts';

/**
 * 계정 진단 요약: 규칙으로 센 진단 결과(사실 목록)를 Claude가 짧은 한 문단으로 정리한다 (버튼을 눌렀을 때만, 사용료가 나감).
 * 사실은 넘긴 숫자에서만 쓴다. 넘긴 글에 없는 숫자가 들어간 요약은 받지 않는다 (지어낸 성과를 막으려고).
 * 연구자의 경험·의견은 넘기지도 쓰게 하지도 않는다 (원칙 4). 월 한도는 다른 Claude 기능과 같이 쓴다.
 */

export const AuditSummarySchema = z.object({
  summary: z.string().describe('진단 요약 한 문단 (3~5문장, 존댓말, 300자 안팎)'),
});

export type AuditSummaryCallFn = (req: { model: string; system: string; user: string }) => Promise<{ summary: string | null; usage: RewriteUsage; stopReason: string | null }>;

/** 한 번에 받을 수 있는 출력 토큰 (생각 + 짧은 문단) */
export const AUDIT_MAX_TOKENS = 3000;

let client: Anthropic | null = null;

export const claudeAuditSummary: AuditSummaryCallFn = async ({ model, system, user }) => {
  client ??= new Anthropic();
  const res = await client.messages.parse({
    model,
    max_tokens: AUDIT_MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: user }],
    // 정해진 숫자를 정리하는 일이라 생각은 적게
    output_config: { effort: 'low', format: zodOutputFormat(AuditSummarySchema) },
  });
  return {
    summary: res.parsed_output?.summary ?? null,
    usage: {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
    },
    stopReason: res.stop_reason,
  };
};

export function auditSystem(): string {
  return [
    `당신은 요리 숏폼 계정(${BRAND.labName})의 성과 기록을 정리해 주는 도우미입니다.`,
    '사용자가 주는 <진단> 글은 프로그램이 게시 기록·성과 숫자로 센 결과입니다. 이것을 휴대폰에서 읽기 좋은 한 문단(3~5문장)으로 요약하세요.',
    '규칙:',
    '- 사실과 숫자는 <진단> 글에 있는 것만 씁니다. 새 숫자, 비율, 예상 조회수, 다른 계정·업계 평균을 지어내지 않습니다.',
    '- 숫자를 다시 계산하거나 반올림하지 말고 적힌 그대로 씁니다. 숫자가 꼭 필요하지 않으면 빼도 됩니다.',
    '- 연구자(요리 전문가)의 경험·의견·말을 지어내지 않습니다. 연구자가 무엇을 했다거나 느꼈다고 쓰지 않습니다.',
    '- 성과 비교를 하지 않았다고 적혀 있으면, 기록이 적어 아직 비교하지 않았다고 솔직하게 말합니다.',
    '- 먼저 잘하고 있는 점 하나, 그다음 가장 큰 발목 잡는 점 하나, 마지막으로 다음에 할 일 하나를 말합니다.',
    '- 쉬운 우리말 존댓말로, 과장·감탄사·이모지 없이 씁니다.',
  ].join('\n');
}

export const auditUser = (facts: string) => `<진단>\n${facts}\n</진단>`;

/** 글 속 숫자 (쉼표 뺀 값) */
const numbersIn = (text: string) => new Set((text.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));

/** 요약에 진단 글에 없는 숫자가 있으면 그 숫자들 */
export function inventedNumbers(summary: string, facts: string): string[] {
  const known = numbersIn(facts);
  return [...numbersIn(summary)].filter((n) => !known.has(n));
}

export interface StoredAuditSummary {
  text: string;
  /** 요약할 때 넘긴 진단 글 (지금 진단과 다르면 화면에 '숫자가 바뀌었어요'로 알린다) */
  facts: string;
  costUsd: number;
  createdAt: string;
}

/** 마지막 요약 한 개만 둔다 (다른 표를 건드리지 않게 처음 쓸 때 만든다) */
function ensureTable(db: Db) {
  db.exec(`CREATE TABLE IF NOT EXISTS audit_summary (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    text TEXT NOT NULL,
    facts TEXT NOT NULL,
    cost_usd REAL NOT NULL,
    created_at TEXT NOT NULL
  )`);
}

export function lastAuditSummary(db: Db): StoredAuditSummary | null {
  ensureTable(db);
  const r = db.prepare('SELECT text, facts, cost_usd, created_at FROM audit_summary WHERE id = 1').get() as Record<string, unknown> | undefined;
  return r ? { text: String(r.text), facts: String(r.facts), costUsd: Number(r.cost_usd), createdAt: String(r.created_at) } : null;
}

function saveAuditSummary(db: Db, s: StoredAuditSummary) {
  ensureTable(db);
  db.prepare(
    'INSERT INTO audit_summary (id, text, facts, cost_usd, created_at) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET text = excluded.text, facts = excluded.facts, cost_usd = excluded.cost_usd, created_at = excluded.created_at',
  ).run(s.text, s.facts, s.costUsd, s.createdAt);
}

export class AuditSummarizer {
  /** 요약을 쓰는 중인지 (두 번 눌러 두 번 결제되지 않게) */
  private busy = false;

  constructor(
    private db: Db,
    private call: AuditSummaryCallFn = claudeAuditSummary,
  ) {}

  available(): boolean {
    return this.call !== claudeAuditSummary || aiConfigured();
  }

  writing(): boolean {
    return this.busy;
  }

  async summarize(facts: string): Promise<StoredAuditSummary> {
    if (!this.available()) throw new HttpError(409, 'Claude API가 아직 설정되지 않았어요. 위의 진단은 그대로 볼 수 있어요.');
    if (this.busy) throw new HttpError(409, '요약을 쓰고 있어요. 잠시만 기다려 주세요.');
    const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    const system = auditSystem();
    const user = auditUser(facts);
    this.busy = true;
    let out;
    try {
      const release = reserveBudget(this.db, costUsd(model, system.length + user.length, AUDIT_MAX_TOKENS));
      try {
        out = await this.call({ model, system, user });
      } catch (e) {
        throw claudeError(e);
      } finally {
        release();
      }
    } finally {
      this.busy = false;
    }
    const cost = rewriteCostUsd(model, out.usage);
    recordUsage(this.db, 'audit', model, out.usage.inputTokens + out.usage.cacheWriteTokens + out.usage.cacheReadTokens, out.usage.outputTokens, cost);
    if (out.stopReason === 'refusal') throw new HttpError(422, '요약을 쓸 수 없다는 답을 받았어요. 위의 진단은 그대로 볼 수 있어요.');
    const text = out.summary?.trim() ?? '';
    if (!text) throw new HttpError(502, '요약을 받지 못했어요. 다시 눌러 주세요.');
    const invented = inventedNumbers(text, facts);
    if (invented.length) throw new HttpError(502, `요약에 진단에 없는 숫자(${invented.slice(0, 3).join(', ')})가 있어 쓰지 않았어요. 다시 눌러 주세요.`);
    const stored = { text: text.slice(0, 1200), facts, costUsd: cost, createdAt: new Date().toISOString() };
    saveAuditSummary(this.db, stored);
    return stored;
  }
}
