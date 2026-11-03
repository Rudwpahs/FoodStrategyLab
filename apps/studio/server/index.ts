import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createApp } from './app.ts';
import { startRender } from './pipeline.ts';
import { DATA_DIR, PORT } from './config.ts';
import { openDb } from './db.ts';
import { Repo } from './repo.ts';
import { Auth } from './auth.ts';
import { describeVoice, ttsProvider } from './tts.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function startServer(port = PORT) {
  const repo = new Repo(openDb(path.join(DATA_DIR, 'studio.db')));
  const interrupted = repo.failInterruptedRenders();
  // 이 PC 밖에서 접속하게 열려면(HOST=0.0.0.0) 먼저 계정이 있어야 한다
  const host = process.env.HOST ?? '127.0.0.1';
  const auth = new Auth(repo.db);
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && auth.userCount() === 0) {
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
  return { repo, server, vite, interrupted };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { interrupted } = await startServer();
  const tts = await ttsProvider().then(describeVoice, (e: Error) => `없음 (${e.message})`);
  console.log(`\n  🧪 이희재의 맛 연구소 스튜디오: http://localhost:${PORT}`);
  console.log(`  데이터 폴더: ${DATA_DIR}`);
  console.log(`  음성(TTS): ${tts}`);
  if (tts.startsWith('음성 없음')) console.log('  → VoiceStudio 앱을 켜거나 "pip install edge-tts"를 설치하면 음성이 들어갑니다.');
  if (interrupted) console.log(`  중단된 제작 작업 ${interrupted}개를 실패로 표시했습니다.`);
}
