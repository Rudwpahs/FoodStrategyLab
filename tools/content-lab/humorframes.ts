// 웃음 형식 새 화면 확인: 글자 그대로용 농담 그림(우체통·부채·재우기)과 사연 한 통의 편지 카드('가상 사연' 표시)를
// 실제 영상 화면(ShortVideo = KitchenVideo)으로 그려 한 장에 붙인다.
// 사용: REMOTION_BROWSER_EXECUTABLE=... npx tsx tools/content-lab/humorframes.ts <출력 jpg>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { BRAND, LETTER_FICTION, LETTER_REAL, SAMPLE_RECIPES, formatIngredient, type Gag, type Script } from '@mat-lab/recipe-core';
import { buildTimeline, type VideoProps } from '@mat-lab/video/timeline';
import { openBrowser, renderStill, selectComposition, type ChromiumOptions } from '@remotion/renderer';
import { getServeUrl } from '@mat-lab/video/render';

const outFile = process.argv[2];
if (!outFile) {
  console.error('사용: npx tsx tools/content-lab/humorframes.ts <출력 jpg>');
  process.exit(1);
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'humorframes-'));
const font = createRequire(import.meta.url).resolve('pretendard/dist/public/static/Pretendard-Bold.otf');
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
const chromiumOptions: ChromiumOptions = { gl: (process.env.REMOTION_GL as ChromiumOptions['gl']) ?? 'swangle' };
const serveUrl = await getServeUrl();
const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions, logLevel: 'error' });
const kimchi = SAMPLE_RECIPES.find((r) => r.dishName === '바삭한 김치전')!;
const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;

const gagScene = (id: string, gag: Gag, line: string) => ({ id, type: 'gag' as const, emotion: 'confident' as const, line, gag });

/** 글자 그대로 김치전 (부치다) + 호두정과 재우기 그림 */
const wordplay: Script = {
  title: '전을 부친다는 말',
  style: 'ai-story',
  hookType: 'wordplay',
  scenes: [
    { id: 's1', type: 'intro', emotion: 'curious', line: '전은 부친다고 하죠.', place: 'dining', hook: true },
    gagScene('s2', 'mailbox', '글자 그대로면 우체통에 넣어 보내는 일이고요.'),
    gagScene('s3', 'hand-fan', '부채로 바람을 보내는 일이기도 해요.'),
    gagScene('s4', 'bedtime', '재운다는 말도 글자 그대로면 이렇게 돼요.'),
    { id: 's5', type: 'question', emotion: 'confident', line: '물론 그 뜻은 아니에요.', place: 'lab' },
  ],
};

/** 사연 한 통: 가상 사연 편지 카드 → 이야기 장면(표시 유지) → 노트(표시 없음) */
const letterStory: Script = {
  title: '명절 전날의 김치전',
  style: 'ai-story',
  hookType: 'listener-story',
  scenes: [
    { id: 's1', type: 'intro', emotion: 'curious', line: '김치전 사연 한 통 읽어 볼게요.', place: 'dining', hook: true },
    { id: 's2', type: 'question', emotion: 'curious', line: '어느 집이 명절 아침에 반죽을 한 통 가득 미리 만들어 뒀대요.', place: 'dining', cardTitle: LETTER_FICTION },
    { id: 's3', type: 'question', emotion: 'curious', line: '오후에 부치니 전이 자꾸 처졌대요.', place: 'kitchen' },
    { id: 's4', type: 'explain', emotion: 'confident', line: '김치 속 소금이 반죽 수분을 끌어내요.', place: 'lab', cardTitle: BRAND.notePhrase, cardItems: [kimchi.principle.split('. ')[0]! + '.'] },
    { id: 's5', type: 'ingredients', emotion: 'confident', line: '재료예요.', place: 'kitchen', cardTitle: '재료', cardItems: kimchi.ingredients.map(formatIngredient) },
  ],
};

/** 진짜 연구자 답변 카드 (표시 없음) */
const realLetter: Script = {
  title: '선생님이 받은 질문',
  style: 'ai-story',
  hookType: 'listener-story',
  scenes: [
    { id: 's1', type: 'intro', emotion: 'curious', line: '호두정과 질문 하나예요.', place: 'dining', hook: true },
    { id: 's2', type: 'question', emotion: 'curious', line: '선생님이 수업에서 자주 받는 질문이래요.', place: 'dining', cardTitle: LETTER_REAL, cardItems: ['호두를 왜 굳이 데쳤다가 헹구나요?'] },
    { id: 's3', type: 'outro', emotion: 'joy', line: `${BRAND.labName}였어요.`, place: 'dining' },
  ],
};

const tiles: string[] = [];
async function shoot(recipe: typeof kimchi, script: Script, picks: { scene: number; at: number; label: string }[]) {
  const timings = buildTimeline(script, script.scenes.map(() => null));
  const inputProps = { script, timings, reviewed: false, cleanDraft: true, recipe } satisfies VideoProps as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: 'ShortVideo', inputProps, browserExecutable, chromiumOptions, puppeteerInstance: browser, logLevel: 'error' });
  for (const pick of picks) {
    const t = timings[pick.scene]!;
    const frame = t.from + Math.round((t.durationInFrames - 1) * pick.at);
    const png = path.join(work, `${tiles.length}.png`);
    const jpg = path.join(work, `${tiles.length}.jpg`);
    await renderStill({ composition, serveUrl, output: png, inputProps, browserExecutable, chromiumOptions, frame, puppeteerInstance: browser, logLevel: 'error', timeoutInMilliseconds: 120_000 });
    const label = `drawtext=fontfile=${font}:text='${pick.label}':x=10:y=10:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-vf', `scale=360:-1,${label}`, '-q:v', '3', jpg]);
    fs.rmSync(png);
    tiles.push(jpg);
  }
}

await shoot(kimchi, wordplay, [
  { scene: 1, at: 0.3, label: 'mailbox fly' },
  { scene: 1, at: 0.72, label: 'mailbox into slot' },
  { scene: 2, at: 0.3, label: 'hand-fan' },
  { scene: 2, at: 0.7, label: 'hand-fan swing' },
]);
await shoot(walnut, wordplay, [
  { scene: 3, at: 0.5, label: 'bedtime' },
  { scene: 1, at: 0.6, label: 'mailbox walnut' },
]);
await shoot(kimchi, letterStory, [
  { scene: 1, at: 0.6, label: 'letter fiction' },
  { scene: 2, at: 0.6, label: 'story tag' },
  { scene: 3, at: 0.6, label: 'note no tag' },
]);
await shoot(walnut, realLetter, [{ scene: 1, at: 0.6, label: 'letter real' }]);

const cols = 5;
const rows: string[] = [];
for (let i = 0; i < tiles.length; i += cols) {
  const row = tiles.slice(i, i + cols);
  while (row.length < cols) row.push(row[row.length - 1]!);
  const rf = path.join(work, `row-${i}.jpg`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...row.flatMap((x) => ['-i', x]), '-filter_complex', `${row.map((_, k) => `[${k}]`).join('')}hstack=inputs=${row.length}`, '-q:v', '3', rf]);
  rows.push(rf);
}
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...rows.flatMap((r) => ['-i', r]), '-filter_complex', `vstack=inputs=${rows.length}`, '-q:v', '3', outFile]);
fs.rmSync(work, { recursive: true, force: true });
console.log(`→ ${outFile}`);
await browser.close({ silent: true });
process.exit(0);
