import fs from 'node:fs';
import path from 'node:path';
import { buildReelPromptPack, canRender, type RecipeInput, type Script } from '@mat-lab/recipe-core';
import { buildBlogPost, buildSocialCopy, buildSrt, buildZip } from '@mat-lab/publishing';
import { buildTimeline, captionGroups, type SceneTiming, type SpeechExtra, type VideoProps } from '@mat-lab/video/timeline';
import { cachedSpeechBounds, extractFrame, normalizeLoudness } from '@mat-lab/video/audio';
import { DATA_DIR } from './config.ts';
import { HttpError, type Repo } from './repo.ts';
import { cachedAudio, measuredWords, synthesize, ttsProvider, voiceIdentity } from './tts.ts';

export const AUDIO_DIR = path.join(DATA_DIR, 'audio');
export const RENDER_DIR = path.join(DATA_DIR, 'renders');

/** 음성 파일 URL. 미리보기(브라우저)는 상대경로, 렌더러는 절대경로를 쓴다. */
const audioUrl = (file: string, origin = '') => `${origin}/media/audio/${path.basename(file)}`;

/** 캐시된 음성이 있으면 그 길이로, 없으면 추정 길이로 미리보기 타임라인을 만든다. */
export async function previewTimeline(script: Script, origin = ''): Promise<{ timings: SceneTiming[]; voiced: boolean }> {
  const provider = await ttsProvider().catch(() => 'none' as const);
  const identity = await voiceIdentity(provider).catch(() => null);
  const audio = script.scenes.map((s) => cachedAudio(s.line, AUDIO_DIR, identity));
  const voiced = audio.every(Boolean);
  // 음성 앞뒤 무음을 잘라 실제 말소리 길이로 장면 길이를 맞춘다 (PDF: 무음 자르기)
  const extras: (SpeechExtra | undefined)[] = [];
  const seconds: (number | null)[] = [];
  for (const [i, a] of audio.entries()) {
    if (!a) {
      extras.push(undefined);
      seconds.push(null);
      continue;
    }
    const bounds = await cachedSpeechBounds(a.file).catch(() => ({ start: 0, end: a.seconds, silent: false }));
    const words = await measuredWords(a.file, script.scenes[i]!.line).catch(() => undefined);
    extras.push({ trimStart: bounds.start, words });
    seconds.push(Math.max(0.3, bounds.end - bounds.start));
  }
  const timings = buildTimeline(
    script,
    seconds,
    audio.map((a) => (a ? audioUrl(a.file, origin) : undefined)),
    extras,
  );
  return { timings, voiced };
}

/** 대본 전 장면의 음성을 만든다 (검수 중에도 들어볼 수 있게 승인 전 허용). */
export async function generateVoice(script: Script): Promise<{ provider: string; generated: number }> {
  const provider = await ttsProvider();
  if (provider === 'none') return { provider, generated: 0 };
  const identity = await voiceIdentity(provider);
  let generated = 0;
  for (const scene of script.scenes) {
    if (!cachedAudio(scene.line, AUDIO_DIR, identity)) generated++;
    const a = await synthesize(scene.line, AUDIO_DIR);
    // 빈 음성(소리 없음)은 지우고 알린다: 영상에서 대사가 통째로 빠지는 것을 막는다
    const bounds = await cachedSpeechBounds(a.file).catch(() => null);
    if (bounds?.silent) {
      fs.rmSync(a.file, { force: true });
      throw new Error(`"${scene.line.slice(0, 20)}…" 대사의 음성이 비어 있습니다. 음성 생성을 다시 눌러 주세요.`);
    }
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
    const raw = path.join(outDir, 'video-raw.mp4');
    await renderer.renderVideo({
      inputProps: props,
      outputLocation: raw,
      onProgress: (p) => set('영상 렌더링', 0.12 + p * 0.7),
    });
    // 숏폼 기준 음량(-14 LUFS)으로 맞춘다
    set('음량 맞추기', 0.83);
    await normalizeLoudness(raw, path.join(outDir, 'video.mp4')).then(
      () => fs.rmSync(raw),
      () => fs.renameSync(raw, path.join(outDir, 'video.mp4')),
    );
    set('자막 확인 프레임', 0.85);
    await captionCheckFrames(path.join(outDir, 'video.mp4'), script, timings, path.join(outDir, 'caption-check')).catch(() => undefined);

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

/** 자막마다 한 장씩 프레임을 뽑아 둔다: 자막이 얼굴을 가리거나 잘리지 않았는지 확인용 */
export async function captionCheckFrames(video: string, script: Script, timings: SceneTiming[], dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const t of timings) {
    const scene = script.scenes.find((s) => s.id === t.sceneId);
    if (!scene) continue;
    for (const g of captionGroups(scene.line, Math.max(1, t.speechFrames), t.words)) {
      n++;
      const at = (t.from + (g.from + g.to) / 2) / 30;
      await extractFrame(video, at, path.join(dir, `${String(n).padStart(2, '0')}-${scene.id}.png`));
    }
  }
  return n;
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
