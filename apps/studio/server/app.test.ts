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

    const check = await call('GET', `/projects/${pid}/check`);
    expect(check.body.issues.filter((i: { level: string }) => i.level === 'error')).toEqual([]);

    const missing = await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: { ...allChecked, safety: false }, decision: 'approved' });
    expect(missing.status).toBe(400);

    const approved = await call('POST', `/projects/${pid}/reviews`, { version: 1, reviewer: '이희재', checklist: allChecked, decision: 'approved' });
    expect(approved.body.status).toBe('approved');
    expect(approved.body.approval.reviewer).toBe('이희재');

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

describe('MP3 길이 측정', () => {
  it('MPEG2 Layer III 24kHz 48kbps 프레임을 센다', () => {
    // 프레임 헤더 FF F3 64 C4: MPEG2, Layer III, 48kbps, 24kHz → 프레임 144바이트, 0.024초
    const frame = Buffer.alloc(144);
    frame.set([0xff, 0xf3, 0x64, 0xc4]);
    const buf = Buffer.concat(Array.from({ length: 125 }, () => frame));
    expect(mp3DurationSeconds(buf)).toBeCloseTo(3, 5);
  });
});
