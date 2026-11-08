import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { checkScript, contentCandidates } from '@mat-lab/recipe-core';
import { createApp } from './app.ts';
import { DATA_DIR } from './config.ts';
import { openDb } from './db.ts';
import { ExtractedRecipeSchema, RecipeReader, costUsd, groundSuggestions, monthSpentUsd, monthlyBudgetUsd, shortPrinciple, toContentBlocks, toRecipe, type ExtractedRecipe, type ParseFn } from './recipeReader.ts';
import { Repo } from './repo.ts';

/** 손글씨 김치전 레시피를 읽었다고 치는 결과 */
const kimchijeon: ExtractedRecipe = {
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
    { topic: '김치전은 왜 금방 눅눅해질까?', principle: '반죽을 찬물로 하면 글루텐이 덜 생겨서 바삭해진다.', category: 'fix', evidence: { where: 'tip', number: 1, quote: '찬물로 해야 바삭하다' } },
    { topic: '김치전은 왜 얇게 부칠까?', principle: '얇게 부치면 수분이 빨리 날아가 바삭해진다.', category: 'science', evidence: { where: 'step', number: 3, quote: '얇게 부친다' } },
    { topic: '김치전 팬은 왜 달궈 둘까?', principle: '달군 팬에 올리면 겉이 바로 굳어 기름을 덜 먹는다.', category: 'science', evidence: { where: 'step', number: 3, quote: '달군 팬에' } },
  ],
  commonMistake: '반죽을 미지근한 물로 하면 눅눅해진다.',
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
    expect(Object.keys(fmt.schema.properties)).toEqual(expect.arrayContaining(['ingredients', 'steps', 'suggestions', 'commonMistake', 'problems']));
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
    expect(blocks.map((b) => b.type)).toEqual(['text', 'image', 'text', 'document', 'text', 'text', 'text']);
    expect(() => toContentBlocks([{ name: 'x.docx', type: 'application/msword', data: png }], '')).toThrow(/읽을 수 없는 형식/);
    expect(() => toContentBlocks([], '')).toThrow(/올려 주세요/);
    expect(() => toContentBlocks([{ name: 'IMG_0001.HEIC', type: 'image/heic', data: png }], '')).toThrow(/HEIC/);
  });

  it('재료·분량·순서는 적힌 그대로, 없는 칸은 AI 제안으로 표시하고, 사용 금액을 기록한다 (기본: Opus 5.5)', async () => {
    const db = openDb(':memory:');
    const calls: { model: string; effort: string }[] = [];
    const r = await new RecipeReader(db, fakeParse(kimchijeon, calls)).read([{ name: 'a.jpg', type: 'image/jpeg', data: png }]);
    expect(calls[0]!.model).toBe('claude-opus-5-5');
    expect(calls[0]!.effort).toBe('high');
    expect(r.recipe.ingredients).toEqual([
      { name: '신김치', amount: '200g' },
      { name: '부침가루', amount: '1컵' },
      { name: '찬물', amount: '150ml' },
      { name: '식용유', amount: '3큰술' },
    ]);
    expect(r.recipe.steps).toEqual(kimchijeon.steps.map((s) => s.text));
    expect(r.aiFields).toEqual(['topic', 'principle', 'category', 'commonMistake']);
    expect(r.problems[0]).toBe('재료 "식용유": 숫자 3이 조금 흐림');
    expect(r.recipe.topic).toBe('김치전은 왜 금방 눅눅해질까?');
    expect(r.suggestions).toHaveLength(3);
    expect(r.suggestions.every((s) => s.grounded)).toBe(true);
    expect(r.costUsd).toBeCloseTo(costUsd('claude-opus-5-5', 4000, 2500));
    // Opus 5.5: 입력 4천·출력 2천5백 토큰 = $0.016 + $0.05
    expect(r.costUsd).toBeCloseTo(0.066, 3);
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
    db.prepare('INSERT INTO ai_usage (created_at, month, purpose, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), month, 'x', 'm', 0, 0, 150);
    const calls: unknown[] = [];
    await expect(new RecipeReader(db, fakeParse(kimchijeon, calls)).read([{ name: 'a.jpg', type: 'image/jpeg', data: png }])).rejects.toThrow(/한도/);
    expect(calls).toHaveLength(0);
  });
});

