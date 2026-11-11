import React, { useState } from 'react';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '@mat-lab/recipe-core';
import { api, type ProjectDetail } from '../api.ts';
import { useApp } from '../App.tsx';

type Suggestion = NonNullable<ProjectDetail['source']>['suggestions'][number];

/** 주제 후보의 원리·근거 인용·확인할 점 (주제 고르기와 읽은 레시피 카드가 같이 쓴다) */
export const SuggestionDetails: React.FC<{ s: Suggestion }> = ({ s }) => (
  <>
    <div>{s.principle}</div>
    <div className="muted">
      근거: {s.evidenceLabel} “{s.evidenceQuote}” · {CATEGORY_LABELS[s.category]}
    </div>
    {!s.grounded && <div className="issue warning small">확인 필요: {s.notes.join(' / ')}</div>}
    {(s.styleNotes ?? []).length > 0 && <div className="muted">문체(AI 티): {s.styleNotes.join(' / ')}</div>}
  </>
);

/** 사진에서 읽은 레시피라 아직 영상 주제를 고르지 않았는지 (대본이 이미 있으면 고른 것으로 본다) */
export const needsTopic = (p: ProjectDetail) => Boolean(p.source?.suggestions?.length && !p.source.topicChosenAt && !p.latest);

/**
 * 영상 주제 고르기: AI가 레시피에서 찾은 주제 후보(근거 인용 포함) 중 하나, 또는 직접 쓰기.
 * 주제를 고른 뒤에야 후보 영상 5개를 만든다 (AI가 고른 주제로 바로 영상을 만들지 않는다).
 */
export const TopicPicker: React.FC<{ project: ProjectDetail; onChosen: (p: ProjectDetail) => void }> = ({ project, onChosen }) => {
  const { run } = useApp();
  const suggestions = project.source?.suggestions ?? [];
  const [pick, setPick] = useState<number | 'own'>(0);
  const first = suggestions[0];
  const [topic, setTopic] = useState(first?.topic ?? project.recipe.topic);
  const [principle, setPrinciple] = useState(first?.principle ?? project.recipe.principle);
  const [category, setCategory] = useState<Category>(first?.category ?? project.recipe.category);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  // 다른 주제를 받을 때 원하는 방향 (예: "실수 위주로", "전통 이야기로")
  const [direction, setDirection] = useState('');

  const choose = (i: number | 'own') => {
    setPick(i);
    if (i !== 'own') {
      const s = suggestions[i]!;
      setTopic(s.topic);
      setPrinciple(s.principle);
      setCategory(s.category);
    }
  };

  return (
    <div className="card stack">
      <div>
        <h2 style={{ margin: 0 }}>영상 주제 고르기</h2>
        <div className="muted small">
          AI가 레시피에서 찾은 주제예요. 하나를 고르거나 직접 써 주세요. 주제를 정한 뒤에 그 주제로 후보 영상 5개를 만들어요.
        </div>
      </div>
      {suggestions.map((s, i) => (
        <label key={i} className={`suggestion small${pick === i ? ' current' : ''}`} style={{ cursor: 'pointer' }}>
          <div className="row" style={{ gap: 8 }}>
            <input type="radio" name="topic" checked={pick === i} onChange={() => choose(i)} />
            <b>{s.topic}</b>
            {s.angle && <span className="badge">{s.angle}</span>}
            {i === 0 && <span className="badge approved">AI 추천</span>}
          </div>
          <SuggestionDetails s={s} />
        </label>
      ))}
      <div className="row small" style={{ gap: 8 }}>
        <input type="text" value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="원하는 느낌 (선택) 예: 실수 위주로, 더 짧고 세게" style={{ flex: 1, minWidth: 180 }} />
        <button
          className="btn small"
          disabled={more}
          onClick={async () => {
            setMore(true);
            const p = await run(() => api.moreTopics(project.id, direction), '새 주제 후보를 받았어요 (맨 위)');
            setMore(false);
            if (p) {
              onChosen(p);
              const s = p.source?.suggestions[0];
              if (s) {
                setPick(0);
                setTopic(s.topic);
                setPrinciple(s.principle);
                setCategory(s.category);
              }
            }
          }}
        >
          {more ? '주제 만드는 중… (10~30초)' : '다른 주제 더 보기'}
        </button>
      </div>
      <div className="muted small" style={{ marginTop: -6 }}>마음에 드는 주제가 없으면 눌러 보세요. Claude가 레시피에서 다른 꼴의 주제 5개를 더 찾아요 (1회 약 $0.03).</div>
      <label className={`suggestion small${pick === 'own' ? ' current' : ''}`} style={{ cursor: 'pointer' }}>
        <div className="row" style={{ gap: 8 }}>
          <input type="radio" name="topic" checked={pick === 'own'} onChange={() => choose('own')} />
          <b>직접 쓰기</b>
        </div>
      </label>
      <label className="field">
        주제 (영상 첫 질문, 한 문장)
        <input type="text" value={topic} onChange={(e) => (setTopic(e.target.value), setPick('own'))} placeholder="예: 김치전은 왜 금방 눅눅해질까?" />
      </label>
      <label className="field">
        핵심 원리 (영상에서 답이 되는 한 문장)
        <textarea rows={2} value={principle} onChange={(e) => (setPrinciple(e.target.value), setPick('own'))} placeholder="예: 찬물로 반죽하면 글루텐이 덜 생겨 바삭해진다" />
      </label>
      <label className="field">
        분류
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)} style={{ width: 'auto' }}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <div className="spacer" />
        <button
          className="btn primary"
          disabled={busy || topic.trim().length < 4 || principle.trim().length < 5}
          onClick={async () => {
            setBusy(true);
            const p = await run(() => api.chooseTopic(project.id, { topic, principle, category }), '주제를 정했어요. 이 주제로 후보 영상을 만들어요');
            setBusy(false);
            if (p) onChosen(p);
          }}
        >
          이 주제로 후보 영상 만들기 →
        </button>
      </div>
    </div>
  );
};
