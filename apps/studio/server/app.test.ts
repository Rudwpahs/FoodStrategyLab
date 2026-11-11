import './testDataDir.ts';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '@mat-lab/recipe-core';
import fs from 'node:fs';
import path from 'node:path';
import { createApp, type AppDeps } from './app.ts';
import { DATA_DIR } from './config.ts';
import { HttpError } from './repo.ts';
import { friendlyRenderError, startRender } from './pipeline.ts';
import { openDb } from './db.ts';
import { Repo } from './repo.ts';
import { mp3DurationSeconds } from './tts.ts';

let base = '';
let testRepo: Repo;
let close: () => void;

beforeAll(async () => {
  // 실제 3D 렌더 대신: 렌더 기록을 만들고 바로 완료로 표시하는 가짜 제작기
  const fakeRender: AppDeps['startRender'] = (repo, pid) => {
    const state = repo.versionState(pid);
    if (state.latestScriptVersion === null) throw new HttpError(409, '대본이 아직 없습니다.');
    const rid = repo.createRender(pid, state.latestScriptVersion);
    const dir = path.join(DATA_DIR, 'renders', String(rid));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'video.mp4'), 'fake');
    fs.writeFileSync(path.join(dir, 'timeline.json'), '[]');
    repo.updateRender(rid, { status: 'done', stage: '완료', progress: 1, outputDir: dir, finished: true });
    return rid;
  };
  testRepo = new Repo(openDb(':memory:'));
  const app = createApp(testRepo, { startRender: fakeRender });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  close = () => server.close();
});
afterAll(() => close());

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const allChecked = { ingredients: true, safety: true, noFakeClaims: true, expression: true };