describe('AI 제안 근거 확인', () => {
  it('인용이 원문에 없거나, 없는 숫자·건강 주장이 있으면 뒤로 미루고 이유를 남긴다', () => {
    const x: ExtractedRecipe = {
      ...kimchijeon,
      suggestions: [
        { topic: '김치전, 180도에서 부쳐야 할까?', principle: '180도 기름에 부치면 바삭해진다.', category: 'science', evidence: { where: 'step', number: 3, quote: '얇게 부친다' } },
        { topic: '김치는 왜 몸에 좋을까?', principle: '김치를 먹으면 면역이 좋아진다.', category: 'science', evidence: { where: 'step', number: 1, quote: '잘게 썬다' } },
        { topic: '김치전은 왜 짤까?', principle: '두부를 넣으면 짠맛이 줄어든다.', category: 'fix', evidence: { where: 'step', number: 2, quote: '두부를 넣는다' } },
        { topic: '없는 순서', principle: '다섯째 단계에서 불을 줄이면 타지 않는다.', category: 'fix', evidence: { where: 'step', number: 5, quote: '불을 줄인다' } },
        { topic: '김치전 반죽은 왜 찬물일까?', principle: '찬물로 반죽하면 글루텐이 덜 생겨 바삭해진다.', category: 'science', evidence: { where: 'tip', number: 1, quote: '반죽은 찬물로  해야 바삭하다!' } },
      ],
    };
    const out = groundSuggestions(x);
    // 근거가 확인된 제안(띄어쓰기·문장부호 차이는 봐준다)이 맨 앞
    expect(out[0]).toMatchObject({ topic: '김치전 반죽은 왜 찬물일까?', grounded: true, evidenceLabel: '팁 1' });
    expect(out.slice(1).every((s) => !s.grounded)).toBe(true);
    expect(out.find((s) => s.topic.includes('180도'))!.notes.join()).toContain('없는 숫자(180)');
    expect(out.find((s) => s.topic.includes('몸에'))!.notes.join()).toContain('건강');
    expect(out.find((s) => s.topic.includes('짤까'))!.notes.join()).toContain('찾지 못했어요');
    expect(out.find((s) => s.topic === '없는 순서')!.notes.join()).toContain('5번 순서');
  });

  it('근거가 확인된 제안이 하나도 없으면 레시피에는 넣되 꼭 고치라고 알린다', () => {
    const x: ExtractedRecipe = { ...kimchijeon, suggestions: [{ topic: '김치전은 왜 짤까?', principle: '두부를 넣으면 짠맛이 줄어든다.', category: 'fix', evidence: { where: 'step', number: 2, quote: '두부를 넣는다' } }] };
    const r = toRecipe(x);
    expect(r.recipe.topic).toBe('김치전은 왜 짤까?');
    expect(r.problems.join('\n')).toContain('꼭 고쳐 주세요');
    const none = toRecipe({ ...kimchijeon, suggestions: [] });
    expect(none.problems.join('\n')).toContain('직접 써 주세요');
    expect(none.recipe.principle.length).toBeGreaterThan(5);
  });

  it('메모를 근거로 들 수 있고, 메모의 숫자는 레시피에 있는 숫자로 본다', () => {
    const x: ExtractedRecipe = { ...kimchijeon, suggestions: [{ topic: '김치전은 몇 분 부칠까?', principle: '한 면을 2분 부치면 겉이 굳는다.', category: 'science', evidence: { where: 'memo', number: 0, quote: '한 면 2분' } }] };
    expect(groundSuggestions(x, '한 면 2분씩 부침')[0]!.grounded).toBe(true);
    expect(groundSuggestions(x, '')[0]!.grounded).toBe(false);
  });

  it('순서·재료 줄마다 적힌 "확실하지 않은 점"을 확인할 곳으로 모은다', () => {
    const x: ExtractedRecipe = { ...kimchijeon, steps: [{ text: '김치를 잘게 썬다.', unclear: '' }, { text: '반죽한다.', unclear: '앞 글자가 잘림' }], problems: ['2번째 사진 아래가 잘림'] };
    expect(toRecipe(x).problems).toEqual(['재료 "식용유": 숫자 3이 조금 흐림', '2번 순서: 앞 글자가 잘림', '2번째 사진 아래가 잘림']);
  });

  it('여러 장은 몇 번째 자료인지 붙여 보내고, 메모는 따로 묶는다. 한 달 기본 한도는 $100', () => {
    const blocks = toContentBlocks(
      [
        { name: 'a.jpg', type: 'image/jpeg', data: png },
        { name: 'b.jpg', type: 'image/jpeg', data: png },
      ],
      '소금은 1작은술이 맞음',
    );
    expect(blocks.map((b) => b.type)).toEqual(['text', 'image', 'text', 'image', 'text']);
    expect((blocks[0] as { text: string }).text).toBe('[자료 1/2: a.jpg]');
    expect((blocks[4] as { text: string }).text).toContain('<연구자_메모>\n소금은 1작은술이 맞음\n</연구자_메모>');
    const before = process.env.CLAUDE_MONTHLY_BUDGET_USD;
    delete process.env.CLAUDE_MONTHLY_BUDGET_USD;
    expect(monthlyBudgetUsd()).toBe(100);
    if (before !== undefined) process.env.CLAUDE_MONTHLY_BUDGET_USD = before;
  });
});

