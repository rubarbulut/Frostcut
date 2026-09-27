import { defineConfig } from '@playwright/test';
const port = process.env.FROSTCUT_TEST_PORT ?? '5173';
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests',
  outputDir: process.env.FROSTCUT_TEST_PREVIEW ? 'test-results/p1' : 'test-results',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL,
    channel: 'msedge',
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  reporter: 'list',
  webServer: {
    command: process.env.FROSTCUT_TEST_PREVIEW
      ? `npx vite preview --host 127.0.0.1 --port ${port} --strictPort --outDir dist-p1`
      : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
  },
});