describe('스튜디오 API 흐름', () => {
  it('입력 → 대본 → 검수용 영상 → 승인 전에는 내보내기 불가 → 승인 후 수정하면 다시 불가', async () => {
    const created = await call('POST', '/projects', { recipe: SAMPLE_RECIPES[1] });
    expect(created.status).toBe(201);
    const pid = created.body.id;

    expect((await call('POST', `/projects/${pid}/renders`)).status).toBe(409);

    const scripted = await call('POST', `/projects/${pid}/script/template`);
    expect(scripted.body.status).toBe('review');
    expect(scripted.body.latest.version).toBe(1);

    // 승인 전에도 '검수용 영상'은 만들 수 있지만, 내보내기(ZIP)는 승인 후에만
    const draft = await call('POST', `/projects/${pid}/renders`);
    expect(draft.status).toBe(202);
    expect((await call('GET', `/renders/${draft.body.renderId}/download`)).status).toBe(409);
    expect((await call('GET', `/projects/${pid}/reel-prompts`)).status).toBe(409);

    const check = await call('GET', `/projects/${pid}/check`);
    expect(check.body.issues.filter((i: { level: string }) => i.level === 'error')).toEqual([]);

    const missing = await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: { ...allChecked, safety: false }, decision: 'approved' });
    expect(missing.status).toBe(400);

    const approved = await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved' });
    // 검수용 영상이 이미 있으므로 승인과 동시에 '제작 완료' 상태
    expect(approved.body.status).toBe('rendered');
    expect(approved.body.approval.reviewer).toBe('이희재');

    const pack = await call('GET', `/projects/${pid}/reel-prompts`);
    // 약 8초 클립으로 묶고, 클립당 대사는 2줄 이하, 모든 장면이 순서대로 들어간다
    const ids = pack.body.clips.flatMap((c: { sceneIds: string[] }) => c.sceneIds);
    expect(ids).toEqual(approved.body.latest.script.scenes.map((x: { id: string }) => x.id));
    expect(pack.body.clips.every((c: { sceneIds: string[] }) => c.sceneIds.length <= 2)).toBe(true);
    expect(pack.body.clips[0].videoPrompt).toContain(approved.body.latest.script.scenes[0].line);
    expect(pack.body.characterSheet).toContain('MATJOSU');

    const blog = await call('GET', `/projects/${pid}/blog`);
    expect(blog.body.social.instagram).toContain('검토한');

    // 승인 전에 만든 검수용 영상도 같은 버전이 승인되면 내보낼 수 있다 (다시 렌더하지 않음)
    const zip = await fetch(`${base}/renders/${draft.body.renderId}/download`);
    expect(zip.status).toBe(200);
    expect(zip.headers.get('content-type')).toContain('zip');
    // 렌더 폴더의 묶음 파일은 주소로 직접 받을 수 없다
    expect((await fetch(`${base.replace('/api', '')}/media/renders/${draft.body.renderId}/package.zip`)).status).toBe(403);

    const script = approved.body.latest.script;
    script.scenes[1].line = '수정된 대사입니다.';
    const edited = await call('PUT', `/projects/${pid}/script`, { script });
    expect(edited.body.latest.version).toBe(2);
    expect(edited.body.status).toBe('review');
    // 승인 후 내용이 바뀌면 예전 영상은 내보낼 수 없다
    expect((await call('GET', `/renders/${draft.body.renderId}/download`)).status).toBe(409);

    const stale = await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved' });
    expect(stale.status).toBe(409);

    const restored = await call('POST', `/projects/${pid}/versions/1/restore`);
    expect(restored.body.latest.version).toBe(3);
    expect(restored.body.latest.script.scenes[1].line).not.toBe('수정된 대사입니다.');
  });

  it('승인 후 원본 레시피를 고치면 재검수가 필요하다', async () => {
    const pid = (await call('POST', '/projects', { recipe: SAMPLE_RECIPES[2] })).body.id;
    await call('POST', `/projects/${pid}/script/template`);
    await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved' });
    const recipe = { ...SAMPLE_RECIPES[2], tips: ['새 팁'] };
    const updated = await call('PUT', `/projects/${pid}/recipe`, { recipe });
    expect(updated.body.status).toBe('review');
    expect(updated.body.recipe.tips).toEqual(['새 팁']);
  });

  it('승인 전이라도 원본 레시피를 고치면 새 대본 버전이 되어, 옛 레시피로 만든 영상·카드는 내보낼 수 없다', async () => {
    const pid = (await call('POST', '/projects', { recipe: SAMPLE_RECIPES[2] })).body.id;
    await call('POST', `/projects/${pid}/script/template`);
    const old = (await call('POST', `/projects/${pid}/renders`)).body.renderId;
    // 같은 내용으로 저장만 하면 새 버전을 만들지 않는다
    expect((await call('PUT', `/projects/${pid}/recipe`, { recipe: SAMPLE_RECIPES[2] })).body.latest.version).toBe(1);
    const recipe = { ...SAMPLE_RECIPES[2], tips: [...SAMPLE_RECIPES[2]!.tips, '새 팁'] };
    const updated = await call('PUT', `/projects/${pid}/recipe`, { recipe });
    expect(updated.body.latest.version).toBe(2);
    expect((await call('POST', `/projects/${pid}/reviews`, { version: 2, reviewer: '이희재', checklist: allChecked, decision: 'approved' })).status).toBe(200);
    expect((await call('GET', `/renders/${old}/download`)).status).toBe(409);
  });

  it('영상 자동 검사에서 대사 잘림 같은 오류가 나오면, 확인 없이 승인하지 않는다', async () => {
    const pid = (await call('POST', '/projects', { recipe: SAMPLE_RECIPES[2] })).body.id;
    await call('POST', `/projects/${pid}/script/template`);
    const rid = (await call('POST', `/projects/${pid}/renders`)).body.renderId;
    testRepo.setRenderQa(rid, { issues: [{ level: 'error', code: 'cut', scene: 2, sceneId: 's2', at: 8.15, message: '장면 2 대사 끝이 잘렸어요.' }], checked: ['대사 끝 잘림'], fixed: [] });
    const blocked = await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain('대사 끝이 잘렸어요');
    expect((await call('GET', `/renders/${rid}`)).body.qa.issues[0].code).toBe('cut');
    // 수정 요청은 막지 않는다
    expect((await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'changes_requested', note: '잘림' })).status).toBe(200);
    // 직접 보고 확인했다면 승인할 수 있다
    expect((await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved', acceptQa: true })).status).toBe(200);
  });

  it('AI 붙여넣기 오류는 400으로 알려준다', async () => {
    const pid = (await call('POST', '/projects', { recipe: SAMPLE_RECIPES[0] })).body.id;
    const res = await call('POST', `/projects/${pid}/script/ai`, { text: '죄송해요, 못 만들었어요' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('JSON');
    expect((await call('GET', `/projects/${pid}/ai-prompt`)).body.prompt).toContain('잘 익은 김치 200g');
  });

  it('잘못된 입력은 400', async () => {
    expect((await call('POST', '/projects', { recipe: { topic: '' } })).status).toBe(400);
    expect((await call('GET', '/projects/999')).status).toBe(404);
  });
});

