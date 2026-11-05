import React, { useCallback, useEffect, useState } from 'react';
import { api, type VoiceCompare, type VoiceCompareResult, type VoiceInfo } from '../api.ts';
import { useApp } from '../App.tsx';

const DEFAULT_TEXT = '잠깐! 청국장덮밥, 이렇게 하면 안 돼요!';

/**
 * 음성 엔진 고르기 + 같은 문장 비교 듣기.
 * - 맛조수 목소리(VoxCPM2): 기본. 맛조수 고유 목소리, 한국어 정식 지원.
 * - VibeVoice(Microsoft): 실험. 빠르지만 한국어는 시험 단계, 기본 목소리 2개만.
 */
export const VoiceEnginePanel: React.FC = () => {
  const { run } = useApp();
  const [info, setInfo] = useState<VoiceInfo | null>(null);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [speaker, setSpeaker] = useState('kr-woman');
  const [cmp, setCmp] = useState<VoiceCompare | null>(null);

  const load = useCallback(async () => {
    const v = await run(api.voiceSettings);
    if (v) {
      setInfo(v);
      setSpeaker(v.vibevoice.speaker);
    }
    const c = await api.voiceCompare().catch(() => null);
    if (c) setCmp(c);
  }, [run]);

  useEffect(() => {
    load();
  }, [load]);

  // 비교 작업이 도는 동안 4초마다 결과 확인
  useEffect(() => {
    if (cmp?.status !== 'running') return;
    const t = setInterval(async () => {
      const c = await api.voiceCompare().catch(() => null);
      if (c) setCmp(c);
    }, 4000);
    return () => clearInterval(t);
  }, [cmp?.status]);

  if (!info) return null;
  const vv = info.vibevoice;

  const choose = async (engine: 'voicestudio' | 'vibevoice', who = speaker) => {
    if (engine === 'vibevoice' && info.engine !== 'vibevoice') {
      const ok = window.confirm('앞으로 만드는 목소리가 VibeVoice(실험)로 바뀝니다.\n맛조수 목소리와 다른 목소리예요. 바꿀까요?');
      if (!ok) return;
    }
    const r = await run(() => api.setVoiceEngine(engine, engine === 'vibevoice' ? who : undefined), engine === 'vibevoice' ? 'VibeVoice(실험)로 바꿨어요' : '맛조수 목소리로 돌아왔어요');
    if (r) load();
  };

  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>목소리 엔진</h2>
        <div className="spacer" />
        <span className="muted small">지금: {info.engine === 'vibevoice' ? `VibeVoice (실험) · ${vv.speakers.find((s) => s.id === vv.speaker)?.label ?? vv.speaker}` : '맛조수 목소리 (VoxCPM2)'}</span>
      </div>

      <div className="engine-options">
        <label className={`engine-option ${info.engine === 'voicestudio' ? 'on' : ''}`}>
          <input type="radio" name="engine" checked={info.engine === 'voicestudio'} onChange={() => choose('voicestudio')} />
          <div>
            <b>맛조수 목소리 · VoxCPM2</b> <span className="badge approved">기본</span>
            <div className="muted small">맛조수 고유 목소리 · 한국어 정식 지원 · 상업 이용 가능. 한 줄 만드는 데 30초~2분.</div>
          </div>
        </label>
        <label className={`engine-option ${info.engine === 'vibevoice' ? 'on' : ''} ${vv.configured ? '' : 'disabled'}`}>
          <input type="radio" name="engine" disabled={!vv.configured} checked={info.engine === 'vibevoice'} onChange={() => choose('vibevoice')} />
          <div>
            <b>VibeVoice · Microsoft</b> <span className="badge review">실험</span>
            <div className="muted small">
              훨씬 빠름. 다만 한국어는 시험 단계이고 기본 목소리 2개만 고를 수 있어요(맛조수 목소리 아님). Microsoft는 연구·개발용으로 권합니다.
              {!vv.configured && ' 이 서버에는 설치되어 있지 않아요.'}
            </div>
          </div>
        </label>
      </div>

      {vv.configured && (
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          VibeVoice 목소리
          <select
            style={{ width: 200 }}
            value={speaker}
            onChange={(e) => {
              setSpeaker(e.target.value);
              if (info.engine === 'vibevoice') choose('vibevoice', e.target.value);
            }}
          >
            {vv.speakers.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
      )}

      <div className="stack" style={{ gap: 8 }}>
        <b>같은 문장 비교 듣기</b>
        <textarea rows={2} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
        <div className="row">
          <button
            className="btn primary"
            disabled={cmp?.status === 'running' || !text.trim()}
            onClick={async () => {
              const c = await run(() => api.startVoiceCompare(text.trim(), speaker));
              if (c) setCmp(c);
            }}
          >
            {cmp?.status === 'running' ? '만드는 중…' : '▶ 두 엔진으로 들어보기'}
          </button>
          <span className="muted small">처음에는 클라우드 GPU가 깨어나느라 1~3분 걸릴 수 있어요.</span>
        </div>
        {cmp && (
          <div className="compare-grid">
            <CompareCell title="맛조수 목소리 (VoxCPM2)" result={cmp.voxcpm} running={cmp.status === 'running'} />
            <CompareCell title={`VibeVoice · ${vv.speakers.find((s) => s.id === cmp.speaker)?.label ?? cmp.speaker}`} result={cmp.vibevoice} running={cmp.status === 'running'} />
            <div className="muted small" style={{ gridColumn: '1 / -1' }}>문장: “{cmp.text}”</div>
          </div>
        )}
      </div>
    </div>
  );
};

const CompareCell: React.FC<{ title: string; result: VoiceCompareResult | null; running: boolean }> = ({ title, result, running }) => (
  <div className="compare-cell">
    <b>{title}</b>
    {!result ? (
      <div className="muted small">{running ? '만드는 중…' : '—'}</div>
    ) : 'error' in result ? (
      <div className="issue warning small">{result.error}</div>
    ) : (
      <>
        <audio controls preload="auto" src={result.url} style={{ width: '100%' }} />
        <div className="muted small">
          길이 {result.seconds}초 · 만드는 데 {result.tookSeconds}초
        </div>
      </>
    )}
  </div>
);
