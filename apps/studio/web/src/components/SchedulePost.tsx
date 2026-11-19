import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { POST_STATUS, autoApi, whenKst, type AutoPost } from '../autoApi.ts';
import { useApp } from '../App.tsx';

/** datetime-local 기본값: 내일 같은 시각 (분은 00) */
function tomorrowLocal(): string {
  const d = new Date(Date.now() + 86400_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

/**
 * 예약 게시: 날짜·시간을 고르면 그 시각에 서버가 인스타그램에 올린다 (자동 게시를 켰을 때만).
 * 예약은 지금 승인된 대본 버전에 묶인다. 그 뒤 대본이 바뀌면 올리지 않는다 (원칙 2).
 */
export const SchedulePost: React.FC<{ projectId: number; renderId: number | null; approved: boolean }> = ({ projectId, renderId, approved }) => {
  const { run } = useApp();
  const [when, setWhen] = useState(tomorrowLocal);
  const [posts, setPosts] = useState<AutoPost[]>([]);
  const [autoOn, setAutoOn] = useState<boolean | null>(null);
  const [caption, setCaption] = useState('');
  const [editCaption, setEditCaption] = useState(false);

  const load = () =>
    autoApi.projectPosts(projectId).then(
      (r) => {
        setPosts(r.posts);
        setAutoOn(r.settings.autoPost);
      },
      () => undefined,
    );
  useEffect(() => {
    void load();
  }, [projectId]);
  useEffect(() => {
    if (!editCaption || !renderId || !approved || caption) return;
    api.instagramDraft(renderId).then((d) => setCaption(d.caption), () => undefined);
  }, [editCaption, renderId, approved]);

  const upcoming = posts.filter((p) => p.status === 'scheduled' || p.status === 'posting');
  const lastDone = posts.find((p) => p.status !== 'scheduled' && p.status !== 'posting' && p.status !== 'canceled');

  return (
    <div className="stack schedule-post" style={{ gap: 8 }}>
      <b className="small">예약 게시</b>
      {!approved || !renderId ? (
        <div className="muted small">승인된 최신 대본으로 영상을 만들면 날짜·시간을 골라 예약할 수 있어요.</div>
      ) : (
        <>
          <div className="row small">
            <input type="datetime-local" aria-label="예약 게시 날짜와 시간" value={when} onChange={(e) => setWhen(e.target.value)} />
            <button
              className="btn small primary"
              disabled={!when}
              onClick={async () => {
                const at = new Date(when);
                if (Number.isNaN(at.getTime())) return;
                const r = await run(() => autoApi.schedule(projectId, at.toISOString(), editCaption ? caption : undefined), `${whenKst(at.toISOString())}에 올리도록 예약했어요`);
                if (r) void load();
              }}
            >
              예약 게시
            </button>
          </div>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={editCaption} onChange={(e) => setEditCaption(e.target.checked)} /> 설명 글 직접 고치기 (끄면 올릴 때 승인된 대본으로 만든 글을 써요)
          </label>
          {editCaption && (
            <label className="field small">
              설명 글 ({caption.length}/2200자)
              <textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>
          )}
        </>
      )}
      {upcoming.map((p) => (
        <div key={p.id} className="row small panel">
          <span className="badge review">{POST_STATUS[p.status]}</span>
          <b>{whenKst(p.at)}</b>
          {p.scriptVersion !== null && <span className="muted">대본 v{p.scriptVersion}</span>}
          {p.reason && <span className="muted">{p.reason}</span>}
          {p.status === 'scheduled' && (
            <button
              className="btn small ghost"
              onClick={async () => {
                if (await run(() => autoApi.cancel(p.id), '예약을 취소했어요')) void load();
              }}
            >
              취소
            </button>
          )}
        </div>
      ))}
      {lastDone && (
        <div className={`small ${lastDone.status === 'failed' ? 'issue error' : 'muted'}`}>
          지난 예약 {whenKst(lastDone.at)}: {POST_STATUS[lastDone.status]}
          {lastDone.reason ? ` — ${lastDone.reason}` : ''}
        </div>
      )}
      {autoOn === false && (upcoming.length > 0 || (approved && renderId)) && (
        <div className="issue warning small">
          자동 게시가 꺼져 있어 예약해도 올라가지 않아요. <a href="#/auto">자동 게시 설정</a>에서 켜 주세요.
        </div>
      )}
      {autoOn && <div className="muted small">자동 게시 켜짐 · 예약과 기록은 <a href="#/auto">자동 게시 화면</a>에서 모두 볼 수 있어요.</div>}
    </div>
  );
};
