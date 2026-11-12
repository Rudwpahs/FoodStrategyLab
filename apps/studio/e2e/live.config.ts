import { defineConfig, devices } from '@playwright/test';

/** E2E 2단계: 배포된 실제 서버 점검 (읽기만). npm run e2e:live */
export default defineConfig({
  testDir: '.',
  testMatch: /live\.check\.ts$/,
  workers: 1,
  retries: 2, // 서버가 잠에서 깨는 동안(첫 요청 30초 안팎) 한 번 늦을 수 있다
  timeout: 120_000,
  reporter: [['list']],
  outputDir: '../../../tmp/e2e-live-results',
  use: {
    baseURL: process.env.STUDIO_URL ?? 'https://rudwpahs--matlab-studio-web.us-east.modal.run',
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    locale: 'ko-KR',
    // 바깥 연결이 프록시를 거치는 곳(개발 컨테이너)에서는 API 요청도 같은 프록시로. GitHub Actions에는 없다
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  },
});
