// Run against production previews. This measures editor playback, not ASR or export.
// FROSTCUT_PERF_URLS=http://127.0.0.1:5182,http://127.0.0.1:5183 node scripts/benchmark-editor.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const output = process.env.FROSTCUT_PERF_OUTPUT ?? 'performance-results/editor.json';
const urls = (process.env.FROSTCUT_PERF_URLS ?? 'http://127.0.0.1:5182').split(',');
const repeats = Number(process.env.FROSTCUT_PERF_REPEATS ?? 3);
const fixture = 'tests/fixtures/ten-minutes.mp4';
if (!existsSync(fixture)) {
  const result = spawnSync(
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
  if (result.status !== 0) throw new Error(result.stderr || 'Could not generate fixture');
}
const at = (s) =>
  `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},000`;
const sentence = 'A good story starts with a clear idea and keeps people watching.';
const srt = Array.from(
  { length: 120 },
  (_, i) => `${i + 1}\n${at(i * 5)} --> ${at(i * 5 + 4)}\n${sentence}\n`,
).join('\n');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const runs = [];
await mkdir('performance-results', { recursive: true });
try {
  // Alternate builds to reduce ordering/thermal bias. Each run gets a fresh project.
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const url of repeat % 2 ? [...urls].reverse() : urls) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(url);
      await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
      await page.getByRole('button', { name: 'Create project', exact: true }).click();
      await page.getByLabel('Preview quality', { exact: true }).selectOption('Full');
      await page.getByLabel('Import video file').setInputFiles(fixture);
      await page.locator('[data-track="V1"] .timeline-clip').waitFor();
      await page.getByLabel('Import subtitle file').setInputFiles({
        name: 'performance.srt',
        mimeType: 'text/plain',
        buffer: Buffer.from(srt),
      });
      await page.locator('.left-panel .word').first().waitFor();
      const wordCount = await page.locator('.left-panel .word').count();
      if (wordCount !== 1440) throw new Error(`Unexpected word count: ${wordCount}`);
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.waitForTimeout(2000);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByRole('button', { name: 'Go to start', exact: true }).click();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      const before = Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
      );
      const frames = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const gaps = [];
            let last, id;
            const start = performance.now();
            const frame = (now) => {
              if (last !== undefined) gaps.push(now - last);
              last = now;
              id = requestAnimationFrame(frame);
            };
            id = requestAnimationFrame(frame);
            setTimeout(() => {
              cancelAnimationFrame(id);
              const sorted = [...gaps].sort((a, b) => a - b);
              const video = document.querySelector('.video-canvas video');
              const quality = video?.getVideoPlaybackQuality();
              resolve({
                elapsedMs: performance.now() - start,
                count: gaps.length,
                medianMs: sorted[Math.floor(sorted.length * 0.5)],
                p95Ms: sorted[Math.floor(sorted.length * 0.95)],
                gapsOver50Ms: gaps.filter((x) => x > 50).length,
                video: {
                  width: video?.videoWidth,
                  height: video?.videoHeight,
                  totalFrames: quality?.totalVideoFrames,
                  droppedFrames: quality?.droppedVideoFrames,
                },
              });
            }, 10000);
          }),
      );
      const after = Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
      );
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      const metrics = {};
      for (const key of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'])
        metrics[key + 'MsPerSecond'] = ((after[key] - before[key]) * 1e6) / frames.elapsedMs;
      const run = { url, repeat, wordCount, frames, metrics, errors };
      runs.push(run);
      console.log(JSON.stringify(run));
      if (errors.length) throw new Error(errors.join('\n'));
      if (repeat === 0)
        await page.screenshot({
          path: `performance-results/editor-${new URL(url).port}.png`,
          fullPage: true,
        });
      await context.close();
    }
  }
  await writeFile(
    output,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        scenario:
          '600s 360x640 video, 1440 imported words, transcript visible, Full preview, 1x speed, 10s playback after 2s warmup',
        limitation:
          'Synthetic local editor workload; not ASR, export, GPU memory or a guarantee for other hardware.',
        runs,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
