import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay, poll } from './poll.ts';

describe('backoffDelay', () => {
  it('실패가 없으면 평소 간격, 실패할수록 두 배씩 늘고 최대값에서 멈춘다', () => {
    expect(backoffDelay(1500, 0)).toBe(1500);
    expect(backoffDelay(1500, 1)).toBe(3000);
    expect(backoffDelay(1500, 2)).toBe(6000);
    expect(backoffDelay(1500, 10, 30_000)).toBe(30_000);
  });
});

describe('poll', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('요청이 실패해도 멈추지 않고 다시 확인하며, 다시 연결되면 실패 횟수를 0으로 알린다', async () => {
    const results: (string | Error)[] = [new Error('끊김'), new Error('끊김'), 'running', 'done'];
    const fetcher = vi.fn(async () => {
      const r = results.shift()!;
      if (r instanceof Error) throw r;
      return r;
    });
    const seen: string[] = [];
    const failures: number[] = [];
    poll(fetcher, 1000, { onData: (v) => (seen.push(v), v !== 'done'), onFailures: (n) => failures.push(n) }, { immediate: true });

    await vi.advanceTimersByTimeAsync(0); // 첫 요청 실패
    expect(failures).toEqual([1]);
    await vi.advanceTimersByTimeAsync(2000); // 1000×2 뒤 다시 → 실패
    expect(failures).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(4000); // 1000×4 뒤 다시 → 성공
    expect(failures).toEqual([1, 2, 0]);
    expect(seen).toEqual(['running']);
    await vi.advanceTimersByTimeAsync(1000); // 평소 간격
    expect(seen).toEqual(['running', 'done']);
    await vi.advanceTimersByTimeAsync(60_000); // done이면 멈춤
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('멈추면 더 부르지 않고, 늦게 온 응답도 버린다', async () => {
    let resolve!: (v: string) => void;
    const fetcher = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const onData = vi.fn();
    const stop = poll(fetcher, 1000, { onData }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    stop();
    resolve('늦은 응답');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onData).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('immediate가 아니면 첫 확인은 간격 뒤에', async () => {
    const fetcher = vi.fn(async () => 1);
    poll(fetcher, 5000, { onData: () => false });
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
