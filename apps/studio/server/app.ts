import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { HOOK_INFO, SAMPLE_RECIPES, STYLE_INFO, applyHook, buildAiPrompt, buildReelPromptPack, buildStyledScript, canRender, checkScript, estimateScriptSeconds, generateTemplateScript, contentCandidates, instagramCaption, isHookType, isStyleId, parseAiScript, repetitionWarning, scriptForCandidate, suggestHooks, type Script } from '@mat-lab/recipe-core';
import { BLOG_STYLES, BLOG_STYLE_INFO, EXPERT_QUESTIONS, blogQuantityIssues, buildBlogPost, buildExpertBlog, buildSocialCopy, blogStylePair, checkConsistency, lintBlog, type BlogStyle } from '@mat-lab/publishing';
import { DATA_DIR } from './config.ts';
import { AUDIO_DIR, approvedRender, cancelRender, candidateVoiceJob, exportPackage, generateVoice, instagramText, keepAwake, previewTimeline, startCandidateVoices, startRender } from './pipeline.ts';
import { Instagram, activeIgJob, checkCaption, getIgJob, resolvePublicLink } from './instagram.ts';
import { DEFAULT_MODEL, MAX_FILES, RecipeReader, aiConfigured, monthSpentUsd, monthlyBudgetUsd, type UploadFile } from './recipeReader.ts';
import { METRIC_KEYS, formatInsights } from './insights.ts';
import { Auth, authGuard, clientIp, isDirectLocal, publicOrigin, readCookie, sessionCookie, setupCode } from './auth.ts';
import { HttpError, type Publication, type Repo } from './repo.ts';
import { describeVoice, resetTtsDetection, synthesize, ttsProvider, voiceTempo, voicestudioVoice } from './tts.ts';
import { VOICE_TEMPOS, isVoiceTempo, presetById, presetByVoiceName, voicePresets } from './voicePresets.ts';

/** 목소리 후보를 같은 문장으로 들어 보기 (목소리마다 결과 또는 이유) */
type VoiceSampleResult = { url: string; seconds: number } | { error: string };
interface VoiceSamplesJob {
  status: 'running' | 'done';
  text: string;
  tempo: number;
  items: Record<string, VoiceSampleResult | null>;
}
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

export interface AppDeps {
  /** 영상 제작 시작 (테스트에서는 가짜로 바꿔 실제 렌더를 돌리지 않는다) */
  startRender: typeof startRender;
  auth?: Auth;
  /** 인스타그램 연결 (테스트에서는 가짜 Meta 서버로 바꾼다) */
  instagram?: Instagram;
  /** 레시피 사진·파일 읽기 (테스트에서는 가짜 Claude로 바꾼다) */
  recipeReader?: RecipeReader;
}

