import type { ProjectDetail } from '../api.ts';

/** 콘텐츠 한 편의 단계 (위쪽 단계 막대와 화면 안내 문구가 같은 이름을 쓴다) */
export const STEPS = [
  { key: 'input', label: '레시피' },
  { key: 'script', label: '주제·영상 고르기' },
  { key: 'video', label: '영상·블로그' },
  { key: 'review', label: '검수·승인' },
  { key: 'publish', label: '게시·기록' },
] as const;
export type StepKey = (typeof STEPS)[number]['key'];

type ProgressInput = Pick<ProjectDetail, 'status' | 'renders' | 'latest' | 'publications'>;

/** 최신 대본으로 만든 영상(검수용 포함)이 있는지 */
export const hasLatestRender = (p: ProgressInput) => p.renders.some((r) => r.status === 'done' && r.scriptVersion === p.latest?.version);

/** 주소에 단계가 없을 때 처음 보여 줄 단계 */
export function defaultStep(p: ProgressInput): StepKey {
  if (p.status === 'draft') return 'script';
  if (p.status === 'review') return hasLatestRender(p) ? 'review' : 'video';
  return 'publish';
}

/** 끝난 단계의 마지막 번호: 입력(0) → 후보(1) → 영상·블로그(2) → 승인(3) → 게시(4) */
export function doneUntil(p: ProgressInput): number {
  if (p.status === 'draft') return 0;
  if (p.status === 'review') return hasLatestRender(p) ? 2 : 1;
  const published = p.publications.some((x) => x.status === 'published' && x.scriptVersion === p.latest?.version);
  return published ? 4 : 3;
}
