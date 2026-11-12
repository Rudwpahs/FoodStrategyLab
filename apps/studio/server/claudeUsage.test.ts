import './testDataDir.ts';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { assertBudget, claudeError, costUsd, monthKey, monthSpentUsd, priceOf, recentCostByPurpose, recordUsage, reserveBudget, reservedUsd } from './claudeUsage.ts';
import { openDb } from './db.ts';
import { HttpError } from './repo.ts';

describe('Claude 비용·월 한도 (레시피 읽기·주제 더 보기·AI 티 다듬기 공통)', () => {
  it('모르는 모델은 가장 비싼 값으로 계산한다', () => {
    expect(priceOf('claude-opus-5-5')).toEqual([4, 20]);
    expect(priceOf('some-future-model')).toEqual([10, 50]);
    expect(priceOf('constructor')).toEqual([10, 50]);
    expect(costUsd('claude-opus-5-5', 4000, 2500)).toBeCloseTo(0.066, 6);
  });

  it('이번 달은 한국 시간으로 센다', () => {
    expect(monthKey(new Date('2026-10-31T15:30:00Z'))).toBe('2026-11');
    expect(monthKey(new Date('2026-10-31T14:30:00Z'))).toBe('2026-10');
  });

  it('사용 기록을 남기고, 한도를 다 쓰면 멈춘다', () => {
    const db = openDb(':memory:');
    recordUsage(db, 'test', 'claude-opus-5-5', 10, 10, 60);
    expect(monthSpentUsd(db)).toBe(60);
    expect(() => assertBudget(db)).not.toThrow();
    recordUsage(db, 'test', 'claude-opus-5-5', 10, 10, 50);
    expect(() => assertBudget(db)).toThrow(/한도\(\$100\)/);
    expect(() => assertBudget(db, (b) => `읽기 한도 ${b}`)).toThrow('읽기 한도 100');
  });

  it('진행 중인 호출의 예상 금액도 한도에 센다 (놓아주면 빠지고, 두 번 놓아도 한 번만 빠진다)', () => {
    const db = openDb(':memory:');
    recordUsage(db, 'test', 'claude-opus-5-5', 10, 10, 99);
    const release = reserveBudget(db, 1);
    expect(reservedUsd(db)).toBe(1);
    expect(() => reserveBudget(db, 0.01)).toThrow(/한도/);
    release();
    release();
    expect(reservedUsd(db)).toBe(0);
    expect(() => assertBudget(db)).not.toThrow();
  });

  it('최근 30일 기능별 실제 1회 평균 금액 (다듬기는 하나로 묶고, 30일 넘은 기록은 뺀다)', () => {
    const db = openDb(':memory:');
    const insert = (at: string, purpose: string, cost: number) =>
      db.prepare('INSERT INTO ai_usage (created_at, month, purpose, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)').run(at, monthKey(new Date(at)), purpose, 'claude-opus-5-5', 0, 0, cost);
    const now = new Date('2026-11-12T00:00:00Z');
    insert('2026-11-10T00:00:00.000Z', 'recipe-read', 0.1);
    insert('2026-11-11T00:00:00.000Z', 'recipe-read', 0.2);
    insert('2026-10-01T00:00:00.000Z', 'recipe-read', 5);
    insert('2026-11-11T00:00:00.000Z', 'topics', 0.03);
    insert('2026-11-11T00:00:00.000Z', 'humanize-script', 0.1);
    insert('2026-11-11T00:00:00.000Z', 'humanize-blog', 0.3);
    const m = recentCostByPurpose(db, 30, now);
    expect(m['recipe-read']!.count).toBe(2);
    expect(m['recipe-read']!.avgUsd).toBeCloseTo(0.15, 10);
    expect(m.topics).toEqual({ count: 1, avgUsd: 0.03 });
    expect(m.humanize!.count).toBe(2);
    expect(m.humanize!.avgUsd).toBeCloseTo(0.2, 10);
    expect(recentCostByPurpose(openDb(':memory:'))).toEqual({});
  });

  it('API 오류를 쉬운 문장으로 바꾸고, 다른 오류는 그대로 둔다', () => {
    const headers = new Headers();
    const auth = claudeError(new Anthropic.AuthenticationError(401, undefined, 'bad key', headers));
    expect(auth).toBeInstanceOf(HttpError);
    expect((auth as HttpError).message).toContain('ANTHROPIC_API_KEY');
    expect((claudeError(new Anthropic.RateLimitError(429, undefined, 'slow', headers)) as HttpError).status).toBe(429);
    const bad = new Anthropic.BadRequestError(400, undefined, 'too big', headers);
    expect((claudeError(bad) as HttpError).status).toBe(502);
    expect((claudeError(bad, (e) => `자료를 보내지 못했어요: ${e.message}`) as HttpError).status).toBe(400);
    const other = new Error('boom');
    expect(claudeError(other)).toBe(other);
  });
});
