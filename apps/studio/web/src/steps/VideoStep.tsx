import React, { useEffect, useState } from 'react';
import { Player } from '@remotion/player';
import { ShortVideo, totalFrames, type VideoProps } from '@mat-lab/video';
import { api, photoColor, type RenderStatus } from '../api.ts';
import { ClipUploads } from '../components/ClipUploads.tsx';
import { BlogChoice } from '../components/BlogChoice.tsx';
import { useApp } from '../App.tsx';
import type { StepProps } from '../pages/ProjectPage.tsx';

export const VideoStep: React.FC<StepProps> = ({ project, setProject, reload, go }) => {
  const { run, meta } = useApp();
  const [preview, setPreview] = useState<{ props: VideoProps; voiced: boolean } | null>(null);
  const [voicing, setVoicing] = useState(false);
  const latestRender = project.renders[0];
  const [render, setRender] = useState<RenderStatus | null>(null);

  const loadPreview = () => run(() => api.preview(project.id)).then((r) => r && setPreview({ props: r.props, voiced: r.voiced }));

  useEffect(() => {
    if (project.latest) loadPreview();
  }, [project.latest?.version, project.status, project.photo?.url, project.recipe, project.sceneMedia]);

  // 진행 중인 제작 작업 상태를 주기적으로 확인
  useEffect(() => {
    if (!latestRender) return;
    let stop = false;
    const tick = async () => {
      const r = await api.render(latestRender.id).catch(() => null);
      if (stop || !r) return;
      setRender(r);
      if (r.status === 'queued' || r.status === 'running') setTimeout(tick, 1500);
      else if (latestRender.status !== r.status) reload();
    };
    tick();
    return () => {
      stop = true;
    };
  }, [latestRender?.id]);

  if (!project.latest) return <div className="card empty">먼저 대본을 만드세요.</div>;
  const approved = project.versionState.approvedScriptVersion === project.latest.version;
  const busy = render?.status === 'queued' || render?.status === 'running';
  const ttsOn = meta?.tts.provider === 'edge' || meta?.tts.provider === 'voicestudio';

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
            style={{ width: 340, height: 604, borderRadius: 14, overflow: 'hidden', border: '2px solid var(--ink)' }}
          />
        ) : (
          <div className="empty">불러오는 중…</div>
        )}
        <div className="muted small" style={{ alignSelf: 'stretch' }}>
          {preview?.voiced ? '음성 포함 미리보기' : '음성 없이 예상 길이로 미리보기'} · 약 {preview ? Math.round(totalFrames(preview.props.timings) / 30) : 0}초
        </div>
        <button
          className="btn"
          disabled={!ttsOn || voicing}
          title={ttsOn ? '' : 'VoiceStudio 앱을 켜거나 pip install edge-tts 후 서버를 다시 시작하세요'}
          onClick={async () => {
            setVoicing(true);
            const r = await run(() => api.voice(project.id), '음성을 만들었습니다');
            setVoicing(false);
            if (r) loadPreview();
          }}
        >
          {voicing ? '음성 만드는 중…' : ttsOn ? `음성 생성 (${meta?.tts.voice})` : '음성 없음 — [캐릭터·목소리]에서 VoiceStudio 연결'}
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
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const p = await run(async () => api.uploadPhoto(project.id, file, await photoColor(file)), '완성 사진을 올렸습니다');
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
        <ClipUploads project={project} setProject={setProject} />
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
          <div className="muted small">내 PC에서 음성과 3D 영상을 만들어요. 그래픽카드가 없으면 20~30분 걸릴 수 있어요. 비용은 들지 않아요.</div>
          <div className="row">
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                const r = await run(() => api.startRender(project.id), approved ? '제작을 시작했습니다' : '검수용 영상 제작을 시작했습니다');
                if (r) reload();
              }}
            >
              {busy ? '만드는 중… (20분~1시간)' : approved ? '영상 만들기' : '검수용 영상 만들기'}
            </button>
          </div>
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
