import React, { useEffect, useState } from 'react';
import { BRAND, DEFAULT_PERSONA, EMOTIONS, EMOTION_LABELS, brandDescription, personaProfile } from '@mat-lab/recipe-core';
import { COLORS, Character } from '@mat-lab/video';
import { useApp } from '../App.tsx';
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

/** 감정별 캐릭터 미리보기. 매 프레임 이 칸만 다시 그린다 (목소리 설정 화면까지 다시 그리지 않게) */
const CharacterGrid: React.FC<{ talking: boolean }> = ({ talking }) => {
  const frame = useFrame();
  return (
    <div className="chars">
      {EMOTIONS.map((e) => (
        <div className="char" key={e}>
          <Character emotion={e} frame={frame} talking={talking} size={180} />
          <div className="char-name">{EMOTION_LABELS[e]}</div>
        </div>
      ))}
    </div>
  );
};

/** 사용자가 고른 성격 (persona.ts 기본값 lab-notes): 한 줄 소개·핵심 특징·늘 지키는 것. 글은 대본 프롬프트와 같은 곳에서 온다 */
const profile = personaProfile(DEFAULT_PERSONA);

export const CharacterPage: React.FC = () => {
  const { meta } = useApp();
  const [talking, setTalking] = useState(false);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>
            {BRAND.character} <span className="tentative">(가칭)</span>
          </h1>
          <div className="lead">{profile.oneLine}</div>
        </div>
      </div>

      <section className="card stack" aria-label="성격">
        <div className="card-head">
          <h2>성격</h2>
          <span className="muted">{profile.label}</span>
        </div>
        {profile.traits.map((t) => (
          <div className="line" key={t.name}>
            <b>{t.name}</b>
            <div>{t.text}</div>
          </div>
        ))}
        <div className="small">
          <b>늘 지키는 것</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            {profile.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </section>

      <VoicePanel />

      <section className="card stack" aria-label="표정">
        <div className="card-head">
          <h2>표정 {EMOTIONS.length}가지</h2>
          <span className="muted">대사마다 하나씩 골라 쓰여요</span>
          <div className="spacer" />
          <label className={`check small ${talking ? 'on' : ''}`} style={{ padding: '6px 12px' }}>
            <input type="checkbox" checked={talking} onChange={(e) => setTalking(e.target.checked)} /> 말하는 입 모양 보기
          </label>
        </div>
        <CharacterGrid talking={talking} />
      </section>

      <div className="grid2">
        <section className="card stack" aria-label="영상 브랜딩 규칙">
          <h2>영상 브랜딩 규칙</h2>
          <div className="line"><b>시리즈</b><div>"{BRAND.series}"</div></div>
          <div className="line"><b>원리</b><div>화면 카드 "{BRAND.notePhrase}"</div></div>
          <div className="line"><b>팁</b><div>화면 카드 "{BRAND.tipPhrase}"</div></div>
          <div className="line"><b>엔딩</b><div>마지막 대사에 "{BRAND.labName}"을 한 번만</div></div>
          <div className="line"><b>설명</b><div>{brandDescription(true)}</div></div>
          <div className="muted small">원리·팁 장면의 첫마디와 엔딩 문장은 한 문장으로 고정하지 않고 레시피마다 달라져요 (같은 말이 영상마다 되풀이되지 않게).</div>
          <div className="muted small">'검토한' 표현은 실제 승인이 끝난 콘텐츠에만 자동으로 들어가요.</div>
        </section>
        <section className="card stack" aria-label="고정 규격">
          <h2>고정 규격</h2>
          <div className="swatches">
            {Object.entries(COLORS).slice(0, 8).map(([name, hex]) => (
              <span className="swatch" key={name}><i style={{ background: hex }} />{hex}</span>
            ))}
          </div>
          <div className="small">
            글꼴 Pretendard (OFL, 상업 이용 가능) · 영상 1080×1920, 30fps
            <br />
            목소리 {meta ? meta.tts.voice : '…'}
          </div>
          <div className="muted small">
            맛조수는 코드로 그린 그림이라 영상마다 모양이 바뀌지 않아요. 옆모습·3/4 시점과 2D 리깅은 다음 단계 과제예요.
          </div>
        </section>
      </div>
    </div>
  );
};
