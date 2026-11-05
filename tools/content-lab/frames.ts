// 영상 장면 확인용: 레시피 JSON으로 후보 대본을 만들고, 일정 간격 프레임을 이미지로 뽑아 한 장으로 붙인다.
// 사용: npx tsx tools/content-lab/frames.ts <recipe.json> <출력폴더> [후보번호=0] [간격초=2]
// (목소리 없이 예상 길이로 그린다. 화면 구성·글자 크기·카메라를 빠르게 확인하는 용도)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RecipeInputSchema, contentCandidates } from '@mat-lab/recipe-core';
import { buildTimeline, totalFrames, type VideoProps } from '@mat-lab/video/timeline';
import { renderStillImage } from '@mat-lab/video/render';

const [recipeFile, outDir, pickArg, everyArg, onlyArg] = process.argv.slice(2);
// 선택: 특정 초만 (예: "6.5,16.5")
const only = onlyArg ? onlyArg.split(',').map((x) => Math.round(Number(x) * 30)) : null;
if (!recipeFile || !outDir) {
  console.error('사용: npx tsx tools/content-lab/frames.ts <recipe.json> <출력폴더> [후보번호] [간격초]');
  process.exit(1);
}
const recipe = RecipeInputSchema.parse(JSON.parse(fs.readFileSync(recipeFile, 'utf8')));
const { candidates } = contentCandidates(recipe, { count: 5 });
const pick = candidates[Number(pickArg ?? 0)] ?? candidates[0]!;
const timings = buildTimeline(pick.script, pick.script.scenes.map(() => null));
const props: VideoProps = { script: pick.script, timings, reviewed: false, cleanDraft: true, recipe };
const total = totalFrames(timings);
const every = Math.round(Number(everyArg ?? 2) * 30);
fs.mkdirSync(outDir, { recursive: true });
console.log(`후보 ${pick.key} · ${pick.title} · ${(total / 30).toFixed(1)}초`);
const files: string[] = [];
const frames = only ?? Array.from({ length: Math.ceil((total - 15) / every) }, (_, i) => 15 + i * every);
for (const f of frames) {
  const file = path.join(outDir, `f${String(f).padStart(4, '0')}.png`);
  await renderStillImage('ShortVideo', props as unknown as Record<string, unknown>, file, f);
  files.push(file);
  const scene = timings.find((t) => f >= t.from && f < t.from + t.durationInFrames);
  console.log(`  ${(f / 30).toFixed(1)}초 · ${scene?.sceneId ?? ''}`);
}
// 한 장으로 붙이기 (ffmpeg)
const cols = Math.min(6, files.length);
const rows = Math.ceil(files.length / cols);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-pattern_type', 'glob', '-i', path.join(outDir, 'f*.png'), '-vf', `scale=360:-1,tile=${cols}x${rows}`, '-frames:v', '1', path.join(outDir, 'sheet.png')]);
console.log(`→ ${path.join(outDir, 'sheet.png')}`);
process.exit(0);