describe('훅·연출 선택', () => {
  const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

  it('훅 후보를 이유와 함께 주고, 고른 훅으로 대본을 만들고, 훅만 바꾸면 나머지 장면은 그대로다', async () => {
    const pid = (await call('POST', '/projects', { recipe: walnut })).body.id;
    const hooks = await call('GET', `/projects/${pid}/hooks?style=experiment`);
    expect(hooks.status).toBe(200);
    expect(hooks.body.hooks).toHaveLength(15);
    expect(hooks.body.hooks[0].reason).toBeTruthy();
    expect(hooks.body.styles.experiment.label).toBe('요리 과학 실험형');

    const made = await call('POST', `/projects/${pid}/script/styled`, { style: 'experiment', hookType: 'experiment' });
    expect(made.status).toBe(200);
    const v1 = made.body.project.latest;
    expect(v1.script.scenes[0].visual).toBe('compare');
    expect(made.body.notes.join(' ')).toContain('설명용');

    // 승인 후 훅을 바꾸면 새 버전이 되어 승인이 풀린다
    await call('POST', `/projects/${pid}/reviews`, { version: v1.version, reviewer: '이희재', checklist: allChecked, decision: 'approved' });
    const changed = await call('POST', `/projects/${pid}/script/hook`, { hookType: 'result-first' });
    expect(changed.status).toBe(200);
    const v2 = changed.body.project.latest;
    expect(v2.version).toBe(v1.version + 1);
    expect(changed.body.project.status).toBe('review');
    expect(v2.script.scenes[0].visual).toBe('result');
    expect(v2.script.scenes.slice(1)).toEqual(v1.script.scenes.slice(1));
  });

  it('대본을 새로 만들어 장면 내용이 바뀌면, 그 장면에 붙인 클립 연결을 풀고 알려준다', async () => {
    const pid = (await call('POST', '/projects', { recipe: walnut })).body.id;
    await call('POST', `/projects/${pid}/script/template`);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a9f00000000049454e44ae426082', 'hex');
    const up = await fetch(`${base}/projects/${pid}/scenes/s1/media`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png });
    expect(up.status).toBe(200);
    const made = await call('POST', `/projects/${pid}/script/styled`, { style: 'comedy' });
    expect(made.body.notes.join(' ')).toContain('연결을 풀었어요');
    expect(made.body.project.sceneMedia.s1).toBeUndefined();
  });

  it('빨간 오류가 있으면 블로그는 게시 준비가 아니다', async () => {
    const pid = (await call('POST', '/projects', { recipe: walnut })).body.id;
    await call('POST', `/projects/${pid}/script/template`);
    const latest = (await call('GET', `/projects/${pid}`)).body.latest;
    // 대본에 원본에 없는 분량을 넣는다
    const bad = { ...latest.script, scenes: latest.script.scenes.map((s: { id: string; line: string }, i: number) => (i === 2 ? { ...s, line: `${s.line} 180도에서 튀기세요.` } : s)) };
    await call('PUT', `/projects/${pid}/script`, { script: bad, note: 'test' });
    const v = (await call('GET', `/projects/${pid}`)).body.latest.version;
    // 원본과 다른 분량이 있으면 승인 자체가 막힌다
    const blocked = await call('POST', `/projects/${pid}/reviews`, { version: v, reviewer: '이희재', checklist: allChecked, decision: 'approved' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain('180도');
    await call('PUT', `/projects/${pid}/expert-notes`, { answers: { 'key-step': '데치기', failure: '딱딱해짐', fix: '불 끄기' }, confirmBy: '이희재' });
    const blog = await call('GET', `/projects/${pid}/blog?style=expert-note`);
    expect(blog.body.consistency.some((c: { level: string }) => c.level === 'error')).toBe(true);
    expect(blog.body.expert.ready).toBe(false);
    expect(blog.body.expert.blockers.join(' ')).toContain('오류');
  });

  it('자료가 없어 만들 수 없는 훅은 400으로 이유를 알려준다', async () => {
    const pid = (await call('POST', '/projects', { recipe: walnut })).body.id;
    const r = await call('POST', `/projects/${pid}/script/styled`, { style: 'problem', hookType: 'mistake' });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('흔한 실수');
    expect((await call('POST', `/projects/${pid}/script/styled`, { style: 'nope' })).status).toBe(400);
  });
});

describe('연구자 답변 블로그', () => {
  const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

  it('답변 저장 → 유형별 원고에 반영, 답이 바뀌면 본인 확인이 풀린다', async () => {
    const pid = (await call('POST', '/projects', { recipe: walnut })).body.id;
    const q = await call('GET', `/projects/${pid}/expert-notes`);
    expect(q.body.questions.length).toBeGreaterThanOrEqual(10);

    let blog = await call('GET', `/projects/${pid}/blog?style=expert-note`);
    expect(blog.body.expert.ready).toBe(false);
    expect(blog.body.post.markdown).toContain('[연구자 답변 대기]');

    const answers = { 'key-step': '데친 뒤 찬물에 헹구는 단계', failure: '시럽을 오래 졸이면 딱딱해져요', fix: '불을 일찍 끕니다', bogus: '무시' };
    const saved = await call('PUT', `/projects/${pid}/expert-notes`, { answers, confirmBy: '이희재' });
    expect(saved.body.notes.confirmedBy).toBe('이희재');
    expect(saved.body.notes.answers.bogus).toBeUndefined();

    blog = await call('GET', `/projects/${pid}/blog?style=expert-note`);
    expect(blog.body.post.markdown).toContain('시럽을 오래 졸이면 딱딱해져요');
    expect(blog.body.expert.pending).toEqual([]);
    // 대본 승인이 없으므로 아직 게시 준비는 아니다
    expect(blog.body.expert.blockers.join(' ')).toContain('승인');

    const edited = await call('PUT', `/projects/${pid}/expert-notes`, { answers: { ...answers, fix: '다르게 고침' } });
    expect(edited.body.notes.confirmedBy).toBeUndefined();

    // 스타일을 안 고르면 기존 자동 원고
    const auto = await call('GET', `/projects/${pid}/blog`);
    expect(auto.body.expert).toBeNull();
  });
});

describe('최종 사용자 흐름: 후보 3개 → 선택 → 검수용 영상 → 블로그 선택 → 승인 → 게시 기록', () => {
  const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
  const pilot = { ...walnut, commonMistake: '호두를 데치지 않고 바로 조리면 떫은맛이 남을 수 있어요.' };

  it('호두정과 파일럿 흐름이 끝까지 이어진다', async () => {
    const pid = (await call('POST', '/projects', { recipe: pilot })).body.id;

    // 1~3. 후보 3개: 연출·훅·첫 화면이 모두 다르다
    const c = await call('GET', `/projects/${pid}/candidates`);
    expect(c.body.candidates.map((x: { style: string }) => x.style)).toEqual(['problem', 'comedy', 'experiment']);
    expect(new Set(c.body.candidates.map((x: { firstVisual: string }) => x.firstVisual)).size).toBe(3);
    // 다른 후보 보기: 이미 본 것은 빠진다
    const keys = c.body.candidates.map((x: { key: string }) => x.key);
    const more = await call('GET', `/projects/${pid}/candidates?exclude=${keys.join(',')}`);
    for (const x of more.body.candidates) expect(keys).not.toContain(x.key);

    // 4. C(실험형) 선택 → 새 대본 버전
    const pick = c.body.candidates[2];
    const sel = await call('POST', `/projects/${pid}/candidates/select`, { style: pick.style, hookType: pick.hookType });
    expect(sel.body.project.latest.script.title).toBe(pick.title);
    expect(sel.body.project.latest.script.scenes[0].line).toBe(pick.firstLine);
    expect(sel.body.project.status).toBe('review');

    // 5. 승인 전 검수용 영상
    const r = await call('POST', `/projects/${pid}/renders`);
    expect(r.status).toBe(202);

    // 6. 블로그 문체 후보 2개 비교 → 선택
    const cmp = await call('GET', `/projects/${pid}/blog/compare`);
    expect(cmp.body.options).toHaveLength(2);
    expect(cmp.body.options[0].style).not.toBe(cmp.body.options[1].style);
    await call('PUT', `/projects/${pid}/blog-style`, { style: cmp.body.options[0].style });

    // 승인 전에는 게시 기록 불가
    expect((await call('POST', `/projects/${pid}/publications`, { platform: 'instagram', url: 'https://www.instagram.com/reel/abc' })).status).toBe(409);

    // 7. 승인
    const v = sel.body.project.latest.version;
    const ok = await call('POST', `/projects/${pid}/reviews`, { version: v, reviewer: '이희재', checklist: allChecked, decision: 'approved' });
    expect(ok.body.status).toBe('rendered');
    // 인스타그램 설명은 후보 첫 대사로 시작하고, 승인 후에만 '검토한'
    const blog = await call('GET', `/projects/${pid}/blog?style=${cmp.body.options[0].style}`);
    expect(blog.body.social.instagram.split('\n')[0]).toBe(pick.firstLine);
    expect(blog.body.social.instagram).toContain('검토한');

    // 8. 인스타그램: 실제 API 연결 전이므로 앱에서 올린 뒤 주소를 기록
    expect((await call('POST', `/projects/${pid}/publications`, { platform: 'instagram', url: 'https://example.com/x' })).status).toBe(400);
    const pub = await call('POST', `/projects/${pid}/publications`, { platform: 'instagram', url: 'https://www.instagram.com/reel/abc' });
    expect(pub.status).toBe(201);
    expect(pub.body.style).toBe('experiment');
    // 같은 콘텐츠 중복 게시 기록은 확인 필요
    expect((await call('POST', `/projects/${pid}/publications`, { platform: 'instagram', url: 'https://www.instagram.com/reel/def' })).status).toBe(409);
    // 예약 기록
    expect((await call('POST', `/projects/${pid}/publications`, { platform: 'youtube', status: 'scheduled', scheduledAt: '2026-11-10T09:00:00+09:00' })).status).toBe(201);

    // 9. 네이버: 고른 원고에 답변 대기 칸이 있으면 발행 기록 불가 → 답변·본인 확인 후 가능
    const early = await call('POST', `/projects/${pid}/publications`, { platform: 'naver', url: 'https://blog.naver.com/matlab/223456789' });
    expect(early.status).toBe(409);
    expect(early.body.error).toContain('블로그');
    const need = cmp.body.options[0].pending.map((q: { id: string }) => q.id);
    await call('PUT', `/projects/${pid}/expert-notes`, { answers: Object.fromEntries(need.map((k: string) => [k, '연구자 답변'])), confirmBy: '이희재' });
    expect((await call('POST', `/projects/${pid}/publications`, { platform: 'naver', url: 'https://blog.naver.com/matlab/223456789' })).status).toBe(201);

    // 10. 성과 입력 → 연출·훅별 모음
    expect((await call('PUT', `/publications/${pub.body.id}/metrics`, { reach: 1000, skipRate: 'abc' })).status).toBe(400);
    await call('PUT', `/publications/${pub.body.id}/metrics`, { reach: 1000, skipRate: 35, avgWatchSeconds: 12.5, saves: 20, shares: 10 });
    const ins = await call('GET', '/insights');
    const exp = ins.body.find((x: { kind: string; key: string }) => x.kind === 'style' && x.key === 'experiment');
    expect(exp.medianSavesSharesPerK).toBe(30);
    expect(exp.enough).toBe(false);

    // 승인 후 내용을 바꾸면 다시 승인 필요 + 게시 기록 불가
    const latest = (await call('GET', `/projects/${pid}`)).body.latest;
    const changed = { ...latest.script, scenes: latest.script.scenes.map((s: { line: string }, i: number) => (i === 1 ? { ...s, line: '바뀐 대사' } : s)) };
    await call('PUT', `/projects/${pid}/script`, { script: changed });
    expect((await call('POST', `/projects/${pid}/publications`, { platform: 'naver', url: 'https://blog.naver.com/matlab/223456790' })).status).toBe(409);
  });
});

describe('제작 작업 관리', () => {
  it('대기 중인 작업은 취소되고, 끝난 작업은 취소할 수 없다', async () => {
    const pid = (await call('POST', '/projects', { recipe: SAMPLE_RECIPES[1] })).body.id;
    await call('POST', `/projects/${pid}/script/template`);
    const done = (await call('POST', `/projects/${pid}/renders`)).body.renderId;
    expect((await call('POST', `/renders/${done}/cancel`)).status).toBe(409);
    const queued = testRepo.createRender(pid, 1);
    const c = await call('POST', `/renders/${queued}/cancel`);
    expect(c.body.status).toBe('canceled');
  });

  it('이미 만들고 있는 영상이 있으면 두 번 시작하지 않는다', () => {
    const pid = testRepo.createProject(SAMPLE_RECIPES[1]);
    testRepo.addScriptVersion(pid, { title: 't', scenes: [{ id: 's1', type: 'intro', emotion: 'joy', line: 'a' }, { id: 's2', type: 'explain', emotion: 'joy', line: 'b' }, { id: 's3', type: 'outro', emotion: 'joy', line: 'c' }] }, 'edit');
    testRepo.createRender(pid, 1);
    expect(() => startRender(testRepo, pid, 'http://127.0.0.1:1')).toThrow(/이미 만들고/);
  });

  it('렌더 오류는 쉬운 문장으로 바꾼다', () => {
    expect(friendlyRenderError('Error: Failed to launch the browser process')).toContain('크롬');
    expect(friendlyRenderError('ENOSPC: no space left on device')).toContain('저장 공간');
    expect(friendlyRenderError('VoiceStudio 음성 생성 실패 (500)')).toContain('VoiceStudio');
  });
});

describe('완성 사진', () => {
  it('사진을 올리면 미리보기 데이터에 사진과 색이 들어가고, 지울 수 있다', async () => {
    const pid = (await call('POST', '/projects', { recipe: SAMPLE_RECIPES[0] })).body.id;
    await call('POST', `/projects/${pid}/script/template`);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1d2f40000000049454e44ae426082', 'hex');
    const up = await fetch(`${base}/projects/${pid}/photo?color=%23cc8844`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png });
    expect(up.status).toBe(200);
    const preview = await call('GET', `/projects/${pid}/preview`);
    expect(preview.body.props.photoColor).toBe('#cc8844');
    expect(preview.body.props.recipe.topic).toBe(SAMPLE_RECIPES[0]!.topic);
    const bad = await fetch(`${base}/projects/${pid}/photo?color=red`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png });
    expect(bad.status).toBe(400);
    const removed = await call('DELETE', `/projects/${pid}/photo`);
    expect(removed.body.photo).toBe(null);
  });

  it('콘텐츠를 지우면 올린 사진·영상 파일도 함께 지운다', async () => {
    const pid = (await call('POST', '/projects', { recipe: SAMPLE_RECIPES[0] })).body.id;
    await call('POST', `/projects/${pid}/script/template`);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1d2f40000000049454e44ae426082', 'hex');
    const photo = (await (await fetch(`${base}/projects/${pid}/photo`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })).json()).photo.file as string;
    const rid = (await call('POST', `/projects/${pid}/renders`)).body.renderId;
    expect(fs.existsSync(path.join(DATA_DIR, photo))).toBe(true);
    expect((await call('DELETE', `/projects/${pid}`)).status).toBe(204);
    expect(fs.existsSync(path.join(DATA_DIR, photo))).toBe(false);
    expect(fs.existsSync(path.join(DATA_DIR, 'renders', String(rid)))).toBe(false);
    expect((await call('DELETE', `/projects/${pid}`)).status).toBe(404);
  });
});

