import fs from 'node:fs';
import path from 'node:path';
import { SAMPLE_RECIPES, generateTemplateScript } from '@mat-lab/recipe-core';
import { renderStillImage, renderVideo } from '@mat-lab/video/render';
import { ROOT } from './config.ts';
import { startServer } from './index.ts';
import { generateVoice, previewTimeline } from './pipeline.ts';

/**
 * 파일럿 샘플 영상 3개를 '검수 전 미리보기' 워터마크와 함께 만든다.
 * 승인 절차를 거치지 않으므로 공개용이 아니라 캐릭터·포맷 검증용이다.
 */
const outDir = path.join(ROOT, 'out', 'pilot');
fs.mkdirSync(outDir, { recursive: true });
const port = 5179;
const { server, vite } = await startServer(port);
try {
  for (const [i, recipe] of SAMPLE_RECIPES.entries()) {
    const script = generateTemplateScript(recipe);
    const voice = await generateVoice(script).catch((e: Error) => ({ provider: `none (${e.message})`, generated: 0 }));
    const { timings, voiced } = previewTimeline(script, `http://127.0.0.1:${port}`);
    const file = path.join(outDir, `pilot-${i + 1}.mp4`);
    console.log(`[${i + 1}/3] ${recipe.topic} — 음성: ${voiced ? voice.provider : '없음(자막만)'}`);
    await renderVideo({ inputProps: { script, timings, reviewed: false, recipe }, outputLocation: file });
    await renderStillImage('Cover', { title: recipe.topic, emotion: 'joy', recipe }, path.join(outDir, `pilot-${i + 1}-cover.png`));
    console.log(`  → ${path.relative(ROOT, file)}`);
  }
  await renderStillImage('CharacterSheet', {}, path.join(outDir, 'character-sheet.png'));
  console.log(`완료: ${path.relative(ROOT, outDir)}`);
} finally {
  server.close();
  await vite.close();
}
