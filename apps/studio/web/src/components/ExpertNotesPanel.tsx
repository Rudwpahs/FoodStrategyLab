import React, { useEffect, useState } from 'react';
import type { BlogStyle, ExpertNotes, ExpertQuestion } from '@mat-lab/publishing';
import { api } from '../api.ts';
import { useApp } from '../App.tsx';

/**
 * 연구자에게 묻는 질문지. 답한 내용만 블로그 본문에 그대로 들어간다.
 * AI가 경험을 지어 쓰지 않도록, 빈 칸은 "답변 대기"로 남는다.
 */
export const ExpertNotesPanel: React.FC<{ projectId: number; style: BlogStyle; onSaved: () => void }> = ({ projectId, style, onSaved }) => {
  const { run } = useApp();
  const [questions, setQuestions] = useState<ExpertQuestion[]>([]);
  const [notes, setNotes] = useState<ExpertNotes>({ answers: {} });
  const [draft, setDraft] = useState<ExpertNotes['answers']>({});
  const [confirmName, setConfirmName] = useState('');
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    void run(() => api.expertNotes(projectId)).then((r) => {
      if (!r) return;
      setQuestions(r.questions);
      setNotes(r.notes);
      setDraft(r.notes.answers);
    });
  }, [projectId, run]);

  const required = questions.filter((q) => q.required.includes(style));
  const optional = questions.filter((q) => q.optional.includes(style) && !q.required.includes(style));
  const changed = JSON.stringify(draft) !== JSON.stringify(notes.answers);

  const save = async () => {
    const r = await run(() => api.saveExpertNotes(projectId, draft, confirm ? confirmName : undefined), confirm ? '답변을 저장하고 본인 확인을 기록했어요' : '답변을 저장했어요');
    if (r) {
      setNotes(r.notes);
      setDraft(r.notes.answers);
      setConfirm(false);
      onSaved();
    }
  };

  const field = (q: ExpertQuestion, must: boolean) => (
    <label key={q.id} className="field">
      <span>
        {must && <span className="badge error" style={{ marginRight: 6 }}>필수</span>}
        {q.question}
      </span>
      <span className="hint">{q.hint}</span>
      <textarea rows={2} value={draft[q.id] ?? ''} onChange={(e) => setDraft({ ...draft, [q.id]: e.target.value })} placeholder="연구자가 직접 말하거나 적은 내용 그대로" />
    </label>
  );

  return (
    <div className="card stack">
      <div className="card-head">
        <h2>이희재 연구자에게 묻기</h2>
        <span className="muted">답한 내용만 글에 들어가요. 해 보지 않은 일은 비워 두세요.</span>
      </div>
      {required.map((q) => field(q, true))}
      {optional.length > 0 && (
        <details>
          <summary className="small">더 풍성하게 쓰고 싶다면 (선택 질문 {optional.length}개)</summary>
          <div className="stack" style={{ marginTop: 8 }}>{optional.map((q) => field(q, false))}</div>
        </details>
      )}
      <div className={`issue small ${notes.confirmedBy && !changed ? 'ok' : 'warning'}`}>
        {notes.confirmedBy && !changed ? `${notes.confirmedBy} 연구자가 확인한 답변이에요 (${notes.confirmedAt ? new Date(notes.confirmedAt).toLocaleDateString('ko-KR') : ''})` : '답변을 고치면 연구자 본인 확인을 다시 받아야 해요.'}
      </div>
      <div className="row">
        <label className={`check small ${confirm ? 'on' : ''}`} style={{ flex: '1 1 260px' }}>
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          연구자 본인이 위 답변을 읽고 확인했습니다
        </label>
        {confirm && <input type="text" placeholder="확인한 연구자 이름" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} style={{ width: 160 }} />}
        <div className="spacer" />
        <button className="btn primary small" disabled={(!changed && !confirm) || (confirm && !confirmName.trim())} onClick={save}>
          저장
        </button>
      </div>
    </div>
  );
};
