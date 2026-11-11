import React, { useCallback, useEffect, useState } from 'react';
import { api, type ProjectDetail } from '../api.ts';
import { navigate, useApp } from '../App.tsx';
import { RecipeForm } from '../components/RecipeForm.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PublishStep } from '../steps/PublishStep.tsx';
import { ReviewStep } from '../steps/ReviewStep.tsx';
import { ScriptStep } from '../steps/ScriptStep.tsx';
import { VideoStep } from '../steps/VideoStep.tsx';

const STEPS = [
  { key: 'input', label: '레시피' },
  { key: 'script', label: '주제·영상 고르기' },
  { key: 'video', label: '영상·블로그' },
  { key: 'review', label: '검수·승인' },
  { key: 'publish', label: '게시·기록' },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

/** 최신 대본으로 만든 영상(검수용 포함)이 있는지 */
const hasLatestRender = (p: ProjectDetail) => p.renders.some((r) => r.status === 'done' && r.scriptVersion === p.latest?.version);

function defaultStep(p: ProjectDetail): StepKey {
  if (p.status === 'draft') return 'script';
  if (p.status === 'review') return hasLatestRender(p) ? 'review' : 'video';
  return 'publish';
}

export interface StepProps {
  project: ProjectDetail;
  setProject: (p: ProjectDetail) => void;
  reload: () => Promise<void>;
  go: (step: StepKey) => void;
}

export const ProjectPage: React.FC<{ id: number }> = ({ id }) => {
  const { run } = useApp();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const stepFromHash = () => (location.hash.split('/')[3] as StepKey | undefined) ?? null;
  const [step, setStep] = useState<StepKey | null>(stepFromHash());

  const reload = useCallback(async () => {
    const p = await run(() => api.get(id));
    if (p) setProject(p);
  }, [id, run]);

  useEffect(() => {
    reload();
    const on = () => setStep(stepFromHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, [reload]);

  if (!project) return <div className="empty">불러오는 중…</div>;
  const current = step ?? defaultStep(project);
  const go = (s: StepKey) => navigate(`/p/${id}/${s}`);
  const props: StepProps = { project, setProject, reload, go };

  // 끝난 단계까지 표시: 입력(0) → 후보(1) → 영상·블로그(2) → 승인(3) → 게시(4)
  const published = project.publications.some((x) => x.status === 'published' && x.scriptVersion === project.latest?.version);
  const doneUntil = project.status === 'draft' ? 0 : project.status === 'review' ? (hasLatestRender(project) ? 2 : 1) : published ? 4 : 3;

  return (
    <div>
      <div className="row">
        <div>
          <div className="muted small">#{project.id} · {project.dishName}</div>
          <h1>{project.topic}</h1>
        </div>
        <StatusBadge status={project.status} />
        <div className="spacer" />
        <button
          className="btn small ghost"
          onClick={async () => {
            if (!confirm('이 콘텐츠와 모든 버전·검수 기록을 삭제할까요?')) return;
            if ((await run(() => api.remove(id), '삭제했습니다')) !== undefined) navigate('/');
          }}
        >
          삭제
        </button>
      </div>

      <div className="steps">
        {STEPS.map((s, i) => (
          <button key={s.key} className={`${current === s.key ? 'active' : ''} ${i <= doneUntil ? 'done' : ''}`} onClick={() => go(s.key)}>
            <span className="num">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </div>

      {current === 'input' && (
        <RecipeForm
          key={project.updatedAt}
          initial={project.recipe}
          submitLabel="원본 저장"
          onSubmit={async (recipe) => {
            if (project.status === 'approved' || project.status === 'rendered') {
              if (!confirm('승인된 대본이 있습니다. 원본을 고치면 다시 검수를 받아야 합니다. 계속할까요?')) return;
            }
            const p = await run(() => api.updateRecipe(id, recipe), '원본을 저장했습니다');
            if (p) setProject(p);
          }}
        />
      )}
      {current === 'script' && <ScriptStep {...props} />}
      {current === 'review' && <ReviewStep {...props} />}
      {current === 'video' && <VideoStep {...props} />}
      {current === 'publish' && <PublishStep {...props} />}

      <div className="card" style={{ marginTop: 28 }}>
        <h3>작업 내역</h3>
        <div className="log">
          {project.events.map((e, i) => (
            <div key={i} style={e.type === 'error' ? { color: 'var(--err)' } : undefined}>
              <time>{new Date(e.createdAt).toLocaleString('ko-KR')}</time>
              {e.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
