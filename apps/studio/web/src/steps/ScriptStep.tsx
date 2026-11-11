import React, { useEffect, useState } from 'react';
import { EMOTIONS, EMOTION_LABELS, SCENE_TYPES, VISUALS, VISUAL_LABELS, estimateScriptSeconds, type Scene, type Script } from '@mat-lab/recipe-core';
import { HookPicker } from '../components/HookPicker.tsx';
import { CandidatePicker } from '../components/CandidatePicker.tsx';
import { RecipeReadCard } from '../components/RecipeReadCard.tsx';
import { HumanizePanel } from '../components/HumanizePanel.tsx';
import { TopicPicker, needsTopic } from '../components/TopicPicker.tsx';
import { Fold } from '../components/Fold.tsx';
import { api, copyText } from '../api.ts';
import { useApp } from '../App.tsx';
import type { StepProps } from '../pages/ProjectPage.tsx';

const TYPE_LABELS: Record<Scene['type'], string> = {
  intro: '오프닝',
  question: '질문',
  mistake: '실수',
  explain: '원리 설명',
  ingredients: '재료',
  steps: '조리 순서',
  tip: '한 줄 팁',
  outro: '엔딩',
};
const SOURCE_LABELS = { template: '템플릿', 'ai-paste': 'AI 붙여넣기', edit: '직접 수정' } as const;

