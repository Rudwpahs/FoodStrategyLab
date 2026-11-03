import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { HOOK_INFO, SAMPLE_RECIPES, STYLE_INFO, applyHook, buildAiPrompt, buildReelPromptPack, buildStyledScript, canRender, checkScript, estimateScriptSeconds, generateTemplateScript, isHookType, isStyleId, parseAiScript, repetitionWarning, suggestHooks, type Script } from '@mat-lab/recipe-core';
import { BLOG_STYLES, BLOG_STYLE_INFO, EXPERT_QUESTIONS, buildBlogPost, buildExpertBlog, buildSocialCopy, checkConsistency, lintBlog, type BlogStyle } from '@mat-lab/publishing';
import { DATA_DIR } from './config.ts';
import { AUDIO_DIR, generateVoice, previewTimeline, startRender } from './pipeline.ts';
import { HttpError, type Repo } from './repo.ts';
import { describeVoice, resetTtsDetection, synthesize, ttsProvider, voicestudioVoice } from './tts.ts';
import { createDesignedVoice, engineInfo, findVoiceStudio, listProfiles, writeVoiceSettings } from './voicestudio.ts';

const id = (req: Request) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, '잘못된 번호입니다.');
  return n;
};

const latestOrThrow = (repo: Repo, projectId: number) => {
  const latest = repo.latestScript(projectId);
  if (!latest) throw new HttpError(400, '먼저 대본을 만드세요.');
  return latest;
};

/**
 * 새 대본에서 내용이 바뀐 장면 번호에 붙어 있던 클립 연결을 푼다 (파일은 지우지 않는다).
 * 예전 장면용 클립이 다른 장면에 잘못 붙어 나오는 것을 막는다.
 */
function detachChangedMedia(repo: Repo, pid: number, before: Script | undefined, after: Script): string[] {
  const media = repo.getSceneMedia(pid);
  const notes: string[] = [];
  for (const sceneId of Object.keys(media)) {
    const oldLine = before?.scenes.find((s) => s.id === sceneId)?.line;
    const newLine = after.scenes.find((s) => s.id === sceneId)?.line;
    if (oldLine !== newLine) {
      repo.deleteSceneMedia(pid, sceneId);
      notes.push(`장면 ${sceneId}에 올려 둔 클립은 장면 내용이 바뀌어 연결을 풀었어요. 필요하면 다시 올려 주세요.`);
    }
  }
  return notes;
}

