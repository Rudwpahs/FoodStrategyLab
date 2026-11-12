import React, { useEffect, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { ShortVideo, totalFrames, videoSeconds, type VideoProps } from '@mat-lab/video';
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
  const [previewFailed, setPreviewFailed] = useState(false);
  const [voicing, setVoicing] = useState(false);
  const latestRender = project.renders[0];
  const [polled, setPolled] = useState<RenderStatus | null>(null);
  const [failures, setFailures] = useState(0);
  const [starting, setStarting] = useState(false);
  // 늦게 온 미리보기 응답이 새 응답을 덮지 않게
  const previewReq = useRef(0);

  const loadPreview = async () => {
    setPreviewFailed(false);
    // 늦게 온 옛 응답은 버린다 (연달아 누르거나 대본이 바뀐 뒤)
    const my = ++previewReq.current;
    const r = await run(() => api.preview(project.id));
    if (my !== previewReq.current) return;
    if (r) setPreview({ props: r.props, voiced: r.voiced });
    else setPreviewFailed(true);
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

  if (!project.latest)
    return (
      <div className="card empty">
        <div>아직 고른 영상이 없어요. [영상 고르기]에서 후보 하나를 고르세요.</div>
        <button className="btn primary" onClick={() => go('script')}>영상 고르기로</button>
      </div>
    );
  const approved = project.versionState.approvedScriptVersion === project.latest.version;
  // 지금 작업의 최신 상태 (아직 확인 전이면 서버가 준 목록의 상태로 판단)
  const render = polled && polled.id === latestRender?.id ? polled : null;
  const status = render?.status ?? latestRender?.status;
  const busy = status === 'queued' || status === 'running';
  // 목소리 엔진 상태를 아직 모르면(불러오기 실패 포함) '없음'으로 단정하지 않는다
  const ttsOn = meta?.tts.provider === 'edge' || meta?.tts.provider === 'voicestudio';
  const clips = Object.keys(project.sceneMedia).length;

  return (
    <div className="split">
      <div className="card stack sticky">
        <div className="card-head">
          <h2>미리보기</h2>
          {preview && (
            <span className="muted num">
              {preview.voiced ? '목소리 포함' : '목소리 없이'} · 약 {videoSeconds(preview.props.timings)}초
            </span>
          )}
        </div>
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
            className="phone-frame"
            style={{ width: '100%', aspectRatio: '9 / 16' }}
          />
        ) : previewFailed ? (
          <div className="issue error stack" style={{ gap: 8 }}>
            미리보기를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 불러와 주세요.
            <div>
              <button className="btn small" onClick={loadPreview}>다시 불러오기</button>
            </div>
          </div>
        ) : (
          <div className="phone-frame loading" role="status">
            <span className="sr-only">미리보기를 불러오는 중…</span>
          </div>
        )}
        {ttsOn ? (
          <button
            className="btn block"
            disabled={voicing}
            onClick={async () => {
              setVoicing(true);
              const r = await run(() => api.voice(project.id), '맛조수 목소리를 넣었어요');
              setVoicing(false);
              if (r) loadPreview();
            }}
          >
            {voicing ? '목소리 넣는 중…' : `맛조수 목소리 넣기 (${meta?.tts.voice})`}
          </button>
        ) : (
          meta && <div className="small muted">지금은 목소리 엔진이 꺼져 있어 목소리 없이 미리 봐요. 엔진이 켜지면 여기서 목소리를 넣을 수 있어요.</div>
        )}
      </div>

      <div className="stack">
        <div className="card stack">
          <div className="card-head">
            <h2>완성 사진</h2>
            <span className="muted">선택</span>
          </div>
          <div className="muted small">실제 완성 요리 사진을 올리면 영상 끝부분에 '완성 사진'으로 나오고, 3D 음식 색도 사진 색에 맞춰집니다.</div>
          <div className="row">
            {project.photo && (
              <>
                <img src={project.photo.url} alt="완성 사진" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--line)' }} />
                {project.photo.color && <span className="swatch"><i style={{ background: project.photo.color }} />{project.photo.color}</span>}
              </>
            )}
            <label className="btn small">
              {project.photo ? '사진 바꾸기' : '사진 올리기'}
              <input
                type="file"
                accept={PHOTO_ACCEPT}
                className="sr-only"
                aria-label={project.photo ? '완성 사진 바꾸기' : '완성 사진 올리기'}
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
          <h2>{approved ? '영상 만들기' : '검수용 영상 만들기'}</h2>
          {!approved ? (
            <div className="issue info">
              고른 후보로 검수용 영상을 먼저 만들어요. 이희재 연구자가 영상을 보고 승인하면 같은 영상을 그대로 내보낼 수 있어요.
              영상에 '검토' 같은 문구는 들어가지 않고, 내려받기·게시는 승인 후에만 돼요.
            </div>
          ) : (
            <div className="muted">승인된 대본 v{project.latest.version}으로 세로 영상(1080×1920 MP4), 커버·썸네일, 레시피 카드를 만듭니다.</div>
          )}
          <div className="muted small">클라우드 서버에서 목소리(GPU)와 3D 영상을 만들어요. 10~30분쯤 걸리고, 쓴 만큼 사용료가 나가요 (한 편 약 $0.5~1, 추정). 화면을 닫아도 서버에서 계속 만들어요.</div>
          <div className="row">
            <button
              className="btn primary big"
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
                <b className="num">작업 #{render.id}</b>
                <span className="muted num">대본 v{render.scriptVersion}</span>
                <span>{render.status === 'canceled' ? '취소됨' : render.stage || '대기 중'}</span>
                {busy && <span className="num muted">{Math.round(render.progress * 100)}%</span>}
                {render.status === 'failed' && <span className="note-err">실패: {render.error}</span>}
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
                <div className="progress" role="progressbar" aria-label="영상 만드는 진행률" aria-valuenow={Math.round(render.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${Math.round(render.progress * 100)}%` }} />
                </div>
              )}
            </div>
          )}
        </div>

        {render?.status === 'done' && (
          <div className="card stack">
            <div className="row">
              <h2 style={{ margin: 0 }}>완성본</h2>
              <span className="muted small num">작업 #{render.id}</span>
              <div className="spacer" />
              {approved && render.scriptVersion === project.latest.version ? (
                <a className="btn primary" href={`/api/renders/${render.id}/download`}>게시 묶음 ZIP 내려받기</a>
              ) : render.scriptVersion !== project.latest.version ? (
                <span className="badge review">대본이 바뀌었어요. 다시 만들어 주세요</span>
              ) : (
                <span className="badge review">검수용 · 승인 후 내려받기</span>
              )}
              <button className="btn" onClick={() => go(approved ? 'publish' : 'review')}>{approved ? '게시·기록으로' : '검수·승인으로'}</button>
            </div>
            <div className="media-row">
              <video src={`${render.baseUrl}/video.mp4`} controls style={{ width: 220, background: 'var(--soy)' }} />
              <img src={`${render.baseUrl}/cover.png`} alt="커버" style={{ width: 150 }} />
              <img src={`${render.baseUrl}/thumbnail.png`} alt="썸네일" style={{ width: 190 }} />
              <img src={`${render.baseUrl}/recipe-card.png`} alt="레시피 카드" style={{ width: 190 }} />
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
                <div className="media-row" style={{ gap: 6 }}>
                  {render.captionChecks.map((f) => (
                    <a key={f} href={`${render.baseUrl}/caption-check/${f}`} target="_blank" rel="noreferrer">
                      <img src={`${render.baseUrl}/caption-check/${f}`} alt={f} style={{ width: 72, display: 'block', borderRadius: 6 }} />
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
