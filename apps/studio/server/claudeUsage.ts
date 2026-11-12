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

const budgetMessage = (budget: number) => `이번 달 Claude 사용 한도($${budget})를 다 썼어요. 다음 달에 다시 쓸 수 있어요.`;

/**
 * 지금 진행 중인 Claude 호출이 쓸 수도 있는 금액 (DB별). 서버는 Node 프로세스 하나라 메모리에 둔다.
 * 두 요청이 동시에 시작해도 둘 다 "아직 한도 안"으로 통과하지 않게 한도 확인 때 함께 센다.
 */
const reserved = new WeakMap<Db, number>();
export const reservedUsd = (db: Db) => reserved.get(db) ?? 0;

/** 이번 달 한도를 다 썼으면 Claude를 부르지 않는다 (부르기 전에 확인). 진행 중인 호출의 예상 금액도 쓴 것으로 센다 */
export function assertBudget(db: Db, message = budgetMessage) {
  const budget = monthlyBudgetUsd();
  if (monthSpentUsd(db) + reservedUsd(db) >= budget) throw new HttpError(429, message(budget));
}

/**
 * 한도를 확인하고 이번 호출의 넉넉한 예상 금액을 잡아 둔다 (확인과 잡기 사이에 다른 요청이 끼어들지 않는다).
 * 예상 금액은 출력이 max_tokens를 다 쓴다고 보고 costUsd로 계산한다.
 * 호출이 끝나면(성공·실패 모두) 돌려받은 함수를 불러 놓아주고, 실제 금액은 recordUsage로 기록한다.
 */
export function reserveBudget(db: Db, estimateUsd: number, message = budgetMessage): () => void {
  assertBudget(db, message);
  const amount = Math.max(0, estimateUsd);
  reserved.set(db, reservedUsd(db) + amount);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    reserved.set(db, Math.max(0, reservedUsd(db) - amount));
  };
}

/** 쓴 금액을 기록한다 (월 한도 계산용) */
export function recordUsage(db: Db, purpose: string, model: string, inputTokens: number, outputTokens: number, cost: number) {
  db.prepare('INSERT INTO ai_usage (created_at, month, purpose, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), monthKey(), purpose, model, inputTokens, outputTokens, cost);
}

/** 실제로 쓴 금액의 평균 (횟수와 1회 평균 달러) */
export interface MeasuredCost {
  count: number;
  avgUsd: number;
}

/**
 * 최근 며칠 동안 기능별로 실제로 쓴 1회 평균 금액 (화면의 비용 안내를 추정 대신 실측으로 보이려고).
 * 기능 이름은 기록할 때 쓴 purpose (recipe-read, topics). AI 티 다듬기(humanize-대사·블로그 등)는 humanize 하나로 묶는다.
 */
export function recentCostByPurpose(db: Db, days = 30, now = new Date()): Record<string, MeasuredCost> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT CASE WHEN purpose LIKE 'humanize-%' THEN 'humanize' ELSE purpose END AS p, COUNT(*) AS n, AVG(cost_usd) AS avg
       FROM ai_usage WHERE created_at >= ? AND created_at <= ? GROUP BY p`,
    )
    .all(since, now.toISOString()) as { p: string; n: number; avg: number }[];
  return Object.fromEntries(rows.map((r) => [r.p, { count: Number(r.n), avgUsd: Number(r.avg) }]));
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
