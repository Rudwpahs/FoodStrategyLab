import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, type VoiceInfo } from '../api.ts';
import { useApp } from '../App.tsx';

/** 맛조수 목소리 설정: VoiceStudio 연결 상태, 목소리 만들기·고르기·들어보기 */
export const VoicePanel: React.FC = () => {
  const { run } = useApp();
  const [info, setInfo] = useState<VoiceInfo | null>(null);
  const [busy, setBusy] = useState('');
  const audio = useRef<HTMLAudioElement>(null);

  const load = useCallback(async () => {
    const v = await run(api.voiceSettings);
    if (v) setInfo(v);
  }, [run]);

  useEffect(() => {
    load();
    // 앱을 켜는 중이면 자동으로 다시 확인
    const t = setInterval(() => {
      if (info?.voicestudio.state !== 'ok') load();
    }, 5000);
    return () => clearInterval(t);
  }, [load, info?.voicestudio.state]);

  if (!info) return <div className="card">목소리 설정 불러오는 중…</div>;
  const vs = info.voicestudio;

  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>맛조수 목소리</h2>
        <span className={`badge ${vs.state === 'ok' ? 'approved' : vs.state === 'starting' ? 'review' : 'draft'}`}>
          {vs.state === 'ok' ? `VoiceStudio 연결됨 (${vs.version})` : vs.state === 'starting' ? 'VoiceStudio 준비 중…' : 'VoiceStudio 꺼짐'}
        </span>
        <div className="spacer" />
        <span className="muted small">지금 쓰는 음성: {info.describe}</span>
      </div>

      {vs.state === 'offline' && (
        <div className="issue info">
          VoiceStudio 앱을 켜 주세요. 아직 설치하지 않았다면{' '}
          <a href="https://github.com/debpalash/VoiceStudio/releases/latest" target="_blank" rel="noreferrer">여기서 Windows 설치 파일(.exe)</a>을 받아 설치하세요.
          앱이 켜지면 이 화면이 자동으로 바뀝니다.
        </div>
      )}
      {vs.state === 'starting' && <div className="issue warning">VoiceStudio가 모델을 불러오는 중입니다. 처음 켤 때는 몇 분 걸릴 수 있습니다.</div>}

      {vs.state === 'ok' && info.engines && !info.engines.chosen && (
        <div className="issue warning">
          상업적으로 쓸 수 있는 음성 엔진이 없습니다. VoiceStudio 기본 엔진(OmniVoice)은 비상업 라이선스라 채널용으로 쓰지 않습니다.
          VoiceStudio 앱의 <b>Model Catalogue</b>에서 <b>VoxCPM2</b>(Apache-2.0, 한국어·목소리 디자인 지원)를 설치해 주세요.
        </div>
      )}
      {vs.state === 'ok' && info.engines?.chosen && (
        <div className="muted small">
          음성 엔진: <b>{info.engines.chosen}</b> (상업 이용 가능 라이선스). VoiceStudio 기본 엔진 OmniVoice는 비상업 라이선스라 쓰지 않습니다.
        </div>
      )}

      {vs.state === 'ok' && (
        <>
          <div className="row">
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
                {info.profiles.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              disabled={!!busy}
              onClick={async () => {
                setBusy('design');
                const r = await run(() => api.designVoice());
                setBusy('');
                if (r) {
                  await load();
                  run(async () => undefined, r.created ? '맛조수 목소리를 만들었습니다' : '이미 있는 맛조수 목소리를 골랐습니다');
                }
              }}
            >
              {busy === 'design' ? '만드는 중… (GPU 없으면 몇 분)' : '맛조수 목소리 자동으로 만들기'}
            </button>
            <button
              className="btn primary"
              disabled={!!busy}
              onClick={async () => {
                setBusy('sample');
                const r = await run(() => api.voiceSample());
                setBusy('');
                if (r && audio.current) {
                  audio.current.src = r.url;
                  audio.current.play().catch(() => undefined);
                }
              }}
            >
              {busy === 'sample' ? '만드는 중…' : '▶ 들어보기'}
            </button>
            <audio ref={audio} controls style={{ height: 36 }} />
          </div>
          <div className="muted small">
            '자동으로 만들기'는 VoxCPM2 목소리 디자인으로 밝고 높은 톤의 기준 녹음을 만든 뒤, 그 녹음을 '맛조수' 프로필로 저장합니다(모든 대사가 같은 목소리). 마음에 안 들면 VoiceStudio 앱의 목소리 디자인에서
            직접 다듬거나 새로 만든 뒤 여기서 고르세요. 목소리를 바꾸면 영상 단계에서 '음성 생성'을 다시 누르세요.
          </div>
        </>
      )}
    </div>
  );
};
