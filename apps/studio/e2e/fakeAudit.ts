import type { AuditSummaryCallFn } from '../server/auditSummary.ts';

/**
 * 시험용 가짜 진단 요약 (실제 Claude를 부르지 않는다). 서버 단위 테스트와 E2E 시험 서버가 같이 쓴다.
 * 진단 글에 있는 숫자(최근 30일 게시 수)만 옮겨 적는다.
 */
export function fakeAuditSummary(facts: string): string {
  const posts = facts.match(/최근 30일 영상 게시 (\d+)편/)?.[1] ?? '0';
  const compared = facts.includes('성과 비교: 함.');
  return `최근 30일 동안 영상 ${posts}편을 올렸어요. ${compared ? '성과 숫자로 잘 된 연출을 비교했어요.' : '성과 기록이 적어 아직 숫자로 비교하지 않았어요.'} 다음에 만들 영상부터 하나씩 끝내 보세요.`;
}

export const fakeAuditCall: AuditSummaryCallFn = async ({ user }) => ({
  summary: fakeAuditSummary(user),
  usage: { inputTokens: 900, outputTokens: 300, cacheWriteTokens: 0, cacheReadTokens: 0 },
  stopReason: 'end_turn',
});
