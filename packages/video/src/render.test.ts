import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { renderConcurrency, visibleCores } from './render.ts';

describe('렌더 동시 작업 수', () => {
  const saved = process.env.REMOTION_CONCURRENCY;
  afterEach(() => {
    if (saved === undefined) delete process.env.REMOTION_CONCURRENCY;
    else process.env.REMOTION_CONCURRENCY = saved;
  });

  it('보이는 코어 수는 Remotion처럼 nproc와 availableParallelism 중 작은 값이다', () => {
    const n = visibleCores();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(os.availableParallelism());
  });

  it('원하는 수가 보이는 코어보다 많으면 줄인다 (Remotion이 거절하지 않게)', () => {
    process.env.REMOTION_CONCURRENCY = '64';
    expect(renderConcurrency()).toBe(visibleCores());
    process.env.REMOTION_CONCURRENCY = '1';
    expect(renderConcurrency()).toBe(1);
    delete process.env.REMOTION_CONCURRENCY;
    expect(renderConcurrency()).toBeUndefined();
  });
});
