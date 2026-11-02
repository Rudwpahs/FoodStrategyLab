import React, { useEffect, useState } from 'react';
import { CATEGORY_LABELS, FORMAT_LABELS } from '@mat-lab/recipe-core';
import { api, type ProjectSummary } from '../api.ts';
import { useApp } from '../App.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';

export const ProjectList: React.FC = () => {
  const { run } = useApp();
  const [items, setItems] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    run(api.list).then((r) => setItems(r ?? []));
  }, [run]);

  return (
    <div className="stack">
      <div className="row">
        <div>
          <h1>콘텐츠 목록</h1>
          <div className="muted">레시피 입력 → 대본 → 이희재 연구자 검수 → 영상·블로그 제작 → 내보내기</div>
        </div>
        <div className="spacer" />
        <a className="btn primary" href="#/new">+ 새 콘텐츠</a>
      </div>
      {items === null ? (
        <div className="empty">불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className="card empty">
          아직 콘텐츠가 없습니다. <a href="#/new">새 콘텐츠</a>를 만들거나, 터미널에서 <code>npm run seed</code>로 파일럿 샘플 3개를 넣어 보세요.
        </div>
      ) : (
        <div className="list">
          {items.map((p) => (
            <a key={p.id} className="list-item" href={`#/p/${p.id}`}>
              <span className="muted small">#{p.id}</span>
              <div style={{ flex: 1 }}>
                <div className="title">{p.topic}</div>
                <div className="muted small">
                  {p.dishName && `${p.dishName} · `}
                  {CATEGORY_LABELS[p.category]} · {FORMAT_LABELS[p.format]}
                  {p.latestVersion !== null && ` · 대본 v${p.latestVersion}`} · {new Date(p.updatedAt).toLocaleString('ko-KR')}
                </div>
              </div>
              <StatusBadge status={p.status} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
