import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const fixture = 'tests/fixtures/ten-minutes.mp4';
const generated = spawnSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-stream_loop',
    '24',
    '-i',
    'public/demo.mp4',
    '-t',
    '600',
    '-c',
    'copy',
    fixture,
  ],
  { encoding: 'utf8' },
);
if (generated.status !== 0)
  throw new Error(generated.stderr || 'Could not prepare benchmark input.');
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const at = (seconds) =>
  `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')},000`;
const lines = [
  'The secret to a better video is a better story.',
  'Start with the moment that makes people stop scrolling.',
  'You do not need a perfect camera to tell a story.',
  'Cut the silence and keep the feeling in your video.',
];
const srt = Array.from(
  { length: 120 },
  (_, i) => `${i + 1}\n${at(i * 5)} --> ${at(i * 5 + 4)}\n${lines[i % lines.length]}\n`,
).join('\n');
const started = Date.now();
try {
  await page.goto(process.env.FROSTCUT_QA_URL ?? 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Import video file').setInputFiles(fixture);
  await page.locator('[data-track="V1"] .timeline-clip').waitFor();
  const importMs = Date.now() - started;
  await page
    .getByLabel('Import subtitle file')
    .setInputFiles({ name: 'benchmark.srt', mimeType: 'text/plain', buffer: Buffer.from(srt) });
  await page.locator('.left-panel .word').first().waitFor();
  await page.getByRole('button', { name: 'Auto Cut', exact: true }).click();
  await page.getByRole('combobox', { name: 'Target length', exact: true }).selectOption('45');
  await page.getByRole('button', { name: 'Find the good parts' }).click();
  await page.getByRole('heading', { name: 'The good parts, found.' }).waitFor();
  const analysisMs = Date.now() - started - importMs;
  const highlights = page.getByRole('checkbox', { name: /^Create Short:/ });
  if ((await highlights.count()) < 3)
    throw new Error('Expected at least three distinct highlight candidates.');
  for (let i = 0; i < 3; i++) await highlights.nth(i).check();
  await page.getByRole('button', { name: 'Create 3 Shorts', exact: true }).click();
  const sequenceCount = await page
    .getByLabel('Current sequence', { exact: true })
    .locator('option')
    .count();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('combobox', { name: 'Resolution', exact: true }).selectOption('480x854');
  const exportStarted = Date.now();
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await page.getByRole('heading', { name: 'Your story is ready.' }).waitFor();
  const exportMs = Date.now() - exportStarted;
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MP4', exact: true }).click();
  await (await download).saveAs('test-results/long-video-short.mp4');
  const outputDuration = await page.locator('.export-result').evaluate((v) => v.duration);
  await page.screenshot({ path: 'test-results/long-video-export.png', fullPage: true });
  const report = {
    inputDuration: 600,
    inputResolution: '360x640',
    inputKind:
      'Synthetic looping typography/tone with imported SRT; performance test, not ASR accuracy evidence',
    importMs,
    analysisMs,
    exportMs,
    outputDuration,
    sequenceCount,
    errors,
    browser: browser.version(),
    memory: await page.evaluate(() =>
      performance.memory
        ? {
            usedJSHeapBytes: performance.memory.usedJSHeapSize,
            totalJSHeapBytes: performance.memory.totalJSHeapSize,
            limitJSHeapBytes: performance.memory.jsHeapSizeLimit,
            limitation: 'Chromium JS heap only; excludes GPU/decoder/browser-process memory',
          }
        : null,
    ),
    date: new Date().toISOString(),
  };
  await writeFile('test-results/long-video-benchmark.json', JSON.stringify(report, null, 2));
  console.log(report);
  if (errors.length || sequenceCount !== 4 || !(outputDuration > 0 && outputDuration <= 60))
    throw new Error('Long-video acceptance criteria failed.');
} finally {
  await browser.close();
}
