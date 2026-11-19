import React, { useCallback, useEffect, useState } from 'react';
import { STATUS_LABELS } from '@mat-lab/recipe-core';
import { auditApi, type AuditFinding, type AuditResponse } from '../api.ts';
import { useApp } from '../App.tsx';

const dateText = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const Finding: React.FC<{ f: AuditFinding }> = ({ f }) => (
  <div className={`audit-finding ${f.kind === 'good' ? 'good' : 'hold'}`}>
    <div className="audit-finding-title">{f.title}</div>
    <div className="small">{f.detail}</div>
    {f.numbers.length > 0 && (
      <div className="audit-numbers" aria-label="판단에 쓴 숫자">
        {f.numbers.map((n) => (
          <span key={n.label} className="badge">
            {n.label} <b className="num">{n.value}</b>
          </span>
        ))}
      </div>
    )}
  </div>
);

/**
 * 계정 진단: 게시 기록·성과 숫자·대본으로 센 "잘하고 있는 점 / 발목 잡는 점 / 다음에 만들 영상 3개" (0원),
 * 그리고 버튼을 눌렀을 때만 Claude가 쓰는 짧은 요약. 숫자는 모두 이 계정의 기록에서만 나온다.
 */
export const AuditPage: React.FC = () => {
  const { run } = useApp();
  const [data, setData] = useState<AuditResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [writing, setWriting] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    run(auditApi.get).then((r) => (r ? setData(r) : setFailed(true)));
  }, [run]);
  useEffect(() => {
    load();
  }, [load]);

  const summarize = async () => {
    setWriting(true);
    const r = await run(auditApi.summarize, '진단 요약이 왔어요');
    setWriting(false);
    if (r) setData(r);
  };

  if (failed && !data) {
    return (
      <div className="card empty">
        <h2>진단을 불러오지 못했어요</h2>
        <div>인터넷 연결을 확인하고 다시 불러와 주세요.</div>
        <button className="btn primary" onClick={load}>다시 불러오기</button>
      </div>
    );
  }
  if (!data) return <div className="loading">진단하는 중…</div>;
  const { audit, summary, ai } = data;
  const busy = writing || ai.writing;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>계정 진단</h1>
          <p className="lead">게시 기록·성과 숫자·대본을 규칙으로 세어 봤어요. 숫자는 모두 이 계정의 기록에서만 나와요.</p>
        </div>
      </div>

      {!audit.enoughData && (
        <section className="card stack" aria-label="아직 기록이 적어요">
          <div className="card-head">
            <h2>아직 기록이 적어요</h2>
            <span className="muted">성과를 적은 영상 {audit.counts.postsWithMetrics}편</span>
          </div>
          <ul className="audit-tips">
            {audit.starter.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack" aria-label="잘하고 있는 점">
        <h2>잘하고 있는 점</h2>
        {audit.good.length ? audit.good.map((f) => <Finding key={f.id} f={f} />) : <div className="muted small">아직 짚을 만한 점이 없어요. 기록이 쌓이면 보여 드려요.</div>}
      </section>

      <section className="card stack" aria-label="발목 잡는 점">
        <h2>발목 잡는 점</h2>
        {audit.holdBack.length ? audit.holdBack.map((f) => <Finding key={f.id} f={f} />) : <div className="muted small">지금 기록으로는 걸리는 점이 없어요.</div>}
      </section>

      <section className="card stack" aria-label="다음에 만들 영상 3개">
        <div className="card-head">
          <h2>다음에 만들 영상 3개</h2>
          <span className="muted">아직 승인·게시된 영상이 없는 레시피에서 골랐어요</span>
        </div>
        {audit.next.length ? (
          <div className="list">
            {audit.next.map((s) => (
              <a key={s.projectId} className={`list-item ${s.status}`} href={`#/p/${s.projectId}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="title">{s.dishName || s.topic}</div>
                  {s.dishName && <div className="small muted">{s.topic}</div>}
                  <div className="meta">
                    <span className="badge">{s.styleLabel}</span>
                    <span>{STATUS_LABELS[s.status]}</span>
                  </div>
                  <div className="small audit-reason">{s.reason}</div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="muted small">
            {audit.counts.projects ? '모든 레시피가 영상이 됐어요. 새 레시피를 올려 주세요.' : '아직 레시피가 없어요.'} <a href="#/new">새 레시피 올리기</a>
          </div>
        )}
      </section>

      <section className="card stack" aria-label="AI 요약">
        <div className="card-head">
          <h2>AI 요약</h2>
          <span className="muted">위의 숫자만으로 Claude가 한 문단으로 정리해요. 연구자의 경험은 쓰지 않아요.</span>
        </div>
        {summary && (
          <div className="audit-summary stack">
            <p>{summary.text}</p>
            <div className="small muted">{dateText(summary.createdAt)}에 받은 요약</div>
            {summary.stale && <div className="issue info small">그 뒤로 진단 숫자가 바뀌었어요. 다시 요약하면 지금 숫자로 정리해요.</div>}
          </div>
        )}
        {ai.available ? (
          <div className="row">
            <button className={`btn ${summary ? '' : 'primary'}`} disabled={busy} onClick={summarize}>
              {busy ? '요약 쓰는 중… (10~30초)' : summary ? '다시 요약하기' : '요약 받기'}
            </button>
            <span className="muted small">약 $0.05~0.1 (추정, 월 한도 안에서)</span>
          </div>
        ) : (
          <div className="issue info small">서버에 Claude API가 설정되면 요약을 받을 수 있어요. 위의 진단은 그대로 쓸 수 있어요.</div>
        )}
      </section>
    </div>
  );
};
