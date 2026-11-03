import { captionGroups, type SceneTiming } from '@mat-lab/video/timeline';
import type { Script } from '@mat-lab/recipe-core';
export { SAMPLE_RECIPES, buildStyledScript, type HookType, type RecipeInput, type StyleId } from '@mat-lab/recipe-core';
/** 받아쓰기 비교용 타임라인 (out/synccheck.ts와 같은 형식) */
export function captionGroupsForExport(script: Script, timings: SceneTiming[]) {
  return timings.map((t) => {
    const s = script.scenes.find((x) => x.id === t.sceneId)!;
    return {
      id: s.id, line: s.line, start: t.from / 30, end: (t.from + t.durationInFrames) / 30,
      groups: captionGroups(s.line, Math.max(1, t.speechFrames), t.words).map((g) => ({ text: g.words.map((w) => w.text).join(' '), from: (t.from + g.from) / 30, to: (t.from + g.to) / 30 })),
    };
  });
}
