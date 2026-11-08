import React from 'react';
import type { RenderRow } from '../api.ts';

/**
 * 완성 영상 자동 품질 검사 결과: 대사 잘림, 목소리 없는 장면, 긴 무음, 검은 화면, 받아쓰기 대조.
 * 자동으로 고친 것도 함께 보여 준다.
 */
export const QaPanel: React.FC<{ render: RenderRow | undefined; onRemake?: () => void }> = ({ render, onRemake }) => {
  if (!render || render.status !== 'done') return null;
  const qa = render.qa;
  if (!qa) return <div className="muted small">이 영상은 자동 품질 검사 전에 만든 영상이에요. 다시 만들면 대사 잘림·무음을 자동으로 검사해요.</div>;
  const errors = qa.issues.filter((i) => i.level === 'error');
  const warnings = qa.issues.filter((i) => i.level === 'warning');
  return (
    <div className="stack ig-checks">
      <b className="small">
        자동 품질 검사 {errors.length ? `— 고쳐야 할 문제 ${errors.length}건` : warnings.length ? `— 확인할 점 ${warnings.length}건` : '— 통과'}
      </b>
      {qa.fixed.map((f, i) => (
        <div key={`f${i}`} className="small ig-check ok">
          🔧 {f}
        </div>
      ))}
      {errors.map((e, i) => (
        <div key={`e${i}`} className="small ig-check error">
          ✕ {e.message}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div key={`w${i}`} className="small ig-check warn">
          ! {w.message}
        </div>
      ))}
      {!errors.length && (
        <div className="small ig-check ok">✓ 검사한 것: {qa.checked.join(' · ')}</div>
      )}
      {errors.length > 0 && onRemake && (
        <div>
          <button className="btn small" onClick={onRemake}>
            영상 다시 만들기
          </button>
        </div>
      )}
    </div>
  );
};