describe('AI 제안 원리 길이', () => {
  it('영상에서 읽는 원리는 한 문장으로: 길면 첫 문장만', () => {
    expect(shortPrinciple('반죽을 찬물로 하면 바삭해진다.')).toBe('반죽을 찬물로 하면 바삭해진다.');
    const long = '청국장을 오래 가열하면 발효균과 효소가 줄고 특유의 쿰쿰한 냄새가 강해진다. 다른 재료를 먼저 익힌 뒤 마지막에 넣어 짧게 볶으면 풍미와 영양을 살릴 수 있다.';
    expect(shortPrinciple(long)).toBe('청국장을 오래 가열하면 발효균과 효소가 줄고 특유의 쿰쿰한 냄새가 강해진다.');
    expect(shortPrinciple('')).toContain('불 조절');
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
  const chooseFirstTopic = async (pid: number) => {
    const s = repo.getSource(pid)!.suggestions[0]!;
    const r = await fetch(`${base}/api/projects/${pid}/topic`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: s.topic, principle: s.principle, category: s.category }) });
    expect(r.status).toBe(200);
  };

  it('주제 고르기: AI 후보를 고르면 AI 제안으로 남고, 직접 쓰면 확인 대상에서 빠진다. 재료·순서는 그대로', async () => {
    const make = async () => (await (await fetch(`${base}/api/projects/from-files`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files: [{ name: 'a.png', type: 'image/png', data: png }] }) })).json()) as { id: number };
    const a = await make();
    expect(repo.needsTopic(a.id)).toBe(true);
    const second = repo.getSource(a.id)!.suggestions[1]!;
    await fetch(`${base}/api/projects/${a.id}/topic`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: second.topic, principle: second.principle, category: second.category }) });
    expect(repo.needsTopic(a.id)).toBe(false);
    expect(repo.getRecipe(a.id)).toMatchObject({ topic: second.topic, principle: second.principle, ingredients: repo.getRecipe(a.id).ingredients });
    expect(repo.getSource(a.id)!.aiFields).toContain('topic');
    expect(repo.getSource(a.id)!.topicChosenAt).toBeTruthy();

    const b = await make();
    const own = await fetch(`${base}/api/projects/${b.id}/topic`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: '김치전 반죽은 언제 섞을까?', principle: '반죽은 부치기 직전에 섞어야 바삭하다.' }) });
    expect(own.status).toBe(200);
    expect(repo.getSource(b.id)!.aiFields).not.toContain('topic');
    expect(repo.getSource(b.id)!.aiFields).not.toContain('principle');
    expect(repo.getRecipe(b.id).steps).toEqual(kimchijeon.steps.map((s) => s.text));
    const bad = await fetch(`${base}/api/projects/${b.id}/topic`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: '', principle: '' }) });
    expect(bad.status).toBe(400);
    for (const id of [a.id, b.id]) fs.rmSync(`${DATA_DIR}/sources/${id}`, { recursive: true, force: true });
  });

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
    // 주제를 고르기 전에는 후보 영상을 만들지 않는다
    expect((await fetch(`${base}/api/projects/${id}/candidates?count=5`)).status).toBe(409);
    await chooseFirstTopic(id);
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

  it('사진에서 읽은 콘텐츠는 AI 제안 내용을 확인하기 전에는 승인할 수 없다', async () => {
    const res = await fetch(`${base}/api/projects/from-files`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files: [{ name: 'a.png', type: 'image/png', data: png }] }) });
    const { id } = (await res.json()) as { id: number };
    await chooseFirstTopic(id);
    const list = (await (await fetch(`${base}/api/projects/${id}/candidates?count=5`)).json()) as { candidates: { style: string; hookType: string }[] };
    await fetch(`${base}/api/projects/${id}/candidates/make`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ style: list.candidates[0]!.style, hookType: list.candidates[0]!.hookType }) });
    const checklist = { ingredients: true, safety: true, noFakeClaims: true, expression: true };
    const approve = () => fetch(`${base}/api/projects/${id}/reviews`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, reviewer: '이희재', checklist, decision: 'approved' }) });
    const blocked = await approve();
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain('AI가 제안한 내용');
    const confirmed = await fetch(`${base}/api/projects/${id}/source/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ by: '이희재' }) });
    expect(confirmed.status).toBe(200);
    expect(repo.getSource(id)?.aiConfirmedBy).toBe('이희재');
    expect((await approve()).status).toBe(200);
    fs.rmSync(`${DATA_DIR}/sources/${id}`, { recursive: true, force: true });
  });

  it('다른 요청은 여전히 2MB까지만 받는다', async () => {
    const res = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipe: { topic: 'x'.repeat(3 * 1024 * 1024) } }) });
    expect(res.status).toBe(413);
  });
});
