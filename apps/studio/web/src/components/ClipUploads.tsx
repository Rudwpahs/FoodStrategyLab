import React from 'react';
import { clipGroups } from '@mat-lab/recipe-core';
import { api, type ProjectDetail } from '../api.ts';
import { useApp } from '../App.tsx';
import { PHOTO_ACCEPT, heicToJpeg } from '../heic.ts';

/**
 * 생성 AI 클립 올리기. 클립 번호는 'AI 영상 프롬프트 팩'과 같다 (약 8초 묶음).
 * 올린 클립은 3D 장면 대신 나오고, 목소리·자막·브랜드 카드는 스튜디오 것이 입혀진다.
 */
export const ClipUploads: React.FC<{ project: ProjectDetail; setProject: (p: ProjectDetail) => void }> = ({ project, setProject }) => {
  const { run } = useApp();
  const script = project.latest?.script;
  if (!script) return null;
  const byId = new Map(script.scenes.map((s, i) => [s.id, { scene: s, index: i + 1 }]));
  const groups = clipGroups(script);
  const count = Object.keys(project.sceneMedia).length;
  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>생성 AI 클립 (선택)</h2>
        <span className="muted small">{count > 0 ? `${count}개 사용 중` : '모두 3D 장면'}</span>
      </div>
      <div className="muted small">
        [블로그·내보내기]의 AI 영상 프롬프트 팩으로 ChatGPT·Gemini에서 만든 클립(MP4)이나 첫 프레임 이미지를 같은 번호에 올리세요. 클립 소리는 끄고 검수된 목소리와 자막을 입힙니다.
        클립을 바꾸면 최종 영상을 다시 만들고 한 번 더 확인하세요.
      </div>
      {groups.map((ids, gi) => {
        const firstId = ids[0]!;
        const media = project.sceneMedia[firstId];
        const range = ids.map((id) => byId.get(id)!.index);
        return (
          <div key={firstId} className="scene" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 72, height: 128, flex: 'none', borderRadius: 10, overflow: 'hidden', background: '#2b2321', border: '2px solid var(--ink)' }}>
              {media?.kind === 'video' && <video src={media.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              {media?.kind === 'image' && <img src={media.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              {!media && <div style={{ color: '#fff', fontSize: 12, textAlign: 'center', paddingTop: 52 }}>3D</div>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>클립 {gi + 1}</b> <span className="muted small">장면 {range[0]}{range.length > 1 ? `–${range.at(-1)}` : ''}</span>
              {ids.map((id) => (
                <div key={id} className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  “{byId.get(id)!.scene.line}”
                </div>
              ))}
            </div>
            <label className="btn small">
              {media ? '바꾸기' : '올리기'}
              <input
                type="file"
                accept={`video/mp4,video/webm,${PHOTO_ACCEPT}`}
                hidden
                onChange={async (e) => {
                  const picked = e.target.files?.[0];
                  e.target.value = '';
                  if (!picked) return;
                  const p = await run(async () => api.uploadSceneMedia(project.id, firstId, await heicToJpeg(picked)), `클립 ${gi + 1}을 올렸습니다`);
                  if (p) setProject(p);
                }}
              />
            </label>
            {media && (
              <button className="btn small ghost" onClick={async () => {
                const p = await run(() => api.deleteSceneMedia(project.id, firstId), `클립 ${gi + 1}을 지웠습니다 (3D로 돌아감)`);
                if (p) setProject(p);
              }}>삭제</button>
            )}
          </div>
        );
      })}
    </div>
  );
};
