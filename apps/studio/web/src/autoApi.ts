import { request } from './api.ts';
import type { AutoPost, AutoReply, DryRun, PlanSlot } from '../../server/autoPilot.ts';
import type { CommentRule } from '../../server/commentRules.ts';

export type { AutoPost, AutoReply, CommentRule, DryRun, PlanSlot };

/** 자동 게시·댓글 답장 화면이 받는 모든 것 (/api/auto) */
export interface AutoOverview {
  settings: { autoPost: boolean; commentReplies: boolean; dailyMax: number };
  instagram: { configured: boolean; connected: boolean; username: string; problem: string; commentScopes: 'yes' | 'no' | 'unknown' };
  rules: CommentRule[];
  scheduled: AutoPost[];
  planSlots: PlanSlot[];
  recentPosts: AutoPost[];
  recentReplies: AutoReply[];
  last: { posts: { at: string; message: string } | null; comments: { at: string; message: string } | null };
  postedLast24h: number;
  maxDaily: number;
  publicUrl: boolean;
}

export type RuleDraft = Omit<CommentRule, 'keywords'> & { keywords: string };

export const autoApi = {
  overview: () => request<AutoOverview>('GET', '/auto'),
  setSettings: (patch: { autoPost?: boolean; commentReplies?: boolean; dailyMax?: number; confirm?: boolean }) => request<AutoOverview>('PUT', '/auto/settings', patch),
  setRules: (rules: RuleDraft[]) => request<AutoOverview>('PUT', '/auto/rules', { rules }),
  connectComments: () => request<{ url: string }>('POST', '/auto/connect'),
  dryRun: () => request<DryRun>('POST', '/auto/dry-run'),
  testComment: (text: string, rules?: RuleDraft[]) =>
    request<{ matched: false } | { matched: true; keyword: string; reply: string; dm: string }>('POST', '/auto/test-comment', rules ? { text, rules } : { text }),
  projectPosts: (projectId: number) => request<{ posts: AutoPost[]; settings: { autoPost: boolean } }>('GET', `/auto/projects/${projectId}`),
  schedule: (projectId: number, at: string, caption?: string) => request<AutoPost>('POST', '/auto/scheduled', { projectId, at, caption }),
  cancel: (id: number) => request<AutoPost>('DELETE', `/auto/scheduled/${id}`),
  retry: (id: number) => request<AutoPost>('POST', `/auto/scheduled/${id}/retry`),
};

export const POST_STATUS: Record<AutoPost['status'], string> = {
  scheduled: '예약됨',
  posting: '올리는 중',
  posted: '올림',
  failed: '실패',
  skipped: '건너뜀',
  canceled: '취소',
};

export const REPLY_STATUS: Record<AutoReply['status'], string> = { working: '보내는 중', done: '답함', partial: '답글만', failed: '실패' };

/** 한국 시각으로 짧게 (예: 11/24(화) 18:00) */
export function whenKst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}
