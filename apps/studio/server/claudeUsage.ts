import Anthropic from '@anthropic-ai/sdk';
import type { Db } from './db.ts';
import { HttpError } from './repo.ts';

/**
 * Claude API 비용·월 한도 (레시피 읽기·다른 주제 더 보기·AI 티 다듬기가 함께 쓴다).
 * 달마다 쓸 수 있는 금액 한도가 있다 (CLAUDE_MONTHLY_BUDGET_USD, 기본 $100).
 */
export const DEFAULT_MODEL = 'claude-opus-5-5';

/** 1백만 토큰당 달러 (입력, 출력). 2026-11 기준, 모르는 모델은 가장 비싼 값으로 계산해 한도를 넘지 않게 한다 */
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};
export const priceOf = (model: string): [number, number] => (Object.hasOwn(PRICES, model) ? PRICES[model]! : [10, 50]);

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [i, o] = priceOf(model);
  return (inputTokens * i + outputTokens * o) / 1_000_000;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** 한국 시간 기준 달 (예: 2026-11) */
export const monthKey = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(now);

/** 이번 달(한국 시간) 쓴 금액 */
export function monthSpentUsd(db: Db, now = new Date()): number {
  const r = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS s FROM ai_usage WHERE month = ?').get(monthKey(now)) as { s: number };
  return Number(r.s);
}

export const monthlyBudgetUsd = () => Number(process.env.CLAUDE_MONTHLY_BUDGET_USD || '100');

/** 이번 달 한도를 다 썼으면 Claude를 부르지 않는다 (부르기 전에 확인) */
export function assertBudget(db: Db, message = (budget: number) => `이번 달 Claude 사용 한도($${budget})를 다 썼어요. 다음 달에 다시 쓸 수 있어요.`) {
  const budget = monthlyBudgetUsd();
  if (monthSpentUsd(db) >= budget) throw new HttpError(429, message(budget));
}

/** 쓴 금액을 기록한다 (월 한도 계산용) */
export function recordUsage(db: Db, purpose: string, model: string, inputTokens: number, outputTokens: number, cost: number) {
  db.prepare('INSERT INTO ai_usage (created_at, month, purpose, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), monthKey(), purpose, model, inputTokens, outputTokens, cost);
}

/**
 * Claude API 오류 → 사용자에게 보여 줄 HttpError. API 오류가 아니면 그대로 돌려준다 (호출한 쪽에서 throw).
 * badRequest: 잘못된 요청(400)을 따로 설명할 때 (예: 올린 파일이 너무 큼)
 */
export function claudeError(e: unknown, badRequest?: (e: Error) => string): unknown {
  if (e instanceof Anthropic.AuthenticationError) return new HttpError(502, 'Claude API 열쇠가 맞지 않아요. 서버의 ANTHROPIC_API_KEY를 확인해 주세요.');
  if (e instanceof Anthropic.RateLimitError) return new HttpError(429, 'Claude API가 잠시 바빠요. 1분 뒤 다시 시도해 주세요.');
  if (badRequest && e instanceof Anthropic.BadRequestError) return new HttpError(400, badRequest(e));
  if (e instanceof Anthropic.APIError) return new HttpError(502, `Claude API 오류 (${e.status ?? '?'}). 잠시 뒤 다시 시도해 주세요.`);
  return e;
}
