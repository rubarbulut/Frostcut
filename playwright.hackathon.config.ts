import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4175';
export default defineConfig({
  testDir: './tests',
  testMatch: ['captions.spec.ts', 'hackathon-backups.spec.ts', 'navigation.spec.ts'],
  grep: /caption text, exact times|timing validation keeps|hosted backup:|middle mouse and hand tool pan|preview speed advances playback/,
  outputDir: 'test-results/hackathon',
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL, browserName: 'chromium', headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4175 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
});
