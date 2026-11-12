import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { Character, ShortVideo, buildTimeline, totalFrames, videoSeconds, type VideoProps } from '@mat-lab/video';
import { api, type CandidateVoiceJob, type FormatInsight, type ProjectDetail, type VoicedCandidate } from '../api.ts';
import { useApp } from '../App.tsx';
import { poll } from '../poll.ts';
import { ConnectionNote } from './ConnectionNote.tsx';

const COUNT = 5;

/**
 * 후보 영상 5개. 브라우저가 바로 그려서 보여 주고(렌더 비용 0원),
 * 목소리는 사용자가 [목소리 넣기]를 눌렀을 때만 서버(클라우드 GPU)가 넣는다. 고른 후보 하나만 영상(MP4)으로 만든다.
 */
export const CandidatePicker: React.FC<{
  project: ProjectDetail;
  onMade: (p: ProjectDetail) => Promise<void> | void;
  /** 후보 묶음 전체(바깥 카드). 아래 편집 칸이 높이 변화를 따라가게 할 때 쓴다 */
  boxRef?: React.Ref<HTMLDivElement>;
}> = ({ project, onMade, boxRef }) => {
  const { run } = useApp();
  const [candidates, setCandidates] = useState<VoicedCandidate[]>([]);
  // 지금 보고 있는 후보를 받을 때 뺀 후보들 (앞 페이지들)
  const [page, setPage] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [insights, setInsights] = useState<FormatInsight[]>([]);
  const [job, setJob] = useState<CandidateVoiceJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [voicing, setVoicing] = useState(false);
  const [failures, setFailures] = useState(0);
  const [making, setMaking] = useState<string | null>(null);
  // 3D 미리보기는 한 번에 하나만 (휴대폰에서 5개를 동시에 그리면 메모리가 넘쳐 브라우저가 멈춘다)
  const [playing, setPlaying] = useState<string | null>(null);
  // 늦게 온 응답이 새 목록을 덮지 않게: 마지막 요청 번호만 받아들인다
  const req = useRef(0);

  /** quiet: 목소리가 새로 들어가 같은 후보를 다시 받을 때 (알림·로딩 표시 없이) */
  const load = useCallback(
    async (exclude: string[], quiet = false) => {
      const my = ++req.current;
      if (!quiet) {
        setFailed(false);
        setLoading(true);
      }
      const r = quiet ? await api.candidates(project.id, exclude, COUNT).catch(() => null) : await run(() => api.candidates(project.id, exclude, COUNT));
      if (my !== req.current) return;
      if (!quiet) setLoading(false);
      if (!r) {
        // 뒤에서 조용히 다시 받다가 실패한 것은 알리지 않는다 (보던 후보는 그대로)
        if (!quiet) setFailed(true);
        return;
      }
      setCandidates(r.candidates);
      if (quiet) return;
      setExhausted(r.exhausted);
      setInsights(r.insights);
      setJob(r.voiceJob);
      setPage(exclude);
      setSeen([...exclude, ...r.candidates.map((c) => c.key)]);
    },
    [project.id, run],
  );

  // 레시피는 서버에서 받을 때마다 새 객체라 내용으로 비교한다 (다른 패널을 고쳐도 보던 후보가 처음으로 돌아가지 않게)
  const recipeKey = JSON.stringify(project.recipe);
  useEffect(() => {
    void load([]);
  }, [recipeKey, load]);

  // 목소리 넣는 중이면 5초마다 확인하고, 새로 만들어진 대사가 있으면 미리보기를 다시 불러온다
  // (모든 후보의 첫 대사부터 만들기 때문에, 첫 장면부터 차례로 목소리가 들린다)
  const running = job?.status === 'running';
  const done = useRef(0);
  done.current = job?.done ?? 0;
  useEffect(() => {
    if (!running) return;
    return poll(() => api.candidateVoiceStatus(project.id), 5000, {
      onData: (next) => {
        setJob(next);
        if (!next) return false;
        if (next.done !== done.current || next.status !== 'running') void load(page, true);
        return next.status === 'running';
      },
      onFailures: setFailures,
    });
  }, [running, project.id, page, load]);

  const unvoiced = candidates.filter((c) => !c.voiced).map((c) => c.key);
  const startVoices = async () => {
    setVoicing(true);
    const started = await run(() => api.candidateVoices(project.id, unvoiced));
    setVoicing(false);
    if (started) setJob(started);
  };
  // 이미 영상을 만들고 있으면 다른 후보로 또 만들 수 없다 (렌더 비용이 두 번 나가지 않게)
  const rendering = project.renders.some((r) => r.status === 'queued' || r.status === 'running');

  const current = project.latest?.script;
  const currentKey = current?.style && current.hookType ? `${current.style}:${current.hookType}` : null;
  const allVoiced = candidates.length > 0 && candidates.every((c) => c.voiced);

  return (
    <div className="card stack" ref={boxRef}>
      <div className="card-head">
        <h2>후보 영상 {candidates.length || COUNT}개</h2>
        <span className="muted">재생해 보고 마음에 드는 영상 하나를 고르세요. 고른 영상만 완성본으로 만들어요.</span>
      </div>
      {job?.status === 'running' && (
        <div className="issue info stack" style={{ gap: 8 }}>
          <div>
            <b className="num">맛조수 목소리 넣는 중 {job.done}/{job.total}줄</b>
            <div className="small">첫 대사부터 차례로 들어가요. 처음엔 목소리 엔진이 깨어나느라 2~3분 더 걸리고, 한 줄에 30초~1분쯤 걸려요. 그동안 목소리 없이 먼저 볼 수 있어요.</div>
          </div>
          <div className="progress sky">
            <div style={{ width: `${job.total ? Math.round((job.done / job.total) * 100) : 0}%` }} />
          </div>
          <ConnectionNote failures={failures} />
        </div>
      )}
      {job?.status === 'failed' && <div className="issue warning">목소리를 넣지 못했어요: {job.error} 목소리 없이 고를 수 있고, 고른 영상은 만들 때 다시 목소리를 넣어요.</div>}
      {!running && unvoiced.length > 0 && (
        <div className="row">
          <button className="btn small" disabled={voicing || loading} onClick={startVoices}>
            {voicing ? '시작하는 중…' : `🔊 후보 ${unvoiced.length}개에 맛조수 목소리 넣기`}
          </button>
          <span className="muted small">클라우드 GPU를 써서 사용료가 조금 나가요 (후보 5개 약 $0.2~0.5, 추정). 넣지 않아도 자막으로 먼저 보고 고를 수 있고, 고른 영상은 만들 때 목소리가 들어가요.</span>
        </div>
      )}
      {rendering && <div className="issue info small">영상을 만드는 중이에요. 끝나거나 [영상·블로그]에서 취소한 뒤에 다른 후보로 만들 수 있어요.</div>}
      {allVoiced && <div className="small note-ok">모든 후보에 목소리가 들어갔어요.</div>}
      {loading && <div className="loading">후보를 만드는 중…</div>}
      {failed && !loading && !candidates.length && (
        <div className="issue error stack" style={{ gap: 8 }}>
          후보 영상을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 불러와 주세요.
          <div>
            <button className="btn small" onClick={() => load([])}>다시 불러오기</button>
          </div>
        </div>
      )}
      <div className="candidates-grid">
        {candidates.map((c, i) => (
          <CandidateCard
            key={c.key}
            index={i}
            candidate={c}
            project={project}
            chosen={c.key === currentKey}
            busy={making !== null || rendering}
            making={making === c.key}
            insight={insights.find((x) => x.kind === 'style' && x.key === c.style)}
            live={playing === c.key}
            // 작업 중에 '다른 후보 보기'로 새로 본 후보는 지금 작업에 들어 있지 않다
            voicing={job?.status === 'running' && job.keys.includes(c.key)}
            onPlay={() => setPlaying(c.key)}
            onMake={async () => {
              setMaking(c.key);
              const r = await run(() => api.makeCandidate(project.id, c.style, c.hookType), `"${c.title}"(으)로 영상을 만들기 시작했어요`);
              setMaking(null);
              if (r) await onMade(r.project);
            }}
          />
        ))}
      </div>
      <div className="row">
        <button className="btn" disabled={exhausted || loading} onClick={() => void load(seen)}>
          다른 후보 보기
        </button>
        {exhausted && <span className="muted small">이 레시피로 만들 수 있는 후보를 모두 보여 드렸어요. 레시피에 흔한 실수·오해·음식 이야기를 더 적으면 후보가 늘어나요.</span>}
        <div className="spacer" />
        {seen.length > COUNT && (
          <button className="btn small ghost" onClick={() => void load([])}>
            처음 후보로
          </button>
        )}
      </div>
    </div>
  );
};

