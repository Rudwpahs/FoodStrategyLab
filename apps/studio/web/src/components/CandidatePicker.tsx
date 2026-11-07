import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { Character, ShortVideo, buildTimeline, totalFrames, videoSeconds, type VideoProps } from '@mat-lab/video';
import { api, type CandidateVoiceJob, type FormatInsight, type ProjectDetail, type VoicedCandidate } from '../api.ts';
import { useApp } from '../App.tsx';

const COUNT = 5;

/**
 * 후보 영상 5개. 브라우저가 바로 그려서 보여 주고(렌더 비용 0원),
 * 서버는 대사에 맛조수 목소리만 넣는다. 고른 후보 하나만 영상(MP4)으로 만든다.
 */
export const CandidatePicker: React.FC<{
  project: ProjectDetail;
  onMade: (p: ProjectDetail) => Promise<void> | void;
  /** 후보 묶음 전체(바깥 카드). 아래 편집 칸이 높이 변화를 따라가게 할 때 쓴다 */
  boxRef?: React.Ref<HTMLDivElement>;
}> = ({ project, onMade, boxRef }) => {
  const { run } = useApp();
  const [candidates, setCandidates] = useState<VoicedCandidate[]>([]);
  const [failed, setFailed] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [insights, setInsights] = useState<FormatInsight[]>([]);
  const [job, setJob] = useState<CandidateVoiceJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [making, setMaking] = useState<string | null>(null);
  // 3D 미리보기는 한 번에 하나만 (휴대폰에서 5개를 동시에 그리면 메모리가 넘쳐 브라우저가 멈춘다)
  const [playing, setPlaying] = useState<string | null>(null);
  const asked = useRef(new Set<string>());

  const load = useCallback(
    async (exclude: string[]) => {
      setFailed(false);
      setLoading(true);
      const r = await run(() => api.candidates(project.id, exclude, COUNT));
      setLoading(false);
      if (!r) {
        setFailed(true);
        return;
      }
      setCandidates(r.candidates);
      setExhausted(r.exhausted);
      setInsights(r.insights);
      setJob(r.voiceJob);
      setSeen([...exclude, ...r.candidates.map((c) => c.key)]);
      // 목소리가 아직 없는 후보가 있으면 자동으로 목소리를 넣는다 (한 번만)
      const need = r.candidates.filter((c) => !c.voiced).map((c) => c.key);
      const fresh = need.filter((k) => !asked.current.has(k));
      if (fresh.length && r.voiceJob?.status !== 'running') {
        need.forEach((k) => asked.current.add(k));
        const started = await api.candidateVoices(project.id, need).catch(() => null);
        if (started) setJob(started);
      }
    },
    [project.id, run],
  );

  useEffect(() => {
    void load([]);
  }, [project.id, project.recipe, load]);

  // 목소리 넣는 중이면 5초마다 확인하고, 새로 만들어진 대사가 있으면 미리보기를 다시 불러온다
  // (모든 후보의 첫 대사부터 만들기 때문에, 첫 장면부터 차례로 목소리가 들린다)
  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = setTimeout(async () => {
      const next = await api.candidateVoiceStatus(project.id).catch(() => null);
      if (!next) return;
      if (next.done !== job.done || next.status !== 'running') {
        const r = await api.candidates(project.id, seen.slice(0, Math.max(0, seen.length - candidates.length)), COUNT).catch(() => null);
        if (r) setCandidates(r.candidates);
      }
      setJob(next);
    }, 5000);
    return () => clearTimeout(t);
  }, [job, project.id, seen, candidates.length]);

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
        </div>
      )}
      {job?.status === 'failed' && <div className="issue warning">목소리를 넣지 못했어요: {job.error} 목소리 없이 고를 수 있고, 고른 영상은 만들 때 다시 목소리를 넣어요.</div>}
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
            busy={making !== null}
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
        <button className="btn" disabled={exhausted || loading} onClick={() => load(seen)}>
          다른 후보 보기
        </button>
        {exhausted && <span className="muted small">이 레시피로 만들 수 있는 후보를 모두 보여 드렸어요. 레시피에 흔한 실수·오해·음식 이야기를 더 적으면 후보가 늘어나요.</span>}
        <div className="spacer" />
        {seen.length > COUNT && (
          <button className="btn small ghost" onClick={() => load([])}>
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
