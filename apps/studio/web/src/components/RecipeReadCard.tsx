import React from 'react';
import { CATEGORY_LABELS, formatIngredient } from '@mat-lab/recipe-core';
import type { ProjectDetail } from '../api.ts';

const FIELD_LABELS: Record<string, string> = {
  topic: '주제(질문)',
  principle: '핵심 조리 원리',
  commonMistake: '흔한 실수',
  category: '분류',
};

/**
 * 사진·파일에서 읽은 레시피. 재료·분량·순서는 적힌 그대로 옮긴 것이고,
 * 자료에 없던 칸(주제·원리·흔한 실수)은 AI 제안이라 연구자가 확인해야 한다.
 */
export const RecipeReadCard: React.FC<{ project: ProjectDetail; onEdit: () => void }> = ({ project, onEdit }) => {
  const src = project.source;
  if (!src) return null;
  const r = project.recipe;
  const value = (f: string) => (f === 'category' ? CATEGORY_LABELS[r.category] : String((r as Record<string, unknown>)[f] ?? ''));

  return (
    <details className="card" open={src.problems.length > 0}>
      <summary style={{ cursor: 'pointer' }}>
        <b>올린 자료에서 읽은 레시피</b>{' '}
        <span className="muted small">
          재료 {r.ingredients.length}개 · 순서 {r.steps.length}단계{src.problems.length ? ` · 확인할 곳 ${src.problems.length}개` : ''} (눌러서 보기)
        </span>
      </summary>
      <div className="stack" style={{ marginTop: 12 }}>
        {src.files.length > 0 && (
          <div className="source-thumbs">
            {src.files.map((f) =>
              f.type.startsWith('image/') ? (
                <a key={f.file} href={f.url} target="_blank" rel="noreferrer">
                  <img src={f.url} alt={f.name} />
                </a>
              ) : (
                <a key={f.file} className="btn small ghost" href={f.url} target="_blank" rel="noreferrer">
                  📄 {f.name}
                </a>
              ),
            )}
          </div>
        )}
        {src.problems.map((p) => (
          <div key={p} className="issue warning small">
            {p}
          </div>
        ))}
        <div className="small">
          <b>{r.dishName || r.topic}</b> — 재료·분량·순서는 자료에 적힌 그대로 옮겼어요. 사진과 다른 곳이 있으면 고쳐 주세요.
        </div>
        <div className="small">
          <b>재료</b> {r.ingredients.map(formatIngredient).join(' · ') || '없음'}
        </div>
        <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
          {r.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {r.tips.length > 0 && (
          <div className="small">
            <b>팁</b> {r.tips.join(' / ')}
          </div>
        )}
        {src.aiFields.map((f) => (
          <div key={f} className="ai-field small">
            <span className="badge review">AI 제안 · 확인 필요</span> <b>{FIELD_LABELS[f] ?? f}</b>: {value(f)}
          </div>
        ))}
        <div>
          <button className="btn small" onClick={onEdit}>
            레시피 고치기
          </button>
        </div>
      </div>
    </details>
  );
};
