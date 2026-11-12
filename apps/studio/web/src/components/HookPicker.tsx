import React, { useEffect, useRef, useState } from 'react';
import { STYLE_IDS, VISUAL_LABELS, isStyleId, type HookCandidate, type HookType, type StyleId, type StyleInfo } from '@mat-lab/recipe-core';
import { api, type ProjectDetail } from '../api.ts';
import { useApp } from '../App.tsx';

/**
 * 연출 유형과 첫 장면(훅)을 고르는 화면.
 * 후보는 레시피 자료로만 만들고, 왜 추천하는지와 첫 화면이 어떻게 보이는지 함께 보여 준다.
 */
export const HookPicker: React.FC<{ project: ProjectDetail; setProject: (p: ProjectDetail) => void; dirty: boolean }> = ({ project, setProject, dirty }) => {
  const { run } = useApp();
  const current = project.latest?.script;
  const [style, setStyle] = useState<StyleId>(isStyleId(current?.style) ? current!.style as StyleId : 'experiment');
  const [styles, setStyles] = useState<Record<StyleId, StyleInfo> | null>(null);
  const [hooks, setHooks] = useState<HookCandidate[]>([]);
  const [chosen, setChosen] = useState<HookType | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [showMissing, setShowMissing] = useState(false);
  const [repetition, setRepetition] = useState<string | null>(null);
  /** 대표 훅을 이미 골라 준 연출 */
  const defaultedFor = useRef<StyleId | null>(null);

  // 레시피는 서버에서 받을 때마다 새 객체라 내용으로 비교한다
  const recipeKey = JSON.stringify(project.recipe);
  useEffect(() => {
    let alive = true;
    void run(() => api.hooks(project.id, style)).then((r) => {
      if (!alive || !r) return;
      setStyles(r.styles);
      setHooks(r.hooks);
      setRepetition(r.repetition);
      // 연출이 바뀐 뒤 처음 받은 후보면 그 연출의 대표 훅을 고른다 (서버 pickHook과 같은 규칙)
      const signature = r.styles[style].hooks.find((t) => r.hooks.some((h) => h.type === t && h.available)) ?? r.hooks.find((h) => h.available)?.type ?? null;
      const fresh = defaultedFor.current !== style;
      defaultedFor.current = style;
      setChosen((c) => (!fresh && c && r.hooks.some((h) => h.type === c && h.available) ? c : signature));
    });
    return () => {
      alive = false;
    };
  }, [project.id, style, recipeKey, run]);
  const pickStyle = (id: StyleId) => setStyle(id);

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
    <div className="stack">
      <div className="muted small">레시피에 있는 내용만으로 후보를 만들어요. 비용은 들지 않아요.</div>

      <div>
        <h3>① 어떤 영상으로 만들까요?</h3>
        <div className="option-grid">
          {STYLE_IDS.map((id) => {
            const s = styles?.[id];
            const on = id === style;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pickStyle(id)}
                className={`option ${on ? 'on' : ''}`}
                aria-pressed={on}
                style={{ gap: 2, padding: '10px 12px' }}
              >
                <span className="option-title">{s?.label ?? id}</span>
                <span className="small muted">{s?.summary}</span>
              </button>
            );
          })}
        </div>
        {repetition && <div className="issue warning" style={{ marginTop: 8 }}>{repetition}</div>}
        {info && (
          <div className="option-note" style={{ marginTop: 8 }}>
            흐름: {info.beats.join(' → ')} · 권장 {info.seconds[0]}~{info.seconds[1]}초 (대사 길이에 맞춰 자동 조정)
          </div>
        )}
      </div>

      <div>
        <h3>② 첫 장면(훅) 고르기 <span className="muted small">위에서부터 추천 순서예요</span></h3>
        <div className="stack" style={{ gap: 8 }}>
          {available.map((h) => {
            const on = h.type === chosen;
            return (
              <label key={h.type} className={`option ${on ? 'on' : ''}`}>
                <input type="radio" name="hook" checked={on} onChange={() => setChosen(h.type)} />
                <div className="stack" style={{ gap: 4 }}>
                  <div>
                    <span className="badge">{h.label}</span> {info?.hooks[0] === h.type || (info && info.hooks.find((t) => available.some((a) => a.type === t)) === h.type) ? <span className="badge review">이 연출의 대표 훅</span> : null} <b>“{h.line}”</b>
                  </div>
                  <div className="small">첫 화면: {h.scenes[0]?.visual ? `${VISUAL_LABELS[h.scenes[0].visual]} — ` : ''}{h.firstScreen}</div>
                  <div className="small muted">추천 이유: {h.reason}</div>
                  {h.needsReview.map((n) => (
                    <div key={n} className="small note-warn">확인 필요: {n}</div>
                  ))}
                </div>
              </label>
            );
          })}
        </div>
        {missing.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn small ghost" aria-expanded={showMissing} onClick={() => setShowMissing((v) => !v)}>
              자료가 더 있으면 쓸 수 있는 훅 {missing.length}개 <span aria-hidden="true">{showMissing ? '▲' : '▼'}</span>
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
        <div className="issue warning small">
          {notes.map((n) => (
            <div key={n}>· {n}</div>
          ))}
        </div>
      )}
    </div>
  );
};
