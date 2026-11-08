import fs from 'node:fs';
import path from 'node:path';
import { buildReelPromptPack, instagramCaption, type RecipeInput, type Script } from '@mat-lab/recipe-core';
import { BLOG_STYLES, buildBlogPost, buildExpertBlog, buildSocialCopy, buildSrt, buildZip, polishPost, type BlogStyle, type ExpertNotes } from '@mat-lab/publishing';
import { buildTimeline, captionGroups, type SceneTiming, type SpeechExtra, type VideoProps } from '@mat-lab/video/timeline';
import { audioDb, cachedSpeechBounds, extractFrame, frameBrightness, normalizeLoudness, removeAudioWithCache, toJpeg } from '@mat-lab/video/audio';
import { QA_STEP, auditAudio, auditFrames, lineMatch, type QaIssue, type QaReport } from '@mat-lab/video/qa';
import { recipeCardPages } from '@mat-lab/video/cards';
import { DATA_DIR } from './config.ts';
import { HttpError, type Repo } from './repo.ts';
import { withRenderToken } from './auth.ts';
import { cachedAudio, measuredWords, synthesize, transcribeAudio, ttsProvider, voiceIdentity } from './tts.ts';

export const AUDIO_DIR = path.join(DATA_DIR, 'audio');
export const RENDER_DIR = path.join(DATA_DIR, 'renders');

/** 음성 파일 URL. 미리보기(브라우저)는 상대경로, 렌더러는 절대경로를 쓴다. */
const audioUrl = (file: string, origin = '') => renderUrl(origin, `/media/audio/${path.basename(file)}`);
/** 렌더러용 주소(origin이 있을 때)에는 비밀 열쇠를 붙인다. 브라우저 미리보기는 로그인 쿠키로 받는다. */
const renderUrl = (origin: string, url: string) => (origin ? withRenderToken(`${origin}${url}`) : url);

