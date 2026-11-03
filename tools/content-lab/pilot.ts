// 호두정과 파일럿 A/B/C: 같은 레시피를 세 가지 연출로 만든다 (검수 전 초안 — 워터마크 표시)
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLE_RECIPES, buildStyledScript, captionGroupsForExport, type HookType, type RecipeInput, type StyleId } from './pilotlib.ts';
import { renderStillImage, renderVideo } from '@mat-lab/video/render';
import { normalizeLoudness } from '@mat-lab/video/audio';
import { startServer } from '../../apps/studio/server/index.ts';
import { generateVoice, previewTimeline } from '../../apps/studio/server/pipeline.ts';
import { resetTtsDetection, ttsProvider } from '../../apps/studio/server/tts.ts';
import { writeVoiceSettings } from '../../apps/studio/server/voicestudio.ts';

const walnut = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
// A·B용: 흔한 실수 칸은 원리 문장("데친 뒤 헹구면 떫은맛이 줄어든다")을 뒤집어 만든 '검수 필요 초안'이다.
const pilotRecipe: RecipeInput = { ...walnut, commonMistake: '호두를 데치지 않고 바로 조리면 떫은맛이 남을 수 있어요.' };
const versions: { key: string; style: StyleId; hook: HookType }[] = [
  { key: 'A-problem', style: 'problem', hook: 'mistake' },
  { key: 'B-comedy', style: 'comedy', hook: 'skit' },
  { key: 'C-experiment', style: 'experiment', hook: 'experiment' },
];
const only = process.argv.slice(2);
const outDir = path.resolve('out/pilot');
fs.mkdirSync(outDir, { recursive: true });
writeVoiceSettings({ voicestudioVoice: '맛조수' });
resetTtsDetection();
console.log('provider', await ttsProvider());
const port = 5180;
const { server, vite } = await startServer(port);
try {
  for (const v of versions.filter((x) => !only.length || only.includes(x.key))) {
    const { script, notes } = buildStyledScript(pilotRecipe, { style: v.style, hookType: v.hook });
    fs.writeFileSync(path.join(outDir, `${v.key}.script.json`), JSON.stringify({ script, notes }, null, 1));
    let t0 = Date.now();
    const voice = await generateVoice(script);
    console.log(v.key, 'voice', voice, ((Date.now() - t0) / 1000).toFixed(0), 's');
    const { timings, voiced } = await previewTimeline(script, `http://127.0.0.1:${port}`);
    const total = (timings.at(-1)!.from + timings.at(-1)!.durationInFrames) / 30;
    console.log(' voiced', voiced, 'seconds', total);
    fs.writeFileSync(path.join(outDir, `${v.key}.timeline.json`), JSON.stringify({ voiced, scenes: captionGroupsForExport(script, timings) }, null, 1));
    const props = { script, timings, reviewed: false, recipe: pilotRecipe };
    await renderStillImage('ShortVideo', props, path.join(outDir, `${v.key}-first.png`), 3);
    t0 = Date.now();
    const raw = path.join(outDir, `${v.key}-raw.mp4`);
    await renderVideo({ inputProps: props, outputLocation: raw });
    await normalizeLoudness(raw, path.join(outDir, `${v.key}.mp4`));
    fs.rmSync(raw);
    console.log(' rendered', v.key, ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
} finally {
  server.close();
  await vite.close();
}
process.exit(0);
