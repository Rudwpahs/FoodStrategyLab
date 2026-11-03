import React, { useEffect, useState } from 'react';
import { STYLE_IDS, VISUAL_LABELS, type HookCandidate, type HookType, type StyleId, type StyleInfo } from '@mat-lab/recipe-core';
import { api, type ProjectDetail } from '../api.ts';
import { useApp } from '../App.tsx';

/**
 * 연출 유형과 첫 장면(훅)을 고르는 화면.
 * 후보는 레시피 자료로만 만들고, 왜 추천하는지와 첫 화면이 어떻게 보이는지 함께 보여 준다.
 */
export const HookPicker: React.FC<{ project: ProjectDetail; setProject: (p: ProjectDetail) => void; dirty: boolean }> = ({ project, setProject, dirty }) => {
  const { run } = useApp();
  const current = project.latest?.script;
  const [style, setStyle] = useState<StyleId>((current?.style as StyleId) ?? 'experiment');
  const [styles, setStyles] = useState<Record<StyleId, StyleInfo> | null>(null);
  const [hooks, setHooks] = useState<HookCandidate[]>([]);
  const [chosen, setChosen] = useState<HookType | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [showMissing, setShowMissing] = useState(false);
  const [repetition, setRepetition] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.hooks(project.id, style).then((r) => {
      if (!alive) return;
      setStyles(r.styles);
      setHooks(r.hooks);
      setRepetition(r.repetition);
      setChosen((c) => (c && r.hooks.some((h) => h.type === c && h.available) ? c : r.hooks.find((h) => h.available)?.type ?? null));
    });
    return () => {
      alive = false;
    };
  }, [project.id, style, project.recipe]);

  const available = hooks.filter((h) => h.available);
  const missing = hooks.filter((h) => !h.available);
  const info = styles?.[style];

  const apply = async (mode: 'new' | 'hook') => {
    if (!chosen) return;
    if (dirty && !confirm('저장하지 않은 수정이 있습니다. 계속할까요?')) return;
    const r = await run(
      () => (mode === 'new' ? api.styledScript(project.id, style, chosen) : api.changeHook(project.id, chosen)),
      mode === 'new' ? '새 대본을 만들었어요 (새 버전, 검수 필요)' : '첫 장면만 바꿨어요 (나머지 장면과 음성은 그대로)',
    );
    if (r) {
      setProject(r.project);
      setNotes(r.notes);
    }
  };

  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>연출과 첫 장면 고르기</h2>
        <span className="muted small">레시피에 있는 내용만으로 후보를 만들어요. 비용 0원.</span>
      </div>

      <div>
        <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>① 어떤 영상으로 만들까요?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
          {STYLE_IDS.map((id) => {
            const s = styles?.[id];
            const on = id === style;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setStyle(id)}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: on ? '3px solid #e2533a' : '1px solid #ddd', background: on ? '#fff3ef' : '#fff', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 800 }}>{s?.label ?? id}</div>
                <div className="small muted">{s?.summary}</div>
              </button>
            );
          })}
        </div>
        {repetition && <div className="issue warning" style={{ marginTop: 8 }}>{repetition}</div>}
        {info && (
          <div className="small" style={{ marginTop: 8, background: '#fffaf3', padding: 10, borderRadius: 10 }}>
            흐름: {info.beats.join(' → ')} · 권장 {info.seconds[0]}~{info.seconds[1]}초 (대사 길이에 맞춰 자동 조정)
          </div>
        )}
      </div>

      <div>
        <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>② 첫 장면(훅)을 고르세요 — 위에서부터 추천 순서</div>
        <div className="stack" style={{ gap: 8 }}>
          {available.map((h) => {
            const on = h.type === chosen;
            return (
              <label key={h.type} style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, border: on ? '3px solid #e2533a' : '1px solid #ddd', background: on ? '#fff3ef' : '#fff', cursor: 'pointer' }}>
                <input type="radio" name="hook" checked={on} onChange={() => setChosen(h.type)} />
                <div className="stack" style={{ gap: 4 }}>
                  <div>
                    <span className="badge">{h.label}</span> <b>“{h.line}”</b>
                  </div>
                  <div className="small">첫 화면: {h.scenes[0]?.visual ? `${VISUAL_LABELS[h.scenes[0].visual]} — ` : ''}{h.firstScreen}</div>
                  <div className="small muted">추천 이유: {h.reason}</div>
                  {h.needsReview.map((n) => (
                    <div key={n} className="small" style={{ color: '#9a5b00' }}>⚠ {n}</div>
                  ))}
                </div>
              </label>
            );
          })}
        </div>
        {missing.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn small ghost" onClick={() => setShowMissing((v) => !v)}>
              자료가 더 있으면 쓸 수 있는 훅 {missing.length}개 {showMissing ? '▲' : '▼'}
            </button>
            {showMissing && (
              <ul className="small muted">
                {missing.map((h) => (
                  <li key={h.type}>
                    {h.label}: 레시피의 <b>{h.missing}</b>을(를) 채우면 쓸 수 있어요.
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="row">
        <button className="btn primary" disabled={!chosen} onClick={() => apply('new')}>
          ③ 이 연출과 첫 장면으로 새 대본 만들기
        </button>
        {current && (
          <button className="btn" disabled={!chosen} onClick={() => apply('hook')} title="지금 대본에서 첫 장면만 바꿔요. 나머지 장면과 이미 만든 음성은 그대로 써요.">
            지금 대본의 첫 장면만 바꾸기
          </button>
        )}
      </div>
      {notes.length > 0 && (
        <div className="small" style={{ background: '#fff8e1', padding: 10, borderRadius: 10 }}>
          {notes.map((n) => (
            <div key={n}>· {n}</div>
          ))}
        </div>
      )}
    </div>
  );
};
