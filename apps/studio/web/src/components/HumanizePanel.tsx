import React, { useState } from 'react';
import type { BlogStyle } from '@mat-lab/publishing';
import { api, type HumanizeResult, type ProjectDetail } from '../api.ts';
import { useApp } from '../App.tsx';
import { costText, useMeasuredCosts } from '../cost.ts';

/**
 * im-not-ai(Humanize KR) 윤문: 규칙 검사(0원) → Claude가 룰북대로 다듬기 → 프로그램이 숫자·분량·말투·인용을 다시 검사.
 * 검사에 걸린 문장은 원래대로 두고, 연구자가 전후를 보고 [적용]을 눌러야 저장된다.
 * 블로그: 연구자 답변·재료·순서·팁 목록은 보내지 않는다. 대본: 대사만 다듬고 화면 카드는 그대로 둔다.
 */
export const HumanizePanel: React.FC<{
  project: ProjectDetail;
  target: 'blog' | 'script';
  style?: BlogStyle;
  polished?: number;
  onApplied: (project?: ProjectDetail) => void;
}> = ({ project, target, style, polished = 0, onApplied }) => {
  const { run, notify } = useApp();
  const [result, setResult] = useState<(HumanizeResult & { version?: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const what = target === 'blog' ? '블로그 문단' : '대사';
  const measured = useMeasuredCosts();

  const start = async (force = false) => {
    setBusy(true);
    const r = await run(() => api.humanize(project.id, target, { style, force }));
    setBusy(false);
    if (r) setResult(r);
  };
  const changed = result?.items.filter((i) => i.changed) ?? [];
  const reverted = result?.items.filter((i) => i.reasons.length) ?? [];

  return (
    <div className="card stack humanize">
      <div className="row">
        <b>AI 티 다듬기</b>
        <span className="muted small">im-not-ai 룰북 85개 패턴 · Claude 사용(1회 {costText(measured.humanize, '약 $0.1')}, 이번 달 한도 안에서)</span>
        <div className="spacer" />
        {target === 'blog' && polished > 0 && (
          <button
            className="btn small ghost"
            onClick={async () => {
              if (await run(() => api.clearPolish(project.id), '원래 문장으로 되돌렸어요')) onApplied();
            }}
          >
            다듬은 {polished}문단 되돌리기
          </button>
        )}
        <button className="btn small" disabled={busy} onClick={() => start(false)}>
          {busy ? '다듬는 중…' : `${what} 다듬기`}
        </button>
      </div>
      <div className="muted small">
        숫자·분량·재료·이름·인용·말투는 바꾸지 않아요. 바뀌면 프로그램이 원래 문장으로 되돌립니다.
        {target === 'blog' ? ' 연구자 답변과 재료·순서·팁 목록은 손대지 않아요.' : ' 화면 카드(재료·순서·원리 원문)는 그대로예요.'}
      </div>
      {result?.skipped && (
        <div className="issue info small">
          {result.skipped}{' '}
          <button className="btn small ghost" disabled={busy} onClick={() => start(true)}>
            그래도 다듬기
          </button>
        </div>
      )}
      {result && !result.skipped && (
        <>
          <div className="row small">
            <span className="badge">AI 티 {result.tellsBefore} → {result.tellsAfter}</span>
            <span className="badge">바뀐 {what} {changed.length}개</span>
            <span className={`badge ${result.changeRate >= 0.3 ? 'review' : ''}`}>변경률 {Math.round(result.changeRate * 100)}%</span>
            <span className="muted">약 ${result.costUsd.toFixed(3)}</span>
          </div>
          {result.warning && <div className="issue warning small">{result.warning}</div>}
          {result.notes && <div className="muted small">Claude 메모: {result.notes}</div>}
          {changed.length === 0 && <div className="issue info small">고칠 곳이 없다는 결과예요. 지금 문장 그대로 써도 돼요.</div>}
          {changed.map((i) => (
            <div key={i.id} className="diff small">
              <div className="before">{i.before}</div>
              <div className="after">{i.after}</div>
            </div>
          ))}
          {reverted.length > 0 && (
            <details className="small">
              <summary>원래대로 둔 {reverted.length}개 (검사에 걸림)</summary>
              {reverted.map((i) => (
                <div key={i.id} className="diff">
                  <div className="before">{i.before}</div>
                  {i.rejected && <div className="rejected">{i.rejected}</div>}
                  <div className="muted">{i.reasons.join(' / ')}</div>
                </div>
              ))}
            </details>
          )}
          <div className="row">
            <button className="btn small ghost" onClick={() => setResult(null)}>
              취소
            </button>
            <button
              className="btn small primary"
              disabled={!changed.length}
              onClick={async () => {
                const r = await run(() => api.applyHumanize(project.id, target, changed.map((i) => ({ id: i.id, before: i.before, after: i.after })), { style, version: result.version }));
                if (r) {
                  const saved = target === 'script' ? `다듬은 대사 ${r.applied}개를 새 버전으로 저장했어요 (재검수 필요)` : `다듬은 문장 ${r.applied}개를 블로그 원고에 적용했어요`;
                  if (r.rejected.length) notify(`${saved}. ${r.rejected.length}개는 다시 검사에 걸려 원래 문장으로 뒀어요.`, true);
                  else notify(saved);
                  setResult(null);
                  onApplied(r.project);
                }
              }}
            >
              적용
            </button>
          </div>
        </>
      )}
    </div>
  );
};
