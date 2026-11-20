// 음식 화면 확인용: 샘플 레시피 5개마다 같은 규칙으로 고른 프레임(첫 화면·조리·완성 접시·엔딩)을 그려 한 장으로 붙인다.
// 사용: npx tsx tools/content-lab/foodframes.ts <출력폴더> [후보번호=0] [일부만: r0-plate,r3-cook]
// (목소리 없이 예상 길이로 그린다. 음식·배경을 고치기 전후를 비교하는 용도. 프레임마다 그린 시간도 적는다)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SAMPLE_RECIPES, contentCandidates, foodProfile, ingredientProps } from '@mat-lab/recipe-core';
import { buildTimeline, totalFrames, type VideoProps } from '@mat-lab/video/timeline';
import { renderStillImage } from '@mat-lab/video/render';
import { stageAt } from '../../packages/video/src/three/stage.ts';
import { BURNER, PLATE } from '../../packages/video/src/three/layout.ts';

const [outDir, pickArg, onlyArg] = process.argv.slice(2);
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
if (!outDir) {
  console.error('사용: npx tsx tools/content-lab/foodframes.ts <출력폴더> [후보번호]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const near = (a: number[], b: number[], d: number) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!) < d;
const times: number[] = [];
const rows: string[] = [];
const picked: string[] = [];
for (const [ri, recipe] of SAMPLE_RECIPES.entries()) {
  const { candidates } = contentCandidates(recipe, { count: 5 });
  const pick = candidates[Number(pickArg ?? 0)] ?? candidates[0]!;
  const script = pick.script;
  const timings = buildTimeline(script, script.scenes.map(() => null));
  const total = totalFrames(timings);
  const kind = foodProfile(recipe).kind;
  const props = ingredientProps(recipe).length;
  const states = Array.from({ length: total }, (_, f) => stageAt(script, timings, f, kind, props));
  // 조건에 맞는 가장 긴 구간의 가운데 프레임
  const middleOf = (ok: (f: number) => boolean, fallback: number) => {
    let best: [number, number] = [fallback, fallback];
    let start = -1;
    for (let f = 0; f <= total; f++) {
      if (f < total && ok(f)) {
        if (start < 0) start = f;
      } else if (start >= 0) {
        if (f - start > best[1] - best[0]) best = [start, f];
        start = -1;
      }
    }
    return Math.floor((best[0] + best[1]) / 2);
  };
  const cook = middleOf((f) => !!states[f]?.showFoodInVessel && near(states[f]!.camera.target, BURNER, 0.3), Math.floor(total * 0.5));
  const plate = middleOf((f) => states[f]?.plated === 'done' && near(states[f]!.camera.target, PLATE, 0.3), Math.floor(total * 0.8));
  const frames: [string, number][] = [
    ['open', 12],
    ['cook', cook],
    ['plate', plate],
    ['end', total - 20],
  ];
  const props_: VideoProps = { script, timings, reviewed: false, cleanDraft: true, recipe };
  const files: string[] = [];
  for (const [name, f] of frames) {
    const file = path.join(outDir, `r${ri}-${name}.png`);
    if (only && !only.has(`r${ri}-${name}`)) continue;
    const t0 = Date.now();
    await renderStillImage('ShortVideo', props_ as unknown as Record<string, unknown>, file, f);
    const ms = Date.now() - t0;
    if (files.length || ri) times.push(ms); // 첫 프레임은 묶음 만들기 시간이 섞이므로 뺀다
    files.push(file);
    picked.push(file);
    console.log(`${recipe.dishName} · ${pick.key} · ${name} ${f}/${total}프레임 · ${ms}ms`);
  }
  if (only) continue;
  const row = path.join(outDir, `row${ri}.png`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}]scale=270:-1[s${i}]`).join(';')};${files.map((_, i) => `[s${i}]`).join('')}hstack=inputs=${files.length}`, row]);
  rows.push(row);
}
const sheet = path.join(outDir, 'sheet.png');
// 일부만 그렸으면 한 줄로, 아니면 레시피별 줄을 위아래로
const parts = only ? picked : rows;
const stack = only ? `${parts.map((_, i) => `[${i}]scale=360:-1[s${i}]`).join(';')};${parts.map((_, i) => `[s${i}]`).join('')}hstack=inputs=${parts.length}` : `${parts.map((_, i) => `[${i}]`).join('')}vstack=inputs=${parts.length}`;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...parts.flatMap((f) => ['-i', f]), '-filter_complex', parts.length > 1 || !only ? stack : '[0]scale=360:-1', sheet]);
const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
console.log(`→ ${sheet} · 프레임당 평균 ${Math.round(avg)}ms (${times.length}장)`);
process.exit(0);
