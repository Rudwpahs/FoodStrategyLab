import React, { useCallback, useEffect, useState } from 'react';
import { CATEGORY_LABELS, FORMAT_LABELS, type ProjectStatus } from '@mat-lab/recipe-core';
import { api, type ProjectSummary } from '../api.ts';
import { useApp } from '../App.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';

/** 연구자가 지금 손대야 하는 것부터 보여 준다 */
const GROUPS: { title: string; statuses: ProjectStatus[] }[] = [
  { title: '검수를 기다려요', statuses: ['review'] },
  { title: '만드는 중', statuses: ['draft'] },
  { title: '승인·완성', statuses: ['approved', 'rendered'] },
];

/** 달력 날짜로 센다 (어제 밤 11시는 '오늘'이 아니라 '어제') */
const when = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000);
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  if (days <= 0) return `오늘 ${time}`;
  if (days === 1) return `어제 ${time}`;
  if (days < 7) return `${days}일 전`;
  return d.toLocaleDateString('ko-KR', d.getFullYear() === now.getFullYear() ? { month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric' });
};

export const ProjectList: React.FC = () => {
  const { run } = useApp();
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    run(api.list).then((r) => (r ? setItems(r) : setFailed(true)));
  }, [run]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>콘텐츠</h1>
          <ol className="flow" aria-label="만드는 순서">
            <li>레시피</li>
            <li>영상 고르기</li>
            <li>영상·블로그</li>
            <li>검수·승인</li>
            <li>게시·기록</li>
          </ol>
        </div>
        <div className="spacer" />
        <a className="btn primary hide-mobile" href="#/new">새 콘텐츠 만들기</a>
      </div>

      {failed && !items ? (
        <div className="card empty">
          <h2>목록을 불러오지 못했어요</h2>
          <div>인터넷 연결을 확인하고 다시 불러와 주세요. 만든 콘텐츠는 서버에 그대로 있어요.</div>
          <button className="btn primary" onClick={load}>다시 불러오기</button>
        </div>
      ) : items === null ? (
        <div className="loading">목록을 불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className="card empty">
          <h2>첫 콘텐츠를 만들어 보세요</h2>
          <div>레시피 사진 한 장이면 맛조수가 진행하는 후보 영상 5개가 나와요.</div>
          <a className="btn primary big" href="#/new">레시피 사진 올리기</a>
        </div>
      ) : (
        GROUPS.map((g) => {
          const list = items.filter((p) => g.statuses.includes(p.status));
          if (!list.length) return null;
          return (
            <section className="group" key={g.title} aria-label={g.title}>
              <h2 className="group-title">
                {g.title} <span className="count">{list.length}</span>
              </h2>
              <div className="list">
                {list.map((p) => (
                  <a key={p.id} className={`list-item ${p.status}`} href={`#/p/${p.id}`}>
                    <div style={{ minWidth: 0 }}>
                      <div className="title">{p.topic}</div>
                      <div className="meta">
                        {p.dishName && <span>{p.dishName}</span>}
                        <span>{CATEGORY_LABELS[p.category]}</span>
                        <span>{FORMAT_LABELS[p.format]}</span>
                        {p.latestVersion !== null && <span className="num">대본 v{p.latestVersion}</span>}
                      </div>
                    </div>
                    <div className="side">
                      {p.status === 'approved' || p.status === 'rendered' ? (
                        <span className="stamp small">승인</span>
                      ) : (
                        <StatusBadge status={p.status} />
                      )}
                      <span className="small muted num">{when(p.updatedAt)}</span>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
};
