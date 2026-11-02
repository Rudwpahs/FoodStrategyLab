import React, { useState } from 'react';
import { api } from '../api.ts';
import { navigate, useApp } from '../App.tsx';
import { EMPTY_RECIPE, RecipeForm } from '../components/RecipeForm.tsx';

export const NewProjectPage: React.FC = () => {
  const { run, meta } = useApp();
  const [initial, setInitial] = useState(EMPTY_RECIPE);
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);

  return (
    <div className="stack">
      <div className="row">
        <div>
          <h1>새 콘텐츠</h1>
          <div className="muted">원본 레시피와 조리 지식을 입력하세요. 저장 후 대본을 만듭니다.</div>
        </div>
        <div className="spacer" />
        {meta && (
          <select
            style={{ width: 'auto' }}
            value=""
            onChange={(e) => {
              const s = meta.samples[Number(e.target.value)];
              if (s) {
                setInitial(s);
                setFormKey((k) => k + 1);
              }
            }}
          >
            <option value="">파일럿 샘플 불러오기…</option>
            {meta.samples.map((s, i) => <option key={i} value={i}>{s.topic}</option>)}
          </select>
        )}
      </div>
      <RecipeForm
        key={formKey}
        initial={initial}
        submitLabel="저장하고 대본 만들기 →"
        busy={busy}
        onSubmit={async (recipe) => {
          setBusy(true);
          const created = await run(() => api.create(recipe));
          if (created) {
            await run(() => api.templateScript(created.id));
            navigate(`/p/${created.id}/script`);
          }
          setBusy(false);
        }}
      />
    </div>
  );
};