describe('장면별 AI 클립', () => {
  it('장면에 이미지를 올리면 미리보기에 들어가고, 지울 수 있다', async () => {
    const pid = (await call('POST', '/projects', { recipe: SAMPLE_RECIPES[1] })).body.id;
    await call('POST', `/projects/${pid}/script/template`);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1d2f40000000049454e44ae426082', 'hex');
    const up = await fetch(`${base}/projects/${pid}/scenes/s3/media`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png });
    expect(up.status).toBe(200);
    const preview = await call('GET', `/projects/${pid}/preview`);
    expect(preview.body.props.sceneMedia.s3.kind).toBe('image');
    expect((await fetch(`${base}/projects/${pid}/scenes/..%2Fx/media`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })).status).toBe(400);
    const removed = await call('DELETE', `/projects/${pid}/scenes/s3/media`);
    expect(removed.body.sceneMedia).toEqual({});
  });
});

describe('미디어 파일 보내기', () => {
  const media = (p: string) => fetch(`${base.replace('/api', '')}/media/${p}`);

  it('DB·설정 파일 같은 데이터 폴더의 다른 파일은 보내지 않는다', async () => {
    fs.writeFileSync(path.join(DATA_DIR, 'studio.db'), 'SQLite format 3 secret');
    fs.writeFileSync(path.join(DATA_DIR, 'settings.json'), '{}');
    for (const p of ['studio.db', 'settings.json', 'studio%2edb', 'audio/..%2fstudio.db', 'renders/..%2fstudio.db']) {
      const r = await media(p);
      expect(r.status, p).not.toBe(200);
      expect(await r.text(), p).not.toContain('SQLite');
    }
  });

  it('렌더 폴더의 글·묶음 파일은 점을 인코딩해도 받을 수 없고, 영상·이미지는 받을 수 있다', async () => {
    const dir = path.join(DATA_DIR, 'renders', '777');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'blog.md'), 'SECRET BLOG');
    fs.writeFileSync(path.join(dir, 'package.zip'), 'SECRET ZIP');
    fs.writeFileSync(path.join(dir, 'video.mp4'), 'mp4');
    for (const p of ['blog.md', 'blog%2emd', 'blog%2Emd', 'package%2ezip', 'BLOG.MD']) {
      const r = await media(`renders/777/${p}`);
      expect(r.status, p).not.toBe(200);
      expect(await r.text(), p).not.toContain('SECRET');
    }
    const ok = await media('renders/777/video.mp4');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('없는 파일 오류에 서버 안의 경로를 드러내지 않는다', async () => {
    const r = await media('audio/nope.mp3');
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain(DATA_DIR);
  });
});

