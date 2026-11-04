// 검증용: 이미 만든 파일럿 영상을 프로젝트의 '검수용 영상'으로 붙인다 (30분 렌더를 다시 돌리지 않기 위해)
// 사용: MATLAB_DATA_DIR=... npx tsx tools/content-lab/seed-pilot-render.ts <projectId> <out/pilot/X.mp4> [첫 화면 png]
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DB_FILE } from '../../apps/studio/server/config.ts';
import { openDb } from '../../apps/studio/server/db.ts';
import { Repo } from '../../apps/studio/server/repo.ts';

const [pid, video, still] = process.argv.slice(2);
const repo = new Repo(openDb(DB_FILE));
const state = repo.versionState(Number(pid));
if (state.latestScriptVersion === null) throw new Error('대본이 없습니다');
const rid = repo.createRender(Number(pid), state.latestScriptVersion);
const dir = path.join(DATA_DIR, 'renders', String(rid));
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(video!, path.join(dir, 'video.mp4'));
if (still) for (const f of ['cover.png', 'thumbnail.png', 'recipe-card.png']) fs.copyFileSync(still, path.join(dir, f));
fs.writeFileSync(path.join(dir, 'timeline.json'), '[]');
repo.updateRender(rid, { status: 'done', stage: '완료 (파일럿 영상 연결)', progress: 1, outputDir: dir, finished: true });
repo.logEvent(Number(pid), 'render', `파일럿 영상 연결 (작업 #${rid}): ${path.basename(video!)}`);
console.log('render', rid);