const CandidateCard: React.FC<{
  index: number;
  candidate: VoicedCandidate;
  project: ProjectDetail;
  chosen: boolean;
  busy: boolean;
  making: boolean;
  insight?: FormatInsight;
  live: boolean;
  voicing: boolean;
  onPlay: () => void;
  onMake: () => void;
}> = ({ index, candidate: c, project, chosen, busy, making, insight, live, voicing, onPlay, onMake }) => {
  const letter = String.fromCharCode(65 + index);
  const props = useMemo<VideoProps>(() => {
    const timings = c.timings ?? buildTimeline(c.script, c.script.scenes.map(() => null));
    return { script: c.script, timings, reviewed: false, cleanDraft: true, recipe: project.recipe, photoUrl: project.photo?.url, photoColor: project.photo?.color || undefined };
  }, [c.script, c.timings, project.recipe, project.photo?.url, project.photo?.color]);

  return (
    <div className={`option candidate ${chosen ? 'on' : ''}`}>
      <div className="row" style={{ gap: 6 }}>
        <span className="candidate-label">후보 {letter}</span>
        <span className="badge">{c.styleLabel}</span>
        {chosen && <span className="badge review">지금 대본</span>}
      </div>
      <div className="candidate-title">{c.title}</div>
      <div className="candidate-stage">
        {live ? (
        <Player
          component={ShortVideo}
          inputProps={props}
          durationInFrames={Math.max(1, totalFrames(props.timings))}
          compositionWidth={1080}
          compositionHeight={1920}
          fps={30}
          controls
          // 0프레임은 맛조수가 등장하기 전이라, 첫 화면을 대표하는 0.7초 지점을 보여 준다
          initialFrame={Math.min(20, Math.max(0, totalFrames(props.timings) - 1))}
          className="player"
          style={{ width: '100%', maxWidth: 200, aspectRatio: '9 / 16' }}
          autoPlay
        />
        ) : (
          <button className="candidate-cover" onClick={onPlay} aria-label={`후보 ${letter} 재생`}>
            <Character emotion={c.script.scenes[0]?.emotion ?? 'curious'} frame={0} size={150} still />
            <span className="candidate-cover-line">“{c.firstLine}”</span>
            <span className="candidate-cover-play">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2 1l9 5-9 5z" fill="currentColor" /></svg>
              재생
            </span>
          </button>
        )}
      </div>
      <div className="row small muted" style={{ gap: 4, columnGap: 10 }}>
        <span>{c.hookLabel}</span>
        {/* 재생 막대에 나오는 길이와 같은 값 (대사 길이만 세면 실제 영상보다 짧게 나온다) */}
        <span className="num">약 {videoSeconds(props.timings)}초</span>
        <span className={c.voiced ? 'note-ok' : ''}>{c.voiced ? '목소리 들어감' : voicing ? '목소리 넣는 중' : '목소리 없음'}</span>
      </div>
      {insight && (
        <div className="insight">
          지난 게시 {insight.posts}편 기록{insight.enough ? '' : ' (3편 미만이라 참고만)'}: 건너뛰기 {insight.medianSkipRate ?? '-'}% · 평균 시청 {insight.medianAvgWatch ?? '-'}초
        </div>
      )}
      {c.needsReview.map((n) => (
        <div key={n} className="small note-warn">
          확인 필요: {n}
        </div>
      ))}
      <div className="spacer" />
      <button className={`btn block ${chosen ? '' : 'primary'}`} disabled={busy} onClick={onMake} aria-label={`후보 ${letter}: ${making ? '만드는 중' : chosen ? '이 영상으로 다시 만들기' : '이 영상으로 만들기'}`}>
        {making ? '만드는 중…' : chosen ? '이 영상으로 다시 만들기' : '이 영상으로 만들기'}
      </button>
    </div>
  );
};
