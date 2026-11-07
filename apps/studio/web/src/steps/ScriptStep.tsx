import React, { useEffect, useRef, useState } from 'react';
import { EMOTIONS, EMOTION_LABELS, SCENE_TYPES, VISUALS, VISUAL_LABELS, type Scene, type Script } from '@mat-lab/recipe-core';
import { buildTimeline, videoSeconds, type SceneTiming } from '@mat-lab/video';
import { HookPicker } from '../components/HookPicker.tsx';
import { CandidatePicker } from '../components/CandidatePicker.tsx';
import { RecipeReadCard } from '../components/RecipeReadCard.tsx';
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
  const editRef = useRef<HTMLDetailsElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  /** '대본 고치기'로 왔을 때 편집 칸 위쪽 끝이 놓인 높이 (화면 기준) */
  const landedTop = useRef(0);

  // [검수·승인]의 '대본 고치기'로 오면 (…/script?edit) 편집 칸을 열어 두고 그리로 데려간다
  useEffect(() => {
    if (!location.hash.endsWith('?edit') || !editRef.current) return;
    editRef.current.open = true;
    editRef.current.scrollIntoView({ block: 'start' });
    landedTop.current = editRef.current.getBoundingClientRect().top;
  }, []);

  // 편집 칸 위의 후보 묶음은 늦게 들어오고 높이도 바뀐다 (불러오는 중 → 카드 5개 → 목소리 안내).
  // 크롬·안드로이드·Safari 27 이상은 스크롤 고정(scroll anchoring)으로 편집 칸을 제자리에 두지만, iOS 26 이하 Safari는 그대로 밀린다.
  // 그런 브라우저에서만, 편집 칸을 보고 있을 때(위쪽 끝이 화면 위에 닿았거나 칸 안의 입력란에 쓰는 중) 편집 칸이 실제로 움직인 만큼 스크롤을 옮긴다.
  // 후보를 보러 위로 올라간 사람은 끌어내리지 않는다.
  useEffect(() => {
    const box = pickerRef.current;
    const ed = editRef.current;
    if (!box || !ed || typeof ResizeObserver === 'undefined') return;
    if (typeof CSS !== 'undefined' && CSS.supports('overflow-anchor', 'auto')) return;
    let last = box.offsetHeight;
    // 높이가 바뀌기 전 편집 칸 위쪽 끝의 화면 위치. 페이지 맨 아래에서 묶음이 줄면 브라우저가 스크롤을 먼저 끌어올리므로
    // 줄어든 높이만큼이 아니라 편집 칸이 실제로 움직인 만큼만 되돌린다. 아직 처리하지 않은 높이 변화가 있을 때의 scroll로는 갱신하지 않는다.
    let prevTop = ed.getBoundingClientRect().top;
    const onScroll = () => {
      if (box.offsetHeight === last) prevTop = ed.getBoundingClientRect().top;
    };
    addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      const delta = box.offsetHeight - last;
      last += delta;
      const shift = Math.round(ed.getBoundingClientRect().top - prevTop);
      if (delta && shift && ed.open) {
        const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
        const line = Math.max(Number.isFinite(pad) ? pad : 0, landedTop.current);
        // 펼침 제목(summary)을 누른 것은 쓰는 중이 아니다 (Safari는 누른 summary에 초점을 둔다)
        const a = document.activeElement;
        const typing = a instanceof HTMLElement && ed.contains(a) && (a.matches('input, textarea, select') || a.isContentEditable);
        // scrollBy가 아니라 절대 위치로 옮긴다: iOS Safari는 끌어올림을 예약해 두고 scrollBy 이동량을 그 위에 한 번 더 더한다
        if (prevTop <= line + 1 || typing) window.scrollTo(window.scrollX, window.scrollY + shift);
      }
      prevTop = ed.getBoundingClientRect().top;
    });
    ro.observe(box);
    return () => {
      ro.disconnect();
      removeEventListener('scroll', onScroll);
    };
  }, []);

  // 저장된 대본의 영상 길이: 목소리가 있으면 실제 목소리 길이로 (후보 카드·미리보기·완성 영상과 같은 값)
  const [saved, setSaved] = useState<{ version: number; timings: SceneTiming[] } | null>(null);
  useEffect(() => {
    if (!project.latest) return;
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
  }, [project.id, project.latest?.version]);

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

  // 영상 길이: 저장된 대본이면 서버가 잰 길이, 고치는 중이면 글자 수로 어림한 길이 (계산 방식은 후보 카드·미리보기와 같다)
  const seconds = draft
    ? videoSeconds(saved && !dirty && saved.version === project.latest?.version ? saved.timings : buildTimeline(draft, draft.scenes.map(() => null)))
    : 0;

  return (
    <div className="stack">
      {project.source && <RecipeReadCard project={project} onEdit={() => go('input')} onConfirmed={reload} />}
      <CandidatePicker
        boxRef={pickerRef}
        project={project}
        onMade={(p) => {
          setProject(p);
          go('video');
        }}
      />
      <details className="card" ref={editRef}>
        <summary>
          대본 직접 고치기 <span className="muted small">선택 · 후보 대신 직접 연출을 정하거나 대사를 고칠 때</span>
        </summary>
        <div className="stack" style={{ gap: 18 }}>
      <details className="plain">
        <summary>연출과 첫 장면 고르기 <span className="muted small">유형과 첫 장면(훅)을 하나씩 정해요</span></summary>
        <div style={{ marginTop: 14 }}>
          <HookPicker project={project} setProject={setProject} dirty={dirty} />
        </div>
      </details>
      <details className="plain">
        <summary>다른 방법으로 대본 만들기 <span className="muted small">템플릿 또는 무료 AI 채팅</span></summary>
        <div className="stack" style={{ marginTop: 14 }}>
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
          <button className="btn" aria-expanded={showAi} onClick={() => setShowAi((v) => !v)}>
            AI 대본 붙여넣기 <span aria-hidden="true">{showAi ? '▲' : '▼'}</span>
          </button>
        </div>
        {showAi && (
          <div className="stack option-note">
            <div className="small">
              ① 프롬프트를 복사해 ChatGPT·Claude·Gemini 무료 웹 채팅에 붙여넣고 ② 받은 답변 전체를 아래에 붙여넣으세요. 재료 카드는 자동으로 원본으로 고정됩니다.
            </div>
            <div>
              <button className="btn small" onClick={() => run(async () => copyText((await api.aiPrompt(project.id)).prompt), '프롬프트를 복사했습니다')}>
                ① 프롬프트 복사
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
      </details>

      {!draft ? (
        <div className="empty">아직 대본이 없어요. 위 후보 중 하나를 고르면 대본이 생겨요.</div>
      ) : (
        <div className="stack">
          <div className="row">
            <h3 style={{ margin: 0 }} className="num">
              대본 v{project.latest?.version}
            </h3>
            {dirty && <span className="badge review">저장 안 한 수정</span>}
            <span className={`badge num ${seconds > 40 ? 'review' : ''}`}>예상 {seconds}초{seconds > 40 ? ' · 목표 30초보다 길어요' : ''}</span>
          </div>
          <label className="field">
            영상 제목
            <input type="text" value={draft.title} onChange={(e) => update({ ...draft, title: e.target.value })} />
          </label>
          {draft.scenes.map((s, i) => (
            <div className="scene" key={s.id + i}>
              <div className="scene-head">
                <span className="sid">{i + 1}</span>
                <select aria-label={`${i + 1}번 장면 종류`} value={s.type} onChange={(e) => setScene(i, { type: e.target.value as Scene['type'] })}>
                  {SCENE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
                <select aria-label={`${i + 1}번 장면 맛조수 표정`} value={s.emotion} onChange={(e) => setScene(i, { emotion: e.target.value as Scene['emotion'] })}>
                  {EMOTIONS.map((e) => <option key={e} value={e}>{EMOTION_LABELS[e]}</option>)}
                </select>
                <select value={s.visual ?? ''} onChange={(e) => setScene(i, { visual: (e.target.value || undefined) as Scene['visual'] })} aria-label={`${i + 1}번 장면 화면 연출`}>
                  <option value="">기본 화면</option>
                  {VISUALS.map((v) => <option key={v} value={v}>{VISUAL_LABELS[v]}</option>)}
                </select>
                {s.hook && <span className="badge" title="첫 장면(훅). 훅을 바꾸면 이 장면만 다시 만들어요.">첫 장면</span>}
                <div className="scene-tools">
                  <button className="btn small ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${i + 1}번 장면 위로`}>↑</button>
                  <button className="btn small ghost" disabled={i === draft.scenes.length - 1} onClick={() => move(i, 1)} aria-label={`${i + 1}번 장면 아래로`}>↓</button>
                  <button className="btn small ghost danger" disabled={draft.scenes.length <= 3} onClick={() => update({ ...draft, scenes: draft.scenes.filter((_, idx) => idx !== i) })} aria-label={`${i + 1}번 장면 삭제`}>삭제</button>
                </div>
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
            <input type="text" placeholder="수정 메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 260, flex: '1 1 200px' }} />
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
            <button className="btn" disabled={dirty} onClick={() => go('video')}>영상·블로그로</button>
          </div>
        </div>
      )}

      {project.versions.length > 0 && (
        <details className="plain">
          <summary>버전 기록 <span className="muted small">{project.versions.length}개</span></summary>
          <div className="log">
            {project.versions.map((v) => (
              <div key={v.version} className="row">
                <b className="num">v{v.version}</b>
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
        </details>
      )}
        </div>
      </details>
    </div>
  );
};
