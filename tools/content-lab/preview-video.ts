// 목소리 없이(예상 길이·자막만) 후보 영상 한 편을 MP4로 만든다. 화면 확인용.
// 사용: npx tsx tools/content-lab/preview-video.ts <recipe.json> <출력.mp4> [후보번호=0]
import fs from 'node:fs';
import { RecipeInputSchema, contentCandidates } from '@mat-lab/recipe-core';
import { buildTimeline, type VideoProps } from '@mat-lab/video/timeline';
import { renderVideo } from '@mat-lab/video/render';

const [recipeFile, out, pickArg] = process.argv.slice(2);
if (!recipeFile || !out) {
  console.error('사용: npx tsx tools/content-lab/preview-video.ts <recipe.json> <출력.mp4> [후보번호]');
  process.exit(1);
}
const recipe = RecipeInputSchema.parse(JSON.parse(fs.readFileSync(recipeFile, 'utf8')));
const { candidates } = contentCandidates(recipe, { count: 5 });
const pick = candidates[Number(pickArg ?? 0)] ?? candidates[0]!;
const timings = buildTimeline(pick.script, pick.script.scenes.map(() => null));
const props: VideoProps = { script: pick.script, timings, reviewed: false, cleanDraft: true, recipe };
console.log(`후보 ${pick.key} · ${pick.title}`);
let last = -1;
await renderVideo({
  inputProps: props as unknown as Record<string, unknown>,
  outputLocation: out,
  onProgress: (p) => {
    const pct = Math.floor(p * 10) * 10;
    if (pct !== last) console.log(`  ${pct}%`);
    last = pct;
  },
});
console.log(`→ ${out}`);
process.exit(0);