/** 캐시된 음성이 있으면 그 길이로, 없으면 추정 길이로 미리보기 타임라인을 만든다. */
export async function previewTimeline(script: Script, origin = '', opts: { fullLength?: Set<string> } = {}): Promise<{ timings: SceneTiming[]; voiced: boolean }> {
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
    // 자동 검사에서 끝이 잘렸던 장면은 말소리 측정 대신 음성 파일 끝까지 쓴다
    const full = opts.fullLength?.has(script.scenes[i]!.id) ? a.seconds - bounds.start + 0.1 : 0;
    seconds.push(Math.max(0.3, bounds.end - bounds.start, full));
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
export async function generateVoice(script: Script, shouldStop: () => boolean = () => false): Promise<{ provider: string; generated: number }> {
  const provider = await ttsProvider();
  if (provider === 'none') return { provider, generated: 0 };
  const identity = await voiceIdentity(provider);
  let generated = 0;
  for (const scene of script.scenes) {
    if (shouldStop()) throw new RenderCanceled();
    if (!cachedAudio(scene.line, AUDIO_DIR, identity)) generated++;
    const a = await synthesize(scene.line, AUDIO_DIR);
    // 빈 음성(소리 없음)은 지우고 알린다: 영상에서 대사가 통째로 빠지는 것을 막는다
    const bounds = await cachedSpeechBounds(a.file).catch(() => null);
    if (bounds?.silent) {
      removeAudioWithCache(a.file);
      throw new Error(`"${scene.line.slice(0, 20)}…" 대사의 음성이 비어 있습니다. 음성 생성을 다시 눌러 주세요.`);
    }
  }
  return { provider, generated };
}

/** 후보 미리보기용 목소리 작업 (콘텐츠마다 하나) */
export interface CandidateVoiceJob {
  status: 'running' | 'done' | 'failed';
  done: number;
  total: number;
  error: string;
}
const candidateVoiceJobs = new Map<number, CandidateVoiceJob>();
export const candidateVoiceJob = (projectId: number) => candidateVoiceJobs.get(projectId) ?? null;

/**
 * 후보 영상 여러 개의 대사에 맛조수 목소리를 넣는다 (미리보기에서 바로 들을 수 있게).
 * 같은 문장은 한 번만 만들고(캐시), 받아쓰기(어절 시간)까지 미리 해 둔다.
 * 영상(MP4)은 만들지 않는다: 미리보기는 브라우저가 그리고, 고른 후보 하나만 서버에서 렌더한다.
 */
export function startCandidateVoices(projectId: number, scripts: Script[], keepAliveOrigin?: string): CandidateVoiceJob {
  const running = candidateVoiceJobs.get(projectId);
  if (running?.status === 'running') return running;
  // 장면 순서대로: 모든 후보의 첫 장면(훅)을 먼저 → 후보마다 첫 대사부터 목소리가 들린다
  const longest = Math.max(0, ...scripts.map((s) => s.scenes.length));
  const ordered: string[] = [];
  for (let i = 0; i < longest; i++) for (const s of scripts) if (s.scenes[i]) ordered.push(s.scenes[i]!.line);
  const lines = [...new Set(ordered)];
  const job: CandidateVoiceJob = { status: 'running', done: 0, total: lines.length, error: '' };
  candidateVoiceJobs.set(projectId, job);
  const stopKeepAlive = keepAliveOrigin ? keepAwake(keepAliveOrigin) : () => undefined;
  void (async () => {
    try {
      const provider = await ttsProvider();
      if (provider === 'none') throw new Error('목소리 도구가 연결되지 않았어요. 목소리 없이 미리보기만 보여 드려요.');
      // 여러 줄을 동시에 만든다 (클라우드에서는 GPU 여러 대가 나눠 맡는다)
      const parallel = Math.max(1, Number(process.env.VOICE_PARALLEL) || 1);
      let next = 0;
      const worker = async () => {
        while (next < lines.length) {
          const line = lines[next++]!;
          const a = await synthesize(line, AUDIO_DIR);
          const bounds = await cachedSpeechBounds(a.file).catch(() => null);
          if (bounds?.silent) {
            removeAudioWithCache(a.file);
            throw new Error(`"${line.slice(0, 20)}…" 대사의 음성이 비어 있어요. 다시 시도해 주세요.`);
          }
          await measuredWords(a.file, line).catch(() => undefined);
          job.done++;
        }
      };
      await Promise.all(Array.from({ length: Math.min(parallel, lines.length) }, worker));
      job.status = 'done';
    } catch (e) {
      job.status = 'failed';
      job.error = (e as Error).message || '목소리를 만들지 못했어요.';
    } finally {
      stopKeepAlive();
    }
  })();
  return job;
}

type VideoRenderer = typeof import('@mat-lab/video/render');
let rendererPromise: Promise<VideoRenderer> | null = null;
// 렌더러(웹팩·크롬)는 무거우므로 처음 제작할 때 불러온다.
const loadRenderer = () => (rendererPromise ??= import('@mat-lab/video/render'));

let queue: Promise<unknown> = Promise.resolve();

class RenderCanceled extends Error {
  constructor() {
    super('취소했어요');
  }
}

/** 진행 중인 제작 작업의 취소 손잡이 */
const jobs = new Map<number, { canceled: boolean; cancelRemotion?: () => void }>();

/**
 * 제작을 취소한다. 대기 중이면 시작하지 않고, 진행 중이면 다음 단계 전에 멈춘다 (렌더 중이면 바로 멈춤).
 */
export function cancelRender(repo: Repo, renderId: number) {
  const r = repo.getRender(renderId);
  if (r.status !== 'queued' && r.status !== 'running') throw new HttpError(409, '이미 끝난 작업이에요.');
  const job = jobs.get(renderId) ?? { canceled: false };
  job.canceled = true;
  job.cancelRemotion?.();
  jobs.set(renderId, job);
  if (r.status === 'queued') repo.updateRender(renderId, { status: 'canceled', stage: '취소됨', finished: true });
  repo.logEvent(r.projectId, 'render', `제작 취소 (작업 #${renderId})`);
}

/**
 * 최신 대본으로 영상·이미지를 만든다. 한 번에 하나씩 처리한다.
 * 승인 전에도 '검수용'으로 만들 수 있다: 연구자가 실제 영상을 보고 승인하도록.
 * 내보내기(ZIP)·게시는 승인된 최신 대본으로 만든 영상만 가능하다 (exportPackage).
 */
export function startRender(repo: Repo, projectId: number, origin: string, keepAliveOrigin?: string): number {
  const state = repo.versionState(projectId);
  if (state.latestScriptVersion === null) throw new HttpError(409, '대본이 아직 없습니다.');
  const busy = repo.getProject(projectId).renders.find((r) => r.status === 'queued' || r.status === 'running');
  if (busy) throw new HttpError(409, `이미 만들고 있는 영상이 있어요 (작업 #${busy.id}). 끝나거나 취소한 뒤 다시 눌러 주세요.`);
  const version = state.latestScriptVersion;
  const approved = state.approvedScriptVersion === version;
  const renderId = repo.createRender(projectId, version);
  repo.logEvent(projectId, 'render', `${approved ? '제작' : '검수용 제작'} 시작 (대본 v${version}, 작업 #${renderId})`);
  queue = queue.then(async () => {
    const stopKeepAlive = keepAliveOrigin ? keepAwake(keepAliveOrigin) : () => undefined;
    try {
      await runRender(repo, projectId, version, renderId, origin);
    } finally {
      stopKeepAlive();
    }
  });
  return renderId;
}

/**
 * 클라우드 서버(Modal)는 요청이 한동안 없으면 잠든다.
 * 휴대폰 앱을 닫아도 제작이 끝까지 가도록, 제작하는 동안 1분마다 공개 주소로 스스로를 부른다.
 */
export function keepAwake(publicOrigin: string, everyMs = Number(process.env.KEEPALIVE_MS) || 60_000): () => void {
  const ping = () => fetch(`${publicOrigin}/api/health`, { signal: AbortSignal.timeout(30_000) }).catch(() => undefined);
  void ping();
  const timer = setInterval(ping, everyMs);
  return () => clearInterval(timer);
}

/** 내부 오류 문장 → 사용자에게 보여 줄 쉬운 문장 */
export function friendlyRenderError(message: string): string {
  if (/VoiceStudio|음성|목소리/.test(message)) return message;
  if (/ENOSPC|no space left/i.test(message)) return '서버 저장 공간이 부족해요. 오래된 영상을 정리해야 해요.';
  if (/ENOMEM|out of memory|Killed|SIGKILL/i.test(message)) return '서버 메모리가 부족해 멈췄어요. 잠시 뒤 다시 시도해 주세요.';
  if (/Failed to launch|browser|chrom/i.test(message)) return '영상 렌더러(크롬)를 시작하지 못했어요. 잠시 뒤 다시 시도하고, 계속되면 서버를 다시 켜 주세요.';
  if (/ECONNREFUSED|fetch failed|ETIMEDOUT/i.test(message)) return '서버 안에서 파일을 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  return '영상을 만들지 못했어요. 다시 시도해 주세요.';
}

async function runRender(repo: Repo, projectId: number, version: number, renderId: number, origin: string) {
  const outDir = path.join(RENDER_DIR, String(renderId));
  const job = jobs.get(renderId) ?? { canceled: false };
  jobs.set(renderId, job);
  const stopIfCanceled = () => {
    if (job.canceled) throw new RenderCanceled();
  };
  const set = (stage: string, progress: number) => {
    stopIfCanceled();
    repo.updateRender(renderId, { status: 'running', stage, progress, outputDir: outDir });
  };
  if (job.canceled) {
    jobs.delete(renderId);
    return;
  }
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const recipe = repo.getRecipe(projectId);
    const { script } = repo.getScript(projectId, version);
    const review = repo.lastReview(projectId, version);
    const approval = review?.decision === 'approved' ? review : null;

    set('음성 생성', 0.02);
    await generateVoice(script, () => job.canceled);
    // 받아쓰기로 대사와 음성을 맞춰 본다: 중간에 끊겨 만들어진 음성은 한 번 다시 만든다
    set('음성 확인', 0.05);
    const qa: QaReport = { issues: [], checked: [], fixed: [] };
    await checkVoiceLines(script, qa, () => job.canceled);
    let { timings } = await previewTimeline(script, origin);
    const photo = repo.getPhoto(projectId);
    const props: VideoProps = {
      script,
      timings,
      reviewed: Boolean(approval),
      reviewer: approval?.reviewer,
      // 승인 전 검수용: 워터마크·상태 문구 없이 (승인 뒤 다시 렌더하지 않아도 되게)
      cleanDraft: !approval,
      recipe,
      photoUrl: photo ? renderUrl(origin, photo.url) : undefined,
      photoColor: photo?.color || undefined,
      sceneMedia: Object.fromEntries(Object.entries(repo.getSceneMedia(projectId)).map(([k, m]) => [k, { kind: m.kind, url: renderUrl(origin, m.url) }])),
    };

    set('렌더러 준비', 0.08);
    const renderer = await loadRenderer();
    await renderer.getServeUrl();

    const renderOnce = async (stage: string) => {
      set(stage, 0.12);
      const raw = path.join(outDir, 'video-raw.mp4');
      const { cancelSignal, cancel } = renderer.makeCancelSignal();
      job.cancelRemotion = cancel;
      await renderer.renderVideo({
        inputProps: { ...props, timings },
        outputLocation: raw,
        cancelSignal,
        onProgress: (p) => {
          if (!job.canceled) repo.updateRender(renderId, { status: 'running', stage, progress: 0.12 + p * 0.68, outputDir: outDir });
        },
      });
      job.cancelRemotion = undefined;
      // 숏폼 기준 음량(-14 LUFS)으로 맞춘다
      set('음량 맞추기', 0.8);
      await normalizeLoudness(raw, path.join(outDir, 'video.mp4')).then(
        () => fs.rmSync(raw),
        () => fs.renameSync(raw, path.join(outDir, 'video.mp4')),
      );
    };
    await renderOnce('영상 렌더링');

    // 완성 영상 자동 품질 검사: 대사가 잘린 장면이 있으면 그 장면을 음성 끝까지 늘려 한 번 다시 만든다
    set('자동 품질 검사', 0.82);
    let audit = await auditVideo(path.join(outDir, 'video.mp4'), timings, script);
    const cut = new Set(audit.filter((i) => i.code === 'cut' && i.sceneId).map((i) => i.sceneId!));
    if (cut.size) {
      ({ timings } = await previewTimeline(script, origin, { fullLength: cut }));
      await renderOnce('대사 잘림 고쳐서 다시 만드는 중');
      set('자동 품질 검사', 0.83);
      const before = audit.filter((i) => i.code === 'cut');
      audit = await auditVideo(path.join(outDir, 'video.mp4'), timings, script);
      const still = new Set(audit.filter((i) => i.code === 'cut').map((i) => i.sceneId));
      for (const b of before) if (!still.has(b.sceneId)) qa.fixed.push(`장면 ${b.scene} 대사 끝이 잘려서, 음성 끝까지 늘려 다시 만들었어요.`);
    }
    qa.issues.push(...audit);
    qa.checked.push('대사 끝 잘림', '목소리 없는 장면', '긴 무음', '검은 화면');
    repo.setRenderQa(renderId, qa);
    fs.writeFileSync(path.join(outDir, 'qa.json'), JSON.stringify(qa, null, 2));
    set('자막 확인 프레임', 0.85);
    await captionCheckFrames(path.join(outDir, 'video.mp4'), script, timings, path.join(outDir, 'caption-check')).catch(() => undefined);

    set('썸네일·레시피 카드', 0.86);
    const cover = { title: recipe.topic, emotion: 'joy' as const, recipe, photoColor: photo?.color || undefined };
    await renderer.renderStillImage('Cover', cover, path.join(outDir, 'cover.png'));
    await renderer.renderStillImage('SquareThumb', cover, path.join(outDir, 'thumbnail.png'));
    await renderer.renderStillImage('RecipeCard', { recipe, reviewed: Boolean(approval), cleanDraft: !approval }, path.join(outDir, 'recipe-card.png'));
    // 넘겨 보는 레시피 카드 (인스타그램 캐러셀용, JPEG). 실패해도 영상 제작은 끝낸다
    set('레시피 카드 묶음', 0.9);
    try {
      const pages = recipeCardPages(recipe);
      for (let i = 0; i < pages.length; i++) {
        const png = path.join(outDir, `carousel-${String(i + 1).padStart(2, '0')}.png`);
        await renderer.renderStillImage('CarouselCard', { recipe, reviewed: Boolean(approval), cleanDraft: !approval, page: i }, png);
        await toJpeg(png, png.replace(/\.png$/, '.jpg'));
        fs.rmSync(png);
      }
      await toJpeg(path.join(outDir, 'cover.png'), path.join(outDir, 'cover.jpg')).catch(() => undefined);
    } catch (e) {
      console.warn('[레시피 카드 묶음] 만들지 못함:', (e as Error).message);
    }

    if (photo) fs.copyFileSync(path.join(DATA_DIR, photo.file), path.join(outDir, `photo${path.extname(photo.file)}`));
    // 게시 묶음(ZIP)은 승인 후 내려받을 때 만든다 (그때의 승인·블로그 선택을 반영)
    fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(timings));

    repo.updateRender(renderId, { status: 'done', stage: '완료', progress: 1, finished: true });
    const errs = qa.issues.filter((i) => i.level === 'error').length;
    repo.logEvent(projectId, 'render', `제작 완료 (작업 #${renderId}) · 자동 검사 ${errs ? `문제 ${errs}건` : '통과'}${qa.fixed.length ? ` · 자동으로 고침 ${qa.fixed.length}건` : ''}`);
  } catch (e) {
    const message = (e as Error).message || String(e);
    if (job.canceled || e instanceof RenderCanceled) {
      repo.updateRender(renderId, { status: 'canceled', stage: '취소됨', finished: true });
    } else {
      // 화면에는 쉬운 문장, 자세한 내용은 작업 내역에 남긴다
      repo.updateRender(renderId, { status: 'failed', error: friendlyRenderError(message), finished: true });
      repo.logEvent(projectId, 'error', `제작 실패 (작업 #${renderId}): ${message.slice(0, 500)}`);
    }
  } finally {
    jobs.delete(renderId);
  }
}

