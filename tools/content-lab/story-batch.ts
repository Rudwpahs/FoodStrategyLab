/**
 * 이야기 대본만 여러 요리로 차례로 쓴다 (영상은 만들지 않음, 실제 Claude 호출 — ANTHROPIC_API_KEY 필요, 요리당 약 $0.1~0.3).
 * 실제 스튜디오처럼 앞 요리에서 쓴 대본을 '계정의 최근 대본'으로 넘겨, 계정 전체에서 같은 구도·소재가 되풀이되는지 본다.
 * 실행: OUT=폴더 DISHES="호두정과,바삭한 김치전" npx tsx tools/content-lab/story-batch.ts
 * 결과: 폴더/번호-요리/stories.json + summary.json → tools/content-lab/diversity-report.ts로 보고서
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.MATLAB_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'story-batch-'));
const { SAMPLE_RECIPES, finalizeStory } = await import('@mat-lab/recipe-core');
const { openDb } = await import('../../apps/studio/server/db.ts');
const { StoryWriter } = await import('../../apps/studio/server/storyWriter.ts');

const out = process.env.OUT || 'out-stories';
const dishes = (process.env.DISHES || SAMPLE_RECIPES.map((r) => r.dishName).join(',')).split(',').map((d) => d.trim()).filter(Boolean);
const writer = new StoryWriter(openDb(':memory:'));
const recent: { storyType: string; title: string; firstLine: string }[] = [];
let total = 0;
let failed = 0;
for (const [i, dish] of dishes.entries()) {
  const recipe = SAMPLE_RECIPES.find((r) => r.dishName === dish);
  if (!recipe) throw new Error(`예시 레시피에 "${dish}"가 없어요`);
  const dir = path.join(out, `${String(i + 1).padStart(2, '0')}-${dish.replace(/\s/g, '_')}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const { drafts, costUsd } = await writer.write(recipe, { recent: recent.slice(0, 12) });
    total += costUsd;
    const stories = drafts.map((d, k) => finalizeStory(recipe, d, `story-${k + 1}`));
    fs.writeFileSync(path.join(dir, 'stories.json'), JSON.stringify(stories, null, 2));
    fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ dish, costUsd, recentGiven: Math.min(recent.length, 12) }, null, 2));
    for (const d of drafts) recent.unshift({ storyType: d.storyType, title: d.title, firstLine: d.scenes[0]?.line ?? '' });
    console.log(`✓ ${dish}: ${drafts.map((d) => `[${d.storyType}/${d.audience}] ${d.title}`).join(' | ')} ($${costUsd.toFixed(2)})`);
  } catch (e) {
    failed++;
    fs.writeFileSync(path.join(dir, 'error.txt'), (e as Error).message);
    console.error(`✘ ${dish}: ${(e as Error).message}`);
  }
}
console.log(`합계 약 $${total.toFixed(2)}`);
process.exit(failed ? 1 : 0);
