import type { Request, Router } from 'express';
import { checkRevision, cleanReviseRequest, isWeekStart, nextWeekStart, weekStartOf, type Script } from '@mat-lab/recipe-core';
import { publicOrigin } from './auth.ts';
import { PlanStore } from './planSlots.ts';
import { HttpError, type Repo } from './repo.ts';
import type { ScriptReviser } from './scriptReviser.ts';
import type { startRender } from './pipeline.ts';

/**
 * 주간 계획·승인 대기열·쉬운 말 수정 요청 API (#/plan 화면).
 * 승인은 여기서 하지 않는다: 화면이 체크리스트를 받아 기존 검수 API(POST /projects/:id/reviews)를 부른다 (원칙 2·3 그대로).
 * 자동 게시는 하지 않는다: 칸에는 '언제'만 저장한다 (planSchema.ts).
 */
export interface PlanApiDeps {
  repo: Repo;
  reviser: ScriptReviser;
  startRender: typeof startRender;
  /** 새 대본에서 바뀐 장면에 붙어 있던 클립 연결 풀기 (app.ts) */
  detachChangedMedia: (repo: Repo, pid: number, before: Script | undefined, after: Script) => string[];
  /** 연구자 답변 원문 (원칙 4: 경험은 답변 원문만) */
  expertAnswers: (pid: number) => string[];
}

const num = (v: unknown, what = '번호') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `잘못된 ${what}입니다.`);
  return n;
};

export function mountPlanApi(api: Router, d: PlanApiDeps): PlanStore {
  const { repo } = d;
  const plan = new PlanStore(repo);
  /** 수정 요청을 반영하고 있는 콘텐츠 (두 번 눌러 두 번 결제되지 않게) */
  const revising = new Set<number>();
  const weekParam = (v: unknown) => {
    if (v === undefined || v === '') return weekStartOf(Date.now());
    if (!isWeekStart(v)) throw new HttpError(400, '주를 다시 골라 주세요 (월요일 날짜).');
    return v;
  };
  const viewOf = (week: string) => ({ ...plan.view(week), revise: { available: d.reviser.available() } });

  api.get('/plan', (req, res) => {
    res.json(viewOf(weekParam(req.query.week)));
  });

  /** 다음 주(또는 고른 주) 계획 세우기 */
  api.post('/plan/next-week', (req, res) => {
    const week = req.body?.week ? weekParam(req.body.week) : nextWeekStart(Date.now());
    const created = plan.planWeek(week);
    res.json({ ...viewOf(week), created: created.map((s) => s.id) });
  });

  api.put('/plan/slots/:id', (req, res) => {
    res.json(plan.move(num(req.params.id), String(req.body?.at ?? '')));
  });

  api.delete('/plan/slots/:id', (req, res) => {
    plan.remove(num(req.params.id));
    res.json({ ok: true });
  });

  /**
   * 쉬운 말로 수정 요청: Claude가 지금 대본을 고치고 → 원본 대조(재료·순서 카드는 원본으로, 원본에 없는 분량이 생기면 거절)
   * → 새 대본 버전으로 저장(승인이 풀림) → 검수용 영상 만들기 시작. 템플릿 대본도 된다.
   */
  api.post('/projects/:id/script/revise', async (req: Request, res) => {
    const pid = num(req.params.id);
    const cleaned = cleanReviseRequest(req.body?.request);
    if (!cleaned.ok) throw new HttpError(400, cleaned.error);
    const latest = repo.latestScript(pid);
    if (!latest) throw new HttpError(400, '먼저 대본을 만드세요.');
    if (req.body?.version !== undefined && Number(req.body.version) !== latest.version) throw new HttpError(409, `대본이 바뀌었어요 (지금 v${latest.version}). 화면을 새로 고친 뒤 다시 요청해 주세요.`);
    if (repo.versionState(pid).approvedScriptVersion === latest.version) throw new HttpError(409, '이미 승인된 대본이에요. 고치려면 콘텐츠 화면에서 대본을 고쳐 주세요 (고치면 다시 승인받아야 해요).');
    const busy = repo.getProject(pid).renders.find((r) => r.status === 'queued' || r.status === 'running');
    if (busy) throw new HttpError(409, `이미 만들고 있는 영상이 있어요 (작업 #${busy.id}). 끝나거나 취소한 뒤 다시 요청해 주세요.`);
    if (revising.has(pid)) throw new HttpError(409, '수정 요청을 반영하고 있어요. 잠시만 기다려 주세요.');
    revising.add(pid);
    try {
      const recipe = repo.getRecipe(pid);
      const { output, costUsd } = await d.reviser.revise(recipe, latest.script, cleaned.request, { expertAnswers: d.expertAnswers(pid) });
      // Claude를 기다리는 동안 누가 대본을 바꿨으면 저장하지 않는다
      if (repo.latestScript(pid)?.version !== latest.version) throw new HttpError(409, '기다리는 동안 대본이 바뀌었어요. 화면을 새로 고친 뒤 다시 요청해 주세요.');
      const checked = checkRevision(recipe, latest.script, output.story);
      if (!checked.ok) {
        repo.logEvent(pid, 'script', `수정 요청을 반영하지 못함 (약 $${costUsd.toFixed(2)}): ${checked.error}`);
        throw new HttpError(422, checked.error);
      }
      const by = (res.locals.user as { displayName?: string } | undefined)?.displayName || '스튜디오';
      // 요청은 지금 버전의 '수정 요청' 검수 기록으로 남긴다 (누가 무엇을 요청했는지)
      repo.addReview(pid, { version: latest.version, reviewer: by, checklist: { ingredients: false, safety: false, noFakeClaims: false, expression: false }, decision: 'changes_requested', note: `말로 수정 요청: ${cleaned.request}` });
      const c = checked.candidate;
      const detached = d.detachChangedMedia(repo, pid, latest.script, c.script);
      const version = repo.addScriptVersion(pid, c.script, 'ai-revise', `수정 요청 반영: ${cleaned.request.slice(0, 120)} (약 $${costUsd.toFixed(2)})`);
      plan.markChangeRequested(pid);
      const origin = `http://127.0.0.1:${req.socket.localPort}`;
      const keepAlive = process.env.KEEPALIVE === '1' ? publicOrigin(req) : undefined;
      const renderId = d.startRender(repo, pid, origin, keepAlive);
      res.status(202).json({ project: repo.getProject(pid), version, renderId, changes: output.changes, notes: [...c.notes, ...c.warnings, ...detached], costUsd });
    } finally {
      revising.delete(pid);
    }
  });

  return plan;
}
