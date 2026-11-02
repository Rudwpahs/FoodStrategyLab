import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createApp } from './app.ts';
import { DATA_DIR, PORT } from './config.ts';
import { openDb } from './db.ts';
import { Repo } from './repo.ts';
import { ttsProvider } from './tts.ts';

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
  const tts = await ttsProvider().catch((e: Error) => `none (${e.message})`);
  console.log(`\n  🧪 이희재의 맛 연구소 스튜디오: http://localhost:${PORT}`);
  console.log(`  데이터 폴더: ${DATA_DIR}`);
  console.log(`  음성(TTS): ${tts === 'edge' ? 'edge-tts (무료)' : '없음 — 자막만으로 제작 (pip install edge-tts 로 음성 사용 가능)'}`);
  if (interrupted) console.log(`  중단된 제작 작업 ${interrupted}개를 실패로 표시했습니다.`);
}
