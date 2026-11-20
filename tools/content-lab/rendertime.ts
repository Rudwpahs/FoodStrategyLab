// 렌더 시간 측정: 샘플 레시피 대본의 정해진 60프레임 구간을 실제 영상 렌더로 그려 걸린 시간을 잰다.
// 사용: npx tsx tools/content-lab/rendertime.ts <출력폴더> [레시피번호=0] [시작프레임 비율=0.7] [video 패키지 폴더]
// 네 번째 값을 주면 그 폴더의 렌더러로 그린다(예: 예전 코드를 저장소 안 다른 폴더에 꺼내 두고 비교).
// (음식·조명·연출을 바꾼 전후 비교용. 같은 머신에서 연달아 돌려 비교할 것)
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLE_RECIPES, contentCandidates } from '@mat-lab/recipe-core';
import { buildTimeline, totalFrames, type VideoProps } from '@mat-lab/video/timeline';

const [outDir, recipeArg, atArg, videoDir] = process.argv.slice(2);
if (!outDir) {
  console.error('사용: npx tsx tools/content-lab/rendertime.ts <출력폴더> [레시피번호] [시작 비율]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const { renderVideo } = (await import(videoDir ? path.resolve(videoDir, 'src/render.ts') : '@mat-lab/video/render')) as typeof import('@mat-lab/video/render');
const recipe = SAMPLE_RECIPES[Number(recipeArg ?? 0)]!;
const script = contentCandidates(recipe, { count: 5 }).candidates[0]!.script;
const timings = buildTimeline(script, script.scenes.map(() => null));
const total = totalFrames(timings);
const start = Math.max(0, Math.min(total - 61, Math.floor(total * Number(atArg ?? 0.7))));
const props: VideoProps = { script, timings, reviewed: false, cleanDraft: true, recipe };
// 첫 번째는 묶음 만들기·브라우저 준비가 섞이므로 버리고 두 번째를 잰다
const run = async (name: string) => {
  const t0 = Date.now();
  await renderVideo({ inputProps: props as unknown as Record<string, unknown>, outputLocation: path.join(outDir, `${name}.mp4`), frameRange: [start, start + 59] });
  return Date.now() - t0;
};
await run('warm');
const ms = await run('timed');
console.log(`${recipe.dishName} · 프레임 ${start}~${start + 59} · 60프레임 ${(ms / 1000).toFixed(1)}초 (${Math.round(ms / 60)}ms/프레임)`);
process.exit(0);
