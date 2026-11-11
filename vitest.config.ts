import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/studio/server/**/*.test.ts', 'apps/studio/web/src/**/*.test.ts'],
    environment: 'node',
    // 테스트가 실제 작업 폴더(data/)를 건드리지 않도록 임시 폴더를 쓴다
    env: { MATLAB_DATA_DIR: path.join(os.tmpdir(), 'matlab-test-data'), TTS_PROVIDER: 'none' },
  },
});
