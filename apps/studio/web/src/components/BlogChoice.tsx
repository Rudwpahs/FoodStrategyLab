import React, { useEffect, useState } from 'react';
import type { BlogStyle } from '@mat-lab/publishing';
import { api, type ProjectDetail } from '../api.ts';
import { useApp } from '../App.tsx';

type Compare = Awaited<ReturnType<typeof api.blogCompare>>;

/** 같은 원본 레시피로 만든 블로그 문체 후보 2개를 나란히 보고 고른다 */
export const BlogChoice: React.FC<{ project: ProjectDetail; setProject: (p: ProjectDetail) => void }> = ({ project, setProject }) => {
  const { run } = useApp();
  const [data, setData] = useState<Compare | null>(null);

  useEffect(() => {
    run(() => api.blogCompare(project.id)).then((r) => r && setData(r));
  }, [project.id, project.updatedAt]);

  if (!data) return <div className="card muted">블로그 후보를 만드는 중…</div>;
  const choose = async (style: BlogStyle) => {
    const p = await run(() => api.setBlogStyle(project.id, style), '블로그 문체를 골랐어요');
    if (p) setProject(p);
  };

  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>블로그 원고 후보 2가지</h2>
        <span className="muted small">재료·분량·순서는 같은 원본이고, 글의 흐름이 달라요. 경험 이야기는 연구자 답변만 들어가요.</span>
      </div>
      <div className="grid2">
        {data.options.map((o) => {
          const on = project.blogStyle === o.style;
          const errors = o.lint.filter((l) => l.level === 'error').length;
          return (
            <div key={o.style} className="stack" style={{ border: on ? '3px solid #e2533a' : '1px solid #ddd', borderRadius: 14, padding: 12, background: on ? '#fff3ef' : '#fff' }}>
              <div className="row">
                <b>{o.info.label}</b>
                {on && <span className="badge review">선택됨</span>}
              </div>
              <div className="small muted">{o.info.summary} · 읽는 사람: {o.info.reader}</div>
              <div className="small"><b>제목</b> {o.post.title}</div>
              <div className="small" style={{ color: o.pending.length ? '#9a5b00' : '#2f7d55' }}>
                {o.pending.length ? `연구자 답변 대기 ${o.pending.length}개: ${o.pending.map((q) => q.question).join(' / ')}` : '✓ 필수 답변이 모두 있어요'}
              </div>
              {errors > 0 && <div className="small" style={{ color: 'var(--err)' }}>문체 점검 오류 {errors}건</div>}
              <div className="blog-preview" style={{ maxHeight: 280, overflow: 'auto', fontSize: 13 }} dangerouslySetInnerHTML={{ __html: o.post.html }} />
              <button className={`btn ${on ? '' : 'primary'}`} disabled={on} onClick={() => choose(o.style)}>
                {on ? '이 원고로 진행' : '이 원고 고르기'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="muted small">답변은 [게시·기록]의 "이희재 연구자에게 묻기"에서 입력해요. 답이 들어가면 두 원고 모두 바로 바뀌어요.</div>
    </div>
  );
};
