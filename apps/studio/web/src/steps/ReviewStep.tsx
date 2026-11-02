import React, { useEffect, useState } from 'react';
import { BRAND, CHECKLIST_ITEMS, formatIngredient, type Issue } from '@mat-lab/recipe-core';
import { api } from '../api.ts';
import { useApp } from '../App.tsx';
import type { StepProps } from '../pages/ProjectPage.tsx';

const LEVEL_LABEL = { error: '오류', warning: '확인 필요', info: '참고' } as const;

export const ReviewStep: React.FC<StepProps> = ({ project, setProject, go }) => {
  const { run } = useApp();
  const latest = project.latest;
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [reviewer, setReviewer] = useState<string>(BRAND.researcher);
  const [note, setNote] = useState('');

  useEffect(() => {
    setChecklist({});
    if (!latest) return;
    run(() => api.check(project.id)).then((r) => {
      if (!r) return;
      setIssues(r.issues);
      setSeconds(r.estimatedSeconds);
    });
  }, [latest?.version, project.recipe]);

  if (!latest) return <div className="card empty">검수할 대본이 없습니다. 먼저 대본을 만드세요.</div>;

  const approved = project.versionState.approvedScriptVersion === latest.version;
  const errors = issues?.filter((i) => i.level === 'error').length ?? 0;
  const sceneIndex = new Map(latest.script.scenes.map((s, i) => [s.id, i + 1]));
  const r = project.recipe;

  const submit = async (decision: 'approved' | 'changes_requested') => {
    if (decision === 'approved' && errors > 0 && !confirm(`자동 검사 오류 ${errors}건이 남아 있습니다. 그래도 승인할까요?`)) return;
    const p = await run(
      () => api.review(project.id, { version: latest.version, reviewer, checklist, decision, note }),
      decision === 'approved' ? '승인했습니다. 이제 최종 제작할 수 있습니다' : '수정 요청을 기록했습니다',
    );
    if (p) {
      setProject(p);
      setNote('');
      if (decision === 'approved') go('video');
    }
  };

  return (
    <div className="stack">
      <div className="compare">
        <div className="card">
          <h2>원본 (이희재 조리 노트)</h2>
          <h3>재료·분량</h3>
          <ul>{r.ingredients.map((i, idx) => <li key={idx}>{formatIngredient(i)}</li>)}</ul>
          <h3>조리 순서</h3>
          <ol>{r.steps.map((s, idx) => <li key={idx}>{s}</li>)}</ol>
          <h3>핵심 원리</h3>
          <p>{r.principle}</p>
          <h3>전문가 팁</h3>
          <ul>{r.tips.map((t, idx) => <li key={idx}>{t}</li>)}</ul>
        </div>
        <div className="card">
          <h2>
            AI 대본 v{latest.version} <span className="muted small">예상 {seconds}초</span>
          </h2>
          {latest.script.scenes.map((s, i) => (
            <div className="line" key={s.id}>
              <b>{i + 1}</b>
              {s.line}
              {s.cardItems && s.cardItems.length > 0 && (
                <div className="muted small" style={{ marginTop: 4 }}>
                  카드: {s.cardTitle ? `[${s.cardTitle}] ` : ''}
                  {s.cardItems.join(' / ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h2>자동 검사 {issues && <span className="muted small">오류 {errors} · 전체 {issues.length}</span>}</h2>
        {issues?.length === 0 && <div className="issue info">원본과 다른 분량이나 주의 표현을 찾지 못했습니다. 그래도 직접 확인하세요.</div>}
        {issues?.map((i, idx) => (
          <div key={idx} className={`issue ${i.level}`}>
            <b>{LEVEL_LABEL[i.level]}</b> {i.sceneId && `· 장면 ${sceneIndex.get(i.sceneId)} `}— {i.message}
          </div>
        ))}
      </div>

      <div className="card stack">
        <h2>연구자 검수</h2>
        {approved ? (
          <div className="issue info">
            v{latest.version}은 {project.approval?.reviewer}님이 {new Date(project.approval!.createdAt).toLocaleString('ko-KR')}에 승인했습니다.
            <button className="btn small" style={{ marginLeft: 12 }} onClick={() => go('video')}>영상 제작으로 →</button>
          </div>
        ) : (
          <>
            {CHECKLIST_ITEMS.map((c) => (
              <label key={c.key} className={`check ${checklist[c.key] ? 'on' : ''}`}>
                <input type="checkbox" checked={!!checklist[c.key]} onChange={(e) => setChecklist((p) => ({ ...p, [c.key]: e.target.checked }))} />
                {c.label}
              </label>
            ))}
            <div className="grid2">
              <label className="field">
                검수자
                <input type="text" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
              </label>
              <label className="field">
                메모 (수정 요청 사유 등)
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <div className="row">
              <button className="btn" onClick={() => go('script')}>대본 고치기</button>
              <div className="spacer" />
              <button className="btn" onClick={() => submit('changes_requested')}>수정 요청</button>
              <button className="btn primary" disabled={!CHECKLIST_ITEMS.every((c) => checklist[c.key]) || !reviewer.trim()} onClick={() => submit('approved')}>
                승인
              </button>
            </div>
          </>
        )}
      </div>

      {project.reviews.length > 0 && (
        <div className="card">
          <h3>검수 기록</h3>
          <div className="log">
            {project.reviews.map((rv) => (
              <div key={rv.id}>
                <time>{new Date(rv.createdAt).toLocaleString('ko-KR')}</time>v{rv.scriptVersion} · {rv.decision === 'approved' ? '승인' : '수정 요청'} · {rv.reviewer}
                {rv.note && ` — ${rv.note}`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
