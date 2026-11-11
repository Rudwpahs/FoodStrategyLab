import './testDataDir.ts';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { assertBudget, claudeError, costUsd, monthKey, monthSpentUsd, priceOf, recordUsage } from './claudeUsage.ts';
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
