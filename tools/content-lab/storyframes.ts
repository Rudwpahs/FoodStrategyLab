// 실제 영상 대본(이야기 대본 묶음 JSON)으로 음식이 나오는 장면의 프레임을 그려 요리별 한 줄씩 붙인다.
// 사용: npx tsx tools/content-lab/storyframes.ts <대본묶음.json> <출력폴더> [레시피 번호=3,0,1,4] [일부만: d0-open,d1-cook2]
// - 대본묶음: [{ script }, ...] (스튜디오 '이야기 대본'이 고른 결과와 같은 모양). 레시피 번호는 SAMPLE_RECIPES 순서 (대본과 같은 차례).
// - 목소리 없이 예상 길이로 그린다. 고르는 프레임: 첫 화면 · 재료 소품 · 조리(앞·뒤) · 완성 접시 · 비교 화면 · 엔딩.
//   고르는 규칙은 대본과 장면 상태만 보므로, 음식 그리는 코드를 고친 전후에 같은 프레임이 나온다 (전후 비교용).
// - 프레임은 540px 너비 JPEG로 줄여 저장하고(디스크 절약), 그린 시간을 frames.json에 적는다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { SAMPLE_RECIPES, foodProfile, ingredientProps, type Script } from '@mat-lab/recipe-core';
import { buildTimeline, totalFrames, type VideoProps } from '@mat-lab/video/timeline';
import { openBrowser, renderStill, selectComposition, type ChromiumOptions } from '@remotion/renderer';
import { getServeUrl } from '@mat-lab/video/render';
import { sceneAt, stageAt } from '../../packages/video/src/three/stage.ts';
import { BURNER, PLATE, PROP_CENTER } from '../../packages/video/src/three/layout.ts';

const [file, outDir, recipeArg, onlyArg] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('사용: npx tsx tools/content-lab/storyframes.ts <대본묶음.json> <출력폴더> [레시피 번호=3,0,1,4] [일부만]');
  process.exit(1);
}
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
const picks = JSON.parse(fs.readFileSync(file, 'utf8')) as { script: Script }[];
const recipeIdx = (recipeArg ?? '3,0,1,4').split(',').map(Number);
fs.mkdirSync(outDir, { recursive: true });
const font = createRequire(import.meta.url).resolve('pretendard/dist/public/static/Pretendard-Bold.otf');

const near = (a: number[], b: number[], d: number) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!) < d;
/** 조건에 맞는 연속 구간들 [시작, 끝) */
function runs(total: number, ok: (f: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let f = 0; f <= total; f++) {
    if (f < total && ok(f)) {
      if (start < 0) start = f;
    } else if (start >= 0) {
      out.push([start, f]);
      start = -1;
    }
  }
  return out;
}
const mid = ([a, b]: [number, number], t = 0.5) => Math.floor(a + (b - a) * t);
const longest = (rs: [number, number][]) => rs.reduce<[number, number] | null>((best, r) => (!best || r[1] - r[0] > best[1] - best[0] ? r : best), null);

// 브라우저 하나를 열어 두고 모든 프레임을 그린다 (프레임마다 브라우저를 새로 열면 한 장에 몇 초씩 더 걸린다)
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
const chromiumOptions: ChromiumOptions = { gl: (process.env.REMOTION_GL as ChromiumOptions['gl']) ?? 'swangle' };
const serveUrl = await getServeUrl();
const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions, logLevel: 'error' });

