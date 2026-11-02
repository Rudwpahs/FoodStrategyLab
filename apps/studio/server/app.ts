import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { SAMPLE_RECIPES, buildAiPrompt, buildReelPromptPack, canRender, checkScript, estimateScriptSeconds, generateTemplateScript, parseAiScript } from '@mat-lab/recipe-core';
import { buildBlogPost, buildSocialCopy } from '@mat-lab/publishing';
import { DATA_DIR } from './config.ts';
import { generateVoice, previewTimeline, startRender } from './pipeline.ts';
import { HttpError, type Repo } from './repo.ts';
import { describeVoice, ttsProvider } from './tts.ts';

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

export function createApp(repo: Repo) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/media', express.static(DATA_DIR, { fallthrough: false }));

  const api = express.Router();

  api.get('/meta', async (_req, res) => {
    const provider = await ttsProvider().catch(() => 'none' as const);
    res.json({ tts: { provider, voice: describeVoice(provider) }, samples: SAMPLE_RECIPES });
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
    const post = buildBlogPost({ recipe: project.recipe, review });
    res.json({ post, social: buildSocialCopy(project.recipe, Boolean(review), post.tags) });
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
    const files = r.status === 'done' && fs.existsSync(r.outputDir) ? fs.readdirSync(r.outputDir) : [];
    res.json({ ...r, files, baseUrl: `/media/renders/${r.id}` });
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
