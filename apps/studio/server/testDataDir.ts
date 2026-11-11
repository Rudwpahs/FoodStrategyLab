import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

/**
 * 테스트 파일마다 따로 쓰는 데이터 폴더.
 * 테스트 파일들은 동시에 돌기 때문에 같은 폴더를 쓰면 settings.json(목소리·빠르기)이나 renders/1 같은 파일이 서로 덮인다.
 * config.ts가 DATA_DIR을 정하기 전에 바꿔야 하므로, 테스트 파일에서 다른 서버 모듈보다 먼저 import한다.
 */
// 숨은 폴더(.으로 시작) 안에 둔다: 데이터 폴더 경로에 숨은 폴더가 있어도 내려받기·미디어가 되는지 함께 확인한다
const parent = path.join(os.tmpdir(), '.matlab-tests');
fs.mkdirSync(parent, { recursive: true });
const dir = fs.mkdtempSync(path.join(parent, 'run-'));
process.env.MATLAB_DATA_DIR = dir;
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
