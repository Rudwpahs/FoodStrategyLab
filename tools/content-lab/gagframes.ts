// 농담 그림(진지한 엉뚱 가이드의 gag 장면) 확인: 실제 영상 화면(ShortVideo = KitchenVideo)으로 프레임을 그려 한 장씩 붙인다.
// 사용: npx tsx tools/content-lab/gagframes.ts <출력폴더> [picks.json]
// - gags.jpg: 그림 목록(GAGS) 전부. 요리 종류마다 접시 모양이 다르게 보이도록 예시 레시피를 돌아가며 쓴다.
// - picks.json(pick-stories.ts 결과)을 주면 그 대본을 이야기 대본처럼 다시 정리(finalizeStory: 농담 전 tip·explain → gag)하고
//   장면마다 프레임을 그려 sample-<번호>.jpg로 붙인다.
// - 프레임마다 그린 시간을 재어 농담 장면과 3D 장면의 평균을 알려 준다 (렌더 시간 비교).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { GAGS, SAMPLE_RECIPES, finalizeStory, type RecipeInput, type Script, type StoryDraft } from '@mat-lab/recipe-core';
import { buildTimeline, type VideoProps } from '@mat-lab/video/timeline';
import { openBrowser, renderStill, selectComposition, type ChromiumOptions } from '@remotion/renderer';
import { getServeUrl } from '@mat-lab/video/render';

const [outArg, picksFile] = process.argv.slice(2);
if (!outArg) {
  console.error('사용: npx tsx tools/content-lab/gagframes.ts <출력폴더> [picks.json]');
  process.exit(1);
}
const outDir: string = outArg;
fs.mkdirSync(outDir, { recursive: true });
const font = createRequire(import.meta.url).resolve('pretendard/dist/public/static/Pretendard-Bold.otf');
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
const chromiumOptions: ChromiumOptions = { gl: (process.env.REMOTION_GL as ChromiumOptions['gl']) ?? 'swangle' };
const serveUrl = await getServeUrl();
const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions, logLevel: 'error' });
const times = { gag: [] as number[], other: [] as number[] };

