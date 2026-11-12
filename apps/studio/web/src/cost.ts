import { useEffect, useState } from 'react';
import { api, type MeasuredCost } from './api.ts';

/** 달러 금액: 1센트 아래는 소수 셋째 자리까지 */
const usd = (v: number) => `$${v < 0.01 ? v.toFixed(3) : v.toFixed(2)}`;

/**
 * 비용 안내 문구. 서버에 실제 사용 기록(최근 30일)이 있으면 그 평균을, 없으면 추정값에 '추정'을 붙인다.
 * (클라우드 GPU 목소리·렌더 비용은 앱 안에서 잴 수 없어 화면에 늘 '추정'으로 적는다)
 */
export function costText(measured: MeasuredCost | undefined, estimate: string): string {
  if (measured && measured.count > 0) return `최근 평균 ${usd(measured.avgUsd)} (${measured.count}회)`;
  return `${estimate}, 추정`;
}

/** 기능별(recipe-read, topics, humanize) 최근 30일 실제 평균. 불러오지 못하면 비어 있다 (화면은 추정을 보인다) */
export function useMeasuredCosts(): Record<string, MeasuredCost> {
  const [measured, setMeasured] = useState<Record<string, MeasuredCost>>({});
  useEffect(() => {
    let alive = true;
    api
      .aiInfo()
      .then((i) => alive && setMeasured(i.measured ?? {}))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return measured;
}
