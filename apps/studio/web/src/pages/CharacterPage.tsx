import React, { useEffect, useState } from 'react';
import { BRAND, EMOTIONS, EMOTION_LABELS, brandDescription } from '@mat-lab/recipe-core';
import { COLORS, Character } from '@mat-lab/video';
import { useApp } from '../App.tsx';
import { VoiceEnginePanel } from '../components/VoiceEnginePanel.tsx';
import { VoicePanel } from '../components/VoicePanel.tsx';

/** 30fps 프레임 카운터 (캐릭터 애니메이션 미리보기용) */
function useFrame() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let id = 0;
    const loop = (t: number) => {
      setFrame(Math.floor(((t - start) / 1000) * 30));
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  return frame;
}

export const CharacterPage: React.FC = () => {
  const frame = useFrame();
  const { meta } = useApp();
  const [talking, setTalking] = useState(false);

  return (
    <div className="stack">
      <div className="row">
        <div>
          <h1>{BRAND.character} (가칭) · 브랜드 가이드</h1>
          <div className="muted">귀엽지만 유치하지 않은 조리 연구소 조수. 성급하고 궁금한 게 많아 가끔 실수하고, 시청자 대신 질문합니다.</div>
        </div>
        <div className="spacer" />
        <label className="check" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={talking} onChange={(e) => setTalking(e.target.checked)} /> 말하는 입 모양 보기
        </label>
      </div>

      <VoicePanel />
      <VoiceEnginePanel />

      <div className="chars">
        {EMOTIONS.map((e) => (
          <div className="card" key={e}>
            <Character emotion={e} frame={frame} talking={talking} size={200} />
            <h3 style={{ marginTop: 8 }}>{EMOTION_LABELS[e]}</h3>
            <div className="muted small">{e}</div>
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="card stack">
          <h2>영상 브랜딩 규칙</h2>
          <div className="line"><b>오프닝</b>"{BRAND.openingLine}"</div>
          <div className="line"><b>중간</b>"{BRAND.notePhrase}에 따르면…"</div>
          <div className="line"><b>엔딩</b>"{BRAND.tipPhrase}"</div>
          <div className="line"><b>설명</b>{brandDescription(true)}</div>
          <div className="muted small">'검토한' 표현은 실제 승인이 끝난 콘텐츠에만 자동으로 들어갑니다.</div>
        </div>
        <div className="card stack">
          <h2>고정 규격</h2>
          <div className="swatches">
            {Object.entries(COLORS).slice(0, 8).map(([name, hex]) => (
              <span className="swatch" key={name}><i style={{ background: hex }} />{hex}</span>
            ))}
          </div>
          <div className="small">
            글꼴: Pretendard (OFL, 상업 이용 가능) · 영상: 1080×1920, 30fps<br />
            목소리: {meta ? meta.tts.voice : '…'}
          </div>
          <div className="muted small">
            캐릭터는 코드로 그린 SVG라 매 영상에서 모양이 바뀌지 않습니다. 측면·3/4 시점 시트와 2D 리깅은 다음 단계 과제입니다.
          </div>
        </div>
      </div>
    </div>
  );
};
