import './testDataDir.ts';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_RECIPES, generateTemplateScript } from '@mat-lab/recipe-core';
import { DATA_DIR } from './config.ts';
import { openDb } from './db.ts';
import { RENDER_DIR, cancelRender, removeProject, startRender, type RenderDeps } from './pipeline.ts';
import { Repo, type RenderRow } from './repo.ts';

/**
 * runRender를 실제로 돌린다. 무거운 Remotion 렌더러만 가짜로 바꾸고 (파일만 쓴다),
 * 음성은 테스트 설정(TTS_PROVIDER=none)이라 만들지 않는다.
 */
const repo = new Repo(openDb(':memory:'));

const project = () => {
  const id = repo.createProject(SAMPLE_RECIPES[1]);
  repo.addScriptVersion(id, generateTemplateScript(repo.getRecipe(id)), 'template');
  return id;
};

/** 가짜 렌더러. hold를 주면 영상 렌더 중에 그 약속이 풀릴 때까지 멈춰 있다 (취소하면 바로 멈춘다) */
function fakeRenderer(hold?: Promise<void>) {
  const calls = { videos: 0, started: 0 };
  const renderer: RenderDeps['renderer'] = async () => ({
    getServeUrl: async () => 'fake',
    makeCancelSignal: () => {
      let onCancel = () => undefined as void;
      return { cancelSignal: (cb: () => void) => void (onCancel = cb), cancel: () => onCancel() };
    },
    renderVideo: async (o: { outputLocation: string; cancelSignal?: (cb: () => void) => void }) => {
      calls.started++;
      if (hold) await new Promise<void>((resolve, reject) => {
        o.cancelSignal?.(() => reject(new Error('renderMedia() got cancelled')));
        void hold.then(resolve);
      });
      fs.writeFileSync(o.outputLocation, 'fake mp4');
      calls.videos++;
    },
    renderStillImage: async (_id: string, _props: Record<string, unknown>, output: string) => fs.writeFileSync(output, 'fake png'),
  }) as unknown as Awaited<ReturnType<RenderDeps['renderer']>>;
  return { renderer, calls };
}

const noIssues: RenderDeps['audit'] = async () => ({ issues: [], checked: ['대사 끝 잘림', '목소리 없는 장면', '긴 무음', '검은 화면'] });

async function finished(renderId: number): Promise<RenderRow> {
  for (let i = 0; i < 500; i++) {
    const r = repo.getRender(renderId);
    if (r.status === 'done' || r.status === 'failed' || r.status === 'canceled') return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error(`render ${renderId} did not finish`);
}

async function until(check: () => boolean) {
  for (let i = 0; i < 500 && !check(); i++) await new Promise((res) => setTimeout(res, 10));
  expect(check()).toBe(true);
}

describe('영상 제작 (runRender)', () => {
  it('자동 검사를 실제로 못 돌리면 "검사함"으로 적지 않고 경고로 남긴다', async () => {
    const pid = project();
    // 가짜 영상 파일이라 소리·화면 분석(ffmpeg)이 실패한다
    const rid = startRender(repo, pid, 'http://127.0.0.1:1', undefined, { renderer: fakeRenderer().renderer });
    const r = await finished(rid);
    expect(r.status).toBe('done');
    expect(r.qa!.checked).not.toContain('대사 끝 잘림');
    expect(r.qa!.checked).not.toContain('검은 화면');
    const skipped = r.qa!.issues.filter((i) => i.code === 'skipped');
    expect(skipped.map((i) => i.message).join(' ')).toContain('소리 검사');
    expect(skipped.map((i) => i.message).join(' ')).toContain('화면 검사');
    expect(repo.getProject(pid).events.find((e) => e.message.startsWith('제작 완료'))!.message).not.toContain('통과');
  });

  it('대사 끝이 잘린 장면이 있으면 그 장면을 늘려 한 번 다시 만들고, 고친 것을 기록한다', async () => {
    const pid = project();
    const { renderer, calls } = fakeRenderer();
    let audits = 0;
    const audit: RenderDeps['audit'] = async (...args) => {
      audits++;
      return audits === 1 ? { issues: [{ level: 'error', code: 'cut', scene: 2, sceneId: 's2', at: 4, message: '장면 2 대사 끝이 잘렸어요.' }], checked: ['대사 끝 잘림'] } : noIssues(...args);
    };
    const r = await finished(startRender(repo, pid, 'http://127.0.0.1:1', undefined, { renderer, audit }));
    expect(r.status).toBe('done');
    expect(calls.videos).toBe(2);
    expect(r.qa!.fixed.join(' ')).toContain('장면 2');
    expect(r.qa!.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(fs.existsSync(path.join(RENDER_DIR, String(r.id), 'video.mp4'))).toBe(true);
  });

  it('렌더 중에 취소하면 바로 멈추고 "취소됨"이 된다', async () => {
    const pid = project();
    const { renderer, calls } = fakeRenderer(new Promise(() => undefined));
    const rid = startRender(repo, pid, 'http://127.0.0.1:1', undefined, { renderer, audit: noIssues });
    await until(() => calls.started === 1);
    cancelRender(repo, rid);
    expect((await finished(rid)).status).toBe('canceled');
  });

  it('제작 대기·진행 중인 콘텐츠를 지워도 다음 제작이 멈추지 않는다', async () => {
    let release = () => undefined as void;
    const a = project();
    const b = project();
    const c = project();
    const slow = fakeRenderer(new Promise<void>((r) => (release = r)));
    const ra = startRender(repo, a, 'http://127.0.0.1:1', undefined, { renderer: slow.renderer, audit: noIssues });
    const rb = startRender(repo, b, 'http://127.0.0.1:1', undefined, { renderer: fakeRenderer().renderer, audit: noIssues });
    await until(() => slow.calls.started === 1);
    // 진행 중인 A는 '지우기'로, 대기 중인 B는 DB에서 바로 지운다 (작업 기록이 사라진 경우)
    removeProject(repo, a);
    repo.deleteProject(b);
    release();
    const rc = startRender(repo, c, 'http://127.0.0.1:1', undefined, { renderer: fakeRenderer().renderer, audit: noIssues });
    expect((await finished(rc)).status).toBe('done');
    expect(() => repo.getRender(ra)).toThrow();
    expect(() => repo.getRender(rb)).toThrow();
    // 지운 콘텐츠의 제작 폴더도 남지 않는다
    await until(() => !fs.existsSync(path.join(RENDER_DIR, String(ra))));
  });

  it('콘텐츠를 지우면 그 콘텐츠의 영상·클립·사진·원본 자료 파일도 지운다 (다른 콘텐츠 파일은 그대로)', async () => {
    const pid = project();
    const other = project();
    const r = await finished(startRender(repo, pid, 'http://127.0.0.1:1', undefined, { renderer: fakeRenderer().renderer, audit: noIssues }));
    const files = [
      path.join(RENDER_DIR, String(r.id), 'video.mp4'),
      path.join(DATA_DIR, 'clips', String(pid), 's1.png'),
      path.join(DATA_DIR, 'photos', `${pid}.jpg`),
      path.join(DATA_DIR, 'sources', String(pid), '1.png'),
    ];
    const keep = [path.join(DATA_DIR, 'photos', `${other}.jpg`), path.join(DATA_DIR, 'photos', `${pid}0.jpg`)];
    for (const f of [...files, ...keep]) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, 'x');
    }
    removeProject(repo, pid);
    for (const f of files) expect(fs.existsSync(f), f).toBe(false);
    for (const f of keep) expect(fs.existsSync(f), f).toBe(true);
    expect(() => repo.getProject(pid)).toThrow();
  });
});
