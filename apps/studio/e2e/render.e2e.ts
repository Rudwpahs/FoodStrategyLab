/**
 * E2E 3단계: 실제 렌더 (docs/testing/E2E_PLAN.md 4절 G). 진짜 Remotion으로 예시 레시피 영상 1개를 목소리 없이 끝까지 만들고 결과를 확인한다.
 * 10~30분 걸린다. CI에는 넣지 않고, 영상 패키지를 바꾼 뒤·큰 배포 전에 손으로 돌린다.
 * 실행: npm run e2e:render   (결과 폴더를 마지막에 알려 준다. 영상을 직접 열어 보고 확인)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matlab-render-e2e-'));
process.env.MATLAB_DATA_DIR = dataDir;
process.env.TTS_PROVIDER ??= 'none';

// 데이터 폴더를 정한 뒤에 서버 모듈을 불러온다 (config.ts가 불러올 때 폴더를 정한다)
const { startServer } = await import('../server/index.ts');
const { startRender } = await import('../server/pipeline.ts');
const { SAMPLE_RECIPES, generateTemplateScript } = await import('@mat-lab/recipe-core');

const fails: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? '✓' : '✘'} ${what}`);
  if (!ok) fails.push(what);
};

const port = Number(process.env.PORT ?? 5198);
const { repo, server, vite } = await startServer(port);
const started = Date.now();
try {
  const recipe = SAMPLE_RECIPES.find((r) => r.dishName === '호두정과')!;
  const pid = repo.createProject(recipe);
  repo.addScriptVersion(pid, generateTemplateScript(recipe), 'template', 'E2E 실제 렌더');
  const rid = startRender(repo, pid, `http://127.0.0.1:${port}`);
  let last = '';
  for (;;) {
    const r = repo.getRender(rid);
    const line = `${r.status} · ${r.stage} · ${Math.round(r.progress * 100)}%`;
    if (line !== last) console.log(`  [${Math.round((Date.now() - started) / 1000)}초] ${line}`);
    last = line;
    if (['done', 'failed', 'canceled'].includes(r.status)) break;
    if (Date.now() - started > 60 * 60_000) throw new Error('1시간 안에 끝나지 않음');
    await new Promise((res) => setTimeout(res, 2000));
  }
  const r = repo.getRender(rid);
  check(r.status === 'done', `제작 완료 (${r.status}${r.error ? `: ${r.error}` : ''})`);
  const dir = r.outputDir;
  const video = path.join(dir, 'video.mp4');
  check(fs.existsSync(video), 'video.mp4');
  if (fs.existsSync(video)) {
    const ffprobe = path.join(path.dirname(require.resolve('@remotion/compositor-linux-x64-gnu/package.json')), 'ffprobe');
    const seconds = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { cwd: path.dirname(ffprobe) }).toString().trim());
    check(seconds >= 15 && seconds <= 60, `영상 길이 ${seconds.toFixed(1)}초 (15~60초)`);
  }
  const qa = r.qa;
  check(Boolean(qa && qa.checked.length), `자동 품질 검사 기록 (${qa?.checked.join(', ') ?? '없음'})`);
  check(!qa?.issues.some((i) => i.code === 'black'), '검은 화면 없음');
  for (const i of qa?.issues ?? []) console.log(`  · 검사 결과 [${i.level}] ${i.message}`);
  for (const f of ['cover.png', 'cover.jpg', 'thumbnail.png', 'recipe-card.png']) check(fs.existsSync(path.join(dir, f)), f);
  const cards = fs.readdirSync(dir).filter((f) => /^carousel-\d+\.jpg$/.test(f));
  check(cards.length >= 2 && cards.length <= 10, `레시피 카드 ${cards.length}장 (2~10장)`);
  console.log(`\n결과 폴더: ${dir}`);
} finally {
  server.close();
  await vite.close();
}
console.log(`걸린 시간 ${Math.round((Date.now() - started) / 60000)}분`);
if (fails.length) {
  console.error(`\n실패 ${fails.length}개: ${fails.join(' / ')}`);
  process.exit(1);
}
console.log('\n실제 렌더 E2E 통과');
process.exit(0);