/** 완성 영상의 소리·화면 검사 (실패해도 제작은 끝낸다) */
export async function auditVideo(video: string, timings: SceneTiming[], script: Script): Promise<QaIssue[]> {
  const issues: QaIssue[] = [];
  try {
    issues.push(...auditAudio({ db: await audioDb(video), step: QA_STEP, timings, script }));
  } catch (e) {
    console.warn('[자동 검사] 소리 검사 실패:', (e as Error).message);
  }
  try {
    issues.push(...auditFrames(await frameBrightness(video, 0.5), 0.5));
  } catch (e) {
    console.warn('[자동 검사] 화면 검사 실패:', (e as Error).message);
  }
  return issues;
}

/**
 * 장면별 음성을 받아써서 대사와 맞춰 본다 (받아쓰기를 쓸 수 있을 때만).
 * - 뒷부분이 없거나(중간에 끊겨 만들어짐) 대사와 많이 다르면 그 음성을 지우고 한 번 다시 만든다
 * - 그래도 다르면 문제로 남긴다. 받아쓰기도 틀릴 수 있어 '다르게 들림'은 경고로 둔다
 */
export async function checkVoiceLines(script: Script, qa: QaReport, shouldStop: () => boolean = () => false) {
  const provider = await ttsProvider().catch(() => 'none' as const);
  const identity = await voiceIdentity(provider).catch(() => null);
  let checked = 0;
  for (const [i, scene] of script.scenes.entries()) {
    if (shouldStop()) throw new RenderCanceled();
    const a = cachedAudio(scene.line, AUDIO_DIR, identity);
    if (!a) continue;
    const heard = await transcribeAudio(a.file).catch(() => undefined);
    if (!heard) continue;
    checked++;
    let m = lineMatch(scene.line, heard.text);
    let text = heard.text;
    if (m.truncated || m.ratio < 0.6) {
      removeAudioWithCache(a.file);
      const again = await synthesize(scene.line, AUDIO_DIR);
      const heard2 = await transcribeAudio(again.file).catch(() => undefined);
      if (heard2) {
        const m2 = lineMatch(scene.line, heard2.text);
        if (!m2.truncated && m2.ratio >= 0.6) qa.fixed.push(`장면 ${i + 1} 음성이 ${m.truncated ? '중간에 끊겨' : '대사와 다르게'} 만들어져서 다시 만들었어요.`);
        m = m2;
        text = heard2.text;
      }
    }
    if (m.truncated) qa.issues.push({ level: 'error', code: 'mismatch', scene: i + 1, sceneId: scene.id, message: `장면 ${i + 1} 음성이 대사 중간에서 끊겨요 (들린 말: "${text.trim().slice(0, 40)}").` });
    else if (m.ratio < 0.6) qa.issues.push({ level: 'warning', code: 'mismatch', scene: i + 1, sceneId: scene.id, message: `장면 ${i + 1} 음성이 대사와 많이 다르게 들려요 (들린 말: "${text.trim().slice(0, 40)}").` });
    else if (m.missing.length && m.ratio < 0.92) qa.issues.push({ level: 'warning', code: 'mismatch', scene: i + 1, sceneId: scene.id, message: `장면 ${i + 1}에서 "${m.missing.slice(0, 3).join('", "')}"이(가) 다르게 들릴 수 있어요 (받아쓰기: "${text.trim().slice(0, 40)}"). 받아쓰기가 틀렸을 수도 있으니 들어 보고 확인해 주세요.` });
  }
  if (checked) qa.checked.push(`받아쓰기로 대사 대조 (${checked}개 장면)`);
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

/** 승인된 최신 대본으로 만든 영상이면 게시 묶음(ZIP)을 만들어 경로를 돌려준다. */
export function exportPackage(repo: Repo, renderId: number): string {
  const { render: r, approval } = approvedRender(repo, renderId);
  const recipe = repo.getRecipe(r.projectId);
  const { script } = repo.getScript(r.projectId, r.scriptVersion);
  const timelineFile = path.join(r.outputDir, 'timeline.json');
  const timings = fs.existsSync(timelineFile) ? (JSON.parse(fs.readFileSync(timelineFile, 'utf8')) as SceneTiming[]) : [];
  const style = repo.getBlogStyle(r.projectId);
  writePackage(r.outputDir, recipe, script, timings, { reviewer: approval.reviewer, reviewedAt: approval.createdAt }, {
    blogStyle: (BLOG_STYLES as readonly string[]).includes(style) ? (style as BlogStyle) : undefined,
    notes: repo.getExpertNotes(r.projectId),
    polish: repo.getPolish(r.projectId),
  });
  return path.join(r.outputDir, 'package.zip');
}

/** 블로그 원고와 SNS 문구 (게시 묶음·인스타그램 게시가 같은 문구를 쓴다) */
export function publishTexts(
  recipe: RecipeInput,
  script: Script,
  review: { reviewer: string; reviewedAt: string },
  extra: { blogStyle?: BlogStyle; notes?: ExpertNotes; polish?: Record<string, string> } = {},
) {
  const images = { thumbnail: 'thumbnail.png', recipeCard: 'recipe-card.png' };
  const built = extra.blogStyle
    ? buildExpertBlog({ recipe, style: extra.blogStyle, notes: extra.notes ?? { answers: {} }, review, images })
    : buildBlogPost({ recipe, review, images });
  // 연구자가 적용한 im-not-ai 윤문 (원문 문단이 그대로일 때만 바뀐다)
  const post = polishPost(built, extra.polish ?? {}, Object.values(extra.notes?.answers ?? {}).filter((a): a is string => Boolean(a)));
  const social = buildSocialCopy(recipe, true, post.tags);
  // 연출 엔진 대본이면 인스타그램 설명은 첫 대사로 시작한다 (매체에 맞는 표현)
  if (script.scenes.some((s) => s.hook)) social.instagram = instagramCaption(recipe, script, true, post.tags);
  return { post, social };
}

/**
 * 승인된 최신 대본으로 만든 완성 영상인지 확인한다 (내보내기·인스타그램 게시 공통).
 * 맞으면 그 영상과 승인 정보를 돌려준다.
 */
export function approvedRender(repo: Repo, renderId: number) {
  const r = repo.getRender(renderId);
  if (r.status !== 'done') throw new HttpError(404, '아직 완성된 영상이 없습니다.');
  const state = repo.versionState(r.projectId);
  if (state.latestScriptVersion !== r.scriptVersion) throw new HttpError(409, '대본이 바뀌었어요. 최신 대본으로 영상을 다시 만들어 주세요.');
  if (state.approvedScriptVersion !== r.scriptVersion) throw new HttpError(409, '이희재 연구자의 승인 후에 내보낼 수 있어요.');
  const approval = repo.lastReview(r.projectId, r.scriptVersion)!;
  return { render: r, approval };
}

/** 승인된 영상의 인스타그램 설명 글 (게시 묶음의 instagram.txt와 같다) */
export function instagramText(repo: Repo, renderId: number): string {
  const { render, approval } = approvedRender(repo, renderId);
  const style = repo.getBlogStyle(render.projectId);
  return publishTexts(repo.getRecipe(render.projectId), repo.getScript(render.projectId, render.scriptVersion).script, { reviewer: approval.reviewer, reviewedAt: approval.createdAt }, {
    blogStyle: (BLOG_STYLES as readonly string[]).includes(style) ? (style as BlogStyle) : undefined,
    notes: repo.getExpertNotes(render.projectId),
    polish: repo.getPolish(render.projectId),
  }).social.instagram;
}

export function writePackage(
  outDir: string,
  recipe: RecipeInput,
  script: Script,
  timings: SceneTiming[],
  review: { reviewer: string; reviewedAt: string },
  extra: { blogStyle?: BlogStyle; notes?: ExpertNotes; polish?: Record<string, string> } = {},
) {
  const { post, social } = publishTexts(recipe, script, review, extra);
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
