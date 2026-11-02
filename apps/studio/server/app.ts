import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { SAMPLE_RECIPES, buildAiPrompt, checkScript, estimateScriptSeconds, generateTemplateScript, parseAiScript } from '@mat-lab/recipe-core';
import { buildBlogPost, buildSocialCopy } from '@mat-lab/publishing';
import { DATA_DIR, TTS } from './config.ts';
import { generateVoice, previewTimeline, startRender } from './pipeline.ts';
import { HttpError, type Repo } from './repo.ts';
import { ttsProvider } from './tts.ts';

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
    const provider = await ttsProvider().catch(() => 'none');
    res.json({ tts: { provider, voice: TTS.voice, rate: TTS.rate, pitch: TTS.pitch }, samples: SAMPLE_RECIPES });
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

  api.get('/projects/:id/preview', (req, res) => {
    const pid = id(req);
    const latest = latestOrThrow(repo, pid);
    const state = repo.versionState(pid);
    const { timings, voiced } = previewTimeline(latest.script);
    res.json({ version: latest.version, voiced, props: { script: latest.script, timings, reviewed: state.approvedScriptVersion === latest.version } });
  });

  api.get('/projects/:id/blog', (req, res) => {
    const pid = id(req);
    const project = repo.getProject(pid);
    const review = project.approval ? { reviewer: project.approval.reviewer, reviewedAt: project.approval.createdAt } : null;
    const post = buildBlogPost({ recipe: project.recipe, review });
    res.json({ post, social: buildSocialCopy(project.recipe, Boolean(review), post.tags) });
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
