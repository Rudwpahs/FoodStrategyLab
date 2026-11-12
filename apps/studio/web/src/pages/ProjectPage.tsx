import React, { useCallback, useEffect, useState } from 'react';
import { BRAND } from '@mat-lab/recipe-core';
import { api, type ProjectDetail } from '../api.ts';
import { navigate, useApp } from '../App.tsx';
import { RecipeForm } from '../components/RecipeForm.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PublishStep } from '../steps/PublishStep.tsx';
import { ReviewStep } from '../steps/ReviewStep.tsx';
import { ScriptStep } from '../steps/ScriptStep.tsx';
import { VideoStep } from '../steps/VideoStep.tsx';
import { STEPS, defaultStep, doneUntil, type StepKey } from '../steps/progress.ts';

export interface StepProps {
  project: ProjectDetail;
  setProject: (p: ProjectDetail) => void;
  reload: () => Promise<void>;
  go: (step: StepKey) => void;
}

export const ProjectPage: React.FC<{ id: number }> = ({ id }) => {
  const { run } = useApp();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const stepFromHash = () => (location.hash.split('/')[3]?.split('?')[0] as StepKey | undefined) || null;
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState<StepKey | null>(stepFromHash());

  const reload = useCallback(async () => {
    setFailed(false);
    const p = await run(() => api.get(id));
    if (p) setProject(p);
    else setFailed(true);
  }, [id, run]);

  useEffect(() => {
    reload();
    const on = () => setStep(stepFromHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, [reload]);

  if (!project)
    return failed ? (
      <div className="card empty">
        <h2>콘텐츠를 불러오지 못했어요</h2>
        <div>인터넷 연결을 확인하고 다시 불러와 주세요. 지워진 콘텐츠라면 목록으로 돌아가세요.</div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={reload}>다시 불러오기</button>
          <a className="btn" href="#/">콘텐츠 목록</a>
        </div>
      </div>
    ) : (
      <div className="loading">불러오는 중…</div>
    );
  const current = step ?? defaultStep(project);
  const go = (s: StepKey) => navigate(`/p/${id}/${s}`);
  const props: StepProps = { project, setProject, reload, go };

  const done = doneUntil(project);
  const approved = project.status === 'approved' || project.status === 'rendered';
  // 도장에 이희재 이름은 연구자 계정이 승인했을 때만 쓴다 (표시 이름이 같다는 것만으로는 쓰지 않는다)
  const approver = project.approval?.reviewer.trim() ?? '';
  const byResearcher = project.approval?.byResearcher === true;

  return (
    <div>
      <a className="back" href="#/">콘텐츠 목록</a>
      <div className="project-head">
        <div style={{ minWidth: 0 }}>
          {project.dishName && <div className="dish">{project.dishName}</div>}
          <h1>{project.topic}</h1>
          <div className="row small muted" style={{ marginTop: 8, gap: 8 }}>
            <StatusBadge status={project.status} />
            {project.latest && <span className="num">대본 v{project.latest.version}</span>}
          </div>
        </div>
        {approved ? (
          <span className="stamp" role="img" aria-label={approver ? `${approver} 승인` : '승인 완료'}>
            <span aria-hidden="true">
              {byResearcher ? (
                <>
                  {BRAND.researcher}
                  <br />
                  승인
                </>
              ) : (
                <>
                  승인
                  <br />
                  완료
                </>
              )}
            </span>
          </span>
        ) : (
          <span className="stamp pending small" role="img" aria-label="아직 승인 전">
            <span aria-hidden="true">
              승인
              <br />
              전
            </span>
          </span>
        )}
      </div>

      <nav className="steps" aria-label="만드는 단계">
        {STEPS.map((s, i) => {
          const finished = i <= done && current !== s.key;
          return (
            <button key={s.key} className={`${current === s.key ? 'active' : ''} ${finished ? 'done' : ''}`} aria-current={current === s.key ? 'step' : undefined} onClick={() => go(s.key)}>
              <span className="num" aria-hidden>{finished ? '✓' : i + 1}</span>
              <span className="label">{s.label}</span>
              {/* ✓는 화면 읽기에서 빠지므로 끝난 단계라고 따로 읽어 준다 */}
              {finished && <span className="sr-only"> (완료)</span>}
            </button>
          );
        })}
      </nav>

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

      <details className="card" style={{ marginTop: 24 }}>
        <summary>
          작업 내역{' '}
          <span className="muted small">
            {project.eventCount}건{project.eventCount > project.events.length && ` · 최근 ${project.events.length}건만 보여요`}
          </span>
        </summary>
        <div className="log">
          {project.events.map((e, i) => (
            <div key={i} className={e.type === 'error' ? 'err' : undefined}>
              <time>{new Date(e.createdAt).toLocaleString('ko-KR')}</time>
              {e.message}
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <span className="small muted">이 콘텐츠와 모든 버전·검수 기록을 지워요. 되돌릴 수 없어요.</span>
          <div className="spacer" />
          <button
            className="btn small danger"
            onClick={async () => {
              if (!confirm('이 콘텐츠와 모든 버전·검수 기록을 삭제할까요?')) return;
              if ((await run(() => api.remove(id), '삭제했습니다')) !== undefined) navigate('/');
            }}
          >
            콘텐츠 삭제
          </button>
        </div>
      </details>
    </div>
  );
};