export const ScriptStep: React.FC<StepProps> = ({ project, setProject, go, reload }) => {
  const { run } = useApp();
  const [draft, setDraft] = useState<Script | null>(project.latest?.script ?? null);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState('');
  const [aiText, setAiText] = useState('');
  const [showAi, setShowAi] = useState(false);
  // 붙여넣기용 프롬프트는 상자를 열 때 미리 받아 둔다 (아이폰 사파리는 서버 응답을 기다린 뒤의 복사를 막는다)
  const [prompt, setPrompt] = useState<string | null>(null);

  useEffect(() => {
    if (!showAi) return;
    setPrompt(null);
    let alive = true;
    void run(() => api.aiPrompt(project.id)).then((r) => alive && r && setPrompt(r.prompt));
    return () => {
      alive = false;
    };
  }, [showAi, project.latest?.version, project.updatedAt]);

  useEffect(() => {
    setDraft(project.latest?.script ?? null);
    setDirty(false);
  }, [project.latest?.version]);

  const update = (next: Script) => {
    setDraft(next);
    setDirty(true);
  };
  const setScene = (i: number, patch: Partial<Scene>) => draft && update({ ...draft, scenes: draft.scenes.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: -1 | 1) => {
    if (!draft) return;
    const scenes = [...draft.scenes];
    const [s] = scenes.splice(i, 1);
    scenes.splice(i + d, 0, s!);
    update({ ...draft, scenes });
  };
  const nextId = () => `s${Math.max(0, ...(draft?.scenes ?? []).map((s) => Number(s.id.replace(/\D/g, '')) || 0)) + 1}`;

  const seconds = draft ? Math.round(estimateScriptSeconds(draft)) : 0;

  return (
    <div className="stack">
      {/* 주제를 아직 안 골랐으면 주제 고르기를 맨 위에 (읽은 레시피는 그 아래에서 확인) */}
      {needsTopic(project) && <TopicPicker project={project} onChosen={setProject} />}
      {project.source && <RecipeReadCard project={project} onEdit={() => go('input')} onConfirmed={reload} hideSuggestions={needsTopic(project)} />}
      {!needsTopic(project) && (
        <CandidatePicker
          project={project}
          onMade={(p) => {
            setProject(p);
            go('video');
          }}
        />
      )}
      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>대본 직접 고치기 (선택){dirty ? ' · 수정 중' : ''}</summary>
        <div className="stack" style={{ marginTop: 12 }}>
          {draft && !dirty && <HumanizePanel project={project} target="script" onApplied={(p) => (p ? setProject(p) : reload())} />}
          {!draft ? (
            <div className="card empty">아직 대본이 없어요. 위 후보 영상에서 고르거나 아래 "다른 방법으로 대본 만들기"를 써 주세요.</div>
          ) : (
            <div className="card stack">
              <div className="row">
                <h2 style={{ margin: 0 }}>
                  대본 v{project.latest?.version} {dirty && <span className="badge review">수정 중</span>}
                </h2>
                <span className={`badge ${seconds > 40 ? 'review' : ''}`}>예상 {seconds}초{seconds > 40 ? ' · 30초 목표보다 깁니다' : ''}</span>
                <div className="spacer" />
                <label className="field" style={{ flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 380 }}>
                  영상 제목 <input type="text" value={draft.title} onChange={(e) => update({ ...draft, title: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                </label>
              </div>
              {draft.scenes.map((s, i) => (
                <div className="scene" key={s.id + i}>
                  <div className="scene-head">
                    <span className="sid">{i + 1}</span>
                    <select value={s.type} onChange={(e) => setScene(i, { type: e.target.value as Scene['type'] })}>
                      {SCENE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                    <select value={s.emotion} onChange={(e) => setScene(i, { emotion: e.target.value as Scene['emotion'] })}>
                      {EMOTIONS.map((e) => <option key={e} value={e}>{EMOTION_LABELS[e]}</option>)}
                    </select>
                    <select value={s.visual ?? ''} onChange={(e) => setScene(i, { visual: (e.target.value || undefined) as Scene['visual'] })} title="장면 화면 연출">
                      <option value="">기본 화면</option>
                      {VISUALS.map((v) => <option key={v} value={v}>{VISUAL_LABELS[v]}</option>)}
                    </select>
                    {s.hook && <span className="badge" title="첫 장면(훅). 훅을 바꾸면 이 장면만 다시 만들어요.">첫 장면</span>}
                    <div className="spacer" />
                    <button className="btn small ghost" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button className="btn small ghost" disabled={i === draft.scenes.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button className="btn small ghost" disabled={draft.scenes.length <= 3} onClick={() => update({ ...draft, scenes: draft.scenes.filter((_, idx) => idx !== i) })}>삭제</button>
                  </div>
                  <label className="field">
                    맛조수 대사 (음성·자막)
                    <textarea rows={2} value={s.line} onChange={(e) => setScene(i, { line: e.target.value })} />
                  </label>
                  {(s.cardTitle !== undefined || s.cardItems !== undefined) && (
                    <div className="grid2" style={{ marginTop: 8 }}>
                      <label className="field">
                        화면 카드 제목
                        <input type="text" value={s.cardTitle ?? ''} onChange={(e) => setScene(i, { cardTitle: e.target.value })} />
                      </label>
                      <label className="field">
                        카드 항목 <span className="hint">한 줄에 하나</span>
                        <textarea rows={Math.max(2, s.cardItems?.length ?? 1)} value={(s.cardItems ?? []).join('\n')} onChange={(e) => setScene(i, { cardItems: e.target.value.split('\n') })} />
                      </label>
                    </div>
                  )}
                </div>
              ))}
              <div className="row">
                <button
                  className="btn small"
                  disabled={draft.scenes.length >= 12}
                  onClick={() => update({ ...draft, scenes: [...draft.scenes.slice(0, -1), { id: nextId(), type: 'explain', emotion: 'curious', line: '새 대사', cardTitle: '', cardItems: [] }, ...draft.scenes.slice(-1)] })}
                >
                  + 장면 추가
                </button>
                <div className="spacer" />
                <input type="text" placeholder="수정 메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 260 }} />
                <button
                  className="btn primary"
                  disabled={!dirty}
                  onClick={async () => {
                    const cleaned = { ...draft, scenes: draft.scenes.map((s) => (s.cardItems ? { ...s, cardItems: s.cardItems.map((x) => x.trim()).filter(Boolean) } : s)) };
                    const p = await run(() => api.saveScript(project.id, cleaned, note), '새 버전으로 저장했습니다 (재검수 필요)');
                    if (p) {
                      setProject(p);
                      setNote('');
                    }
                  }}
                >
                  새 버전으로 저장
                </button>
                <button className="btn" disabled={dirty} onClick={() => go('video')}>영상·블로그로 →</button>
              </div>
            </div>
          )}

          {project.versions.length > 0 && (
            <div className="card">
              <h3>버전 기록</h3>
              <div className="log">
                {project.versions.map((v) => (
                  <div key={v.version} className="row">
                    <b>v{v.version}</b>
                    <span>{SOURCE_LABELS[v.source]}</span>
                    <span>{v.note}</span>
                    <time>{new Date(v.createdAt).toLocaleString('ko-KR')}</time>
                    <div className="spacer" />
                    {v.version !== project.latest?.version && (
                      <button className="btn small" onClick={async () => {
                        const p = await run(() => api.restore(project.id, v.version), `v${v.version}을 새 버전으로 복원했습니다`);
                        if (p) setProject(p);
                      }}>복원</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
      <Fold title="다른 방법으로 대본 만들기 (선택)">
        <HookPicker project={project} setProject={setProject} dirty={dirty} />
        <div className="card stack">
          <div className="row">
            <h2 style={{ margin: 0 }}>템플릿 · AI 채팅 붙여넣기</h2>
            <span className="muted small">비용 0원</span>
          </div>
          <div className="row">
            <button
              className="btn"
              onClick={async () => {
                if (dirty && !confirm('저장하지 않은 수정이 있습니다. 새로 생성할까요?')) return;
                const p = await run(() => api.templateScript(project.id), '템플릿 대본을 새 버전으로 저장했습니다');
                if (p) setProject(p);
              }}
            >
              기본 템플릿으로 새로 생성
            </button>
            <button className="btn" onClick={() => setShowAi((v) => !v)}>
              AI 대본 붙여넣기 {showAi ? '▲' : '▼'}
            </button>
          </div>
          {showAi && (
            <div className="stack" style={{ background: '#fffaf3', padding: 14, borderRadius: 12 }}>
              <div className="small">
                ① 프롬프트를 복사해 ChatGPT·Claude·Gemini 무료 웹 채팅에 붙여넣고 ② 받은 답변 전체를 아래에 붙여넣으세요. 재료 카드는 자동으로 원본으로 고정됩니다.
              </div>
              <div>
                <button className="btn small" disabled={!prompt} onClick={() => prompt && run(() => copyText(prompt), '프롬프트를 복사했습니다')}>
                  {prompt ? '① 프롬프트 복사' : '프롬프트 준비 중…'}
                </button>
              </div>
              <textarea rows={6} placeholder="② AI 답변(JSON)을 여기에 붙여넣기" value={aiText} onChange={(e) => setAiText(e.target.value)} />
              <div>
                <button
                  className="btn primary small"
                  disabled={!aiText.trim()}
                  onClick={async () => {
                    const p = await run(() => api.aiScript(project.id, aiText), 'AI 대본을 새 버전으로 저장했습니다');
                    if (p) {
                      setProject(p);
                      setAiText('');
                      setShowAi(false);
                    }
                  }}
                >
                  ③ AI 대본 적용
                </button>
              </div>
            </div>
          )}
        </div>
      </Fold>
    </div>
  );
};
