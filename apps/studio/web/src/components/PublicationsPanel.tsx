import React, { useState } from 'react';
import { api, type ProjectDetail, type Publication } from '../api.ts';
import { useApp } from '../App.tsx';
import { InstagramPublish } from './InstagramPublish.tsx';

const PLATFORM_LABEL: Record<Publication['platform'], string> = { instagram: '인스타그램 릴스', naver: '네이버 블로그', youtube: '유튜브 쇼츠' };
const METRICS: [string, string][] = [
  ['reach', '도달 계정'],
  ['skipRate', '건너뛰기 비율(%)'],
  ['avgWatchSeconds', '평균 시청(초)'],
  ['saves', '저장'],
  ['shares', '보내기·공유'],
  ['follows', '팔로우'],
  ['views', '조회수(참고)'],
];

/**
 * 게시와 기록. 승인된 최신 콘텐츠만 기록할 수 있다.
 * 인스타그램은 공식 API로 바로 올리거나(연결했을 때), 앱에서 직접 올리고 주소를 기록한다.
 */
export const PublicationsPanel: React.FC<{ project: ProjectDetail; reload: () => Promise<void> }> = ({ project, reload }) => {
  const { run } = useApp();
  const approved = project.latest !== null && project.versionState.approvedScriptVersion === project.latest.version;
  const render = project.renders.find((r) => r.status === 'done' && r.scriptVersion === project.latest?.version);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [when, setWhen] = useState('');

  const record = async (platform: Publication['platform'], status: 'published' | 'scheduled') => {
    const body = status === 'published' ? { platform, status, url: urls[platform] ?? '' } : { platform, status, scheduledAt: when };
    let r = await run(() => api.addPublication(project.id, body), status === 'published' ? '게시 기록을 남겼어요' : '예약을 기록했어요');
    if (r === undefined && status === 'published' && confirm('이미 게시 기록이 있어요. 그래도 새로 기록할까요?')) {
      r = await run(() => api.addPublication(project.id, { ...body, confirmDuplicate: true }), '게시 기록을 남겼어요');
    }
    if (r) {
      setUrls((u) => ({ ...u, [platform]: '' }));
      await reload();
    }
  };

  const img = (f: string) => (render ? `/media/renders/${render.id}/${f}` : '');

  return (
    <div className="stack">
      {!approved && <div className="issue warning">이희재 연구자의 승인을 받은 최신 콘텐츠만 게시·기록할 수 있어요.</div>}

      <div className="card stack">
        <h2 style={{ margin: 0 }}>인스타그램 릴스</h2>
        <InstagramPublish renderId={render?.id ?? null} approved={approved} onPublished={reload} />
        <div className="muted small">인스타그램 앱에서 직접 올렸다면 게시물 주소를 기록해 주세요.</div>
        <div className="row">
          <input type="url" placeholder="https://www.instagram.com/reel/…" value={urls.instagram ?? ''} onChange={(e) => setUrls({ ...urls, instagram: e.target.value })} style={{ flex: 1 }} disabled={!approved} />
          <button className="btn primary small" disabled={!approved || !urls.instagram} onClick={() => record('instagram', 'published')}>게시 기록</button>
        </div>
        <div className="row small">
          예약 메모
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={!approved} />
          <button className="btn small" disabled={!approved || !when} onClick={() => record('instagram', 'scheduled')}>예약 기록</button>
          <span className="muted">(예약은 메모만 남아요. 실제 게시는 그 시각에 직접 눌러 주세요)</span>
        </div>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>네이버 블로그 (반자동)</h2>
        <ol className="small" style={{ margin: 0 }}>
          <li>왼쪽 원고에서 <b>본문 복사</b> → 아래 버튼으로 글쓰기 창 열기 → 붙여넣기</li>
          <li>사진을 내려받아 글 속 [사진 첨부] 자리에 올리기</li>
          <li>발행한 뒤 글 주소를 기록하기</li>
        </ol>
        <div className="row">
          <a className="btn small" href="https://blog.naver.com/GoBlogWrite.naver" target="_blank" rel="noreferrer">네이버 글쓰기 창 열기</a>
          {render ? (
            ['cover.png', 'thumbnail.png', 'recipe-card.png'].map((f) => (
              <a key={f} className="btn small ghost" href={img(f)} download>
                {f === 'cover.png' ? '커버' : f === 'thumbnail.png' ? '썸네일' : '레시피 카드'} 내려받기
              </a>
            ))
          ) : (
            <span className="muted small">영상을 만들면 사진(커버·썸네일·레시피 카드)을 내려받을 수 있어요.</span>
          )}
          {project.photo && <a className="btn small ghost" href={project.photo.url} download>완성 사진 내려받기</a>}
        </div>
        <div className="row">
          <input type="url" placeholder="https://blog.naver.com/아이디/글번호" value={urls.naver ?? ''} onChange={(e) => setUrls({ ...urls, naver: e.target.value })} style={{ flex: 1 }} disabled={!approved} />
          <button className="btn primary small" disabled={!approved || !urls.naver} onClick={() => record('naver', 'published')}>발행 기록</button>
        </div>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>유튜브 쇼츠</h2>
        <div className="row">
          <input type="url" placeholder="https://www.youtube.com/shorts/…" value={urls.youtube ?? ''} onChange={(e) => setUrls({ ...urls, youtube: e.target.value })} style={{ flex: 1 }} disabled={!approved} />
          <button className="btn primary small" disabled={!approved || !urls.youtube} onClick={() => record('youtube', 'published')}>게시 기록</button>
        </div>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>게시 이력과 성과</h2>
        <div className="muted small">게시 하루 이틀 뒤 인스타그램·유튜브 인사이트 숫자를 옮겨 적어 주세요. 같은 연출을 3편 이상 모으면 [후보 고르기]에 방향이 보여요. 조회수는 참고만 해요.</div>
        {project.publications.length === 0 && <div className="muted">아직 기록이 없어요.</div>}
        {project.publications.map((p) => (
          <PublicationRow key={p.id} pub={p} onSaved={reload} />
        ))}
      </div>
    </div>
  );
};

const PublicationRow: React.FC<{ pub: Publication; onSaved: () => Promise<void> }> = ({ pub, onSaved }) => {
  const { run } = useApp();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(Object.entries(pub.metrics).map(([k, v]) => [k, String(v)])));
  return (
    <div className="stack" style={{ border: '1px solid #ddd', borderRadius: 12, padding: 10 }}>
      <div className="row small">
        <b>{PLATFORM_LABEL[pub.platform]}</b>
        <span className="badge">{pub.status === 'published' ? '게시됨' : `예약 ${new Date(pub.scheduledAt).toLocaleString('ko-KR')}`}</span>
        <span>대본 v{pub.scriptVersion}</span>
        {pub.url && (
          <a href={pub.url} target="_blank" rel="noreferrer">
            {pub.url}
          </a>
        )}
      </div>
      {pub.status === 'published' && pub.platform !== 'naver' && (
        <div className="row small" style={{ flexWrap: 'wrap', gap: 6 }}>
          {METRICS.map(([k, label]) => (
            <label key={k} className="field" style={{ width: 120 }}>
              {label}
              <input type="number" min={0} value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            </label>
          ))}
          <button
            className="btn small"
            onClick={async () => {
              const r = await run(() => api.setMetrics(pub.id, vals), '성과를 저장했어요');
              if (r) await onSaved();
            }}
          >
            성과 저장
          </button>
        </div>
      )}
    </div>
  );
};
