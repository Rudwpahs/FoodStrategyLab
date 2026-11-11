import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { isGlFailure, renderConcurrency, visibleCores, withGlFallback } from './render.ts';

describe('GPU 실패 때 소프트웨어 렌더로 다시 시도', () => {
  it('3D(WebGL) 오류일 때만 다시 시도하고, 취소·시간 초과·화면 코드 오류는 그대로 알린다', async () => {
    expect(isGlFailure(new Error('THREE.WebGLRenderer: Error creating WebGL context.'))).toBe(true);
    expect(isGlFailure(new Error('Failed to create an ANGLE GPU context'))).toBe(true);
    for (const message of ['renderMedia() got cancelled', 'renderStill() got cancelled', 'A delayRender() "Loading audio" was called but not cleared after 120000ms', "TypeError: Cannot read properties of undefined (reading 'scenes')"])
      expect(isGlFailure(new Error(message)), message).toBe(false);

    let calls = 0;
    const canceled = () => {
      calls++;
      return Promise.reject(new Error('renderMedia() got cancelled'));
    };
    await expect(withGlFallback(canceled)).rejects.toThrow('cancelled');
    expect(calls).toBe(1);
  });
});

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
