import fs from 'node:fs';
import path from 'node:path';
import { buildReelPromptPack, canRender, type RecipeInput, type Script } from '@mat-lab/recipe-core';
import { buildBlogPost, buildSocialCopy, buildSrt, buildZip } from '@mat-lab/publishing';
import { buildTimeline, type SceneTiming, type VideoProps } from '@mat-lab/video/timeline';
import { DATA_DIR } from './config.ts';
import { HttpError, type Repo } from './repo.ts';
import { cachedAudio, synthesize, ttsProvider } from './tts.ts';

export const AUDIO_DIR = path.join(DATA_DIR, 'audio');
export const RENDER_DIR = path.join(DATA_DIR, 'renders');

/** 음성 파일 URL. 미리보기(브라우저)는 상대경로, 렌더러는 절대경로를 쓴다. */
const audioUrl = (file: string, origin = '') => `${origin}/media/audio/${path.basename(file)}`;

/** 캐시된 음성이 있으면 그 길이로, 없으면 추정 길이로 미리보기 타임라인을 만든다. */
export async function previewTimeline(script: Script, origin = ''): Promise<{ timings: SceneTiming[]; voiced: boolean }> {
  const provider = await ttsProvider().catch(() => 'none' as const);
  const audio = script.scenes.map((s) => cachedAudio(s.line, AUDIO_DIR, provider));
  const voiced = audio.every(Boolean);
  const timings = buildTimeline(
    script,
    audio.map((a) => a?.seconds ?? null),
    audio.map((a) => (a ? audioUrl(a.file, origin) : undefined)),
  );
  return { timings, voiced };
}

/** 대본 전 장면의 음성을 만든다 (검수 중에도 들어볼 수 있게 승인 전 허용). */
export async function generateVoice(script: Script): Promise<{ provider: string; generated: number }> {
  const provider = await ttsProvider();
  if (provider === 'none') return { provider, generated: 0 };
  let generated = 0;
  for (const scene of script.scenes) {
    if (!cachedAudio(scene.line, AUDIO_DIR, provider)) generated++;
    await synthesize(scene.line, AUDIO_DIR);
  }
  return { provider, generated };
}

type VideoRenderer = typeof import('@mat-lab/video/render');
let rendererPromise: Promise<VideoRenderer> | null = null;
// 렌더러(웹팩·크롬)는 무거우므로 처음 제작할 때 불러온다.
const loadRenderer = () => (rendererPromise ??= import('@mat-lab/video/render'));

let queue: Promise<unknown> = Promise.resolve();

/** 승인된 최신 대본으로 영상·이미지·블로그·게시 묶음을 만든다. 한 번에 하나씩 처리한다. */
export function startRender(repo: Repo, projectId: number, origin: string): number {
  const state = repo.versionState(projectId);
  const gate = canRender(state);
  if (!gate.ok) throw new HttpError(409, gate.reason);
  const version = state.latestScriptVersion!;
  const renderId = repo.createRender(projectId, version);
  repo.logEvent(projectId, 'render', `제작 시작 (대본 v${version}, 작업 #${renderId})`);
  queue = queue.then(() => runRender(repo, projectId, version, renderId, origin));
  return renderId;
}

async function runRender(repo: Repo, projectId: number, version: number, renderId: number, origin: string) {
  const outDir = path.join(RENDER_DIR, String(renderId));
  const set = (stage: string, progress: number) => repo.updateRender(renderId, { status: 'running', stage, progress, outputDir: outDir });
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const recipe = repo.getRecipe(projectId);
    const { script } = repo.getScript(projectId, version);
    const approval = repo.lastReview(projectId, version);
    if (approval?.decision !== 'approved') throw new Error('승인이 취소되어 제작을 중단했습니다.');

    set('음성 생성', 0.02);
    await generateVoice(script);
    const { timings } = await previewTimeline(script, origin);
    const photo = repo.getPhoto(projectId);
    const props: VideoProps = {
      script,
      timings,
      reviewed: true,
      recipe,
      photoUrl: photo ? `${origin}${photo.url}` : undefined,
      photoColor: photo?.color || undefined,
      sceneMedia: Object.fromEntries(Object.entries(repo.getSceneMedia(projectId)).map(([k, m]) => [k, { kind: m.kind, url: `${origin}${m.url}` }])),
    };

    set('렌더러 준비', 0.08);
    const renderer = await loadRenderer();
    await renderer.getServeUrl();

    set('영상 렌더링', 0.12);
    await renderer.renderVideo({
      inputProps: props,
      outputLocation: path.join(outDir, 'video.mp4'),
      onProgress: (p) => set('영상 렌더링', 0.12 + p * 0.73),
    });

    set('썸네일·레시피 카드', 0.86);
    const cover = { title: recipe.topic, emotion: 'joy' as const, recipe, photoColor: photo?.color || undefined };
    await renderer.renderStillImage('Cover', cover, path.join(outDir, 'cover.png'));
    await renderer.renderStillImage('SquareThumb', cover, path.join(outDir, 'thumbnail.png'));
    await renderer.renderStillImage('RecipeCard', { recipe, reviewed: true }, path.join(outDir, 'recipe-card.png'));

    set('블로그·게시 묶음', 0.95);
    if (photo) fs.copyFileSync(path.join(DATA_DIR, photo.file), path.join(outDir, `photo${path.extname(photo.file)}`));
    writePackage(outDir, recipe, script, timings, { reviewer: approval.reviewer, reviewedAt: approval.createdAt });

    repo.updateRender(renderId, { status: 'done', stage: '완료', progress: 1, finished: true });
    repo.logEvent(projectId, 'render', `제작 완료 (작업 #${renderId})`);
  } catch (e) {
    const message = (e as Error).message || String(e);
    repo.updateRender(renderId, { status: 'failed', error: message, finished: true });
    repo.logEvent(projectId, 'error', `제작 실패 (작업 #${renderId}): ${message}`);
  }
}

export function writePackage(outDir: string, recipe: RecipeInput, script: Script, timings: SceneTiming[], review: { reviewer: string; reviewedAt: string }) {
  const post = buildBlogPost({ recipe, review, images: { thumbnail: 'thumbnail.png', recipeCard: 'recipe-card.png' } });
  const social = buildSocialCopy(recipe, true, post.tags);
  const texts: Record<string, string> = {
    'blog.md': post.markdown,
    'blog.html': `<!doctype html><meta charset="utf-8"><title>${post.title}</title>\n${post.html}`,
    'captions.srt': buildSrt(script, timings),
    'instagram.txt': social.instagram,
    'youtube.txt': `${social.youtubeTitle}\n\n${social.youtubeDescription}`,
    'script.json': JSON.stringify(script, null, 2),
    'ai-prompts.md': buildReelPromptPack(recipe, script).markdown,
  };
  for (const [name, text] of Object.entries(texts)) fs.writeFileSync(path.join(outDir, name), text);
  const files: Record<string, Uint8Array | string> = { ...texts };
  for (const name of fs.readdirSync(outDir)) {
    if (/\.(mp4|png|jpe?g|webp)$/.test(name)) files[name] = fs.readFileSync(path.join(outDir, name));
  }
  fs.writeFileSync(path.join(outDir, 'package.zip'), buildZip(files));
}