const FROM_FILES = '/api/projects/from-files';

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 인스타그램 로그인 뒤 돌아오는 화면 (외부 브라우저에서 열릴 수 있어 간단한 페이지로 보여 준다) */
function igResultPage(ok: boolean, message: string): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>인스타그램 연결</title>
<body style="font-family:sans-serif;max-width:420px;margin:48px auto;padding:0 16px;line-height:1.6">
<h2>${ok ? '✅ 인스타그램 연결 완료' : '⚠️ 인스타그램 연결 실패'}</h2><p>${esc(message)}</p>
<p>이 창을 닫고 스튜디오(맛 연구소 앱)로 돌아가세요.</p><p><a href="/">스튜디오 열기</a></p></body>`;
}

const PLATFORM_URL: Record<Publication['platform'], RegExp> = {
  instagram: /^https:\/\/(www\.)?instagram\.com\/(reel|p)\/[\w-]+/,
  naver: /^https:\/\/(m\.)?blog\.naver\.com\/[\w-]+\/\d+/,
  youtube: /^https:\/\/((www\.)?youtube\.com\/shorts\/|youtu\.be\/)[\w-]+/,
};

export function createApp(repo: Repo, deps: AppDeps = { startRender }) {
  const app = express();
  // 레시피 사진·파일 올리기만 큰 요청(최대 40MB)을 받는다. 나머지는 2MB
  const smallJson = express.json({ limit: '2mb' });
  app.use((req, res, next) => (req.path === FROM_FILES ? next() : smallJson(req, res, next)));
  const auth = deps.auth ?? new Auth(repo.db);
  const ig = deps.instagram ?? new Instagram(repo.db);
  const reader = deps.recipeReader ?? new RecipeReader(repo.db);

  // 살아 있는지 확인 (로그인 없이). 클라우드에서 제작 중 서버가 잠들지 않게 스스로 부를 때도 쓴다.
  app.get('/api/health', (_req, res) => {
    // public: 공개 주소(PUBLIC_URL)를 알고 있는지, ai: 레시피 읽기 열쇠가 있는지 (배포 확인용, 비밀값 자체는 내보내지 않음)
    res.json({ ok: true, public: Boolean(process.env.PUBLIC_URL), ai: aiConfigured() });
  });

  // Meta가 게시할 영상을 내려받는 임시 주소 (추측할 수 없는 열쇠, 2시간 뒤·게시 후 만료). 로그인 없이 열린다.
  app.get('/public/reels/:file', (req, res, next) => {
    const file = resolvePublicLink(String(req.params.file).replace(/\.mp4$/, ''));
    if (!file) return next(new HttpError(404, '없는 주소예요.'));
    res.sendFile(file, { headers: { 'cache-control': 'no-store' } });
  });
  // 인스타그램 로그인에서 돌아오는 곳: 휴대폰 앱 밖(브라우저)에서 열릴 수 있어 로그인 대신 1회용 state로 확인한다
  app.get('/api/instagram/callback', async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    if (q.error) return res.status(400).send(igResultPage(false, '인스타그램에서 연결을 취소했어요. 스튜디오에서 다시 시도해 주세요.'));
    try {
      const { username } = await ig.completeLogin(String(q.code ?? ''), String(q.state ?? ''));
      res.send(igResultPage(true, `@${username} 계정이 연결됐어요.`));
    } catch (e) {
      res.status(e instanceof HttpError ? e.status : 500).send(igResultPage(false, (e as Error).message));
    }
  });

  // ── 로그인 (이 경로만 로그인 없이 열림) ──
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body ?? {};
    const { token, user } = auth.login(String(username ?? ''), String(password ?? ''), clientIp(req));
    res.setHeader('Set-Cookie', sessionCookie(req, token));
    res.json({ user });
  });
  app.post('/api/auth/logout', (req, res) => {
    auth.logout(readCookie(req));
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    res.json({ ok: true });
  });
  app.get('/api/auth/me', (req, res) => {
    const local = auth.userCount() === 0;
    // 계정이 없을 때: 설정 코드가 있으면 화면에서 첫 계정 만들기, 없으면 이 PC 전용
    const mode = !local ? 'login' : setupCode() ? 'setup' : 'local';
    res.json({ mode, allowed: local ? isDirectLocal(req) : Boolean(auth.sessionUser(readCookie(req))), user: local ? null : auth.sessionUser(readCookie(req)) });
  });
  app.post('/api/auth/setup', (req, res) => {
    const { code, username, displayName, password } = req.body ?? {};
    const { token, user } = auth.setupFirstUser(
      { code: String(code ?? ''), username: String(username ?? ''), displayName: String(displayName ?? ''), password: String(password ?? '') },
      clientIp(req),
    );
    res.setHeader('Set-Cookie', sessionCookie(req, token));
    res.json({ user });
  });
  // 그 밖의 모든 API·미디어는 로그인 확인
  app.use(['/api', '/media'], authGuard(auth));
  // 렌더 폴더의 글·묶음 파일은 직접 열 수 없다: 승인 확인을 거치는 내보내기 API로만 받는다
  app.use('/media/renders', (req, _res, next) => (/\.(zip|md|html|txt|srt|json)$/i.test(req.path) ? next(new HttpError(403, '승인 후 내보내기에서 받을 수 있어요.')) : next()));
  app.use('/media', express.static(DATA_DIR, { fallthrough: false }));

  // 목소리 후보 들어 보기 작업 (한 번에 하나)
  let samplesJob: VoiceSamplesJob | null = null;
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
    res.json({
      voicestudio: vs,
      profiles,
      engines,
      selected: voicestudioVoice(),
      selectedPreset: presetByVoiceName(voicestudioVoice())?.id ?? null,
      presets: voicePresets().map((p) => ({ id: p.id, label: p.label, note: p.note, voiceName: p.voiceName })),
      tempo: voiceTempo(),
      tempos: VOICE_TEMPOS,
      provider,
      describe: describeVoice(provider),
    });
  });

  /** 목소리 고르기 (저장소에 기준 녹음이 있는 목소리 중 하나) */
  api.put('/voice/preset', (req, res) => {
    const preset = presetById(String(req.body?.id ?? ''));
    if (!preset) throw new HttpError(400, '모르는 목소리예요.');
    writeVoiceSettings({ voicestudioVoice: preset.voiceName });
    resetTtsDetection();
    res.json({ selected: preset.voiceName, selectedPreset: preset.id });
  });

  /** 말 빠르기 (음높이는 그대로) */
  api.put('/voice/tempo', (req, res) => {
    const tempo = Number(req.body?.tempo);
    if (!isVoiceTempo(tempo)) throw new HttpError(400, '고를 수 있는 빠르기가 아니에요.');
    writeVoiceSettings({ tempo });
    resetTtsDetection();
    res.json({ tempo: voiceTempo() });
  });

  /**
   * 모든 목소리로 같은 문장을 만들어 비교해 듣는다 (설정은 바꾸지 않는다).
   * 클라우드 GPU가 깨어나는 데 몇 분 걸릴 수 있어 뒤에서 만들고, 화면은 몇 초마다 결과를 확인한다.
   */
  api.post('/voice/samples', (req, res) => {
    if (samplesJob?.status === 'running') return res.json(samplesJob);
    const text = String(req.body?.text ?? '').trim().slice(0, 200) || '이희재의 맛 연구소, 오늘의 실험!';
    const tempo = isVoiceTempo(Number(req.body?.tempo)) ? Number(req.body.tempo) : voiceTempo();
    const presets = voicePresets();
    if (!presets.length) throw new HttpError(409, '고를 수 있는 목소리 목록이 없어요.');
    const job: VoiceSamplesJob = { status: 'running', text, tempo, items: Object.fromEntries(presets.map((p) => [p.id, null])) };
    samplesJob = job;
    const stopKeepAlive = process.env.KEEPALIVE === '1' ? keepAwake(publicOrigin(req)) : () => undefined;
    void (async () => {
      // 여러 목소리를 동시에 (클라우드에서는 GPU 여러 대가 나눠 맡는다)
      const parallel = Math.max(1, Number(process.env.VOICE_PARALLEL) || 1);
      let next = 0;
      const worker = async () => {
        while (next < presets.length) {
          const p = presets[next++]!;
          try {
            const a = await synthesize(text, AUDIO_DIR, { voice: p.voiceName, tempo });
            job.items[p.id] = { url: `/media/audio/${path.basename(a.file)}`, seconds: Math.round(a.seconds * 10) / 10 };
          } catch (e) {
            job.items[p.id] = { error: (e as Error).message || '만들지 못했어요.' };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(parallel, presets.length) }, worker));
      job.status = 'done';
      stopKeepAlive();
    })();
    res.status(202).json(job);
  });
  api.get('/voice/samples', (_req, res) => res.json(samplesJob));

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

  // ── 레시피 사진·파일로 새 콘텐츠 (Claude가 적힌 그대로 옮기고, 없는 칸은 'AI 제안'으로 표시) ──
  api.post('/projects/:id/source/confirm', (req, res) => {
    const pid = id(req);
    if (!repo.getSource(pid)?.aiFields.length) throw new HttpError(400, '확인할 AI 제안 내용이 없어요.');
    const by = (res.locals.user as { displayName?: string } | undefined)?.displayName || String(req.body?.by ?? '').trim() || '연구자';
    res.json(repo.confirmAiFields(pid, by));
  });
  api.get('/ai', (_req, res) => {
    res.json({ configured: aiConfigured(), model: process.env.CLAUDE_MODEL || DEFAULT_MODEL, spentUsd: monthSpentUsd(repo.db), budgetUsd: monthlyBudgetUsd(), maxFiles: MAX_FILES });
  });
  api.post('/projects/from-files', express.json({ limit: '40mb' }), async (req, res) => {
    const body = req.body ?? {};
    const files: UploadFile[] = Array.isArray(body.files)
      ? body.files.map((f: Record<string, unknown>) => ({ name: String(f?.name ?? 'recipe').slice(0, 120), type: String(f?.type ?? ''), data: String(f?.data ?? '') }))
      : [];
    const memo = String(body.memo ?? '').slice(0, 2000);
    const { recipe, aiFields, problems, costUsd } = await reader.read(files, memo);
    const pid = repo.createProject(recipe);
    // 원본 자료를 그대로 보관한다 (연구자가 읽은 결과와 대조할 수 있게)
    const dir = path.join(DATA_DIR, 'sources', String(pid));
    fs.mkdirSync(dir, { recursive: true });
    const saved = files.map((f, i) => {
      const ext = (f.type.split('/')[1] ?? 'bin').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
      const rel = `sources/${pid}/${i + 1}.${ext}`;
      fs.writeFileSync(path.join(DATA_DIR, rel), Buffer.from(f.data, 'base64'));
      return { name: f.name, type: f.type, file: rel };
    });
    repo.setSource(pid, { files: saved, aiFields, problems });
    const spent = costUsd.toFixed(4);
    repo.logEvent(pid, 'recipe', `레시피를 자료 ${files.length}개에서 읽음 (Claude, 약 ${spent}달러)` + (aiFields.length ? ` · AI 제안: ${aiFields.join(', ')}` : ''));
    res.status(201).json({ id: pid, aiFields, problems });
  });

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
    // 로그인한 경우 검수자는 로그인한 사람 (다른 사람 이름으로 승인하지 못하게)
    const reviewer = res.locals.user ? String(res.locals.user.displayName) : String(body.reviewer ?? '');
    repo.addReview(pid, { version: Number(body.version), reviewer, checklist: body.checklist, decision: String(body.decision), note: body.note });
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
    const social = buildSocialCopy(project.recipe, Boolean(review), post.tags, review?.reviewer);
    if (project.latest?.script.scenes.some((s) => s.hook)) social.instagram = instagramCaption(project.recipe, project.latest.script, Boolean(review), post.tags, review?.reviewer);
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
    const body = { ...(req.body ?? {}) };
    if (res.locals.user && body.confirmBy) body.confirmBy = String(res.locals.user.displayName);
    res.json({ notes: repo.setExpertNotes(pid, body) });
  });

  // 선택: 이미지·영상 생성 AI용 프롬프트 팩 (승인된 대본만)
  api.get('/projects/:id/reel-prompts', (req, res) => {
    const pid = id(req);
    const gate = canRender(repo.versionState(pid));
    if (!gate.ok) throw new HttpError(409, gate.reason);
    res.json(buildReelPromptPack(repo.getRecipe(pid), latestOrThrow(repo, pid).script));
  });

  api.post('/projects/:id/renders', (req, res) => {
    // 렌더러는 이 서버 안에서 돈다: 휴대폰이 접속한 주소(Tailscale 등)가 아니라 서버 내부 주소로 파일을 가져간다
    const origin = `http://127.0.0.1:${req.socket.localPort}`;
    // 클라우드(KEEPALIVE=1): 제작하는 동안 공개 주소로 스스로를 불러 서버가 잠들지 않게 한다
    const keepAlive = process.env.KEEPALIVE === '1' ? publicOrigin(req) : undefined;
    res.status(202).json({ renderId: deps.startRender(repo, id(req), origin, keepAlive) });
  });

  api.post('/renders/:id/cancel', (req, res) => {
    const r = repo.getRender(id(req));
    cancelRender(repo, r.id);
    res.json(repo.getRender(r.id));
  });

  api.get('/renders/:id', (req, res) => {
    const r = repo.getRender(id(req));
    const files = r.status === 'done' && fs.existsSync(r.outputDir) ? fs.readdirSync(r.outputDir).filter((f) => f.includes('.')) : [];
    const checkDir = path.join(r.outputDir, 'caption-check');
    const captionChecks = r.status === 'done' && fs.existsSync(checkDir) ? fs.readdirSync(checkDir).sort() : [];
    res.json({ ...r, files, captionChecks, baseUrl: `/media/renders/${r.id}` });
  });

  // ── 인스타그램 공식 게시 ──
  const igRedirect = (req: Request) => `${publicOrigin(req)}/api/instagram/callback`;
  api.get('/instagram', async (req, res) => {
    res.json({ ...(await ig.status()), redirectUri: igRedirect(req) });
  });
  api.post('/instagram/connect', (req, res) => {
    res.json({ url: ig.authorizeUrl(igRedirect(req)) });
  });
  api.post('/instagram/disconnect', (_req, res) => {
    ig.disconnect();
    res.json({ ok: true });
  });
  api.get('/instagram/jobs/:job', (req, res) => {
    const job = getIgJob(String(req.params.job));
    if (!job) throw new HttpError(404, '게시 작업을 찾을 수 없어요. 서버가 다시 켜졌다면 게시 이력에서 확인해 주세요.');
    res.json(job);
  });
  api.get('/renders/:id/instagram', (req, res) => {
    const { render } = approvedRender(repo, id(req));
    res.json({ caption: instagramText(repo, render.id), job: activeIgJob(render.projectId) });
  });
  /**
   * 실제 게시. 연구자가 승인한 최신 대본의 영상만, 화면에서 '올리기'를 다시 확인했을 때만.
   * 같은 대본을 이미 올렸으면 따로 확인해야 다시 올린다.
   */
  api.post('/renders/:id/instagram', async (req, res) => {
    const body = req.body ?? {};
    if (body.confirm !== true) throw new HttpError(400, '실제로 올릴지 확인이 필요해요.');
    const { render } = approvedRender(repo, id(req));
    const pid = render.projectId;
    if (activeIgJob(pid)) throw new HttpError(409, '이미 올리고 있어요. 끝날 때까지 기다려 주세요.');
    const dup = repo.listPublications(pid).find((p) => p.platform === 'instagram' && p.status === 'published' && p.scriptVersion === render.scriptVersion);
    if (dup && !body.confirmDuplicate) throw new HttpError(409, `이 콘텐츠는 이미 인스타그램에 올렸어요 (${dup.url || '주소 없음'}). 다시 올리려면 확인이 필요해요.`);
    const caption = String(body.caption ?? '').trim();
    const bad = checkCaption(caption);
    if (bad) throw new HttpError(400, bad);
    // 설명 글을 고쳤어도 원본 레시피(또는 연구자 답변)에 없는 분량은 올릴 수 없다
    const wrongAmounts = blogQuantityIssues(repo.getRecipe(pid), repo.getExpertNotes(pid), caption);
    if (wrongAmounts.length) throw new HttpError(409, `설명 글에 ${wrongAmounts.join(', ')}이(가) 있어요. 원본 레시피의 분량만 쓸 수 있어요.`);
    const origin = publicOrigin(req);
    if (!origin.startsWith('https://') && process.env.IG_ALLOW_HTTP !== '1') {
      throw new HttpError(409, '인스타그램은 공개 https 주소의 영상만 가져갈 수 있어요. 클라우드(Modal) 주소에서 올려 주세요.');
    }
    const script = repo.getScript(pid, render.scriptVersion).script;
    let stopKeepAlive: () => void = () => undefined;
    const job = await ig.startReel({
      projectId: pid,
      renderId: render.id,
      videoFile: path.join(render.outputDir, 'video.mp4'),
      caption,
      publicOrigin: origin,
      // 인스타그램 처리를 기다리는 동안 대본이 바뀌거나 승인이 풀렸으면 여기서 멈춘다
      beforePublish: () => {
        approvedRender(repo, render.id);
      },
      onPublished: (permalink) => {
        stopKeepAlive();
        repo.addPublication(pid, {
          renderId: render.id,
          scriptVersion: render.scriptVersion,
          platform: 'instagram',
          status: 'published',
          url: permalink,
          scheduledAt: '',
          publishedAt: new Date().toISOString(),
          style: script.style ?? '',
          hookType: script.hookType ?? '',
          note: '인스타그램 API로 게시',
        });
        repo.logEvent(pid, 'publish', `인스타그램 게시 (작업 #${render.id}) ${permalink}`);
      },
      onFailed: (message) => {
        stopKeepAlive();
        repo.logEvent(pid, 'error', `인스타그램 게시 실패 (작업 #${render.id}): ${message.slice(0, 300)}`);
      },
    });
    // 작업이 실제로 시작된 뒤에만 서버를 깨워 둔다 (시작 전 오류로 타이머가 남지 않게)
    if (process.env.KEEPALIVE === '1' && (job.status === 'uploading' || job.status === 'processing' || job.status === 'publishing')) stopKeepAlive = keepAwake(origin);
    res.status(202).json(job);
  });

  api.get('/renders/:id/download', (req, res) => {
    const r = repo.getRender(id(req));
    const file = exportPackage(repo, r.id);
    res.download(file, `matlab-${r.projectId}-v${r.scriptVersion}.zip`);
  });

  // ── 콘텐츠 후보 3가지 ──
  const recentFormats = (pid: number) =>
    repo
      .listProjects()
      .filter((p) => p.id !== pid)
      .slice(0, 5)
      .map((p) => repo.latestScript(p.id)?.script)
      .filter((sc): sc is NonNullable<typeof sc> => Boolean(sc?.style || sc?.hookType))
      .map((sc) => ({ style: sc.style, hookType: sc.hookType }));

  api.get('/projects/:id/candidates', async (req, res) => {
    const pid = id(req);
    const exclude = String(req.query.exclude ?? '').split(',').filter(Boolean);
    const count = Math.min(5, Math.max(1, Number(req.query.count) || 3));
    const result = contentCandidates(repo.getRecipe(pid), { exclude, recent: recentFormats(pid), count });
    // 미리보기 타임라인: 목소리를 만들어 둔 문장은 실제 목소리 길이·파일로, 아니면 예상 길이로
    const previews = await Promise.all(result.candidates.map((c) => previewTimeline(c.script).catch(() => null)));
    res.json({
      ...result,
      candidates: result.candidates.map((c, i) => ({ ...c, timings: previews[i]?.timings ?? null, voiced: previews[i]?.voiced ?? false })),
      voiceJob: candidateVoiceJob(pid),
      insights: formatInsights(repo.allPublications()),
    });
  });

  /** 후보들의 대사에 목소리 넣기 (미리보기용, 영상은 만들지 않음) */
  api.post('/projects/:id/candidates/voice', (req, res) => {
    const pid = id(req);
    const recipe = repo.getRecipe(pid);
    const keys: string[] = Array.isArray(req.body?.keys) ? req.body.keys.map(String).slice(0, 5) : [];
    const scripts = keys.flatMap((k) => {
      const [style, hookType] = k.split(':');
      if (!isStyleId(style) || !isHookType(hookType)) return [];
      try {
        return [scriptForCandidate(recipe, style, hookType).script];
      } catch {
        return [];
      }
    });
    if (!scripts.length) throw new HttpError(400, '목소리를 넣을 후보가 없어요.');
    const keepAlive = process.env.KEEPALIVE === '1' ? publicOrigin(req) : undefined;
    res.status(202).json(startCandidateVoices(pid, scripts, keepAlive));
  });
  api.get('/projects/:id/candidates/voice', (req, res) => {
    res.json(candidateVoiceJob(id(req)));
  });

  /** 이 후보로 만들기: 대본을 고르고 바로 영상(검수용) 만들기를 시작한다 */
  api.post('/projects/:id/candidates/make', (req, res) => {
    const pid = id(req);
    const { style, hookType } = req.body ?? {};
    if (!isStyleId(style) || !isHookType(hookType)) throw new HttpError(400, '후보를 다시 골라 주세요.');
    let built;
    try {
      built = scriptForCandidate(repo.getRecipe(pid), style, hookType);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const detached = detachChangedMedia(repo, pid, repo.latestScript(pid)?.script, built.script);
    repo.addScriptVersion(pid, built.script, 'template', `후보 선택: ${built.title} (${STYLE_INFO[style].label} · ${HOOK_INFO[hookType].label})`);
    const origin = `http://127.0.0.1:${req.socket.localPort}`;
    const keepAlive = process.env.KEEPALIVE === '1' ? publicOrigin(req) : undefined;
    const renderId = deps.startRender(repo, pid, origin, keepAlive);
    res.status(202).json({ project: repo.getProject(pid), renderId, notes: [...built.notes, ...detached] });
  });

  api.post('/projects/:id/candidates/select', (req, res) => {
    const pid = id(req);
    const { style, hookType } = req.body ?? {};
    if (!isStyleId(style) || !isHookType(hookType)) throw new HttpError(400, '후보를 다시 골라 주세요.');
    let built;
    try {
      built = scriptForCandidate(repo.getRecipe(pid), style, hookType);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const detached = detachChangedMedia(repo, pid, repo.latestScript(pid)?.script, built.script);
    repo.addScriptVersion(pid, built.script, 'template', `후보 선택: ${built.title} (${STYLE_INFO[style].label} · ${HOOK_INFO[hookType].label})`);
    res.json({ project: repo.getProject(pid), notes: [...built.notes, ...detached] });
  });

  // ── 블로그 문체 후보 2개 비교·선택 ──
  api.get('/projects/:id/blog/compare', (req, res) => {
    const pid = id(req);
    const project = repo.getProject(pid);
    const review = project.approval ? { reviewer: project.approval.reviewer, reviewedAt: project.approval.createdAt } : null;
    const notes = repo.getExpertNotes(pid);
    const dish = project.recipe.dishName || project.recipe.topic;
    const options = blogStylePair(project.recipe).map((style) => {
      const post = buildExpertBlog({ recipe: project.recipe, style, notes, review });
      return { style, info: BLOG_STYLE_INFO[style], post, pending: post.pending, lint: lintBlog(post.markdown, { dish, notes }) };
    });
    res.json({ options, selected: project.blogStyle });
  });

  api.put('/projects/:id/blog-style', (req, res) => {
    const pid = id(req);
    const style = String(req.body?.style ?? '');
    if (style && !(BLOG_STYLES as readonly string[]).includes(style)) throw new HttpError(400, '알 수 없는 글 유형입니다.');
    repo.setBlogStyle(pid, style);
    res.json(repo.getProject(pid));
  });

  // ── 게시 기록·성과 ──
  api.post('/projects/:id/publications', (req, res) => {
    const pid = id(req);
    const body = req.body ?? {};
    const platform = String(body.platform) as Publication['platform'];
    if (!(platform in PLATFORM_URL)) throw new HttpError(400, '플랫폼을 고르세요.');
    const status = body.status === 'scheduled' ? 'scheduled' : 'published';
    const state = repo.versionState(pid);
    const version = state.latestScriptVersion;
    // 승인되지 않은 콘텐츠는 게시(기록)하지 않는다
    if (version === null || state.approvedScriptVersion !== version) throw new HttpError(409, '이희재 연구자의 승인을 받은 최신 콘텐츠만 게시할 수 있어요.');
    const render = repo.getProject(pid).renders.find((r) => r.status === 'done' && r.scriptVersion === version);
    if (platform === 'naver') {
      // 고른 블로그 원고에 '답변 대기' 칸이 남았거나 연구자 확인이 없으면 발행 기록을 막는다
      const style = repo.getBlogStyle(pid);
      if ((BLOG_STYLES as readonly string[]).includes(style)) {
        const approval = repo.lastReview(pid, version)!;
        const post = buildExpertBlog({ recipe: repo.getRecipe(pid), style: style as BlogStyle, notes: repo.getExpertNotes(pid), review: { reviewer: approval.reviewer, reviewedAt: approval.createdAt } });
        if (!post.ready) throw new HttpError(409, `블로그 원고가 아직 준비되지 않았어요: ${post.blockers.join(' ')}`);
      }
    }
    if (platform !== 'naver' && !render) throw new HttpError(409, '승인된 대본으로 만든 영상이 없어요. 영상을 먼저 만들어 주세요.');
    const url = String(body.url ?? '').trim();
    if (status === 'published' && !PLATFORM_URL[platform].test(url)) throw new HttpError(400, '게시물 주소를 확인해 주세요. (예: 인스타그램 https://www.instagram.com/reel/…)');
    const scheduledAt = status === 'scheduled' ? String(body.scheduledAt ?? '') : '';
    if (status === 'scheduled' && Number.isNaN(Date.parse(scheduledAt))) throw new HttpError(400, '예약 시각을 입력해 주세요.');
    const dup = repo.listPublications(pid).find((p) => p.platform === platform && p.status === 'published' && p.scriptVersion === version);
    if (dup && status === 'published' && !body.confirmDuplicate) throw new HttpError(409, `이 콘텐츠는 이미 ${platform}에 게시됐어요 (${dup.url}). 다시 기록하려면 확인이 필요해요.`);
    const script = repo.getScript(pid, version).script;
    const pub = repo.addPublication(pid, {
      renderId: render?.id ?? null,
      scriptVersion: version,
      platform,
      status,
      url,
      scheduledAt,
      publishedAt: status === 'published' ? new Date().toISOString() : '',
      style: script.style ?? '',
      hookType: script.hookType ?? '',
      note: String(body.note ?? '').slice(0, 500),
    });
    res.status(201).json(pub);
  });

  api.put('/publications/:id/metrics', (req, res) => {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const metrics: Record<string, number> = {};
    for (const k of METRIC_KEYS) {
      const v = raw[k];
      if (v === undefined || v === '' || v === null) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${k} 값이 올바르지 않아요.`);
      metrics[k] = n;
    }
    res.json(repo.setPublicationMetrics(id(req), metrics));
  });

  api.get('/insights', (_req, res) => res.json(formatInsights(repo.allPublications())));

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
