/**
 * 견본 영상 여러 편의 이야기 대본을 실제 스튜디오처럼 차례로 쓰고 고른다 (실제 Claude 호출 — ANTHROPIC_API_KEY 필요, 요리당 약 $0.1~0.3).
 * 앞 요리에서 쓴 대본을 '계정의 최근 대본'으로 넘기므로, 같은 출처 문장·첫 어절·형식이 영상마다 되풀이되지 않는지 볼 수 있다
 * (따로따로 동시에 쓰면 서로를 몰라 4편 중 3편이 같은 말로 시작했다: 2026-11-20 견본).
 * 실행: OUT=폴더 JOBS='[{"dish":"호두정과","audience":"hobby-learner","type":"why","persona":"recorder"}]' npx tsx tools/content-lab/pick-stories.ts
 * persona(맛조수 성격, persona.ts)를 주면 그 성격으로 쓰고, 최근 대본은 성격마다 따로 잇는다 (성격만 바꿔 비교하려고)
 * 결과: 폴더/번호-요리/stories.json (쓴 대본 전부) + 폴더/picks.json (요리마다 고른 대본, 렌더에 넘긴다)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.MATLAB_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'pick-stories-'));
const { AUDIENCES, SAMPLE_RECIPES, STORY_TYPES, finalizeStory, isPersonaId } = await import('@mat-lab/recipe-core');
const { openDb } = await import('../../apps/studio/server/db.ts');
const { StoryWriter } = await import('../../apps/studio/server/storyWriter.ts');
const { pickStory } = await import('../../apps/studio/e2e/pickStory.ts');

interface Job {
  dish: string;
  audience?: string;
  type?: string;
  /** 맛조수 성격 (persona.ts). 비우면 기본 설정 */
  persona?: string;
}
const out = process.env.OUT || 'out-picks';
const jobs = JSON.parse(process.env.JOBS || '[]') as Job[];
if (!jobs.length) throw new Error('JOBS가 비었어요');
const writer = new StoryWriter(openDb(':memory:'));
// '최근 대본'은 성격(페르소나)마다 따로 잇는다: 같은 요리를 성격만 바꿔 비교할 때 서로를 피하느라 형식·대상이 달라지지 않게
const recentBy = new Map<string, { storyType: string; title: string; firstLine: string; lines: string[] }[]>();
const picks: unknown[] = [];
let total = 0;
for (const [i, job] of jobs.entries()) {
  const recipe = SAMPLE_RECIPES.find((r) => r.dishName === job.dish);
  if (!recipe) throw new Error(`예시 레시피에 "${job.dish}"가 없어요`);
  const dir = path.join(out, `${String(i + 1).padStart(2, '0')}-${job.dish.replace(/\s/g, '_')}${job.persona ? `-${job.persona}` : ''}`);
  fs.mkdirSync(dir, { recursive: true });
  if (job.persona && !isPersonaId(job.persona)) throw new Error(`모르는 성격(페르소나): ${job.persona}`);
  const persona = job.persona && isPersonaId(job.persona) ? job.persona : undefined;
  const recent = recentBy.get(persona ?? '') ?? [];
  recentBy.set(persona ?? '', recent);
  // 요청한 형식과 시청자를 함께 강제한다 (형식만 강제하면 다른 시청자로 써서 견본이 뒤바뀌었다: 2026-11-23)
  const mustInclude = job.type && (STORY_TYPES as readonly string[]).includes(job.type) ? (job.type as (typeof STORY_TYPES)[number]) : undefined;
  const mustAudience = job.audience && (AUDIENCES as readonly string[]).includes(job.audience) ? (job.audience as (typeof AUDIENCES)[number]) : undefined;
  const { drafts, costUsd } = await writer.write(recipe, { recent: recent.slice(0, 12), persona, mustInclude, mustAudience });
  total += costUsd;
  const stories = drafts.map((d, k) => finalizeStory(recipe, d, `story-${k + 1}`));
  fs.writeFileSync(path.join(dir, 'stories.json'), JSON.stringify(stories, null, 2));
  const pick = pickStory(stories, job.audience, job.type);
  picks.push(pick ?? null);
  if (pick && ((job.type && pick.storyType !== job.type) || (job.audience && pick.audience !== job.audience)))
    console.warn(`⚠ ${job.dish}: 요청(${job.type ?? '-'}/${job.audience ?? '-'})과 다른 대본을 골랐어요 (${pick.storyType}/${pick.audience})`);
  // 스튜디오처럼 쓴 대본 전부가 다음 요리의 '최근 대본'이 된다
  for (const d of drafts) recent.unshift({ storyType: d.storyType, title: d.title, firstLine: d.scenes[0]?.line ?? '', lines: d.scenes.map((sc) => sc.line) });
  console.log(`${pick ? '✓' : '✘'} ${job.dish}${persona ? ` (${persona})` : ''}: ${pick ? `[${pick.storyType}/${pick.audience}] ${pick.script.title}` : '원본 대조를 통과한 대본 없음'} ($${costUsd.toFixed(2)})`);
}
fs.writeFileSync(path.join(out, 'picks.json'), JSON.stringify(picks, null, 2));
console.log(`합계 약 $${total.toFixed(2)}`);
process.exit(picks.every(Boolean) ? 0 : 1);
