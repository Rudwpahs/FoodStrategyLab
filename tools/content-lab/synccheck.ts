import fs from 'node:fs';
import { SAMPLE_RECIPES, generateTemplateScript } from '@mat-lab/recipe-core';
import { captionGroups } from '@mat-lab/video/timeline';
import { previewTimeline } from '../../apps/studio/server/pipeline.ts';
const recipe = SAMPLE_RECIPES[3]!;
const script = generateTemplateScript(recipe);
const { timings, voiced } = await previewTimeline(script, '');
const out = timings.map((t) => {
  const s = script.scenes.find((x) => x.id === t.sceneId)!;
  return { id: s.id, line: s.line, start: t.from / 30, end: (t.from + t.durationInFrames) / 30, speechEnd: (t.from + t.speechFrames) / 30, trim: (t.audioTrimFrames ?? 0) / 30,
    groups: captionGroups(s.line, Math.max(1, t.speechFrames), t.words).map((g) => ({ text: g.words.map((w) => w.text).join(' '), from: (t.from + g.from) / 30, to: (t.from + g.to) / 30 })) };
});
fs.writeFileSync('out/voiced/walnut-timeline.json', JSON.stringify({ voiced, scenes: out }, null, 1));
console.log('voiced', voiced, 'scenes', out.length, 'total', out.at(-1)!.end);
