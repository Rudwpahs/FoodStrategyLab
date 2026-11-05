import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { checkScript, contentCandidates } from '@mat-lab/recipe-core';
import { createApp } from './app.ts';
import { DATA_DIR } from './config.ts';
import { openDb } from './db.ts';
import { ExtractedRecipeSchema, RecipeReader, costUsd, monthSpentUsd, toContentBlocks, type ExtractedRecipe, type ParseFn } from './recipeReader.ts';
import { Repo } from './repo.ts';

/** 손글씨 김치전 레시피를 읽었다고 치는 결과 */
const kimchijeon: ExtractedRecipe = {
  isRecipe: true,
  dishName: '바삭한 김치전',
  ingredients: [
    { name: '신김치', amount: '200g', group: '' },
    { name: '부침가루', amount: '1컵', group: '' },
    { name: '찬물', amount: '150ml', group: '' },
    { name: '식용유', amount: '3큰술', group: '' },
  ],
  steps: ['김치를 잘게 썬다.', '부침가루와 찬물을 섞어 반죽한다.', '달군 팬에 기름을 넉넉히 두르고 얇게 부친다.'],
  tips: ['반죽은 찬물로 해야 바삭하다.'],
  mistakeFromSource: '',
  storyFromSource: '',
  otherNotes: '',
  problems: ['식용유 분량 "3큰술"의 숫자가 조금 흐림'],
  suggestion: {
    topic: '김치전은 왜 금방 눅눅해질까?',
    principle: '반죽을 찬물로 하면 글루텐이 덜 생겨서 바삭해진다.',
    commonMistake: '반죽을 미지근한 물로 하면 눅눅해진다.',
    category: 'fix',
  },
};

const fakeParse = (result: ExtractedRecipe | null, calls: unknown[] = []): ParseFn => async (req) => {
  calls.push(req);
  return { parsed: result, inputTokens: 4000, outputTokens: 2500, stopReason: 'end_turn' };
};
const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');

