import React, { useEffect, useRef, useState } from 'react';
import { api, type AiInfo, type UploadFile } from '../api.ts';
import { navigate, useApp } from '../App.tsx';
import { costText } from '../cost.ts';
import { EMPTY_RECIPE, RecipeForm } from '../components/RecipeForm.tsx';
import { IMAGE_ACCEPT, heicToJpeg, isHeicFile } from '../heic.ts';

const MAX_SIDE = 2000;

/** 레시피로 읽을 수 있는 파일: 사진(HEIC 포함)·PDF·텍스트 (끌어 놓기도 고르기와 같은 기준) */
const readable = (f: File) => f.type.startsWith('image/') || isHeicFile(f) || f.type === 'application/pdf' || f.type.startsWith('text/') || /\.(txt|md|pdf)$/i.test(f.name);

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
      // 원본 크기로 푼 사진은 바로 놓아준다 (아이폰은 큰 사진 몇 장에 탭이 다시 로드될 수 있다)
      bmp.close();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      canvas.width = canvas.height = 0;
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
  const [over, setOver] = useState(false);
  const [initial, setInitial] = useState(EMPTY_RECIPE);
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const manualRef = useRef<HTMLDetailsElement>(null);
  const filesRef = useRef<File[]>([]);
  filesRef.current = files;

  useEffect(() => {
    api.aiInfo().then(setAi).catch(() => setAi(null));
  }, []);

  const max = ai?.maxFiles ?? 4;
  const blocked = ai?.configured === false;

  // 사진 미리보기 주소는 파일이 바뀔 때만 만들고, 다 쓰면 지운다 (화면을 다시 그릴 때마다 만들면 메모리가 샌다)
  const [previews, setPreviews] = useState<{ f: File; url: string | null }[]>([]);
  useEffect(() => {
    const made = files.map((f) => ({ f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }));
    setPreviews(made);
    return () => made.forEach((p) => p.url && URL.revokeObjectURL(p.url));
  }, [files]);

  // 레시피 읽기가 꺼져 있으면 '직접 입력하기'를 펼쳐 둔다
  useEffect(() => {
    if (blocked && manualRef.current) manualRef.current.open = true;
  }, [blocked]);

  /** 고르거나 끌어 놓은 파일을 더한다. 아이폰 사진(HEIC)은 바로 JPG로 바꾼다 (미리보기·Claude가 읽을 수 있게) */
  // 알림은 한 번에 하나만 보이므로, 문제가 여러 개면 모아서 한 번에 알린다
  const addFiles = async (all: File[]) => {
    const problems: string[] = [];
    const bad = all.filter((f) => !readable(f));
    if (bad.length) problems.push(`${bad.map((f) => f.name).join(', ')}은(는) 올릴 수 없는 형식이에요. 사진·PDF·텍스트 파일만 올려 주세요.`);
    const picked = all.filter(readable);
    if (picked.length) {
      setConverting(true);
      const ok: File[] = [];
      for (const f of picked) {
        try {
          ok.push(await heicToJpeg(f));
        } catch (err) {
          problems.push((err as Error).message);
        }
      }
      setConverting(false);
      if (filesRef.current.length + ok.length > max) problems.push(`한 번에 ${max}개까지 올릴 수 있어요. 앞의 ${max}개만 남겼어요.`);
      setFiles((cur) => [...cur, ...ok].slice(0, max));
    }
    if (problems.length) notify(problems.join(' '), true);
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>새 콘텐츠</h1>
          <div className="lead">레시피 사진이나 파일을 올리면 맛조수가 진행하는 후보 영상 5개를 만들어요.</div>
        </div>
      </div>

      <section className="card stack" aria-label="레시피 올리기">
        <div className="card-head">
          <h2>레시피 올리기</h2>
          <span className="muted num">{files.length}/{max}개</span>
        </div>
        {blocked && (
          <div className="issue warning">레시피 읽기(Claude API)가 아직 설정되지 않았어요. 관리자가 서버에 열쇠를 넣으면 쓸 수 있어요. 그 전에는 아래 '직접 입력하기'를 써 주세요.</div>
        )}
        <button
          type="button"
          className={`drop ${over ? 'over' : ''}`}
          disabled={blocked}
          onClick={() => input.current?.click()}
          // 꺼진 칸(disabled)도 끌어 놓기는 막히지 않는다. 직접 막는다 (preventDefault는 그대로: 안 하면 브라우저가 파일을 열어 버린다)
          onDragOver={(e) => {
            e.preventDefault();
            if (blocked) {
              e.dataTransfer.dropEffect = 'none';
              return;
            }
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (blocked) return;
            void addFiles([...e.dataTransfer.files]);
          }}
        >
          <span className="icon" aria-hidden>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
          <b>사진 찍기 또는 파일 고르기</b>
          <span className="muted small">손글씨·인쇄 레시피 사진(아이폰 HEIC 포함), 화면 캡처, PDF, 텍스트 파일 · 최대 {max}개</span>
        </button>
        <input
          ref={input}
          type="file"
          accept={`${IMAGE_ACCEPT},application/pdf,text/plain,.txt,.md`}
          multiple
          hidden
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])];
            e.target.value = '';
            void addFiles(picked);
          }}
        />
        <div role="status" className={converting ? 'muted small' : 'sr-only'}>
          {converting ? '아이폰 사진(HEIC)을 JPG로 바꾸는 중…' : ''}
        </div>
        {previews.length > 0 && (
          <div className="source-thumbs" style={{ paddingTop: 6 }}>
            {previews.map(({ f, url }, i) => (
              <div key={i} className="thumb">
                {url ? <img src={url} alt={f.name} /> : <span className="file-chip">{f.name}</span>}
                <button type="button" className="x" aria-label={`${f.name} 빼기`} onClick={() => setFiles((cur) => cur.filter((x) => x !== f))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="field">
          메모 <span className="hint">선택 · 사진에 없는 내용. 예) "할머니께 배운 방식", "흔히 반죽을 미지근한 물로 해서 실패해요"</span>
          <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <button
          className="btn primary big block"
          disabled={reading || converting || files.length === 0 || blocked}
          onClick={async () => {
            setReading(true);
            const r = await run(async () => {
              // 한 장씩 차례로 줄인다 (여러 장을 동시에 원본 크기로 풀면 아이폰 메모리가 모자란다)
              const uploads: UploadFile[] = [];
              for (const f of files) uploads.push(await toUpload(f));
              return api.createFromFiles(uploads, memo);
            }, '레시피를 읽었어요. 영상 주제를 골라 주세요');
            setReading(false);
            if (r) navigate(`/p/${r.id}/script`);
          }}
        >
          {reading ? '레시피 읽는 중… 10~40초 걸려요' : '레시피 읽기 → 주제 고르기'}
        </button>
        <div className="muted small">재료·분량·순서는 적힌 그대로 옮기고, 자료에 없는 주제·원리는 'AI 제안'으로 표시해요. 꼭 확인해 주세요.</div>
        {ai?.configured && <div className="muted small">Claude 사용료: 1회 {costText(ai.measured?.['recipe-read'], '사진 한 장 약 $0.1~0.2')} · 이번 달 한도 안에서</div>}
      </section>

      <details className="card manual" ref={manualRef}>
        <summary>
          직접 입력하기 <span className="muted small">사진 없이 레시피를 손으로 적을 때</span>
        </summary>
        <div className="stack">
          {meta && (
            <label className="field" style={{ maxWidth: 420 }}>
              파일럿 샘플로 채우기
              <select
                value=""
                onChange={(e) => {
                  const s = meta.samples[Number(e.target.value)];
                  if (s) {
                    setInitial(s);
                    setFormKey((k) => k + 1);
                  }
                }}
              >
                <option value="">샘플 고르기…</option>
                {meta.samples.map((s, i) => (
                  <option key={i} value={i}>
                    {s.topic}
                  </option>
                ))}
              </select>
            </label>
          )}
          <RecipeForm
            key={formKey}
            initial={initial}
            submitLabel="저장하고 후보 영상 보기"
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
