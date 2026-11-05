import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { ShortVideo, buildTimeline, totalFrames, type VideoProps } from '@mat-lab/video';
import { api, type CandidateVoiceJob, type FormatInsight, type ProjectDetail, type VoicedCandidate } from '../api.ts';
import { useApp } from '../App.tsx';

const COUNT = 5;

/**
 * 후보 영상 5개. 브라우저가 바로 그려서 보여 주고(렌더 비용 0원),
 * 서버는 대사에 맛조수 목소리만 넣는다. 고른 후보 하나만 영상(MP4)으로 만든다.
 */
export const CandidatePicker: React.FC<{ project: ProjectDetail; onMade: (p: ProjectDetail) => Promise<void> | void }> = ({ project, onMade }) => {
  const { run } = useApp();
  const [candidates, setCandidates] = useState<VoicedCandidate[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [insights, setInsights] = useState<FormatInsight[]>([]);
  const [job, setJob] = useState<CandidateVoiceJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [making, setMaking] = useState<string | null>(null);
  const asked = useRef(new Set<string>());

  const load = useCallback(
    async (exclude: string[]) => {
      setLoading(true);
      const r = await run(() => api.candidates(project.id, exclude, COUNT));
      setLoading(false);
      if (!r) return;
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

  // 목소리 넣는 중이면 4초마다 확인하고, 끝나면 목소리가 들어간 미리보기로 다시 불러온다
  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = setTimeout(async () => {
      const next = await api.candidateVoiceStatus(project.id).catch(() => null);
      if (!next) return;
      setJob(next);
      if (next.status !== 'running') {
        const r = await api.candidates(project.id, seen.slice(0, Math.max(0, seen.length - candidates.length)), COUNT).catch(() => null);
        if (r) setCandidates(r.candidates);
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [job, project.id, seen, candidates.length]);

  const current = project.latest?.script;
  const currentKey = current?.style && current.hookType ? `${current.style}:${current.hookType}` : null;
  const allVoiced = candidates.length > 0 && candidates.every((c) => c.voiced);

  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>후보 영상 {candidates.length || COUNT}개</h2>
        <span className="muted small">재생해 보고 마음에 드는 영상을 고르세요. 고른 영상만 완성본으로 만들어요.</span>
      </div>
      {job?.status === 'running' && (
        <div className="issue info">
          맛조수 목소리 넣는 중… {job.done}/{job.total} (처음에는 목소리 엔진이 깨어나느라 1~3분 더 걸려요). 그동안 목소리 없이 먼저 볼 수 있어요.
          <div style={{ height: 6, background: '#dde4f2', borderRadius: 4, marginTop: 6 }}>
            <div style={{ width: `${job.total ? Math.round((job.done / job.total) * 100) : 0}%`, height: 6, background: '#5b7bc4', borderRadius: 4 }} />
          </div>
        </div>
      )}
      {job?.status === 'failed' && <div className="issue warning">목소리를 넣지 못했어요: {job.error} 목소리 없이 고를 수 있고, 고른 영상은 만들 때 다시 목소리를 넣어요.</div>}
      {allVoiced && <div className="muted small">🔊 모든 후보에 목소리가 들어갔어요.</div>}
      {loading && <div className="muted">후보를 만드는 중…</div>}
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
  onMake: () => void;
}> = ({ index, candidate: c, project, chosen, busy, making, insight, onMake }) => {
  const props = useMemo<VideoProps>(() => {
    const timings = c.timings ?? buildTimeline(c.script, c.script.scenes.map(() => null));
    return { script: c.script, timings, reviewed: false, cleanDraft: true, recipe: project.recipe, photoUrl: project.photo?.url, photoColor: project.photo?.color || undefined };
  }, [c.script, c.timings, project.recipe, project.photo?.url, project.photo?.color]);

  return (
    <div className="stack candidate" style={{ border: chosen ? '3px solid #e2533a' : '1px solid #ddd', background: chosen ? '#fff3ef' : '#fff' }}>
      <div className="row" style={{ gap: 6 }}>
        <b style={{ fontSize: 18 }}>후보 {String.fromCharCode(65 + index)}</b>
        <span className="badge">{c.styleLabel}</span>
        {c.voiced ? <span className="badge approved">🔊 목소리</span> : <span className="badge draft">목소리 준비 중</span>}
        {chosen && <span className="badge review">지금 대본</span>}
      </div>
      <div style={{ fontWeight: 800, fontSize: 17 }}>{c.title}</div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
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
          style={{ width: 200, height: 356, borderRadius: 12, overflow: 'hidden', border: '2px solid var(--ink)' }}
        />
      </div>
      <div className="small">
        <b>첫 대사</b> “{c.firstLine}”
      </div>
      <div className="small muted">
        {c.hookLabel} · 약 {c.estimatedSeconds}초
      </div>
      {insight && (
        <div className="small" style={{ background: '#eef6ff', padding: 8, borderRadius: 8 }}>
          지난 게시 {insight.posts}편 기록{insight.enough ? '' : ' (3편 미만이라 참고만)'}: 건너뛰기 {insight.medianSkipRate ?? '-'}% · 평균 시청 {insight.medianAvgWatch ?? '-'}초
        </div>
      )}
      {c.needsReview.map((n) => (
        <div key={n} className="small" style={{ color: '#9a5b00' }}>
          ⚠ {n}
        </div>
      ))}
      <button className="btn primary" disabled={busy} onClick={onMake}>
        {making ? '만드는 중…' : chosen ? '이 영상으로 다시 만들기' : '이 영상으로 만들기'}
      </button>
    </div>
  );
};