export function createApp(repo: Repo) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/media', express.static(DATA_DIR, { fallthrough: false }));

  const api = express.Router();

  api.get('/meta', async (_req, res) => {
    const provider = await ttsProvider().catch(() => 'none' as const);
    res.json({ tts: { provider, voice: describeVoice(provider) }, samples: SAMPLE_RECIPES });
  });

  // ---- 음성 설정 (VoiceStudio) ----
  api.get('/voice', async (_req, res) => {
    const vs = await findVoiceStudio();
    const profiles = vs.state === 'ok' ? await listProfiles(vs.url).catch(() => []) : [];
    const engines = vs.state === 'ok' ? await engineInfo(vs.url).catch(() => null) : null;
    const provider = await ttsProvider().catch(() => 'none' as const);
    res.json({ voicestudio: vs, profiles, engines, selected: voicestudioVoice(), provider, describe: describeVoice(provider) });
  });

  api.put('/voice', (req, res) => {
    const voice = String(req.body?.voice ?? '').trim();
    if (!voice) throw new HttpError(400, '목소리를 고르세요.');
    writeVoiceSettings({ voicestudioVoice: voice });
    resetTtsDetection();
    res.json({ selected: voicestudioVoice() });
  });

  /** 맛조수 목소리를 VoiceStudio에 자동으로 만든다 (이미 있으면 그대로 쓴다) */
  api.post('/voice/design', async (req, res) => {
    const vs = await findVoiceStudio();
    if (vs.state !== 'ok') throw new HttpError(409, vs.state === 'starting' ? 'VoiceStudio가 아직 준비 중입니다. 잠시 뒤 다시 눌러 주세요.' : 'VoiceStudio 앱이 꺼져 있습니다. 앱을 켜 주세요.');
    const name = String(req.body?.name ?? '맛조수').trim() || '맛조수';
    const existing = (await listProfiles(vs.url)).find((p) => p.name === name);
    const profile = existing ?? (await createDesignedVoice(vs.url, name));
    writeVoiceSettings({ voicestudioVoice: profile.name });
    resetTtsDetection();
    res.json({ profile, created: !existing });
  });

  /** 지금 목소리로 짧은 문장을 만들어 들어본다 */
  api.post('/voice/sample', async (req, res) => {
    const text = String(req.body?.text ?? '이희재의 맛 연구소에서 오늘도 실험!').slice(0, 200);
    if ((await ttsProvider().catch(() => 'none')) === 'none') throw new HttpError(409, '사용할 수 있는 음성 도구가 없습니다.');
    const a = await synthesize(text, AUDIO_DIR);
    res.json({ url: `/media/audio/${path.basename(a.file)}`, seconds: a.seconds });
  });

  api.get('/projects', (_req, res) => res.json(repo.listProjects()));

  api.post('/projects', (req, res) => res.status(201).json({ id: repo.createProject(req.body?.recipe) }));

  api.get('/projects/:id', (req, res) => res.json(repo.getProject(id(req))));

  api.delete('/projects/:id', (req, res) => {
    repo.deleteProject(id(req));
    res.status(204).end();
  });

  api.put('/projects/:id/recipe', (req, res) => {
    repo.updateRecipe(id(req), req.body?.recipe);
    res.json(repo.getProject(id(req)));
  });

  api.post('/projects/:id/script/template', (req, res) => {
    const pid = id(req);
    repo.addScriptVersion(pid, generateTemplateScript(repo.getRecipe(pid)), 'template');
    res.json(repo.getProject(pid));
  });

  /** 연출 유형 목록 + 이 레시피로 만들 수 있는 훅 후보 (추천 순서, 이유 포함) */
  api.get('/projects/:id/hooks', (req, res) => {
    const pid = id(req);
    const style = isStyleId(req.query.style) ? req.query.style : undefined;
    // 최근 다른 콘텐츠의 연출·훅: 같은 상황이 반복되지 않도록 추천 순위에 반영
    const recent = repo
      .listProjects()
      .filter((p) => p.id !== pid)
      .slice(0, 5)
      .map((p) => repo.latestScript(p.id)?.script)
      .filter((sc): sc is NonNullable<typeof sc> => Boolean(sc?.style || sc?.hookType))
      .map((sc) => ({ style: sc.style, hookType: sc.hookType }));
    res.json({
      styles: STYLE_INFO,
      hookInfo: HOOK_INFO,
      hooks: suggestHooks(repo.getRecipe(pid), { preferred: style ? STYLE_INFO[style].hooks : undefined, recent }),
      repetition: style ? repetitionWarning(recent, style) : null,
    });
  });

  /** 연출 유형 + 훅으로 새 대본 (새 버전, 승인 해제) */
  api.post('/projects/:id/script/styled', (req, res) => {
    const pid = id(req);
    const { style, hookType } = req.body ?? {};
    if (!isStyleId(style)) throw new HttpError(400, '연출 유형을 고르세요.');
    if (hookType !== undefined && !isHookType(hookType)) throw new HttpError(400, '알 수 없는 훅 유형입니다.');
    let result;
    try {
      result = buildStyledScript(repo.getRecipe(pid), { style, hookType });
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const detached = detachChangedMedia(repo, pid, repo.latestScript(pid)?.script, result.script);
    repo.addScriptVersion(pid, result.script, 'template', `연출: ${STYLE_INFO[style].label} · 훅: ${result.hook.label}`);
    res.json({ project: repo.getProject(pid), notes: [...result.notes, ...detached] });
  });

  /** 지금 대본의 훅(첫 장면)만 바꾼다. 나머지 장면과 음성은 그대로. */
  api.post('/projects/:id/script/hook', (req, res) => {
    const pid = id(req);
    const { hookType } = req.body ?? {};
    if (!isHookType(hookType)) throw new HttpError(400, '훅 유형을 고르세요.');
    const latest = latestOrThrow(repo, pid);
    let result;
    try {
      result = applyHook(latest.script, repo.getRecipe(pid), hookType);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const detached = detachChangedMedia(repo, pid, latest.script, result.script);
    repo.addScriptVersion(pid, result.script, 'edit', `훅 변경: ${result.hook.label}`);
    res.json({ project: repo.getProject(pid), notes: [...result.hook.needsReview, ...detached] });
  });

  api.get('/projects/:id/ai-prompt', (req, res) => res.json({ prompt: buildAiPrompt(repo.getRecipe(id(req))) }));

  api.post('/projects/:id/script/ai', (req, res) => {
    const pid = id(req);
    const result = parseAiScript(String(req.body?.text ?? ''), repo.getRecipe(pid));
    if (!result.ok) throw new HttpError(400, result.error);
    repo.addScriptVersion(pid, result.script, 'ai-paste', result.notes.join(' '));
    res.json(repo.getProject(pid));
  });

  api.put('/projects/:id/script', (req, res) => {
    const pid = id(req);
    repo.addScriptVersion(pid, req.body?.script, 'edit', String(req.body?.note ?? ''));
    res.json(repo.getProject(pid));
  });

  api.post('/projects/:id/versions/:version/restore', (req, res) => {
    const pid = id(req);
    const v = Number(req.params.version);
    const old = repo.getScript(pid, v);
    repo.addScriptVersion(pid, old.script, 'edit', `v${v} 복원`);
    res.json(repo.getProject(pid));
  });

  api.get('/projects/:id/check', (req, res) => {
    const pid = id(req);
    const latest = latestOrThrow(repo, pid);
    res.json({
      version: latest.version,
      issues: checkScript(repo.getRecipe(pid), latest.script),
      estimatedSeconds: Math.round(estimateScriptSeconds(latest.script)),
    });
  });

  api.post('/projects/:id/reviews', (req, res) => {
    const pid = id(req);
    const body = req.body ?? {};
    repo.addReview(pid, { version: Number(body.version), reviewer: String(body.reviewer ?? ''), checklist: body.checklist, decision: String(body.decision), note: body.note });
    res.json(repo.getProject(pid));
  });

  api.post('/projects/:id/voice', async (req, res) => {
    const pid = id(req);
    const result = await generateVoice(latestOrThrow(repo, pid).script);
    if (result.generated > 0) repo.logEvent(pid, 'voice', `음성 ${result.generated}개 생성`);
    res.json(result);
  });

  api.get('/projects/:id/preview', async (req, res) => {
    const pid = id(req);
    const latest = latestOrThrow(repo, pid);
    const state = repo.versionState(pid);
    const photo = repo.getPhoto(pid);
    const { timings, voiced } = await previewTimeline(latest.script);
    res.json({
      version: latest.version,
      voiced,
      props: {
        script: latest.script,
        timings,
        reviewed: state.approvedScriptVersion === latest.version,
        reviewer: state.approvedScriptVersion === latest.version ? repo.lastReview(pid, latest.version)?.reviewer : undefined,
        recipe: repo.getRecipe(pid),
        photoUrl: photo?.url,
        photoColor: photo?.color || undefined,
        sceneMedia: repo.getSceneMedia(pid),
      },
    });
  });

  // 장면별 생성 AI 클립(MP4·WEBM) 또는 첫 프레임 이미지
  api.put('/projects/:id/scenes/:sceneId/media', express.raw({ type: ['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'], limit: '300mb' }), (req, res) => {
    const pid = id(req);
    const sceneId = String(req.params.sceneId);
    if (!/^[\w-]{1,40}$/.test(sceneId)) throw new HttpError(400, '잘못된 장면 번호입니다.');
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'MP4·WEBM 영상이나 JPG·PNG·WEBP 이미지를 올려 주세요.');
    const type = String(req.headers['content-type'] ?? '');
    const kind = type.startsWith('video/') ? 'video' : 'image';
    const ext = type.includes('webm') ? '.webm' : type.includes('mp4') ? '.mp4' : type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
    const dir = path.join(DATA_DIR, 'clips', String(pid));
    fs.mkdirSync(dir, { recursive: true });
    const old = repo.deleteSceneMedia(pid, sceneId);
    if (old) fs.rmSync(path.join(DATA_DIR, old), { force: true });
    const file = `clips/${pid}/${sceneId}${ext}`;
    fs.writeFileSync(path.join(DATA_DIR, file), req.body);
    repo.setSceneMedia(pid, sceneId, file, kind);
    res.json(repo.getProject(pid));
  });

  api.delete('/projects/:id/scenes/:sceneId/media', (req, res) => {
    const pid = id(req);
    const old = repo.deleteSceneMedia(pid, String(req.params.sceneId));
    if (old) fs.rmSync(path.join(DATA_DIR, old), { force: true });
    res.json(repo.getProject(pid));
  });

  // 완성 사진: 영상 속 '완성 사진' 카드와 3D 음식 색에 쓴다
  api.put('/projects/:id/photo', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '12mb' }), (req, res) => {
    const pid = id(req);
    repo.getRecipe(pid);
    const type = String(req.headers['content-type'] ?? '');
    const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'JPG·PNG·WEBP 사진을 올려 주세요.');
    const color = String(req.query.color ?? '');
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new HttpError(400, '색상 형식이 잘못되었습니다.');
    const dir = path.join(DATA_DIR, 'photos');
    fs.mkdirSync(dir, { recursive: true });
    for (const old of fs.readdirSync(dir).filter((f) => f.startsWith(`${pid}.`))) fs.rmSync(path.join(dir, old));
    fs.writeFileSync(path.join(dir, `${pid}${ext}`), req.body);
    repo.setPhoto(pid, `photos/${pid}${ext}`, color);
    res.json(repo.getProject(pid));
  });

  api.delete('/projects/:id/photo', (req, res) => {
    const pid = id(req);
    const photo = repo.getPhoto(pid);
    if (photo) fs.rmSync(path.join(DATA_DIR, photo.file), { force: true });
    repo.setPhoto(pid, '', '');
    res.json(repo.getProject(pid));
  });

  api.get('/projects/:id/blog', (req, res) => {
    const pid = id(req);
    const project = repo.getProject(pid);
    const review = project.approval ? { reviewer: project.approval.reviewer, reviewedAt: project.approval.createdAt } : null;
    const style = (BLOG_STYLES as readonly string[]).includes(String(req.query.style)) ? (String(req.query.style) as BlogStyle) : null;
    const notes = repo.getExpertNotes(pid);
    // style이 없으면 기존 자동 원고(A), 있으면 연구자 답변을 반영한 원고(B)
    const expert = style ? buildExpertBlog({ recipe: project.recipe, style, notes, review }) : null;
    const post = expert ?? buildBlogPost({ recipe: project.recipe, review });
    const social = buildSocialCopy(project.recipe, Boolean(review), post.tags);
    const consistency = project.latest
      ? checkConsistency({ recipe: project.recipe, script: project.latest.script, blogMarkdown: post.markdown, social: social.instagram, reviewed: Boolean(review), notes })
      : [];
    const lint = lintBlog(post.markdown, { dish: project.recipe.dishName || project.recipe.topic, notes });
    // 빨간 오류(일관성·문체)가 하나라도 있으면 게시 준비가 아니다
    const errors = consistency.filter((c) => c.level === 'error').length + lint.filter((l) => l.level === 'error').length;
    const blockers = expert ? [...expert.blockers, ...(errors ? [`고쳐야 할 오류가 ${errors}개 있어요 (아래 빨간 표시).`] : [])] : [];
    res.json({ post, social, consistency, lint, expert: expert ? { style, pending: expert.pending, ready: blockers.length === 0, blockers } : null, styles: BLOG_STYLE_INFO });
  });

  api.get('/projects/:id/expert-notes', (req, res) => {
    res.json({ notes: repo.getExpertNotes(id(req)), questions: EXPERT_QUESTIONS, styles: BLOG_STYLE_INFO });
  });

  api.put('/projects/:id/expert-notes', (req, res) => {
    const pid = id(req);
    res.json({ notes: repo.setExpertNotes(pid, req.body ?? {}) });
  });

  // 선택: 이미지·영상 생성 AI용 프롬프트 팩 (승인된 대본만)
  api.get('/projects/:id/reel-prompts', (req, res) => {
    const pid = id(req);
    const gate = canRender(repo.versionState(pid));
    if (!gate.ok) throw new HttpError(409, gate.reason);
    res.json(buildReelPromptPack(repo.getRecipe(pid), latestOrThrow(repo, pid).script));
  });

  api.post('/projects/:id/renders', (req, res) => {
    const origin = `${req.protocol}://${req.get('host')}`;
    res.status(202).json({ renderId: startRender(repo, id(req), origin) });
  });

  api.get('/renders/:id', (req, res) => {
    const r = repo.getRender(id(req));
    const files = r.status === 'done' && fs.existsSync(r.outputDir) ? fs.readdirSync(r.outputDir).filter((f) => f.includes('.')) : [];
    const checkDir = path.join(r.outputDir, 'caption-check');
    const captionChecks = r.status === 'done' && fs.existsSync(checkDir) ? fs.readdirSync(checkDir).sort() : [];
    res.json({ ...r, files, captionChecks, baseUrl: `/media/renders/${r.id}` });
  });

  api.get('/renders/:id/download', (req, res) => {
    const r = repo.getRender(id(req));
    const file = path.join(r.outputDir, 'package.zip');
    if (r.status !== 'done' || !fs.existsSync(file)) throw new HttpError(404, '아직 완성된 묶음이 없습니다.');
    res.download(file, `matlab-${r.projectId}-v${r.scriptVersion}.zip`);
  });

  app.use('/api', api);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, '없는 API입니다.')));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return res.status(400).json({ error: `${first?.path.join('.') || '입력'}: ${first?.message ?? '형식 오류'}` });
    }
    const status = (err as { status?: number }).status;
    if (status && status < 500) return res.status(status).json({ error: (err as Error).message });
    console.error(err);
    res.status(500).json({ error: (err as Error).message ?? '서버 오류' });
  });
  return app;
}
