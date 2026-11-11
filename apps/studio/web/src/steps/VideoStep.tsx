import React, { useEffect, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { ShortVideo, totalFrames, type VideoProps } from '@mat-lab/video';
import { api, photoColor, type RenderStatus } from '../api.ts';
import { QaPanel } from '../components/QaPanel.tsx';
import { ConnectionNote } from '../components/ConnectionNote.tsx';
import { Fold } from '../components/Fold.tsx';
import { poll } from '../poll.ts';
import { PHOTO_ACCEPT, heicToJpeg } from '../heic.ts';
import { ClipUploads } from '../components/ClipUploads.tsx';
import { BlogChoice } from '../components/BlogChoice.tsx';
import { useApp } from '../App.tsx';
import type { StepProps } from '../pages/ProjectPage.tsx';

export const VideoStep: React.FC<StepProps> = ({ project, setProject, reload, go }) => {
  const { run, meta } = useApp();
  const [preview, setPreview] = useState<{ props: VideoProps; voiced: boolean } | null>(null);
  const [voicing, setVoicing] = useState(false);
  const latestRender = project.renders[0];
  const [polled, setPolled] = useState<RenderStatus | null>(null);
  const [failures, setFailures] = useState(0);
  const [starting, setStarting] = useState(false);
  // 늦게 온 미리보기 응답이 새 응답을 덮지 않게
  const previewReq = useRef(0);

  const loadPreview = async () => {
    const my = ++previewReq.current;
    const r = await run(() => api.preview(project.id));
    if (r && my === previewReq.current) setPreview({ props: r.props, voiced: r.voiced });
  };

  // 레시피·클립은 서버에서 받을 때마다 새 객체라 내용으로 비교한다
  const recipeKey = JSON.stringify(project.recipe);
  const mediaKey = JSON.stringify(project.sceneMedia);
  useEffect(() => {
    if (project.latest) void loadPreview();
  }, [project.latest?.version, project.status, project.photo?.url, recipeKey, mediaKey]);

  // 제작 작업 상태를 주기적으로 확인 (요청이 실패해도 멈추지 않고 다시 확인)
  useEffect(() => {
    if (!latestRender) return;
    const startStatus = latestRender.status;
    return poll(() => api.render(latestRender.id), 1500, {
      onData: (r) => {
        setPolled(r);
        const active = r.status === 'queued' || r.status === 'running';
        if (!active && startStatus !== r.status) void reload();
        return active;
      },
      onFailures: setFailures,
    }, { immediate: true });
  }, [latestRender?.id]);

  if (!project.latest) return <div className="card empty">먼저 대본을 만드세요.</div>;
  const approved = project.versionState.approvedScriptVersion === project.latest.version;
  // 지금 작업의 최신 상태 (아직 확인 전이면 서버가 준 목록의 상태로 판단)
  const render = polled && polled.id === latestRender?.id ? polled : null;
  const status = render?.status ?? latestRender?.status;
  const busy = status === 'queued' || status === 'running';
  // 목소리 엔진 상태를 아직 모르면(불러오기 실패 포함) '없음'으로 단정하지 않는다
  const ttsOff = meta?.tts.provider === 'none';
  const clips = Object.keys(project.sceneMedia).length;

  return (
    <div className="grid2" style={{ gridTemplateColumns: '400px 1fr' }}>
      <div className="card stack" style={{ alignItems: 'center' }}>
        <h2 style={{ alignSelf: 'flex-start' }}>미리보기</h2>
        {preview ? (
          <Player
            key={JSON.stringify(preview.props.timings.map((t) => t.durationInFrames))}
            component={ShortVideo}
            inputProps={preview.props}
            durationInFrames={totalFrames(preview.props.timings)}
            compositionWidth={1080}
            compositionHeight={1920}
            fps={30}
            controls
            style={{ width: '100%', maxWidth: 340, aspectRatio: '9 / 16', borderRadius: 14, overflow: 'hidden', border: '2px solid var(--ink)' }}
          />
        ) : (
          <div className="empty">불러오는 중…</div>
        )}
        <div className="muted small" style={{ alignSelf: 'stretch' }}>
          {preview?.voiced ? '음성 포함 미리보기' : '음성 없이 예상 길이로 미리보기'} · 약 {preview ? Math.round(totalFrames(preview.props.timings) / 30) : 0}초
        </div>
        <button
          className="btn"
          disabled={ttsOff || voicing}
          onClick={async () => {
            setVoicing(true);
            const r = await run(() => api.voice(project.id), '음성을 만들었습니다');
            setVoicing(false);
            if (r) loadPreview();
          }}
        >
          {voicing ? '음성 만드는 중…' : ttsOff ? '목소리 엔진 연결 안 됨 — [캐릭터·목소리]에서 확인' : `음성 생성${meta ? ` (${meta.tts.voice})` : ''}`}
        </button>
      </div>

      <div className="stack">
        <div className="card stack">
          <h2>완성 사진 (선택)</h2>
          <div className="muted small">실제 완성 요리 사진을 올리면 영상 끝부분에 '완성 사진'으로 나오고, 3D 음식 색도 사진 색에 맞춰집니다.</div>
          <div className="row">
            {project.photo && (
              <>
                <img src={project.photo.url} alt="완성 사진" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 12, border: '2px solid var(--ink)' }} />
                {project.photo.color && <span className="swatch"><i style={{ background: project.photo.color }} />{project.photo.color}</span>}
              </>
            )}
            <label className="btn small">
              {project.photo ? '사진 바꾸기' : '사진 올리기'}
              <input
                type="file"
                accept={PHOTO_ACCEPT}
                hidden
                onChange={async (e) => {
                  const picked = e.target.files?.[0];
                  e.target.value = '';
                  if (!picked) return;
                  const p = await run(async () => {
                    const file = await heicToJpeg(picked);
                    return api.uploadPhoto(project.id, file, await photoColor(file));
                  }, '완성 사진을 올렸습니다');
                  if (p) setProject(p);
                }}
              />
            </label>
            {project.photo && (
              <button className="btn small ghost" onClick={async () => {
                const p = await run(() => api.deletePhoto(project.id), '사진을 지웠습니다');
                if (p) setProject(p);
              }}>삭제</button>
            )}
          </div>
        </div>
        <Fold title={`생성 AI 클립 올리기 (선택${clips ? ` · ${clips}개 사용 중` : ''})`}>
          <ClipUploads project={project} setProject={setProject} />
        </Fold>
        <div className="card stack">
          <h2>영상 만들기</h2>
          {!approved ? (
            <div className="issue info">
              고른 후보로 <b>검수용 영상</b>을 먼저 만들어요. 이희재 연구자가 실제 영상을 보고 승인하면 같은 영상을 그대로 내보낼 수 있어요.
              (영상에는 '검토' 같은 문구가 들어가지 않아요. 내려받기·게시는 승인 후에만 돼요.)
            </div>
          ) : (
            <div className="muted">승인된 대본 v{project.latest.version}으로 세로 영상(1080×1920 MP4), 커버·썸네일, 레시피 카드를 만듭니다.</div>
          )}
          <div className="muted small">클라우드 서버에서 목소리(GPU)와 3D 영상을 만들어요. 10~30분쯤 걸리고, 쓴 만큼 사용료가 나가요 (한 편 약 $0.5~1, 추정). 화면을 닫아도 서버에서 계속 만들어요.</div>
          <div className="row">
            <button
              className="btn primary"
              disabled={busy || starting}
              onClick={async () => {
                setStarting(true);
                const r = await run(() => api.startRender(project.id), approved ? '제작을 시작했습니다' : '검수용 영상 제작을 시작했습니다');
                setStarting(false);
                if (r) await reload();
              }}
            >
              {busy ? '만드는 중… (10~30분)' : approved ? '영상 만들기' : '검수용 영상 만들기'}
            </button>
          </div>
          <ConnectionNote failures={busy ? failures : 0} />
          {render && (
            <div className="stack">
              <div className="row small">
                <b>작업 #{render.id}</b> · 대본 v{render.scriptVersion} · {render.status === 'canceled' ? '취소됨' : render.stage || '대기'}
                {render.status === 'failed' && <span style={{ color: 'var(--err)' }}>실패: {render.error}</span>}
                {busy && (
                  <button
                    className="btn small ghost"
                    onClick={async () => {
                      if (!confirm('영상 만들기를 멈출까요? 다시 만들려면 처음부터 다시 시작해요.')) return;
                      const r = await run(() => api.cancelRender(render.id), '취소했어요');
                      if (r) reload();
                    }}
                  >
                    취소
                  </button>
                )}
              </div>
              {busy && (
                <div className="progress">
                  <div style={{ width: `${Math.round(render.progress * 100)}%` }} />
                </div>
              )}
            </div>
          )}
        </div>

        {render?.status === 'done' && (
          <div className="card stack">
            <div className="row">
              <h2 style={{ margin: 0 }}>완성본 (작업 #{render.id})</h2>
              <div className="spacer" />
              {approved && render.scriptVersion === project.latest.version ? (
                <a className="btn primary" href={`/api/renders/${render.id}/download`}>게시 묶음 ZIP 내려받기</a>
              ) : render.scriptVersion !== project.latest.version ? (
                <span className="badge review">대본이 바뀌었어요 — 다시 만들어 주세요</span>
              ) : (
                <span className="badge review">검수용 · 승인 후 내려받기</span>
              )}
              <button className="btn" onClick={() => go(approved ? 'publish' : 'review')}>{approved ? '게시·기록 →' : '검수·승인으로 →'}</button>
            </div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <video src={`${render.baseUrl}/video.mp4`} controls style={{ width: 240, borderRadius: 12, border: '2px solid var(--ink)' }} />
              <img src={`${render.baseUrl}/cover.png`} alt="커버" style={{ width: 160, borderRadius: 10 }} />
              <img src={`${render.baseUrl}/thumbnail.png`} alt="썸네일" style={{ width: 200, borderRadius: 10 }} />
              <img src={`${render.baseUrl}/recipe-card.png`} alt="레시피 카드" style={{ width: 200, borderRadius: 10 }} />
            </div>
            <QaPanel
              render={render}
              onRemake={async () => {
                const r = await run(() => api.startRender(project.id), '영상을 다시 만들기 시작했어요');
                if (r) reload();
              }}
            />
            {render.captionChecks.length > 0 && (
              <div className="stack">
                <div className="small"><b>자막 확인</b> <span className="muted">자막마다 한 장씩: 얼굴을 가리거나 잘린 자막이 없는지 보세요.</span></div>
                <div className="row" style={{ gap: 6 }}>
                  {render.captionChecks.map((f) => (
                    <a key={f} href={`${render.baseUrl}/caption-check/${f}`} target="_blank" rel="noreferrer">
                      <img src={`${render.baseUrl}/caption-check/${f}`} alt={f} style={{ width: 72, borderRadius: 6, border: '1px solid var(--line)' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="row small">
              {render.files.filter((f) => /\.(mp4|png|jpe?g|webp)$/.test(f)).map((f) => (
                <a key={f} href={`${render.baseUrl}/${f}`} download>{f}</a>
              ))}
            </div>
          </div>
        )}
        <BlogChoice project={project} setProject={setProject} />
      </div>
    </div>
  );
};
