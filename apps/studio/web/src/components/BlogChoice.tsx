import React, { useEffect, useState } from 'react';
import type { BlogStyle } from '@mat-lab/publishing';
import { api, type ProjectDetail } from '../api.ts';
import { useApp } from '../App.tsx';

type Compare = Awaited<ReturnType<typeof api.blogCompare>>;

/** 같은 원본 레시피로 만든 블로그 문체 후보 2개를 나란히 보고 고른다 */
export const BlogChoice: React.FC<{ project: ProjectDetail; setProject: (p: ProjectDetail) => void }> = ({ project, setProject }) => {
  const { run } = useApp();
  const [data, setData] = useState<Compare | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setFailed(false);
    run(() => api.blogCompare(project.id)).then((r) => (r ? setData(r) : setFailed(true)));
  }, [project.id, project.updatedAt, tick]);

  if (!data)
    return failed ? (
      <div className="card stack">
        <h2>블로그 원고 고르기</h2>
        <div className="issue error">원고 후보를 불러오지 못했어요.</div>
        <div><button className="btn small" onClick={() => setTick((t) => t + 1)}>다시 불러오기</button></div>
      </div>
    ) : (
      <div className="card loading">블로그 원고 후보를 만드는 중…</div>
    );
  const choose = async (style: BlogStyle) => {
    const p = await run(() => api.setBlogStyle(project.id, style), '블로그 문체를 골랐어요');
    if (p) setProject(p);
  };

  return (
    <div className="card stack">
      <div className="card-head">
        <h2>블로그 원고 고르기</h2>
        <span className="muted">재료·분량·순서는 같은 원본이고, 글의 흐름이 달라요. 경험 이야기는 연구자 답변만 들어가요.</span>
      </div>
      <div className="grid2">
        {data.options.map((o) => {
          const on = project.blogStyle === o.style;
          const errors = o.lint.filter((l) => l.level === 'error').length;
          return (
            <div key={o.style} className={`option ${on ? 'on' : ''}`}>
              <div className="row">
                <span className="option-title">{o.info.label}</span>
                {on && <span className="badge review">선택됨</span>}
              </div>
              <div className="small muted">{o.info.summary} · 읽는 사람: {o.info.reader}</div>
              <div className="small"><b>제목</b> {o.post.title}</div>
              <div className={`small ${o.pending.length ? 'note-warn' : 'note-ok'}`}>
                {o.pending.length ? `연구자 답변 대기 ${o.pending.length}개: ${o.pending.map((q) => q.question).join(' / ')}` : '필수 답변이 모두 있어요'}
              </div>
              {errors > 0 && <div className="small note-err">문체 점검 오류 {errors}건</div>}
              <div className="blog-preview compact" dangerouslySetInnerHTML={{ __html: o.post.html }} />
              <div className="spacer" />
              <button className={`btn ${on ? '' : 'primary'}`} disabled={on} onClick={() => choose(o.style)}>
                {on ? '이 원고로 진행' : '이 원고 고르기'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="muted small">원고를 고른 뒤 [게시·기록]의 '이희재 연구자에게 묻기'에서 답을 적어요. 답이 들어가면 두 원고 모두 바로 바뀌어요.</div>
    </div>
  );
};