describe('레시피 읽기 (가짜 Claude)', () => {
  it('구조화 출력 형식으로 바꿀 수 있다 (SDK가 보내는 JSON 스키마)', () => {
    const fmt = zodOutputFormat(ExtractedRecipeSchema) as unknown as { type: string; schema: { properties: Record<string, unknown> } };
    expect(fmt.type).toBe('json_schema');
    expect(Object.keys(fmt.schema.properties)).toEqual(expect.arrayContaining(['ingredients', 'steps', 'suggestion', 'problems']));
  });

  it('사진은 image, PDF는 document 블록으로 보내고, 모르는 형식은 거절한다', () => {
    const blocks = toContentBlocks(
      [
        { name: 'a.jpg', type: 'image/jpeg', data: png },
        { name: 'b.pdf', type: 'application/pdf', data: png },
        { name: 'c.txt', type: 'text/plain', data: Buffer.from('김치 200g').toString('base64') },
      ],
      '할머니 레시피',
    );
    expect(blocks.map((b) => b.type)).toEqual(['image', 'document', 'text', 'text']);
    expect(() => toContentBlocks([{ name: 'x.docx', type: 'application/msword', data: png }], '')).toThrow(/읽을 수 없는 형식/);
    expect(() => toContentBlocks([], '')).toThrow(/올려 주세요/);
  });

  it('재료·분량·순서는 적힌 그대로, 없는 칸은 AI 제안으로 표시하고, 사용 금액을 기록한다 (기본: Haiku)', async () => {
    const db = openDb(':memory:');
    const calls: { model: string }[] = [];
    const r = await new RecipeReader(db, fakeParse(kimchijeon, calls)).read([{ name: 'a.jpg', type: 'image/jpeg', data: png }]);
    expect(calls[0]!.model).toBe('claude-haiku-5-5');
    expect(r.recipe.ingredients).toEqual([
      { name: '신김치', amount: '200g' },
      { name: '부침가루', amount: '1컵' },
      { name: '찬물', amount: '150ml' },
      { name: '식용유', amount: '3큰술' },
    ]);
    expect(r.recipe.steps).toEqual(kimchijeon.steps);
    expect(r.aiFields).toEqual(['topic', 'principle', 'category', 'commonMistake']);
    expect(r.problems[0]).toContain('흐림');
    expect(r.costUsd).toBeCloseTo(costUsd('claude-haiku-5-5', 4000, 2500));
    expect(r.costUsd).toBeLessThan(0.01);
    expect(monthSpentUsd(db)).toBeCloseTo(r.costUsd);
    // 읽은 레시피로 후보 4개 이상, 대본은 원본 대조를 통과한다
    const { candidates } = contentCandidates(r.recipe, { count: 5 });
    expect(candidates.length).toBeGreaterThanOrEqual(4);
    for (const c of candidates) expect(checkScript(r.recipe, c.script).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('레시피가 아니거나 아무것도 못 읽으면 알려 준다', async () => {
    const db = openDb(':memory:');
    await expect(new RecipeReader(db, fakeParse({ ...kimchijeon, isRecipe: false })).read([{ name: 'a.jpg', type: 'image/jpeg', data: png }])).rejects.toThrow(/레시피로 보이지/);
    await expect(new RecipeReader(db, fakeParse({ ...kimchijeon, ingredients: [], steps: [] })).read([{ name: 'a.jpg', type: 'image/jpeg', data: png }])).rejects.toThrow(/읽지 못했어요/);
    await expect(new RecipeReader(db, fakeParse(null)).read([{ name: 'a.jpg', type: 'image/jpeg', data: png }])).rejects.toThrow(/정리하지 못했어요/);
  });

  it('이번 달 한도를 넘으면 Claude를 부르지 않는다', async () => {
    const db = openDb(':memory:');
    const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date());
    db.prepare('INSERT INTO ai_usage (created_at, month, purpose, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), month, 'x', 'm', 0, 0, 99);
    const calls: unknown[] = [];
    await expect(new RecipeReader(db, fakeParse(kimchijeon, calls)).read([{ name: 'a.jpg', type: 'image/jpeg', data: png }])).rejects.toThrow(/한도/);
    expect(calls).toHaveLength(0);
  });
});

describe('사진으로 새 콘텐츠 (API)', () => {
  let base = '';
  let close: () => void;
  let repo: Repo;
  const starts: number[] = [];
  beforeAll(async () => {
    repo = new Repo(openDb(':memory:'));
    const app = createApp(repo, {
      startRender: (_r, pid) => {
        starts.push(pid);
        return 1;
      },
      recipeReader: new RecipeReader(repo.db, fakeParse(kimchijeon)),
    });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => close());

  it('큰 사진(2MB 넘게)도 받아서 콘텐츠를 만들고 원본 파일을 보관한다', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 1).toString('base64');
    const res = await fetch(`${base}/api/projects/from-files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ name: '김치전.jpg', type: 'image/jpeg', data: big }], memo: '' }),
    });
    expect(res.status).toBe(201);
    const { id, aiFields } = (await res.json()) as { id: number; aiFields: string[] };
    expect(aiFields).toContain('principle');
    const p = repo.getProject(id);
    expect(p.recipe.dishName).toBe('바삭한 김치전');
    expect(p.source?.aiFields).toContain('topic');
    expect(p.source?.files[0]).toMatchObject({ name: '김치전.jpg', type: 'image/jpeg' });
    expect(fs.statSync(`${DATA_DIR}/${p.source!.files[0]!.file}`).size).toBe(3 * 1024 * 1024);
    fs.rmSync(`${DATA_DIR}/sources/${id}`, { recursive: true, force: true });
  });

  it('후보 5개(미리보기 타임라인 포함) → "이 영상으로 만들기"는 대본을 만들고 영상 제작을 시작한다', async () => {
    const res = await fetch(`${base}/api/projects/from-files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ name: 'a.png', type: 'image/png', data: png }] }),
    });
    const { id } = (await res.json()) as { id: number };
    const list = (await (await fetch(`${base}/api/projects/${id}/candidates?count=5`)).json()) as { candidates: { key: string; style: string; hookType: string; timings: unknown[] | null }[] };
    expect(list.candidates).toHaveLength(5);
    for (const c of list.candidates) expect(Array.isArray(c.timings)).toBe(true);
    const pick = list.candidates[2]!;
    const made = await fetch(`${base}/api/projects/${id}/candidates/make`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ style: pick.style, hookType: pick.hookType }) });
    expect(made.status).toBe(202);
    const body = (await made.json()) as { project: { latest: { version: number; script: { style: string; hookType: string } } }; renderId: number };
    expect(body.project.latest.version).toBe(1);
    expect(`${body.project.latest.script.style}:${body.project.latest.script.hookType}`).toBe(pick.key);
    expect(starts).toEqual([id]);
    fs.rmSync(`${DATA_DIR}/sources/${id}`, { recursive: true, force: true });
  });

  it('다른 요청은 여전히 2MB까지만 받는다', async () => {
    const res = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipe: { topic: 'x'.repeat(3 * 1024 * 1024) } }) });
    expect(res.status).toBe(413);
  });
});
