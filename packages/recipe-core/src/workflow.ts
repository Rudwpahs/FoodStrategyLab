import { CHECKLIST_ITEMS, type Checklist } from './types.ts';

export type ProjectStatus = 'draft' | 'review' | 'approved' | 'rendered';

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: '입력 중',
  review: '검수 대기',
  approved: '승인됨',
  rendered: '제작 완료',
};

/** 버전 번호로만 상태를 계산한다. 대본이 수정되면 승인은 자동으로 무효가 된다. */
export interface VersionState {
  latestScriptVersion: number | null;
  approvedScriptVersion: number | null;
  renderedScriptVersion: number | null;
}

export function deriveStatus(s: VersionState): ProjectStatus {
  if (s.latestScriptVersion === null) return 'draft';
  if (s.approvedScriptVersion !== s.latestScriptVersion) return 'review';
  if (s.renderedScriptVersion === s.latestScriptVersion) return 'rendered';
  return 'approved';
}

export type Gate = { ok: true } | { ok: false; reason: string };

/** 승인되지 않은 최신 대본은 영상·블로그로 출력할 수 없다. */
export function canRender(s: VersionState): Gate {
  if (s.latestScriptVersion === null) return { ok: false, reason: '대본이 아직 없습니다.' };
  if (s.approvedScriptVersion !== s.latestScriptVersion) {
    return { ok: false, reason: '이희재 연구자의 승인이 끝난 대본만 최종 출력할 수 있습니다.' };
  }
  return { ok: true };
}

export function canApprove(checklist: Partial<Checklist>, reviewer: string): Gate {
  if (!reviewer.trim()) return { ok: false, reason: '검수자 이름을 입력하세요.' };
  const missing = CHECKLIST_ITEMS.filter((item) => checklist[item.key] !== true);
  if (missing.length > 0) {
    return { ok: false, reason: `확인하지 않은 항목: ${missing.map((m) => m.label).join(', ')}` };
  }
  return { ok: true };
}
