import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { AUDIENCE_INFO, PLACE_LABELS } from '@mat-lab/recipe-core';
import { Character, ShortVideo, buildTimeline, totalFrames, videoSeconds, type VideoProps } from '@mat-lab/video';
import { api, musicUrl, type ProjectDetail, type StoriesResponse, type StoryItem } from '../api.ts';
import { useApp } from '../App.tsx';

type Story = Extract<StoryItem, { script: unknown }>;

/**
 * AI 이야기 대본: Claude가 이 레시피로 이야기가 서로 다른 대본 3개를 쓴다 (버튼을 눌렀을 때만, 사용료가 나감).
 * 재료·순서 카드는 서버가 원본으로 고정하고, 원본에 없는 분량을 말하는 대본은 만들 수 없게 막는다.
 */
export const StoryPicker: React.FC<{ project: ProjectDetail; onMade: (p: ProjectDetail) => Promise<void> | void }> = ({ project, onMade }) => {
  const { run } = useApp();
  const [data, setData] = useState<StoriesResponse | null>(null);
  const [writing, setWriting] = useState(false);
  const [making, setMaking] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);

  const recipeKey = JSON.stringify(project.recipe);
  const load = useCallback(async () => {
    const r = await api.stories(project.id).catch(() => null);
    if (r) setData(r);
  }, [project.id]);
  useEffect(() => {
    void load();
  }, [load, recipeKey]);

  if (!data) return null;
  const rendering = project.renders.some((r) => r.status === 'queued' || r.status === 'running');
  const stories = data.stories;
  const write = async () => {
    setWriting(true);
    const r = await run(() => api.writeStories(project.id), '새 이야기 대본이 왔어요');
    setWriting(false);
    if (!r) return;
    setData({ ...data, stories: r.stories, writing: false });
    setFresh(r.added);
  };
  const busyWriting = writing || data.writing;

  return (
    <div className="card stack">
      <div className="card-head">
        <h2>AI 이야기 대본</h2>
        <span className="muted">
          Claude가 이 레시피로 이야기가 서로 다른 대본 3개를 써요 (추리·구출·선물·내기…). 재료·분량·순서는 원본 그대로 지키고, 원본에 없는 숫자를 말하는 대본은 만들 수 없게 막아요.
        </span>
      </div>
      {!data.available ? (
        <div className="issue info small">서버에 Claude API가 설정되면 쓸 수 있어요. 지금은 아래 후보 영상에서 골라 주세요.</div>
      ) : (
        <div className="row">
          <button className={`btn ${stories.length ? '' : 'primary'}`} disabled={busyWriting} onClick={write}>
            {busyWriting ? '이야기 쓰는 중… (30초~1분)' : stories.length ? '✍️ 새 이야기 3개 더 쓰기' : '✍️ 이야기 대본 3개 쓰기'}
          </button>
          <span className="muted small">한 번에 약 $0.1~0.3 (추정, 월 한도 안에서)</span>
        </div>
      )}
      {stories.length > 0 && (
        <div className="candidates-grid">
          {stories.map((s) =>
            'error' in s ? null : (
              <StoryCard
                key={s.id}
                story={s}
                project={project}
                isNew={fresh.includes(s.id)}
                chosen={data.currentTitle === s.script.title && project.latest?.source === 'ai-story'}
                live={playing === s.id}
                busy={making !== null || rendering}
                making={making === s.id}
                onPlay={() => setPlaying(s.id)}
                onMake={async () => {
                  setMaking(s.id);
                  const r = await run(() => api.makeStory(project.id, s.id), `"${s.script.title}"(으)로 영상을 만들기 시작했어요`);
                  setMaking(null);
                  if (r) await onMade(r.project);
                }}
              />
            ),
          )}
        </div>
      )}
      {rendering && stories.length > 0 && <div className="issue info small">영상을 만드는 중이에요. 끝나거나 취소한 뒤에 다른 이야기로 만들 수 있어요.</div>}
    </div>
  );
};

const StoryCard: React.FC<{
  story: Story;
  project: ProjectDetail;
  isNew: boolean;
  chosen: boolean;
  live: boolean;
  busy: boolean;
  making: boolean;
  onPlay: () => void;
  onMake: () => void;
}> = ({ story: s, project, isNew, chosen, live, busy, making, onPlay, onMake }) => {
  const props = useMemo<VideoProps>(() => {
    const timings = buildTimeline(s.script, s.script.scenes.map(() => null));
    return { script: s.script, timings, reviewed: false, cleanDraft: true, musicSrc: musicUrl(s.script), recipe: project.recipe, photoUrl: project.photo?.url, photoColor: project.photo?.color || undefined };
  }, [s.script, project.recipe, project.photo?.url, project.photo?.color]);
  const places = [...new Set(s.script.scenes.map((sc) => sc.place).filter((p): p is NonNullable<typeof p> => Boolean(p)))];
  const errors = s.issues.filter((i) => i.level === 'error');

  return (
    <div className={`option story-card ${chosen ? 'on' : ''}`}>
      <div className="row" style={{ gap: 6 }}>
        <span className="badge">{s.label}</span>
        {s.audience && <span className="badge">{AUDIENCE_INFO[s.audience].short}</span>}
        {isNew && <span className="badge review">새로 씀</span>}
        {chosen && <span className="badge review">지금 대본</span>}
      </div>
      <div className="candidate-title">{s.script.title}</div>
      <div className="small muted">{s.logline}</div>
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
            initialFrame={Math.min(20, Math.max(0, totalFrames(props.timings) - 1))}
            className="player"
            style={{ width: '100%', maxWidth: 200, aspectRatio: '9 / 16' }}
            autoPlay
          />
        ) : (
          <button className="candidate-cover" onClick={onPlay} aria-label={`${s.script.title} 재생`}>
            <Character emotion={s.script.scenes[0]?.emotion ?? 'curious'} frame={0} size={150} still />
            <span className="candidate-cover-line">“{s.script.scenes[0]?.line}”</span>
            <span className="candidate-cover-play">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M2 1l9 5-9 5z" fill="currentColor" />
              </svg>
              재생
            </span>
          </button>
        )}
      </div>
      <div className="row small muted" style={{ gap: 4, columnGap: 10 }}>
        <span className="num">약 {videoSeconds(props.timings)}초</span>
        <span>{places.map((p) => PLACE_LABELS[p]).join(' → ')}</span>
      </div>
      <details className="plain">
        <summary className="small">대사 전체 보기</summary>
        <ol className="small story-lines">
          {s.script.scenes.map((sc) => (
            <li key={sc.id}>{sc.line}</li>
          ))}
        </ol>
      </details>
      {errors.map((e) => (
        <div key={e.message} className="small note-warn">
          만들 수 없음: {e.message}
        </div>
      ))}
      {s.warnings.map((w) => (
        <div key={w} className="small note-warn">
          확인 필요: {w}
        </div>
      ))}
      <div className="spacer" />
      <button
        className={`btn block ${chosen ? '' : 'primary'}`}
        disabled={busy || s.blocked}
        onClick={onMake}
        aria-label={`${s.script.title}: ${making ? '만드는 중' : '이 이야기로 만들기'}`}
      >
        {making ? '만드는 중…' : s.blocked ? '원본과 달라 만들 수 없어요' : chosen ? '이 이야기로 다시 만들기' : '이 이야기로 만들기'}
      </button>
    </div>
  );
};
