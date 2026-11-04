import React, { useCallback, useEffect, useState } from 'react';
import { api, type InstagramJob, type InstagramStatus } from '../api.ts';
import { useApp } from '../App.tsx';

const STEP: Record<InstagramJob['status'], string> = {
  uploading: '영상 보내는 중',
  processing: '인스타그램이 처리하는 중',
  publishing: '게시하는 중',
  published: '게시 완료',
  failed: '실패',
};

/**
 * 인스타그램 공식 게시 (Instagram API with Instagram Login).
 * - 승인된 최신 대본의 영상만, '올리기'를 누르고 한 번 더 확인해야 실제로 올라간다.
 * - 연결·설정이 안 됐으면 무엇을 해야 하는지 알려 준다.
 */
export const InstagramPublish: React.FC<{ renderId: number | null; approved: boolean; onPublished: () => Promise<void> }> = ({ renderId, approved, onPublished }) => {
  const { run, notify } = useApp();
  const [st, setSt] = useState<InstagramStatus | null>(null);
  const [caption, setCaption] = useState('');
  const [job, setJob] = useState<InstagramJob | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.instagram().then(setSt).catch(() => setSt(null)), []);
  useEffect(() => {
    void load();
  }, [load]);

  // 승인된 영상이 있으면 설명 글 초안과 진행 중인 작업을 불러온다
  useEffect(() => {
    if (!renderId || !approved || !st?.connected) return;
    api
      .instagramDraft(renderId)
      .then((d) => {
        setCaption((c) => c || d.caption);
        if (d.job) setJob(d.job);
      })
      .catch(() => undefined);
  }, [renderId, approved, st?.connected]);

  // 게시 작업 진행 상황 (3초마다)
  useEffect(() => {
    if (!job || job.status === 'published' || job.status === 'failed') return;
    const t = setTimeout(async () => {
      const next = await api.instagramJob(job.id).catch(() => null);
      if (!next) return;
      setJob(next);
      if (next.status === 'published') {
        notify('인스타그램에 올렸어요');
        await onPublished();
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [job, notify, onPublished]);

  if (!st) return null;

  if (!st.configured) {
    return (
      <div className="issue info">
        공식 자동 게시: <b>설정 전</b> — Meta 개발자 앱 정보를 서버에 넣으면 여기서 바로 올릴 수 있어요 (안내: <code>docs/INSTAGRAM_SETUP.md</code>). 그 전에는 인스타그램 앱에서 올린 뒤 아래에 주소를 기록해 주세요.
      </div>
    );
  }

  if (!st.connected) {
    return (
      <div className="stack">
        {st.problem && <div className="issue warning">{st.problem}</div>}
        <div className="row">
          <button
            className="btn primary small"
            onClick={async () => {
              const r = await run(() => api.instagramConnect());
              if (r) window.location.href = r.url;
            }}
          >
            인스타그램 계정 연결
          </button>
          <button className="btn small ghost" onClick={() => load()}>
            연결 확인
          </button>
        </div>
        <div className="muted small">
          인스타그램 로그인 화면이 열려요. 어머니 계정(프로페셔널 계정)으로 로그인하고 <b>콘텐츠 게시</b>를 허용한 뒤, 연결 완료 화면이 나오면 이 화면으로 돌아와 <b>연결 확인</b>을 누르세요.
        </div>
      </div>
    );
  }

  const running = job && job.status !== 'published' && job.status !== 'failed';
  const publish = async (confirmDuplicate = false) => {
    if (!renderId) return;
    if (!confirmDuplicate && !confirm(`@${st.username} 계정에 이 영상을 실제로 게시합니다.\n올린 뒤에는 인스타그램 앱에서만 지울 수 있어요. 올릴까요?`)) return;
    setBusy(true);
    try {
      setJob(await api.instagramPublish(renderId, caption, confirmDuplicate));
    } catch (e) {
      const msg = (e as Error).message;
      if (!confirmDuplicate && msg.includes('이미 인스타그램에 올렸어요') && confirm(`${msg}\n\n그래도 한 번 더 올릴까요?`)) {
        setBusy(false);
        return publish(true);
      }
      notify(msg, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="row small">
        <span className="badge">@{st.username} 연결됨</span>
        <span className="muted">연결 기간: {new Date(st.expiresAt).toLocaleDateString('ko-KR')}까지 (쓰는 동안 자동 연장)</span>
        <button
          className="btn small ghost"
          onClick={async () => {
            if (!confirm('인스타그램 연결을 끊을까요?')) return;
            await run(() => api.instagramDisconnect(), '연결을 끊었어요');
            await load();
          }}
        >
          연결 끊기
        </button>
      </div>
      {!approved || !renderId ? (
        <div className="muted small">승인된 최신 대본으로 영상을 만들면 여기서 바로 올릴 수 있어요.</div>
      ) : (
        <>
          <label className="field">
            설명 글 ({caption.length}/2200자)
            <textarea rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={Boolean(running)} />
          </label>
          <div className="row">
            <button className="btn primary" disabled={busy || Boolean(running) || !caption.trim()} onClick={() => publish()}>
              인스타그램에 올리기
            </button>
            {job && (
              <span className={`badge${job.status === 'failed' ? ' error' : ''}`}>
                {STEP[job.status]}
                {running ? '…' : ''}
              </span>
            )}
          </div>
          {job?.status === 'failed' && <div className="issue error">{job.message}</div>}
          {job?.status === 'published' && job.permalink && (
            <a href={job.permalink} target="_blank" rel="noreferrer">
              올린 릴스 보기
            </a>
          )}
          {running && <div className="muted small">{job.message}. 화면을 닫아도 서버에서 계속 진행돼요.</div>}
        </>
      )}
    </div>
  );
};