/** 대본 하나의 프레임들을 그려 360px 폭 JPG 목록으로 */
async function frames(recipe: RecipeInput, script: Script, picks: { frame: number; label: string; gag: boolean }[], prefix: string): Promise<string[]> {
  const timings = buildTimeline(script, script.scenes.map(() => null));
  const inputProps = { script, timings, reviewed: false, cleanDraft: true, recipe } satisfies VideoProps as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: 'ShortVideo', inputProps, browserExecutable, chromiumOptions, puppeteerInstance: browser, logLevel: 'error' });
  const out: string[] = [];
  for (const [k, pick] of picks.entries()) {
    const png = path.join(outDir, `${prefix}-${k}.png`);
    const jpg = path.join(outDir, `${prefix}-${k}.jpg`);
    const t0 = Date.now();
    await renderStill({ composition, serveUrl, output: png, inputProps, browserExecutable, chromiumOptions, frame: pick.frame, puppeteerInstance: browser, logLevel: 'error', timeoutInMilliseconds: 120_000 });
    (pick.gag ? times.gag : times.other).push(Date.now() - t0);
    const label = `drawtext=fontfile=${font}:text='${pick.label.replace(/'/g, '')}':x=10:y=10:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-vf', `scale=360:-1,${label}`, '-q:v', '3', jpg]);
    fs.rmSync(png);
    out.push(jpg);
  }
  return out;
}

/** 타일들을 cols개씩 줄지어 한 장으로 */
function sheet(tiles: string[], cols: number, file: string) {
  const rows: string[] = [];
  for (let i = 0; i < tiles.length; i += cols) {
    const row = tiles.slice(i, i + cols);
    while (row.length < cols) row.push(row[row.length - 1]!);
    const rf = path.join(outDir, `row-${i}.jpg`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...row.flatMap((x) => ['-i', x]), '-filter_complex', `${row.map((_, k) => `[${k}]`).join('')}hstack=inputs=${row.length}`, '-q:v', '3', rf]);
    rows.push(rf);
  }
  if (rows.length === 1) fs.copyFileSync(rows[0]!, file);
  else execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...rows.flatMap((r) => ['-i', r]), '-filter_complex', `vstack=inputs=${rows.length}`, '-q:v', '3', file]);
  for (const f of [...tiles, ...rows]) fs.rmSync(f, { force: true });
  console.log(`→ ${file}`);
}

// 1) 그림 목록 전부: 레시피를 돌아가며 (전·나물·달걀·정과·파스타)
const byRecipe = new Map<RecipeInput, (typeof GAGS)[number][]>();
GAGS.forEach((g, i) => {
  const r = SAMPLE_RECIPES[i % SAMPLE_RECIPES.length]!;
  byRecipe.set(r, [...(byRecipe.get(r) ?? []), g]);
});
const libraryTiles: { gag: string; jpg: string }[] = [];
for (const [recipe, gags] of byRecipe) {
  const script: Script = {
    title: `${recipe.dishName} 엉뚱 가이드`,
    style: 'ai-story',
    hookType: 'deadpan',
    scenes: [
      { id: 's1', type: 'intro', emotion: 'curious', line: `${recipe.dishName}, 이럴 때 있죠?`, place: 'dining', hook: true },
      ...gags.map((g, k) => ({ id: `g${k + 1}`, type: 'gag' as const, emotion: 'confident' as const, line: '그럴 때는 아주 진지하게, 이렇게 해 보세요.', gag: g })),
    ],
  };
  const timings = buildTimeline(script, script.scenes.map(() => null));
  const picks = gags.map((g, k) => {
    const t = timings[k + 1]!;
    return { frame: t.from + Math.round(t.durationInFrames * 0.55), label: g, gag: true };
  });
  const jpgs = await frames(recipe, script, picks, `lib-${recipe.dishName.replace(/\s/g, '')}`);
  gags.forEach((g, k) => libraryTiles.push({ gag: g, jpg: jpgs[k]! }));
}
libraryTiles.sort((a, b) => GAGS.indexOf(a.gag as (typeof GAGS)[number]) - GAGS.indexOf(b.gag as (typeof GAGS)[number]));
sheet(
  libraryTiles.map((t) => t.jpg),
  7,
  path.join(outDir, 'gags.jpg'),
);

// 2) 견본 대본 (picks.json): 이야기 대본처럼 다시 정리해 장면마다
if (picksFile) {
  const picks = JSON.parse(fs.readFileSync(picksFile, 'utf8')) as { storyType: string; audience?: string; logline: string; script: Script }[];
  for (const [n, pick] of picks.entries()) {
    const recipe = SAMPLE_RECIPES.find((r) => pick.script.title.includes(r.dishName.replace('바삭한 ', '')) || pick.logline.includes(r.dishName.replace('바삭한 ', '')))!;
    const draft: StoryDraft = {
      title: pick.script.title,
      storyType: pick.storyType as StoryDraft['storyType'],
      audience: pick.audience as StoryDraft['audience'],
      logline: pick.logline,
      scenes: pick.script.scenes.map((s) => ({ beat: 'point', type: s.type, emotion: s.emotion, visual: s.visual, place: s.place ?? 'kitchen', line: s.line, cardTitle: s.cardTitle, cardItems: s.cardItems })),
    };
    const story = finalizeStory(recipe, draft, `sample-${n + 1}`);
    if ('error' in story) throw new Error(story.error);
    console.log(`견본 ${n + 1} ${recipe.dishName}: ${story.script.scenes.map((s) => `${s.type}${s.gag ? `(${s.gag})` : ''}${s.cardTitle ? '[카드]' : ''}`).join(' → ')}`);
    console.log(`  정리: ${story.notes.join(' / ')}`);
    console.log(`  원본 대조: ${story.issues.filter((i) => i.level === 'error').length ? story.issues.map((i) => i.message).join(' / ') : '오류 없음'}`);
    fs.writeFileSync(path.join(outDir, `sample-${n + 1}.json`), JSON.stringify(story, null, 2));
    const timings = buildTimeline(story.script, story.script.scenes.map(() => null));
    const at = story.script.scenes.flatMap((s, i) => {
      const t = timings[i]!;
      const mid = { frame: t.from + Math.min(45, Math.round(t.durationInFrames / 2)), label: `${i + 1} ${s.type}${s.gag ? ` ${s.gag}` : ''}`, gag: s.type === 'gag' };
      return s.type === 'gag' ? [{ ...mid, frame: t.from + 10, label: `${mid.label} start` }, { ...mid, frame: t.from + t.durationInFrames - 6, label: `${mid.label} end` }] : [mid];
    });
    const jpgs = await frames(recipe, story.script, at, `sample${n + 1}`);
    sheet(jpgs, 5, path.join(outDir, `sample-${n + 1}.jpg`));
  }
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
console.log(`프레임 한 장 평균: 농담 장면 ${avg(times.gag)}ms (${times.gag.length}장) · 3D 장면 ${avg(times.other)}ms (${times.other.length}장)`);
await browser.close({ silent: true });
process.exit(0);
