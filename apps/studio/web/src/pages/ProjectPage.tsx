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

const STEPS = [
  { key: 'input', label: '레시피' },
  { key: 'script', label: '영상 고르기' },
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

  // 끝난 단계까지 표시: 입력(0) → 후보(1) → 영상·블로그(2) → 승인(3) → 게시(4)
  const doneUntil = project.status === 'draft' ? 0 : project.status === 'review' ? (hasLatestRender(project) ? 2 : 1) : 3;
  const approved = project.status === 'approved' || project.status === 'rendered';
  // 도장에는 실제로 승인한 사람만 쓴다 (다른 계정이 승인했거나 이름이 없으면 이희재 이름을 쓰지 않는다)
  const approver = project.approval?.reviewer.trim() ?? '';
  const byResearcher = approver === BRAND.researcher;

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
          const done = i <= doneUntil && current !== s.key;
          return (
            <button key={s.key} className={`${current === s.key ? 'active' : ''} ${done ? 'done' : ''}`} aria-current={current === s.key ? 'step' : undefined} onClick={() => go(s.key)}>
              <span className="num" aria-hidden>{done ? '✓' : i + 1}</span>
              <span className="label">{s.label}</span>
              {/* ✓는 화면 읽기에서 빠지므로 끝난 단계라고 따로 읽어 준다 */}
              {done && <span className="sr-only"> (완료)</span>}
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
