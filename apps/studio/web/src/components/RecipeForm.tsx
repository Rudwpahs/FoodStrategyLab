import React, { useState } from 'react';
import { CATEGORIES, CATEGORY_LABELS, FOOD_KINDS, FOOD_KIND_LABELS, FORMATS, FORMAT_LABELS, inferFoodKind, type RecipeInput } from '@mat-lab/recipe-core';

export const EMPTY_RECIPE: RecipeInput = {
  topic: '',
  dishName: '',
  category: 'science',
  format: 'explainer',
  ingredients: [{ name: '', amount: '' }],
  steps: [],
  principle: '',
  tips: [],
  commonMistake: '',
  source: '이희재 조리 노트',
  foodKind: 'auto',
};

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

interface Props {
  initial: RecipeInput;
  submitLabel: string;
  onSubmit: (recipe: RecipeInput) => void;
  busy?: boolean;
  extra?: React.ReactNode;
}

/** 원본 레시피·조리 지식 입력. 여기 입력한 재료·분량은 AI가 바꾸지 않는다. */
export const RecipeForm: React.FC<Props> = ({ initial, submitLabel, onSubmit, busy, extra }) => {
  const [r, setR] = useState<RecipeInput>(initial);
  const [steps, setSteps] = useState(initial.steps.join('\n'));
  const [tips, setTips] = useState(initial.tips.join('\n'));
  const set = <K extends keyof RecipeInput>(k: K, v: RecipeInput[K]) => setR((p) => ({ ...p, [k]: v }));

  const setIng = (i: number, key: 'name' | 'amount' | 'group', v: string) =>
    set('ingredients', r.ingredients.map((x, idx) => (idx === i ? { ...x, [key]: v } : x)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...r, ingredients: r.ingredients.filter((i) => i.name.trim()), steps: lines(steps), tips: lines(tips) });
  };

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card stack">
        <label className="field">
          이번 콘텐츠 주제 <span className="hint">질문형이 좋아요. 예) 왜 김치전은 금방 눅눅해질까?</span>
          <input type="text" value={r.topic} onChange={(e) => set('topic', e.target.value)} required />
        </label>
        <div className="grid2 fields">
          <label className="field">
            요리 이름
            <input type="text" value={r.dishName} onChange={(e) => set('dishName', e.target.value)} placeholder="예) 바삭한 김치전" />
          </label>
          <label className="field">
            출처
            <input type="text" value={r.source} onChange={(e) => set('source', e.target.value)} />
          </label>
          <label className="field">
            분류
            <select value={r.category} onChange={(e) => set('category', e.target.value as RecipeInput['category'])}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="field">
            3D 음식 모양 <span className="hint">영상 속 조리 장면에 나오는 음식</span>
            <select value={r.foodKind} onChange={(e) => set('foodKind', e.target.value as RecipeInput['foodKind'])}>
              <option value="auto">자동 — {FOOD_KIND_LABELS[inferFoodKind({ ...r, steps: lines(steps) })]}</option>
              {FOOD_KINDS.map((k) => <option key={k} value={k}>{FOOD_KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="field">
            영상 포맷
            <select value={r.format} onChange={(e) => set('format', e.target.value as RecipeInput['format'])}>
              {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="card stack">
        <div className="card-head">
          <h3>재료·분량</h3>
          <span className="muted">원본 그대로 영상·블로그에 들어가요</span>
        </div>
        {r.ingredients.map((ing, i) => (
          <div className="ing-row" key={i}>
            <input type="text" className="ing-name" placeholder="재료 이름" aria-label={`${i + 1}번 재료 이름`} value={ing.name} onChange={(e) => setIng(i, 'name', e.target.value)} />
            <input type="text" placeholder="분량 (200g)" aria-label={`${i + 1}번 재료 분량`} value={ing.amount} onChange={(e) => setIng(i, 'amount', e.target.value)} />
            <input type="text" placeholder="묶음 (예: 소스)" aria-label={`${i + 1}번 재료 묶음`} value={ing.group ?? ''} onChange={(e) => setIng(i, 'group', e.target.value)} />
            <button type="button" className="btn small ghost ing-x" onClick={() => set('ingredients', r.ingredients.filter((_, idx) => idx !== i))} aria-label={`${i + 1}번 재료 삭제`}>✕</button>
          </div>
        ))}
        <div>
          <button type="button" className="btn small" onClick={() => set('ingredients', [...r.ingredients, { name: '', amount: '', group: r.ingredients.at(-1)?.group }])}>+ 재료 추가</button>
        </div>
        <label className="field">
          조리 순서 <span className="hint">한 줄에 한 단계</span>
          <textarea rows={5} value={steps} onChange={(e) => setSteps(e.target.value)} />
        </label>
      </div>

      <div className="card stack">
        <label className="field">
          핵심 조리 원리 <span className="hint">이희재 연구자의 조리 노트. 문장 1~2개가 영상 설명 장면이 됩니다.</span>
          <textarea rows={4} value={r.principle} onChange={(e) => set('principle', e.target.value)} required />
        </label>
        <label className="field">
          전문가 팁 <span className="hint">한 줄에 하나. 첫 번째 팁이 영상 엔딩 "한 줄 팁"이 됩니다.</span>
          <textarea rows={3} value={tips} onChange={(e) => setTips(e.target.value)} />
        </label>
        <label className="field">
          흔한 실수 <span className="hint">연구자가 실제로 자주 보는 실수. 비워 두면 실수 경고·문제 해결 훅은 쓰지 않습니다.</span>
          <input type="text" value={r.commonMistake} onChange={(e) => set('commonMistake', e.target.value)} />
        </label>
        <label className="field">
          흔한 오해 <span className="hint">(선택) 사람들이 잘못 아는 점. 오해 반박·반전 훅에 씁니다.</span>
          <input type="text" value={r.misconception ?? ''} onChange={(e) => set('misconception', e.target.value)} />
        </label>
        <label className="field">
          음식 이야기 <span className="hint">(선택) 유래나 연구자의 실제 경험. 스토리형 훅에 씁니다. 확인된 내용만 적어 주세요.</span>
          <textarea rows={2} value={r.story ?? ''} onChange={(e) => set('story', e.target.value)} />
        </label>
      </div>

      <div className="row">
        {extra}
        <div className="spacer" />
        <button className="btn primary big" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
};
