import React, { useCallback, useEffect, useState } from 'react';
import { api, type VoiceInfo, type VoiceSampleResult, type VoiceSamples } from '../api.ts';
import { useApp } from '../App.tsx';

const SAMPLE_TEXT = '잠깐! 청국장덮밥, 이렇게 하면 안 돼요! 이희재의 맛 연구소, 오늘의 실험!';

/**
 * 맛조수 목소리 고르기: 저장소에 기준 녹음이 있는 목소리들(모두 VoxCPM2) 중 하나 + 말 빠르기.
 * '모든 목소리로 들어보기'는 같은 문장을 목소리마다 만들어 나란히 들려준다 (설정은 바꾸지 않음).
 */
export const VoicePanel: React.FC = () => {
  const { run } = useApp();
  const [info, setInfo] = useState<VoiceInfo | null>(null);
  const [samples, setSamples] = useState<VoiceSamples | null>(null);
  const [text, setText] = useState(SAMPLE_TEXT);

  const load = useCallback(async () => {
    const v = await run(api.voiceSettings);
    if (v) setInfo(v);
    const s = await api.voiceSamples().catch(() => null);
    if (s) setSamples(s);
  }, [run]);

  useEffect(() => {
    load();
  }, [load]);

  // VoiceStudio가 준비 중이면 자동으로 다시 확인
  useEffect(() => {
    if (!info || info.voicestudio.state === 'ok') return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load, info]);

  // 들어보기 음성을 만드는 동안 4초마다 결과 확인
  useEffect(() => {
    if (samples?.status !== 'running') return;
    const t = setInterval(async () => {
      const s = await api.voiceSamples().catch(() => null);
      if (s) setSamples(s);
    }, 4000);
    return () => clearInterval(t);
  }, [samples?.status]);

  if (!info) return <div className="card">목소리 설정 불러오는 중…</div>;
  const vs = info.voicestudio;
  const done = samples ? Object.values(samples.items).filter(Boolean).length : 0;
  const total = samples ? Object.keys(samples.items).length : 0;
  const tempoLabel = (v: number) => info.tempos.find((t) => t.value === v)?.label ?? `${v}배`;

  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>맛조수 목소리</h2>
        <span className={`badge ${vs.state === 'ok' ? 'approved' : vs.state === 'starting' ? 'review' : 'draft'}`}>
          {vs.state === 'ok' ? '목소리 엔진 연결됨' : vs.state === 'starting' ? '목소리 엔진 준비 중…' : '목소리 엔진 꺼짐'}
        </span>
        <div className="spacer" />
        <span className="muted small">지금: {info.describe}</span>
      </div>

      {vs.state === 'offline' && (
        <div className="issue info">
          VoiceStudio 앱을 켜 주세요. 아직 설치하지 않았다면{' '}
          <a href="https://github.com/debpalash/VoiceStudio/releases/latest" target="_blank" rel="noreferrer">여기서 Windows 설치 파일(.exe)</a>을 받아 설치하세요.
          앱이 켜지면 이 화면이 자동으로 바뀝니다.
        </div>
      )}
      {vs.state === 'starting' && <div className="issue warning">목소리 엔진이 모델을 불러오는 중입니다. 처음 켤 때는 몇 분 걸릴 수 있습니다.</div>}
      {vs.state === 'ok' && info.engines && !info.engines.chosen && (
        <div className="issue warning">
          상업적으로 쓸 수 있는 음성 엔진이 없습니다. VoiceStudio 앱의 <b>Model Catalogue</b>에서 <b>VoxCPM2</b>를 설치해 주세요.
        </div>
      )}

      <div className="stack" style={{ gap: 8 }}>
        <b>목소리 고르기</b>
        {info.presets.length === 0 && <div className="small muted">고를 수 있는 목소리 목록을 불러오지 못했어요. 관리자에게 알려 주세요.</div>}
        <div className="voice-options">
          {info.presets.map((p) => {
            const on = info.selectedPreset === p.id;
            return (
              <div key={p.id} className={`voice-option ${on ? 'on' : ''}`}>
                <label className="voice-pick">
                  <input
                    type="radio"
                    name="voice-preset"
                    checked={on}
                    onChange={async () => {
                      const r = await run(() => api.setVoicePreset(p.id), `목소리를 '${p.label}'(으)로 바꿨어요`);
                      if (r) load();
                    }}
                  />
                  <span>
                    <b>{p.label}</b>
                    <span className="muted small"> {p.note}</span>
                  </span>
                </label>
                <SampleCell result={samples?.items[p.id] ?? null} running={samples?.status === 'running'} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <b>말 빠르기</b>
        <div className="seg" role="radiogroup" aria-label="말 빠르기">
          {info.tempos.map((t) => (
            <button
              key={t.value}
              role="radio"
              aria-checked={info.tempo === t.value}
              className={`seg-btn ${info.tempo === t.value ? 'on' : ''}`}
              onClick={async () => {
                if (info.tempo === t.value) return;
                const r = await run(() => api.setVoiceTempo(t.value), `말 빠르기를 '${t.label}'(으)로 바꿨어요`);
                if (r) load();
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="muted small">음높이는 그대로 두고 빠르기만 바뀌어요.</span>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <b>모든 목소리로 들어보기</b>
        <textarea rows={2} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} aria-label="들어볼 문장" />
        <div className="row">
          <button
            className="btn primary"
            disabled={samples?.status === 'running' || !text.trim() || vs.state !== 'ok'}
            onClick={async () => {
              const s = await run(() => api.startVoiceSamples(text.trim()));
              if (s) setSamples(s);
            }}
          >
            {samples?.status === 'running' ? `만드는 중… ${done}/${total}` : `▶ 모든 목소리로 만들기 (${tempoLabel(info.tempo)})`}
          </button>
          <span className="muted small">처음에는 클라우드 GPU가 깨어나느라 1~3분 걸릴 수 있어요. 다 되면 위 목록에서 목소리마다 들을 수 있어요.</span>
        </div>
        {samples && samples.status === 'done' && (
          <div className="muted small">
            문장: “{samples.text}” · 빠르기: {tempoLabel(samples.tempo)}
          </div>
        )}
      </div>

      <div className="muted small">목소리나 빠르기를 바꾸면 그다음에 만드는 대사부터 바뀌어요. 이미 만든 영상은 그대로예요.</div>

      {vs.state === 'ok' && info.profiles.some((pr) => !info.presets.some((p) => p.voiceName === pr.name)) && (
        <details>
          <summary className="muted small">VoiceStudio에서 직접 만든 목소리 쓰기</summary>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            목소리
            <select
              style={{ width: 220 }}
              value={info.profiles.some((p) => p.name === info.selected) ? info.selected : ''}
              onChange={async (e) => {
                if (!e.target.value) return;
                await run(() => api.setVoice(e.target.value), `목소리를 ${e.target.value}(으)로 바꿨습니다`);
                load();
              }}
            >
              <option value="">— 고르세요 —</option>
              {info.profiles
                .filter((pr) => !info.presets.some((p) => p.voiceName === pr.name))
                .map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
            </select>
          </label>
        </details>
      )}
    </div>
  );
};

const SampleCell: React.FC<{ result: VoiceSampleResult | null; running: boolean }> = ({ result, running }) => {
  if (!result) return running ? <span className="muted small">만드는 중…</span> : null;
  if ('error' in result) return <span className="issue warning small">{result.error}</span>;
  return <audio controls preload="none" src={result.url} style={{ width: '100%', height: 36 }} />;
};
