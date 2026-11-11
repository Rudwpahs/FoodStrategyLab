import './testDataDir.ts';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, buildStyledScript } from '@mat-lab/recipe-core';
import { QUICK_RULES } from '@mat-lab/publishing';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { Humanizer, rewriteCostUsd, type RewriteFn } from './humanize.ts';
import { monthSpentUsd } from './claudeUsage.ts';
import { Repo } from './repo.ts';

/**
 * 가짜 Claude: 받은 항목에서 "매우 중요합니다"·"되어집니다"를 고치고(정상 윤문),
 * 숫자가 든 대사는 숫자를 바꿔 돌려준다(게이트가 잡아야 하는 사고).
 */
const calls: { system: string; user: string }[] = [];
const fakeRewrite: RewriteFn = async ({ system, user }) => {
  calls.push({ system, user });
  const body = user.slice(user.indexOf('<윤문할_'));
  const json = body.slice(body.indexOf('['), body.lastIndexOf(']') + 1);
  const items = JSON.parse(json) as { id: string; text: string }[];
  return {
    parsed: {
      items: items.map((i) => ({
        id: i.id,
        text: /\d/.test(i.text)
          ? i.text.replace(/\d+/, (n) => String(Number(n) + 10))
          : i.text.replace('매우 중요합니다', '중요합니다').replace('되어집니다', '됩니다').replace('매우 중요해요', '중요해요'),
      })),
      notes: 'D-2 1곳',
    },
    usage: { inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 9000, cacheReadTokens: 0 },
    stopReason: 'end_turn',
  };
};

let base = '';
let repo: Repo;
let close: () => void;
beforeAll(async () => {
  repo = new Repo(openDb(':memory:'));
  const app = createApp(repo, { startRender: () => 0, humanizer: new Humanizer(repo.db, fakeRewrite) });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  close = () => server.close();
});
afterAll(() => close());

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

