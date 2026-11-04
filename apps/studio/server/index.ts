import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createApp } from './app.ts';
import { startRender } from './pipeline.ts';
import { DATA_DIR, DB_FILE, DB_SNAPSHOT, PORT } from './config.ts';
import { restoreSnapshot, startSnapshots, type Snapshots } from './dbSnapshot.ts';
import { openDb } from './db.ts';
import { Repo } from './repo.ts';
import { Auth, setupCode } from './auth.ts';
import { describeVoice, ttsProvider } from './tts.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function startServer(port = PORT) {
  if (DB_SNAPSHOT && restoreSnapshot(DB_FILE, DB_SNAPSHOT)) console.log(`  저장소의 DB 복사본을 불러왔어요: ${DB_SNAPSHOT}`);
  const repo = new Repo(openDb(DB_FILE));
  const snapshots: Snapshots | null = DB_SNAPSHOT ? startSnapshots(repo.db, DB_SNAPSHOT) : null;
  const interrupted = repo.failInterruptedRenders();
  // 이 PC 밖에서 접속하게 열려면(HOST=0.0.0.0) 먼저 계정이 있거나, 화면에서 첫 계정을 만들 설정 코드가 있어야 한다
  const host = process.env.HOST ?? '127.0.0.1';
  const auth = new Auth(repo.db);
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && auth.userCount() === 0 && !setupCode()) {
    throw new Error('외부 접속(HOST)을 열기 전에 "npm run user:add"로 계정을 먼저 만드세요.');
  }
  const app = createApp(repo, { startRender, auth });
  // --production: 미리 만든 화면 묶음(dist)을 바로 보낸다 (개발 모드보다 훨씬 빠름, 휴대폰 접속용)
  const production = process.argv.includes('--production');
  const dist = path.join(here, '../dist');
  let vite: { close: () => Promise<void> } = { close: async () => undefined };
  if (production) {
    if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('화면 묶음이 없어요. "npm run start"로 실행해 주세요.');
    app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
    app.get(/^(?!\/api|\/media).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    const dev = await createViteServer({
      configFile: path.join(here, '../vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(dev.middlewares);
    vite = dev;
  }
  const server = app.listen(port, host);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return { repo, server, vite, interrupted, snapshots };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // 라이브러리 안에서 놓친 오류(예: 렌더용 크롬 내려받기 실패) 하나로 서버 전체가 꺼지지 않게 한다.
  // 해당 영상 작업은 자체 오류 처리로 '실패'가 되고, 스튜디오는 계속 동작한다.
  process.on('unhandledRejection', (e) => console.error('처리되지 않은 오류:', (e as Error)?.message ?? e));
  const { interrupted, snapshots } = await startServer();
  // 클라우드 서버가 꺼질 때 마지막 변경까지 저장소에 복사한다
  if (snapshots) {
    for (const sig of ['SIGTERM', 'SIGINT'] as const) {
      process.on(sig, () => {
        try {
          snapshots.flush();
        } finally {
          process.exit(0);
        }
      });
    }
  }
  const tts = await ttsProvider().then(describeVoice, (e: Error) => `없음 (${e.message})`);
  console.log(`\n  🧪 이희재의 맛 연구소 스튜디오: http://localhost:${PORT}`);
  console.log(`  데이터 폴더: ${DATA_DIR}`);
  console.log(`  음성(TTS): ${tts}`);
  if (tts.startsWith('음성 없음')) console.log('  → VoiceStudio 앱을 켜거나 "pip install edge-tts"를 설치하면 음성이 들어갑니다.');
  if (interrupted) console.log(`  중단된 제작 작업 ${interrupted}개를 실패로 표시했습니다.`);
}
