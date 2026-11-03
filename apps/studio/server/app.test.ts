import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES } from '@mat-lab/recipe-core';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { Repo } from './repo.ts';
import { mp3DurationSeconds } from './tts.ts';

let base = '';
let close: () => void;

beforeAll(async () => {
  const app = createApp(new Repo(openDb(':memory:')));
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
  it('입력 → 대본 → 검수 → 승인 전에는 제작 불가 → 승인 후 수정하면 다시 불가', async () => {
    const created = await call('POST', '/projects', { recipe: SAMPLE_RECIPES[1] });
    expect(created.status).toBe(201);
    const pid = created.body.id;

    expect((await call('POST', `/projects/${pid}/renders`)).status).toBe(409);

    const scripted = await call('POST', `/projects/${pid}/script/template`);
    expect(scripted.body.status).toBe('review');
    expect(scripted.body.latest.version).toBe(1);

    expect((await call('POST', `/projects/${pid}/renders`)).status).toBe(409);
    expect((await call('GET', `/projects/${pid}/reel-prompts`)).status).toBe(409);

    const check = await call('GET', `/projects/${pid}/check`);
    expect(check.body.issues.filter((i: { level: string }) => i.level === 'error')).toEqual([]);

    const missing = await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: { ...allChecked, safety: false }, decision: 'approved' });
    expect(missing.status).toBe(400);

    const approved = await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved' });
    expect(approved.body.status).toBe('approved');
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

    const script = approved.body.latest.script;
    script.scenes[1].line = '수정된 대사입니다.';
    const edited = await call('PUT', `/projects/${pid}/script`, { script });
    expect(edited.body.latest.version).toBe(2);
    expect(edited.body.status).toBe('review');
    expect((await call('POST', `/projects/${pid}/renders`)).status).toBe(409);

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

describe('MP3 길이 측정', () => {
  it('MPEG2 Layer III 24kHz 48kbps 프레임을 센다', () => {
    // 프레임 헤더 FF F3 64 C4: MPEG2, Layer III, 48kbps, 24kHz → 프레임 144바이트, 0.024초
    const frame = Buffer.alloc(144);
    frame.set([0xff, 0xf3, 0x64, 0xc4]);
    const buf = Buffer.concat(Array.from({ length: 125 }, () => frame));
    expect(mp3DurationSeconds(buf)).toBeCloseTo(3, 5);
  });
});
