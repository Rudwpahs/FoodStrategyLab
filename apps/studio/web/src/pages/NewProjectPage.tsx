import React, { useEffect, useRef, useState } from 'react';
import { api, type AiInfo, type UploadFile } from '../api.ts';
import { navigate, useApp } from '../App.tsx';
import { EMPTY_RECIPE, RecipeForm } from '../components/RecipeForm.tsx';
import { IMAGE_ACCEPT, heicToJpeg } from '../heic.ts';

const MAX_SIDE = 2000;

/** 사진은 휴대폰에서 줄여서 보낸다 (긴 변 2000px, JPEG) — 빠르고, 읽는 비용도 줄어든다 */
async function toUpload(file: File): Promise<UploadFile> {
  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      return { name: file.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg', data: dataUrl.split(',')[1]! };
    } catch {
      /* 줄이지 못하면 원본 그대로 */
    }
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { name: file.name, type: file.type || (file.name.endsWith('.txt') ? 'text/plain' : ''), data: btoa(bin) };
}

export const NewProjectPage: React.FC = () => {
  const { run, meta, notify } = useApp();
  const [ai, setAi] = useState<AiInfo | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [memo, setMemo] = useState('');
  const [reading, setReading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [initial, setInitial] = useState(EMPTY_RECIPE);
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.aiInfo().then(setAi).catch(() => setAi(null));
  }, []);

  const max = ai?.maxFiles ?? 4;
  const previews = files.map((f) => ({ f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }));

  return (
    <div className="stack">
      <div>
        <h1>새 콘텐츠</h1>
        <div className="muted">레시피 사진이나 파일을 올리면 후보 영상 5개를 만들어 드려요.</div>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>① 레시피 사진·파일 올리기</h2>
        {ai && !ai.configured && (
          <div className="issue warning">레시피 읽기(Claude API)가 아직 설정되지 않았어요. 관리자가 서버에 열쇠를 넣으면 쓸 수 있어요. 그 전에는 아래 "직접 입력"을 써 주세요.</div>
        )}
        <div className="drop" onClick={() => input.current?.click()}>
          <div style={{ fontSize: 34 }}>📷</div>
          <b>사진 찍기 · 사진 고르기 · 파일 고르기</b>
          <div className="muted small">손글씨·인쇄 레시피 사진(아이폰 HEIC 포함), 화면 캡처, PDF, 텍스트 파일 (최대 {max}개)</div>
        </div>
        <input
          ref={input}
          type="file"
          accept={`${IMAGE_ACCEPT},application/pdf,text/plain,.txt,.md`}
          multiple
          hidden
          onChange={async (e) => {
            const picked = [...(e.target.files ?? [])];
            e.target.value = '';
            // 아이폰 사진(HEIC)은 고르자마자 JPG로 바꾼다 (미리보기·Claude가 읽을 수 있게)
            setConverting(true);
            const ok: File[] = [];
            for (const f of picked) {
              try {
                ok.push(await heicToJpeg(f));
              } catch (err) {
                notify((err as Error).message, true);
              }
            }
            setConverting(false);
            setFiles((cur) => [...cur, ...ok].slice(0, max));
          }}
        />
        {converting && <div className="muted small">아이폰 사진(HEIC)을 JPG로 바꾸는 중…</div>}
        {files.length > 0 && (
          <div className="source-thumbs">
            {previews.map(({ f, url }, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {url ? <img src={url} alt={f.name} /> : <span className="badge">📄 {f.name}</span>}
                <button className="btn small ghost" style={{ position: 'absolute', top: 0, right: 0, padding: '0 6px' }} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="field">
          메모 (선택) — 사진에 없는 내용, 예: "할머니께 배운 방식", "흔히 반죽을 미지근한 물로 해서 실패해요"
          <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <button
          className="btn primary"
          disabled={reading || converting || files.length === 0 || ai?.configured === false}
          onClick={async () => {
            setReading(true);
            const uploads = await Promise.all(files.map(toUpload));
            const r = await run(() => api.createFromFiles(uploads, memo), '레시피를 읽었어요. 후보 영상을 만들어요');
            setReading(false);
            if (r) navigate(`/p/${r.id}/script`);
          }}
        >
          {reading ? '레시피 읽는 중… (10~40초)' : '② 후보 영상 5개 만들기 →'}
        </button>
        <div className="muted small">재료·분량·순서는 적힌 그대로 옮기고, 자료에 없는 주제·원리는 "AI 제안"으로 표시해요. 꼭 확인해 주세요.</div>
      </div>

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>직접 입력하기</summary>
        <div className="stack" style={{ marginTop: 12 }}>
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
              {meta.samples.map((s, i) => (
                <option key={i} value={i}>
                  {s.topic}
                </option>
              ))}
            </select>
          )}
          <RecipeForm
            key={formKey}
            initial={initial}
            submitLabel="저장하고 후보 영상 보기 →"
            busy={busy}
            onSubmit={async (recipe) => {
              setBusy(true);
              const created = await run(() => api.create(recipe));
              if (created) navigate(`/p/${created.id}/script`);
              setBusy(false);
            }}
          />
        </div>
      </details>
    </div>
  );
};
