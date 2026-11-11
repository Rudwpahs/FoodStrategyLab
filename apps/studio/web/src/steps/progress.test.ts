import { describe, expect, it } from 'vitest';
import { defaultStep, doneUntil } from './progress.ts';

type Input = Parameters<typeof doneUntil>[0];
const project = (over: Partial<{ status: string; version: number; renders: { status: string; scriptVersion: number }[]; publications: { status: string; scriptVersion: number }[] }>): Input =>
  ({
    status: over.status ?? 'draft',
    latest: { version: over.version ?? 2 },
    renders: over.renders ?? [],
    publications: over.publications ?? [],
  }) as unknown as Input;

describe('단계 진행 표시', () => {
  it('대본 전이면 주제·영상 고르기부터', () => {
    expect(defaultStep(project({ status: 'draft' }))).toBe('script');
    expect(doneUntil(project({ status: 'draft' }))).toBe(0);
  });

  it('검수 중: 최신 대본으로 만든 영상이 있어야 검수 화면, 옛 대본 영상은 치지 않는다', () => {
    const old = project({ status: 'review', renders: [{ status: 'done', scriptVersion: 1 }] });
    expect(defaultStep(old)).toBe('video');
    expect(doneUntil(old)).toBe(1);
    const fresh = project({ status: 'review', renders: [{ status: 'done', scriptVersion: 2 }] });
    expect(defaultStep(fresh)).toBe('review');
    expect(doneUntil(fresh)).toBe(2);
  });

  it('승인 뒤에는 게시 단계, 최신 버전을 실제로 게시해야 게시 단계도 끝난 것으로', () => {
    expect(defaultStep(project({ status: 'approved' }))).toBe('publish');
    expect(doneUntil(project({ status: 'approved' }))).toBe(3);
    expect(doneUntil(project({ status: 'rendered', publications: [{ status: 'scheduled', scriptVersion: 2 }] }))).toBe(3);
    expect(doneUntil(project({ status: 'rendered', publications: [{ status: 'published', scriptVersion: 1 }] }))).toBe(3);
    expect(doneUntil(project({ status: 'rendered', publications: [{ status: 'published', scriptVersion: 2 }] }))).toBe(4);
  });
});