describe('테스트 격리', () => {
  it('테스트 파일마다 따로 만든 데이터 폴더를 쓴다 (동시에 돌 때 settings.json 등이 겹치지 않게)', () => {
    expect(path.basename(DATA_DIR)).toMatch(/^matlab-test-/);
  });
});

describe('MP3 길이 측정', () => {
  it('MPEG2 Layer III 24kHz 48kbps 프레임을 센다', () => {
    // 프레임 헤더 FF F3 64 C4: MPEG2, Layer III, 48kbps, 24kHz → 프레임 144바이트, 0.024초
    const frame = Buffer.alloc(144);
    frame.set([0xff, 0xf3, 0x64, 0xc4]);
    const buf = Buffer.concat(Array.from({ length: 125 }, () => frame));
    expect(mp3DurationSeconds(buf)).toBeCloseTo(3, 5);
  });
});

describe('목소리 고르기', () => {
  it('목록의 목소리와 빠르기를 고르고, 목록에 없는 값은 거절한다', async () => {
    const info = await call('GET', '/voice');
    expect(info.body.presets[0].id).toBe('matjosu');
    expect(info.body.tempos.map((t: { value: number }) => t.value)).toEqual([0.9, 1, 1.1, 1.2]);
    expect((await call('PUT', '/voice/preset', { id: 'nope' })).status).toBe(400);
    const picked = await call('PUT', '/voice/preset', { id: 'matjosu' });
    expect(picked.body.selectedPreset).toBe('matjosu');
    expect((await call('PUT', '/voice/tempo', { tempo: 1.7 })).status).toBe(400);
    expect((await call('PUT', '/voice/tempo', { tempo: 1.1 })).body.tempo).toBe(1.1);
    const after = await call('GET', '/voice');
    expect(after.body.selectedPreset).toBe('matjosu');
    expect(after.body.tempo).toBe(1.1);
    await call('PUT', '/voice/tempo', { tempo: 1 });
  });
});
