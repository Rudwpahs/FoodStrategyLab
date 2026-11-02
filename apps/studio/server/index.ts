import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createApp } from './app.ts';
import { DATA_DIR, PORT } from './config.ts';
import { openDb } from './db.ts';
import { Repo } from './repo.ts';
import { describeVoice, ttsProvider } from './tts.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function startServer(port = PORT) {
  const repo = new Repo(openDb(path.join(DATA_DIR, 'studio.db')));
  const interrupted = repo.failInterruptedRenders();
  const app = createApp(repo);
  const vite = await createViteServer({
    configFile: path.join(here, '../vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  const server = app.listen(port, '127.0.0.1');
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
