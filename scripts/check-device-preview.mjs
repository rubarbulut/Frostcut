import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('docs/qa', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const baseURL = process.env.FROSTCUT_QA_URL ?? 'http://127.0.0.1:4173';
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  const started = Date.now();
  await page.getByLabel('Import video file').setInputFiles('tests/fixtures/4k.mp4');
  await expect(page.locator('.preview-quality')).toContainText('Preview 960 × 540');
  await expect
    .poll(() =>
      page
        .locator('.video-canvas > video')
        .first()
        .evaluate((v) => v.videoWidth),
    )
    .toBe(960);
  const proxyMs = Date.now() - started;
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.video-canvas > video')
        .first()
        .evaluate((v) => v.currentTime),
    )
    .toBeGreaterThan(0.5);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const mobile = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    documentWidth: document.documentElement.scrollWidth,
    previewWidth: document.querySelector('.video-canvas > video').videoWidth,
    memory: performance.memory
      ? {
          usedJSHeapBytes: performance.memory.usedJSHeapSize,
          totalJSHeapBytes: performance.memory.totalJSHeapSize,
          limitJSHeapBytes: performance.memory.jsHeapSizeLimit,
        }
      : null,
  }));
  expect(mobile.documentWidth).toBeLessThanOrEqual(392);
  await page.screenshot({ path: 'docs/qa/mobile-proxy.png', fullPage: true });
  await page.close();

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  desktop.on('pageerror', (e) => errors.push(e.message));
  await desktop.addInitScript(() => {
    const original = AudioContext.prototype.createGain;
    window.qaAudio = [];
    AudioContext.prototype.createGain = function () {
      const gain = original.call(this);
      const analyser = this.createAnalyser();
      gain.connect(analyser);
      window.qaAudio.push({ gain, analyser });
      return gain;
    };
  });
  await desktop.goto(baseURL);
  await desktop.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await desktop.locator('[data-track="V1"] .timeline-clip').click();
  const props = desktop.locator('.editor-workspace .properties-panel');
  await props.getByRole('button', { name: 'Properties', exact: true }).click();
  await desktop.getByRole('button', { name: 'Play', exact: true }).click();
  const rms = () =>
    desktop.evaluate(async () => {
      let power = 0;
      const { gain, analyser } = window.qaAudio.at(-1);
      gain.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      for (let frame = 0; frame < 15; frame++) {
        await new Promise(requestAnimationFrame);
        analyser.getFloatTimeDomainData(data);
        power += data.reduce((total, value) => total + value ** 2, 0) / data.length;
      }
      return Math.sqrt(power / 15);
    });
  await expect.poll(() => desktop.evaluate(() => window.qaAudio.length)).toBeGreaterThan(0);
  const baseGain = await rms();
  await props.getByRole('slider', { name: 'Volume', exact: true }).fill('200');
  const boostedGain = await rms();
  expect(baseGain).toBeGreaterThan(0);
  expect(boostedGain / baseGain).toBeGreaterThan(1.7);
  expect(boostedGain / baseGain).toBeLessThan(2.3);
  await desktop.getByRole('button', { name: 'Pause', exact: true }).click();
  await desktop.getByRole('button', { name: 'Play', exact: true }).click();
  // Cleanup/reconnection must not leave a resumed clip silent.
  await expect.poll(rms).toBeGreaterThan(baseGain * 1.5);
  const report = {
    date: new Date().toISOString(),
    browser: browser.version(),
    mobileSimulation: {
      ...mobile,
      cpuThrottle: 4,
      proxyMs,
      source: '3840×2160 synthetic video',
      limitation:
        'Desktop Chromium emulation, not physical mobile hardware. JS heap excludes decoder/GPU/WASM/browser-process memory.',
    },
    previewAudio: {
      baseRms: baseGain,
      boostedRms: boostedGain,
      ratio: boostedGain / baseGain,
      resumeAudible: true,
    },
    errors,
  };
  await writeFile('docs/qa/device-preview.json', JSON.stringify(report, null, 2));
  console.log(report);
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
