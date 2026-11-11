import { HOOK_INFO, STYLE_INFO, isHookType, isStyleId } from '@mat-lab/recipe-core';
import type { Publication } from './repo.ts';

/** 사용자가 인사이트 화면을 보고 입력하는 성과 (조회수는 판정에 쓰지 않는다) */
export const METRIC_KEYS = ['reach', 'views', 'skipRate', 'avgWatchSeconds', 'saves', 'shares', 'follows'] as const;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface FormatInsight {
  kind: 'style' | 'hook';
  key: string;
  label: string;
  posts: number;
  medianSkipRate: number | null;
  medianAvgWatch: number | null;
  /** 도달 1,000명당 저장+보내기 */
  medianSavesSharesPerK: number | null;
  /** 3편 미만이면 판단하지 않는다 */
  enough: boolean;
}

/** 게시 기록을 연출·훅별로 모은다. 같은 조건 3편 이상일 때만 '방향'으로 본다. */
export function formatInsights(pubs: Publication[]): FormatInsight[] {
  const withMetrics = pubs.filter((p) => p.status === 'published' && Object.keys(p.metrics).length > 0);
  const groups = new Map<string, Publication[]>();
  for (const p of withMetrics) {
    if (p.style) groups.set(`style:${p.style}`, [...(groups.get(`style:${p.style}`) ?? []), p]);
    if (p.hookType) groups.set(`hook:${p.hookType}`, [...(groups.get(`hook:${p.hookType}`) ?? []), p]);
  }
  return [...groups.entries()].map(([k, list]) => {
    const [kind, key] = k.split(':') as ['style' | 'hook', string];
    const label = kind === 'style' ? (isStyleId(key) ? STYLE_INFO[key].label : key) : isHookType(key) ? HOOK_INFO[key].label : key;
    const perK = list.filter((p) => p.metrics.reach).map((p) => (((p.metrics.saves ?? 0) + (p.metrics.shares ?? 0)) / p.metrics.reach!) * 1000);
    return {
      kind,
      key,
      label,
      posts: list.length,
      medianSkipRate: median(list.map((p) => p.metrics.skipRate).filter((v): v is number => v !== undefined)),
      medianAvgWatch: median(list.map((p) => p.metrics.avgWatchSeconds).filter((v): v is number => v !== undefined)),
      medianSavesSharesPerK: median(perK),
      enough: list.length >= 3,
    };
  });
}
