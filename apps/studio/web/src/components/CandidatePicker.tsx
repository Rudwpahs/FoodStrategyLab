import React, { useEffect, useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import type { ContentCandidate } from '@mat-lab/recipe-core';
import { ShortVideo, buildTimeline, totalFrames, type VideoProps } from '@mat-lab/video';
import { api, type FormatInsight, type ProjectDetail } from '../api.ts';
import { useApp } from '../App.tsx';

/**
 * 콘텐츠 후보 3가지. 미리보기는 브라우저에서 바로 그린다 (음성 없음, 렌더 비용 0원).
 * 고른 후보 하나만 서버에서 음성·영상으로 만든다.
 */
export const CandidatePicker: React.FC<{ project: ProjectDetail; setProject: (p: ProjectDetail) => void; onPicked: (notes: string[]) => void }> = ({ project, setProject, onPicked }) => {
  const { run } = useApp();
  const [candidates, setCandidates] = useState<ContentCandidate[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [insights, setInsights] = useState<FormatInsight[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (exclude: string[]) => {
    setLoading(true);
    const r = await run(() => api.candidates(project.id, exclude));
    setLoading(false);
    if (!r) return;
    setCandidates(r.candidates);
    setExhausted(r.exhausted);
    setInsights(r.insights);
    setSeen([...exclude, ...r.candidates.map((c) => c.key)]);
  };

  useEffect(() => {
    load([]);
  }, [project.id, project.recipe]);

  const current = project.latest?.script;
  const currentKey = current?.style && current.hookType ? `${current.style}:${current.hookType}` : null;

  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>콘텐츠 후보 3가지</h2>
        <span className="muted small">훅·이야기 흐름·첫 화면이 서로 다른 후보예요. 미리보기는 음성 없이 바로 보여 드려요(비용 0원).</span>
      </div>
      {loading && <div className="muted">후보를 만드는 중…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {candidates.map((c, i) => (
          <CandidateCard
            key={c.key}
            index={i}
            candidate={c}
            project={project}
            chosen={c.key === currentKey}
            insight={insights.find((x) => x.kind === 'style' && x.key === c.style)}
            onPick={async () => {
              const r = await run(() => api.selectCandidate(project.id, c.style, c.hookType), `"${c.title}" 후보로 대본을 만들었어요 (검수 필요)`);
              if (r) {
                setProject(r.project);
                onPicked([...c.needsReview, ...r.notes.filter((n) => !c.needsReview.includes(n))]);
              }
            }}
          />
        ))}
      </div>
      <div className="row">
        <button className="btn" disabled={exhausted || loading} onClick={() => load(seen)}>
          다른 후보 3개 보기
        </button>
        {exhausted && <span className="muted small">이 레시피 자료로 만들 수 있는 후보를 모두 보여 드렸어요. 레시피에 흔한 실수·오해·음식 이야기를 더 적으면 후보가 늘어나요.</span>}
        <div className="spacer" />
        {seen.length > 3 && (
          <button className="btn small ghost" onClick={() => load([])}>
            처음 후보로
          </button>
        )}
      </div>
    </div>
  );
};

const CandidateCard: React.FC<{ index: number; candidate: ContentCandidate; project: ProjectDetail; chosen: boolean; insight?: FormatInsight; onPick: () => void }> = ({
  index,
  candidate: c,
  project,
  chosen,
  insight,
  onPick,
}) => {
  const props = useMemo<VideoProps>(() => {
    const timings = buildTimeline(c.script, c.script.scenes.map(() => null));
    return { script: c.script, timings, reviewed: false, recipe: project.recipe, photoUrl: project.photo?.url, photoColor: project.photo?.color || undefined };
  }, [c.script, project.recipe, project.photo?.url]);

  return (
    <div className="stack" style={{ border: chosen ? '3px solid #e2533a' : '1px solid #ddd', borderRadius: 16, padding: 14, background: chosen ? '#fff3ef' : '#fff' }}>
      <div className="row" style={{ gap: 6 }}>
        <b style={{ fontSize: 18 }}>후보 {String.fromCharCode(65 + index)}</b>
        <span className="badge">{c.styleLabel}</span>
        <span className="badge">{c.hookLabel}</span>
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
      <div className="small">
        <b>첫 화면</b> {c.firstScreen}
      </div>
      <div className="small">
        <b>핵심 장면</b>
        <ol style={{ margin: '4px 0 0 18px', padding: 0 }}>
          {c.keyScenes.map((k) => (
            <li key={k.label}>
              {k.label}: {k.line.length > 34 ? `${k.line.slice(0, 34)}…` : k.line}
              {k.visual ? <span className="muted"> ({k.visual})</span> : null}
            </li>
          ))}
        </ol>
      </div>
      <div className="small muted">약 {c.estimatedSeconds}초 · {c.reason}</div>
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
      <button className="btn primary" onClick={onPick}>
        {chosen ? '이 후보로 다시 만들기' : '이 후보로 만들기'}
      </button>
    </div>
  );
};
