import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 1단계 (docs/testing/E2E_PLAN.md). 가짜 렌더러·가짜 Claude를 끼운 시험 서버를 띄우고 휴대폰·PC 화면으로 흐름을 따라간다.
 * 실행: npm run e2e   (화면 묶음을 만든 뒤 이 설정으로 돈다)
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 5199);
export const BASE = `http://127.0.0.1:${PORT}`;
export const SETUP_CODE = 'e2e-setup-code-2026';
// 실행마다 새 데이터 폴더 (숨은 폴더 안: 경로에 '.'으로 시작하는 폴더가 있어도 되는지 함께 본다)
const parent = path.join(os.tmpdir(), '.matlab-e2e');
fs.mkdirSync(parent, { recursive: true });
const dataDir = process.env.E2E_DATA_DIR ?? fs.mkdtempSync(path.join(parent, 'run-'));
process.env.E2E_DATA_DIR = dataDir;

// 클라우드처럼: 프록시를 거친 요청으로 보이게 해서 '이 PC 전용' 모드가 아닌 로그인 모드로 시험한다
const proxied = { 'x-forwarded-for': '203.0.113.10' };

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  // 서버 하나(제작 줄 하나)를 함께 쓰므로 한 번에 하나씩, 파일 이름 순서대로
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../../../tmp/e2e-report' }]] : [['list']],
  outputDir: '../../../tmp/e2e-results',
  use: {
    baseURL: BASE,
    extraHTTPHeaders: proxied,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ko-KR',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    // PC 화면은 전체 흐름과 화면 품질만 (계정·규칙·보안은 휴대폰 쪽에서 한 번)
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } }, testMatch: /(flow|screens)\.spec\.ts$/, dependencies: ['mobile'] },
  ],
  webServer: {
    command: 'npx tsx apps/studio/e2e/server.ts --production',
    cwd: path.resolve(here, '../../..'),
    url: `${BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    env: {
      PORT: String(PORT),
      MATLAB_DATA_DIR: dataDir,
      TTS_PROVIDER: 'none',
      STUDIO_SETUP_CODE: SETUP_CODE,
      TRUST_PROXY: '1',
      // 화면이 사진 읽기 버튼을 켜도록 '설정됨'으로 보이게만 한다. Claude 부르는 곳은 모두 가짜로 바꿨고,
      // 혹시 빠진 곳이 있으면 바깥이 아니라 닫힌 주소로 가서 바로 실패한다 (돈이 나가지 않게)
      ANTHROPIC_API_KEY: 'e2e-fake-key',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
    },
  },
});