describe('im-not-ai 윤문 (가짜 Claude)', () => {
  it('규칙 검사에서 AI 티가 없으면 Claude를 부르지 않는다 (비용 0원), 원하면 그래도 다듬는다', async () => {
    const pid = repo.createProject(SAMPLE_RECIPES[1]!);
    repo.addScriptVersion(pid, buildStyledScript(SAMPLE_RECIPES[1]!, { style: 'experiment' }).script, 'template');
    const before = calls.length;
    const r = await call('POST', `/projects/${pid}/humanize`, { target: 'script' });
    expect(r.status).toBe(200);
    expect(r.body.skipped).toBeTruthy();
    expect(r.body.costUsd).toBe(0);
    expect(calls.length).toBe(before);
    const forced = await call('POST', `/projects/${pid}/humanize`, { target: 'script', force: true });
    expect(forced.body.skipped).toBeUndefined();
    expect(calls.length).toBe(before + 1);
  });

  it('대사: 룰북 원문을 보내고, 숫자를 바꾼 대사는 원래대로 두고, [적용]하면 새 대본 버전이 된다', async () => {
    const recipe = SAMPLE_RECIPES[3]!; // 호두정과 (140도)
    const pid = repo.createProject(recipe);
    const script = buildStyledScript(recipe, { style: 'experiment' }).script;
    script.scenes[1] = { ...script.scenes[1]!, line: '이 단계가 매우 중요해요!' };
    const v = repo.addScriptVersion(pid, script, 'template');
    const r = await call('POST', `/projects/${pid}/humanize`, { target: 'script' });
    expect(r.status).toBe(200);
    const last = calls.at(-1)!;
    expect(last.system).toContain(QUICK_RULES);
    expect(last.user).toContain('<진단');
    expect(r.body.tellsBefore).toBeGreaterThan(0);
    expect(r.body.version).toBe(v);
    const changed = r.body.items.filter((i: any) => i.changed);
    expect(changed.map((i: any) => i.after)).toContain('이 단계가 중요해요!');
    const withNumber = r.body.items.find((i: any) => i.before.includes('140도'));
    expect(withNumber.after).toBe(withNumber.before);
    expect(withNumber.reasons.join()).toContain('number_injected');
    expect(withNumber.rejected).toContain('150도');
    expect(monthSpentUsd(repo.db)).toBeGreaterThan(0);

    // 화면이 숫자를 바꾼 결과를 억지로 보내도 서버가 다시 검사해서 막는다
    const sneaky = await call('POST', `/projects/${pid}/humanize/apply`, { target: 'script', version: v, items: [{ id: withNumber.id, before: withNumber.before, after: withNumber.rejected }] });
    expect(sneaky.status).toBe(400);

    const applied = await call('POST', `/projects/${pid}/humanize/apply`, { target: 'script', version: v, items: changed });
    expect(applied.status).toBe(200);
    expect(applied.body.project.latest.version).toBe(v + 1);
    expect(applied.body.project.latest.script.scenes[1].line).toBe('이 단계가 중요해요!');
    // 화면 카드는 그대로
    expect(applied.body.project.latest.script.scenes.map((s: any) => s.cardItems)).toEqual(script.scenes.map((s) => s.cardItems));
    // 옛 버전 기준으로 다시 적용하면 거절
    expect((await call('POST', `/projects/${pid}/humanize/apply`, { target: 'script', version: v, items: changed })).status).toBe(409);
  });

  it('블로그: 연구자 답변·재료·순서는 보내지 않고, 적용하면 원고·복사본에 반영되며 되돌릴 수 있다', async () => {
    const recipe = { ...SAMPLE_RECIPES[0]!, principle: '반죽을 미리 섞어 두지 않는 것이 매우 중요합니다. 김이 빠지지 못하면 겉면이 다시 젖게 되어집니다.' };
    const pid = repo.createProject(recipe);
    const answer = '수업에서 보면 반죽을 미리 만들어 두는 분이 정말 많아요. 그러면 매우 중요합니다라는 말을 꼭 해요.';
    repo.setExpertNotes(pid, { answers: { 'key-step': answer } });
    const r = await call('POST', `/projects/${pid}/humanize`, { target: 'blog', style: 'expert-note' });
    expect(r.status).toBe(200);
    const sent = calls.at(-1)!.user;
    expect(sent).not.toContain('수업에서 보면');
    for (const s of recipe.steps) expect(sent).not.toContain(s);
    const changed = r.body.items.filter((i: any) => i.changed);
    expect(changed.length).toBeGreaterThan(0);
    const applied = await call('POST', `/projects/${pid}/humanize/apply`, { target: 'blog', style: 'expert-note', items: changed });
    expect(applied.status).toBe(200);
    const blog = await call('GET', `/projects/${pid}/blog?style=expert-note`);
    expect(blog.body.polished).toBeGreaterThan(0);
    expect(blog.body.post.markdown).toContain('반죽을 미리 섞어 두지 않는 것이 중요합니다.');
    expect(blog.body.post.markdown).toContain(answer); // 답변 원문은 그대로
    const cleared = await call('DELETE', `/projects/${pid}/polish`);
    expect(cleared.status).toBe(200);
    expect((await call('GET', `/projects/${pid}/blog?style=expert-note`)).body.polished).toBe(0);
  });

  it('대사별 AI 티 검사는 비용 없이 볼 수 있다', async () => {
    const pid = repo.createProject(SAMPLE_RECIPES[0]!);
    const script = buildStyledScript(SAMPLE_RECIPES[0]!, { style: 'problem' }).script;
    script.scenes[0] = { ...script.scenes[0]!, line: '이것은 시사하는 바가 커요.' };
    repo.addScriptVersion(pid, script, 'template');
    const r = await call('GET', `/projects/${pid}/ai-tells`);
    expect(r.body.scenes[0].tells[0].rule).toBe('D-2');
    expect(r.body.source).toContain('im-not-ai');
  });

  it('이번 달 한도를 넘으면 Claude를 부르지 않는다', async () => {
    const db = openDb(':memory:');
    const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date());
    db.prepare('INSERT INTO ai_usage (created_at, month, purpose, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), month, 'x', 'm', 0, 0, 1000);
    const n = calls.length;
    await expect(new Humanizer(db, fakeRewrite).run('blog', [{ id: 'p1', text: '이것은 매우 중요합니다.' }], { keep: [] })).rejects.toThrow(/한도/);
    expect(calls.length).toBe(n);
  });

  it('비용 계산: 캐시 쓰기 1.25배, 캐시 읽기 0.1배', () => {
    expect(rewriteCostUsd('claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 })).toBeCloseTo(4);
    expect(rewriteCostUsd('claude-opus-5-5', { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000, cacheReadTokens: 1_000_000 })).toBeCloseTo(5.4);
  });
});
