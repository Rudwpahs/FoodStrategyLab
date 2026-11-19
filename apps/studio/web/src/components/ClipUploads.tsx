import React from 'react';
import { SHOT_TIPS, clipGroups, josa, shotList } from '@mat-lab/recipe-core';
import { api, type ProjectDetail } from '../api.ts';
import { useApp } from '../App.tsx';
import { PHOTO_ACCEPT } from '../heic.ts';
import { PHONE_CLIP_ACCEPT, prepareClipFile } from '../clipFile.ts';
import { Fold } from './Fold.tsx';

const Thumb: React.FC<{ media?: { url: string; kind: 'video' | 'image' }; label: React.ReactNode }> = ({ media, label }) => (
  <div className="clip-thumb">
    {media?.kind === 'video' && <video src={media.url} muted playsInline preload="metadata" />}
    {media?.kind === 'image' && <img src={media.url} alt="" />}
    {!media && label}
  </div>
);

/**
 * 실제 촬영 영상 넣기. 영상 묶음(약 8초)마다 휴대폰으로 찍을 장면(촬영 목록)을 보여 주고, 찍은 영상을 바로 올린다.
 * 올린 영상은 그 묶음에서 3D 대신 화면을 꽉 채우고, 촬영 소리는 목소리 밑에 작게 깔리며, 맛조수는 왼쪽 아래에서 말한다.
 * 생성 AI 클립(프롬프트 팩으로 만든 것)은 아래 접힌 칸에서 올린다 (소리는 끈다).
 */
export const ClipUploads: React.FC<{ project: ProjectDetail; setProject: (p: ProjectDetail) => void }> = ({ project, setProject }) => {
  const { run } = useApp();
  const script = project.latest?.script;
  if (!script) return null;
  const shots = shotList(script, project.recipe);
  const byId = new Map(script.scenes.map((s) => [s.id, s]));
  const count = Object.keys(project.sceneMedia).length;

  const upload = async (sceneId: string, picked: File, label: string, source?: 'ai') => {
    const p = await run(async () => api.uploadSceneMedia(project.id, sceneId, await prepareClipFile(picked), source), `${josa(label, '을/를')} 넣었어요. 미리보기에서 확인해 보세요`);
    if (p) setProject(p);
  };
  const remove = async (sceneId: string, label: string) => {
    const p = await run(() => api.deleteSceneMedia(project.id, sceneId), `${josa(label, '을/를')} 뺐어요 (3D 장면으로 돌아가요)`);
    if (p) setProject(p);
  };

  return (
    <div className="stack">
      <div className="issue info">
        <b>진짜 음식이 보이면 더 끝까지 봐요.</b> 아래 목록대로 휴대폰으로 짧게 찍어 올리면, 그 부분은 3D 대신 촬영 영상이 화면을 채우고
        맛조수는 왼쪽 아래 작은 원에서 이야기를 이어 가요. 다 찍지 않아도 돼요. 하나만 올려도 좋아요.
      </div>
      <ul className="shot-tips small">
        {SHOT_TIPS.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <div className="muted small">
        <b>{count > 0 ? `${count}개 넣음` : '아직 모두 3D 장면'}</b> · 영상을 바꾸면 영상을 다시 만들고 한 번 더 확인해 주세요.
      </div>
      {shots.map((shot) => {
        const sceneId = shot.sceneIds[0]!;
        const media = project.sceneMedia[sceneId];
        const label = `촬영 ${shot.group}`;
        return (
          <div key={sceneId} className="scene shot-row">
            <Thumb media={media} label={<span className="shot-num">{shot.group}</span>} />
            <div className="shot-body">
              <div>
                <b>
                  {shot.group}. {shot.title}
                </b>{' '}
                <span className="muted small">· {shot.seconds}초쯤</span>
              </div>
              <div>{shot.instruction}</div>
              {shot.quote.length > 0 && (
                <details className="small">
                  <summary>{shot.kind === 'step' ? '원본 조리 순서 보기' : shot.kind === 'ingredients' ? '원본 재료 보기' : '연구자 노트 보기'}</summary>
                  <ol className="shot-quote">
                    {shot.quote.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ol>
                </details>
              )}
              <div className="muted small">요령: {shot.tip}</div>
              <div className="muted small ellipsis">대사: “{shot.sceneIds.map((id) => byId.get(id)?.line).join(' ')}”</div>
              <div className="row">
                <label className={`btn small ${media ? '' : 'primary'}`}>
                  {media ? '바꾸기' : '촬영 영상 넣기'}
                  <input
                    type="file"
                    accept={PHONE_CLIP_ACCEPT}
                    className="sr-only"
                    aria-label={`${label} ${media ? '바꾸기' : '넣기'}`}
                    onChange={async (e) => {
                      const picked = e.target.files?.[0];
                      e.target.value = '';
                      if (picked) await upload(sceneId, picked, label);
                    }}
                  />
                </label>
                {media && (
                  <button className="btn small ghost" onClick={() => remove(sceneId, label)}>
                    빼기
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <Fold title="생성 AI 클립 넣기 (고급)">
        <AiClipUploads project={project} upload={upload} remove={remove} />
      </Fold>
    </div>
  );
};

/** 생성 AI 클립: 클립 번호는 'AI 영상 프롬프트 팩'과 같다. 대사가 섞여 있을 수 있어 소리는 끄고 검수된 목소리·자막을 입힌다 */
const AiClipUploads: React.FC<{
  project: ProjectDetail;
  upload: (sceneId: string, picked: File, label: string, source?: 'ai') => Promise<void>;
  remove: (sceneId: string, label: string) => Promise<void>;
}> = ({ project, upload, remove }) => {
  const script = project.latest!.script;
  const index = new Map(script.scenes.map((s, i) => [s.id, i + 1]));
  return (
    <>
      <div className="muted small">
        [게시·기록]의 AI 영상 프롬프트 팩으로 만든 클립(MP4)이나 첫 프레임 이미지를 같은 번호에 넣으세요. 클립 소리는 끄고 검수된 목소리와 자막을 입혀요. 위의 촬영 영상과 같은 칸을 써서, 넣으면 그 칸의 영상이 바뀌어요.
      </div>
      {clipGroups(script).map((ids, gi) => {
        const firstId = ids[0]!;
        const media = project.sceneMedia[firstId];
        const range = ids.map((id) => index.get(id)!);
        const label = `클립 ${gi + 1}`;
        return (
          <div key={firstId} className="scene clip-row">
            <Thumb media={media} label="3D" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{label}</b> <span className="muted small">장면 {range[0]}{range.length > 1 ? `–${range.at(-1)}` : ''}</span>
            </div>
            <label className="btn small">
              {media ? '바꾸기' : '넣기'}
              <input
                type="file"
                accept={`video/mp4,video/webm,${PHOTO_ACCEPT}`}
                className="sr-only"
                aria-label={`${label} ${media ? '바꾸기' : '넣기'}`}
                onChange={async (e) => {
                  const picked = e.target.files?.[0];
                  e.target.value = '';
                  if (picked) await upload(firstId, picked, label, 'ai');
                }}
              />
            </label>
            {media && (
              <button className="btn small ghost" onClick={() => remove(firstId, label)}>
                빼기
              </button>
            )}
          </div>
        );
      })}
    </>
  );
};
