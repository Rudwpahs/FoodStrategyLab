import React, { useEffect, useState } from 'react';
import { BRAND, CHECKLIST_ITEMS, formatIngredient, type Issue } from '@mat-lab/recipe-core';
import { BLOG_STYLE_INFO, type BlogStyle } from '@mat-lab/publishing';
import { buildTimeline, videoSeconds, type SceneTiming } from '@mat-lab/video';
import { api, renderFile } from '../api.ts';
import { RecipeReadCard } from '../components/RecipeReadCard.tsx';
import { HumanizePanel } from '../components/HumanizePanel.tsx';
import { QaPanel } from '../components/QaPanel.tsx';
import { navigate, useApp } from '../App.tsx';
import type { StepProps } from '../pages/ProjectPage.tsx';

const LEVEL_LABEL = { error: '오류', warning: '확인 필요', info: '참고' } as const;

export const ReviewStep: React.FC<StepProps> = ({ project, setProject, go, reload }) => {
  const { run, user, notify, researcherSet, checkAuth } = useApp();
  const latest = project.latest;
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [reviewer, setReviewer] = useState<string>(user?.displayName ?? BRAND.researcher);
  const [note, setNote] = useState('');
  // 대사별 AI 티 (im-not-ai 규칙 검사, 0원)
  const [tells, setTells] = useState<Record<string, string[]>>({});
  const [checkFailed, setCheckFailed] = useState(false);
  // '다시 검사하기'를 누를 때마다 1씩 늘려 원본 대조 검사를 다시 한다
  const [checkTry, setCheckTry] = useState(0);
  // 레시피는 서버에서 받을 때마다 새 객체라 내용으로 비교한다
  const recipeKey = JSON.stringify(project.recipe);

  // 대본·원본이 바뀌면 확인 항목을 처음부터 (다시 검사만 할 때는 체크한 항목을 그대로 둔다)
  useEffect(() => {
    setChecklist({});
  }, [latest?.version, recipeKey]);

  useEffect(() => {
    if (!latest) return;
    let alive = true;
    api
      .aiTells(project.id)
      .then((r) => alive && setTells(Object.fromEntries(r.scenes.map((s) => [s.id, s.tells.map((t) => `[${t.rule}] ${t.found}`)]))))
      .catch(() => alive && setTells({}));
    return () => {
      alive = false;
    };
  }, [latest?.version, recipeKey]);

  useEffect(() => {
    if (!latest) return;
    let live = true;
    setIssues(null);
    setCheckFailed(false);
    run(() => api.check(project.id)).then((r) => {
      if (!live) return;
      if (!r) {
        setCheckFailed(true);
        return;
      }
      setIssues(r.issues);
    });
    return () => {
      live = false;
    };
  }, [latest?.version, recipeKey, checkTry]);

  // 이 대본 버전의 영상 길이: 목소리가 있으면 실제 목소리 길이로 (후보 카드·미리보기·완성 영상과 같은 값)
  const [saved, setSaved] = useState<{ version: number; timings: SceneTiming[] } | null>(null);
  useEffect(() => {
    if (!latest) return;
    let live = true;
    api.preview(project.id).then(
      (r) => {
        if (live) setSaved({ version: r.version, timings: r.props.timings });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [project.id, latest?.version]);

  if (!latest)
    return (
      <div className="card empty">
        <div>아직 고른 영상이 없어요. [영상 고르기]에서 후보 하나를 고르세요.</div>
        <button className="btn primary" onClick={() => go('script')}>영상 고르기로</button>
      </div>
    );

  const approved = project.versionState.approvedScriptVersion === latest.version;
  const errors = issues?.filter((i) => i.level === 'error').length ?? 0;
  const sceneIndex = new Map(latest.script.scenes.map((s, i) => [s.id, i + 1]));
  const r = project.recipe;
  const render = project.renders.find((x) => x.status === 'done' && x.scriptVersion === latest.version);
  const hasRender = Boolean(render);
  // 사진에서 읽은 레시피의 AI 제안 칸은 확인해야 승인할 수 있다
  const aiPending = Boolean(project.source?.aiFields.length && !project.source.aiConfirmedAt);
  // 도장에는 실제로 승인한 사람만 쓴다 (다른 계정이 승인했거나 이름이 없으면 이희재 이름을 쓰지 않는다)
  const approver = project.approval?.reviewer.trim() ?? '';
  // 연구자 이름은 연구자 계정이 승인했을 때만 (표시 이름이 같다는 것만으로는 쓰지 않는다)
  const byResearcher = project.approval?.byResearcher === true;
  // 서버 길이를 받기 전에는 글자 수로 어림한다 (계산 방식은 미리보기·완성 영상과 같다)
  const seconds = videoSeconds(saved?.version === latest.version ? saved.timings : buildTimeline(latest.script, latest.script.scenes.map(() => null)));

  const submit = async (decision: 'approved' | 'changes_requested') => {
    // 영상 자동 검사에서 오류가 나온 영상은 한 번 더 확인하고 승인한다
    const qaErrors = render?.qa?.issues.filter((i) => i.level === 'error') ?? [];
    if (decision === 'approved' && qaErrors.length && !confirm(`영상 자동 검사에서 문제 ${qaErrors.length}건이 나왔어요.\n\n${qaErrors.map((e) => `· ${e.message}`).join('\n')}\n\n직접 보고 들어서 괜찮다면 승인할까요? (영상을 다시 만드는 편을 권해요)`)) return;
    const p = await run(
      () => api.review(project.id, { version: latest.version, reviewer, checklist, decision, note, acceptQa: qaErrors.length > 0 }),
      decision === 'approved' ? '승인했습니다. 이제 내보내고 게시할 수 있습니다' : '수정 요청을 기록했습니다',
    );
    if (p) {
      setProject(p);
      setNote('');
      if (p.warning) notify(p.warning, true);
      if (decision === 'approved') go(hasRender ? 'publish' : 'video');
    }
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h2 style={{ margin: 0 }}>결과물 보기</h2>
        <QaPanel render={render} onRemake={() => go('video')} />
        {user && !researcherSet && (
          <div className="issue warning">
            연구자 계정이 아직 정해지지 않아 누구나 승인할 수 있어요. 이희재 연구자 본인 계정이면 아래를 눌러 정해 주세요. 정한 뒤에는 이 계정만 승인할 수 있어요 (한 번만 정할 수 있어요).
            <div>
              <button
                className="btn small"
                onClick={async () => {
                  if (!confirm(`'${user.displayName}' 계정을 연구자 계정으로 정할까요? 정한 뒤에는 이 계정만 승인할 수 있어요.`)) return;
                  if (await run(() => api.claimResearcher(), '연구자 계정으로 정했어요')) checkAuth();
                }}
              >
                이 계정을 연구자 계정으로 정하기
              </button>
            </div>
          </div>
        )}
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          {render ? (
            <video src={renderFile(render.id, 'video.mp4')} controls style={{ width: 220, borderRadius: 14, background: 'var(--soy)' }} />
          ) : (
            <div className="issue warning stack" style={{ maxWidth: 340, gap: 10 }}>
              <div>이 대본(v{latest.version})으로 만든 영상이 아직 없어요. 영상을 보고 승인하려면 먼저 검수용 영상을 만드세요.</div>
              <div><button className="btn small" onClick={() => go('video')}>검수용 영상 만들러 가기</button></div>
            </div>
          )}
          <div className="stack small" style={{ flex: '1 1 240px', gap: 8 }}>
            <div><b>대본 제목</b> {latest.script.title}</div>
            <div><b>블로그 원고</b> {project.blogStyle ? (BLOG_STYLE_INFO[project.blogStyle as BlogStyle]?.label ?? '고른 원고') : '아직 고르지 않음. 기본 자동 원고로 내보내져요'}</div>
            <div className="muted">승인하면 이 대본 버전으로 만든 영상을 내보내고 게시할 수 있어요. 승인 뒤에 대본·원본을 고치면 다시 승인받아야 해요.</div>
          </div>
        </div>
      </div>
      <div className="compare">
        <div className="card">
          <h2>원본 <span className="muted small">이희재 조리 노트</span></h2>
          <h3>재료·분량</h3>
          <ul>{r.ingredients.map((i, idx) => <li key={idx}>{formatIngredient(i)}</li>)}</ul>
          <h3>조리 순서</h3>
          <ol>{r.steps.map((s, idx) => <li key={idx}>{s}</li>)}</ol>
          <h3>핵심 원리</h3>
          <p>{r.principle}</p>
          {r.tips.length > 0 && (
            <>
              <h3>전문가 팁</h3>
              <ul>{r.tips.map((t, idx) => <li key={idx}>{t}</li>)}</ul>
            </>
          )}
        </div>
        <div className="card">
          <h2>
            대본 v{latest.version} <span className="muted small">예상 {seconds}초</span>
          </h2>
          {latest.script.scenes.map((s, i) => (
            <div className="line" key={s.id}>
              <b>{i + 1}</b>
              <div>
                {s.line}
                {s.cardItems && s.cardItems.length > 0 && (
                  <div className="muted small" style={{ marginTop: 4 }}>
                    화면 카드 {s.cardTitle ? `[${s.cardTitle}] ` : ''}
                    {s.cardItems.join(' / ')}
                  </div>
                )}
                {(tells[s.id] ?? []).length > 0 && <div className="small" style={{ color: '#a05a2c', marginTop: 4 }}>AI 티: {tells[s.id]!.join(' / ')}</div>}
              </div>
            </div>
          ))}
          {!approved && (
            <div style={{ marginTop: 12 }}>
              <HumanizePanel project={project} target="script" onApplied={(p) => (p ? setProject(p) : reload())} />
            </div>
          )}
        </div>
      </div>

      <div className="card stack">
        <div className="card-head">
          <h2>원본 대조 검사</h2>
          {issues && <span className="muted num">오류 {errors}건 · 전체 {issues.length}건</span>}
        </div>
        {issues === null && !checkFailed && <div className="loading">검사하는 중…</div>}
        {checkFailed && (
          <div className="issue error stack" style={{ gap: 8 }}>
            원본 대조 검사를 하지 못했어요. 인터넷 연결을 확인하고 다시 검사해 주세요. 검사가 끝나야 승인할 수 있어요.
            <div>
              <button className="btn small" onClick={() => setCheckTry((n) => n + 1)}>다시 검사하기</button>
            </div>
          </div>
        )}
        {issues?.length === 0 && <div className="issue ok">원본과 다른 분량이나 주의할 표현을 찾지 못했어요. 그래도 직접 한 번 더 보세요.</div>}
        {issues?.map((i, idx) => (
          <div key={idx} className={`issue ${i.level}`}>
            <b>{LEVEL_LABEL[i.level]}{i.sceneId && ` · 장면 ${sceneIndex.get(i.sceneId)}`}</b> {i.message}
          </div>
        ))}
      </div>

      <div className="card stack">
        <h2>연구자 검수</h2>
        {approved ? (
          <div className="row" style={{ gap: 16 }}>
            <span className="stamp fresh" role="img" aria-label={approver ? `${approver} 승인` : '승인 완료'}>
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
            <div style={{ flex: '1 1 200px' }}>
              <b className="num">v{latest.version} 승인 완료</b>
              <div className="small muted">{project.approval?.reviewer} · {new Date(project.approval!.createdAt).toLocaleString('ko-KR')}</div>
            </div>
            <button className="btn primary" onClick={() => go(hasRender ? 'publish' : 'video')}>{hasRender ? '게시·기록으로' : '영상 만들기로'}</button>
          </div>
        ) : (
          <>
            {aiPending && <RecipeReadCard project={project} onEdit={() => go('input')} onConfirmed={reload} open />}
            {CHECKLIST_ITEMS.map((c) => (
              <label key={c.key} className={`check ${checklist[c.key] ? 'on' : ''}`}>
                <input type="checkbox" checked={!!checklist[c.key]} onChange={(e) => setChecklist((p) => ({ ...p, [c.key]: e.target.checked }))} />
                {c.label}
              </label>
            ))}
            <div className="grid2">
              <label className="field">
                검수자
                <input type="text" value={user ? user.displayName : reviewer} disabled={Boolean(user)} title={user ? '로그인한 사람 이름으로 기록돼요' : ''} onChange={(e) => setReviewer(e.target.value)} />
              </label>
              <label className="field">
                메모 (수정 요청 사유 등)
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => navigate(`/p/${project.id}/script?edit`)}>대본 고치기</button>
              {/* 좁은 화면에서도 '수정 요청'과 '승인'은 함께 오른쪽에 (승인만 홀로 다음 줄 왼쪽으로 떨어지지 않게) */}
              <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
                <button className="btn" onClick={() => submit('changes_requested')}>수정 요청</button>
                <button
                  className="btn primary big"
                  disabled={issues === null || errors > 0 || aiPending || !CHECKLIST_ITEMS.every((c) => checklist[c.key]) || !reviewer.trim()}
                  title={issues === null ? '원본 대조 검사가 끝나야 승인할 수 있어요' : errors > 0 ? '원본 레시피와 다른 곳을 먼저 고쳐야 승인할 수 있어요' : aiPending ? 'AI 제안 내용을 먼저 확인해 주세요' : ''}
                  onClick={() => submit('approved')}
                >
                  승인
                </button>
              </div>
            </div>
            {errors > 0 && <div className="issue error">원본 레시피와 다른 분량·재료·순서 {errors}건을 고쳐야 승인할 수 있어요. [주제·영상 고르기]의 '대본 직접 고치기'에서 고치세요.</div>}
          </>
        )}
      </div>

      {project.reviews.length > 0 && (
        <details className="card">
          <summary>검수 기록 <span className="muted small">{project.reviews.length}건</span></summary>
          <div className="log">
            {project.reviews.map((rv) => (
              <div key={rv.id}>
                <time>{new Date(rv.createdAt).toLocaleString('ko-KR')}</time>v{rv.scriptVersion} · {rv.decision === 'approved' ? '승인' : '수정 요청'} · {rv.reviewer}
                {rv.note && ` — ${rv.note}`}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
