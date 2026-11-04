import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.ts';

/**
 * 클라우드(Modal) 저장 방식.
 * 클라우드 저장소(Volume)는 큰 파일에는 좋지만 SQLite를 바로 올려 두기에는 잠금이 불안하다.
 * 그래서 DB는 서버 안 디스크에서 쓰고, 바뀐 것이 있으면 몇 초마다 저장소에 통째로 복사해 둔다.
 * 서버가 새로 켜질 때는 저장소의 복사본을 가져와 이어서 쓴다.
 */
export function restoreSnapshot(dbFile: string, snapshot: string): boolean {
  if (fs.existsSync(dbFile) || !fs.existsSync(snapshot)) return false;
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.copyFileSync(snapshot, dbFile);
  return true;
}

export interface Snapshots {
  /** 바뀐 것이 있으면 지금 바로 복사한다 */
  flush: () => void;
  stop: () => void;
}

export function startSnapshots(db: Db, snapshot: string, everyMs = 5000): Snapshots {
  fs.mkdirSync(path.dirname(snapshot), { recursive: true });
  let saved = -1;
  const changes = () => Number((db.prepare('SELECT total_changes() AS n').get() as { n: number }).n);
  const flush = () => {
    const n = changes();
    if (n === saved && fs.existsSync(snapshot)) return;
    const tmp = `${snapshot}.tmp`;
    fs.rmSync(tmp, { force: true });
    // VACUUM INTO: 쓰는 중이어도 일관된 한 장의 DB 파일을 만든다
    db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
    fs.renameSync(tmp, snapshot);
    saved = n;
  };
  const timer = setInterval(() => {
    try {
      flush();
    } catch (e) {
      console.error('DB 복사 실패:', (e as Error).message);
    }
  }, everyMs);
  timer.unref();
  return { flush, stop: () => clearInterval(timer) };
}
