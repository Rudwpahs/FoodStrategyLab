/**
 * E2E 시험 서버 (docs/testing/E2E_PLAN.md 3절). 운영 서버(startServer)와 같은 코드에 바깥 연결만 바꿔 끼운다.
 * - 렌더러: 작은 영상·그림 파일을 쓰는 가짜 (runRender의 진행·품질 검사 기록·카드·표지 JPEG는 진짜 코드)
 * - Claude(레시피 읽기·주제 더 보기·윤문): 정해진 답을 주는 가짜 — 돈이 들지 않는다
 * - 시험용 주소 /__e2e/* 는 이 서버에만 있다 (운영 코드에는 없음)
 * 실행: playwright.config.ts의 webServer가 띄운다. 환경 변수(데이터 폴더·포트·설정 코드)는 그쪽에서 정한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Script } from '@mat-lab/recipe-core';
import type { SceneTiming } from '@mat-lab/video/timeline';
import { startServer } from '../server/index.ts';
import { auditVideo, startRender, type RenderDeps } from '../server/pipeline.ts';
import { RecipeReader, type ExtractedRecipe, type ParseFn, type TopicsFn } from '../server/recipeReader.ts';
import { Humanizer, type RewriteFn } from '../server/humanize.ts';
import type { RenderQaIssue } from '../server/repo.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = path.join(here, 'fixtures/tiny.mp4');
const STILL = path.join(here, 'fixtures/tiny.png');

// ── 시나리오가 정하는 상태 ──
const control = {
  /** 다음 제작의 자동 품질 검사 결과 (한 번 쓰면 비움). 없으면 진짜 검사 */
  nextAudit: null as RenderQaIssue[] | null,
  /** true면 영상 렌더가 풀어 줄 때까지 멈춰 있다 (제작 중 상황 시험) */
  hold: false,
  release: [] as (() => void)[],
};

const renderer: RenderDeps['renderer'] = async () =>
  ({
    getServeUrl: async () => 'e2e',
    makeCancelSignal: () => {
      let onCancel = () => undefined as void;
      return { cancelSignal: (cb: () => void) => void (onCancel = cb), cancel: () => onCancel() };
    },
    renderVideo: async (o: { outputLocation: string; cancelSignal?: (cb: () => void) => void; onProgress?: (p: number) => void }) => {
      if (control.hold) {
        await new Promise<void>((resolve, reject) => {
          o.cancelSignal?.(() => reject(new Error('renderMedia() got cancelled')));
          control.release.push(resolve);
        });
      }
      o.onProgress?.(0.5);
      fs.copyFileSync(VIDEO, o.outputLocation);
      o.onProgress?.(1);
    },
    renderStillImage: async (_id: string, _props: unknown, output: string) => fs.copyFileSync(STILL, output),
  }) as unknown as Awaited<ReturnType<RenderDeps['renderer']>>;

const audit: RenderDeps['audit'] = async (video: string, timings: SceneTiming[], script: Script) => {
  if (control.nextAudit) {
    const issues = control.nextAudit;
    control.nextAudit = null;
    return { issues, checked: ['대사 끝 잘림', '목소리 없는 장면', '긴 무음', '검은 화면'] };
  }
  return auditVideo(video, timings, script);
};

// ── 가짜 Claude ──
/** 손글씨 김치전 레시피를 읽었다고 치는 결과 (근거 있는 주제 2개 + 근거 없는 주제 1개) */
const readResult: ExtractedRecipe = {
  isRecipe: true,
  dishName: '바삭한 김치전',
  ingredients: [
    { name: '신김치', amount: '200g', group: '', unclear: '' },
    { name: '부침가루', amount: '1컵', group: '', unclear: '' },
    { name: '찬물', amount: '150ml', group: '', unclear: '' },
    { name: '식용유', amount: '3큰술', group: '', unclear: '숫자 3이 조금 흐림' },
  ],
  steps: [
    { text: '김치를 잘게 썬다.', unclear: '' },
    { text: '부침가루와 찬물을 섞어 반죽한다.', unclear: '' },
    { text: '달군 팬에 기름을 넉넉히 두르고 얇게 부친다.', unclear: '' },
  ],
  tips: ['반죽은 찬물로 해야 바삭하다.'],
  mistakeFromSource: '',
  storyFromSource: '',
  otherNotes: '',
  problems: [],
  suggestions: [
    { angle: 'mistake', topic: '김치전 반죽, 미지근한 물이면 눅눅해요', principle: '반죽을 찬물로 하면 글루텐이 덜 생겨서 바삭해진다.', category: 'fix', evidence: { where: 'tip', number: 1, quote: '찬물로 해야 바삭하다' } },
    { angle: 'expert', topic: '조리기능장이 김치전을 얇게 펴는 이유', principle: '얇게 부치면 수분이 빨리 날아가 바삭해진다.', category: 'science', evidence: { where: 'step', number: 3, quote: '얇게 부친다' } },
    { angle: 'compare', topic: '김치전 180도 vs 160도', principle: '180도 기름에 부치면 바삭하다.', category: 'compare', evidence: { where: 'step', number: 2, quote: '두부를 넣는다' } },
  ],
  commonMistake: '반죽을 미지근한 물로 하면 눅눅해진다.',
};
const parse: ParseFn = async () => ({ parsed: readResult, inputTokens: 4000, outputTokens: 2500, stopReason: 'end_turn' });
const topics: TopicsFn = async () => ({
  parsed: {
    suggestions: [
      { angle: 'one-thing', topic: '김치전 팬, 달구고 올려야 덜 먹어요', principle: '달군 팬에 올리면 겉이 바로 굳어 기름을 덜 먹는다.', category: 'science', evidence: { where: 'step', number: 3, quote: '달군 팬에' } },
      { angle: 'result', topic: '김치 잘게 썰면 반죽이 고루 붙어요', principle: '김치를 잘게 썰면 반죽이 고루 묻는다.', category: 'fix', evidence: { where: 'step', number: 1, quote: '잘게 썬다' } },
    ],
  },
  inputTokens: 800,
  outputTokens: 900,
  stopReason: 'end_turn',
});
/** 윤문: '매우 ' 같은 군더더기만 뺀다 (숫자·재료는 그대로라 게이트를 통과) */
const rewrite: RewriteFn = async ({ user }) => {
  const body = user.slice(user.indexOf('<윤문할_'));
  const items = JSON.parse(body.slice(body.indexOf('['), body.lastIndexOf(']') + 1)) as { id: string; text: string }[];
  return {
    parsed: { items: items.map((i) => ({ id: i.id, text: i.text.replace(/매우 |정말 /g, '') })), notes: '' },
    usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stopReason: 'end_turn',
  };
};

const port = Number(process.env.PORT ?? 5199);
await startServer(port, {
  deps: (repo) => ({
    startRender: (r, pid, origin, keepAlive) => startRender(r, pid, origin, keepAlive, { renderer, audit }),
    recipeReader: new RecipeReader(repo.db, parse, topics),
    humanizer: new Humanizer(repo.db, rewrite),
  }),
  extend: (app) => {
    app.use('/__e2e', express.json());
    app.post('/__e2e/next-audit', (req, res) => {
      control.nextAudit = (req.body?.issues ?? null) as RenderQaIssue[] | null;
      res.json({ ok: true });
    });
    app.post('/__e2e/hold', (req, res) => {
      control.hold = req.body?.hold === true;
      if (!control.hold) for (const f of control.release.splice(0)) f();
      res.json({ ok: true });
    });
  },
});
console.log(`E2E 시험 서버: http://127.0.0.1:${port}`);
