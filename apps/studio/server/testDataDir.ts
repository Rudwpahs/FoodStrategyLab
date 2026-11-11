import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 테스트 파일마다 따로 쓰는 데이터 폴더.
 * 테스트 파일들은 동시에 돌기 때문에 같은 폴더를 쓰면 settings.json(목소리·빠르기)이나 renders/1 같은 파일이 서로 덮인다.
 * config.ts가 DATA_DIR을 정하기 전에 바꿔야 하므로, 테스트 파일에서 다른 서버 모듈보다 먼저 import한다.
 */
process.env.MATLAB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'matlab-test-'));
