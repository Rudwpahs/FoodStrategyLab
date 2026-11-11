/**
 * 서버 작업 진행 상황을 주기적으로 확인한다.
 * - 요청이 실패해도 멈추지 않고, 점점 길게(최대 maxMs) 기다렸다 다시 확인한다.
 *   (아이폰은 화면을 끄거나 다른 앱으로 가면 요청이 끊기기 쉽고, 클라우드 서버는 깨어날 때 잠깐 오류를 준다)
 * - 화면이 다시 보이면(visibilitychange) 바로 한 번 확인한다.
 * - onData가 false를 돌려주면 확인을 멈춘다. 돌려받은 함수를 부르면 멈춘다.
 */
export interface PollHandlers<T> {
  onData: (value: T) => boolean | void;
  /** 연속 실패 횟수. 다시 연결되면 0으로 한 번 불린다 */
  onFailures?: (count: number) => void;
}

/** 실패 횟수에 따라 기다릴 시간: 평소 간격 × 2^실패, 최대 maxMs */
export function backoffDelay(everyMs: number, failures: number, maxMs = 30_000): number {
  if (failures <= 0) return everyMs;
  return Math.min(maxMs, everyMs * 2 ** failures);
}

export function poll<T>(fetcher: () => Promise<T>, everyMs: number, handlers: PollHandlers<T>, opts: { maxMs?: number; immediate?: boolean } = {}): () => void {
  const doc = typeof document === 'undefined' ? null : document;
  let stopped = false;
  let inFlight = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    doc?.removeEventListener('visibilitychange', onVisible);
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  };
  async function tick() {
    if (stopped || inFlight) return;
    inFlight = true;
    clearTimeout(timer);
    let value: T;
    try {
      value = await fetcher();
    } catch {
      inFlight = false;
      if (stopped) return;
      failures += 1;
      handlers.onFailures?.(failures);
      schedule(backoffDelay(everyMs, failures, opts.maxMs));
      return;
    }
    inFlight = false;
    if (stopped) return;
    if (failures) {
      failures = 0;
      handlers.onFailures?.(0);
    }
    if (handlers.onData(value) === false) return stop();
    schedule(everyMs);
  }
  function onVisible() {
    if (doc?.visibilityState === 'visible') void tick();
  }

  doc?.addEventListener('visibilitychange', onVisible);
  if (opts.immediate) void tick();
  else schedule(everyMs);
  return stop;
}