const report: { dish: string; name: string; frame: number; ms: number; file: string }[] = [];
const rows: string[] = [];
const TILE = 270;
for (const [di, pick] of picks.entries()) {
  const recipe = SAMPLE_RECIPES[recipeIdx[di] ?? di]!;
  const script = pick.script;
  const timings = buildTimeline(script, script.scenes.map(() => null));
  const total = totalFrames(timings);
  const kind = foodProfile(recipe).kind;
  const labels = ingredientProps(recipe).map((p) => p.label);
  const states = Array.from({ length: total }, (_, f) => stageAt(script, timings, f, kind, labels));
  const typeAt = (f: number) => sceneAt(script, timings, f)?.scene;
  const frames: [string, number][] = [];
  const add = (name: string, f: number | undefined) => {
    if (f === undefined || f < 0 || f >= total) return;
    if (frames.some(([, g]) => Math.abs(g - f) < 12)) return;
    frames.push([name, f]);
  };
  // 첫 화면: 카메라가 다가와 멈춘 뒤
  const first = timings[0]!;
  add('open', Math.min(first.from + first.durationInFrames - 4, 44));
  // 재료 소품: 모두 나온 뒤
  const props = longest(runs(total, (f) => typeAt(f)?.type === 'ingredients' && (states[f]?.propPop.every((p) => p >= 0.99) ?? false) && near(states[f]!.camera.target, PROP_CENTER, 0.6)));
  if (props) add('props', mid(props, 0.6));
  // 조리: 불 위 음식이 보이는 구간 (첫 화면 다음 첫 구간의 앞쪽 = 덜 익음, 마지막 구간의 뒤쪽 = 다 익음, 연구실 불 위)
  const openEnd = first.from + first.durationInFrames;
  const cooking = (f: number) => !!states[f]?.showFoodInVessel && near(states[f]!.camera.target, BURNER, 0.3);
  const cook = runs(total, (f) => f >= openEnd && cooking(f) && states[f]?.place !== 'lab');
  if (cook.length) {
    add('cook1', mid(cook[0]!, 0.35));
    add('cook2', mid(cook[cook.length - 1]!, cook.length > 1 ? 0.6 : 0.85));
  }
  const lab = longest(runs(total, (f) => f >= openEnd && cooking(f) && states[f]?.place === 'lab'));
  if (lab) add('lab', mid(lab));
  // 완성 접시 (조리대 위)
  const plate = longest(runs(total, (f) => states[f]?.plated === 'done' && near(states[f]!.camera.target, PLATE, 0.3) && typeAt(f)?.visual !== 'compare'));
  if (plate) add('plate', mid(plate));
  // 실패 접시 (첫 화면이 아닌 곳에 있으면)
  const fail = longest(runs(total, (f) => states[f]?.plated === 'failed' && f > openEnd));
  if (fail) add('fail', mid(fail));
  // 비교 화면 (위: 건너뛴 쪽, 아래: 노트대로)
  const compare = longest(runs(total, (f) => typeAt(f)?.visual === 'compare'));
  if (compare) add('compare', mid(compare));
  add('end', total - 20);
  frames.sort((a, b) => a[1] - b[1]);

  const inputProps = { script, timings, reviewed: false, cleanDraft: true, recipe } satisfies VideoProps as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: 'ShortVideo', inputProps, browserExecutable, chromiumOptions, puppeteerInstance: browser, logLevel: 'error' });
  const tiles: string[] = [];
  for (const [name, f] of frames) {
    const id = `d${di}-${name}`;
    if (only && !only.has(id)) continue;
    const png = path.join(outDir, `${id}.png`);
    const jpg = path.join(outDir, `${id}.jpg`);
    const t0 = Date.now();
    await renderStill({ composition, serveUrl, output: png, inputProps, browserExecutable, chromiumOptions, frame: f, puppeteerInstance: browser, logLevel: 'error', timeoutInMilliseconds: 120_000 });
    const ms = Date.now() - t0;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-vf', 'scale=540:-1', '-q:v', '3', jpg]);
    fs.rmSync(png);
    report.push({ dish: recipe.dishName, name, frame: f, ms, file: jpg });
    tiles.push(jpg);
    console.log(`${recipe.dishName} · ${name} ${f}/${total}프레임 · ${ms}ms`);
  }
  if (only || !tiles.length) continue;
  const row = path.join(outDir, `row${di}.jpg`);
  const label = (i: number) => `drawtext=fontfile=${font}:text='${frames[i]![0]}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=4`;
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...tiles.flatMap((t) => ['-i', t]),
    '-filter_complex',
    `${tiles.map((_, i) => `[${i}]scale=${TILE}:-1,${label(i)}[s${i}]`).join(';')};${tiles.map((_, i) => `[s${i}]`).join('')}hstack=inputs=${tiles.length},pad=${TILE * 8}:ih:0:0:white`,
    '-q:v', '3', row,
  ]);
  rows.push(row);
}
// 일부만 다시 그렸으면 예전 기록에 덮어 쓴다 (같은 파일)
const manifest = path.join(outDir, 'frames.json');
const kept = only && fs.existsSync(manifest) ? (JSON.parse(fs.readFileSync(manifest, 'utf8')) as typeof report).filter((r) => !report.some((n) => n.file === r.file)) : [];
fs.writeFileSync(manifest, JSON.stringify([...kept, ...report], null, 1));
if (!only && rows.length) {
  const sheet = path.join(outDir, 'sheet.jpg');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...rows.flatMap((r) => ['-i', r]), '-filter_complex', `${rows.map((_, i) => `[${i}]`).join('')}vstack=inputs=${rows.length}`, '-q:v', '3', sheet]);
  console.log(`→ ${sheet}`);
}
// 첫 장은 셰이더 준비 시간이 섞이므로 평균에서 뺀다
const times = report.slice(1).map((r) => r.ms);
console.log(`프레임당 평균 ${Math.round(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length))}ms (${times.length}장)`);
await browser.close({ silent: true });
process.exit(0);
