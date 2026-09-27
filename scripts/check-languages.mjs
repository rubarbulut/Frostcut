import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const fixtures = JSON.parse(await readFile('tests/fixtures/languages/manifest.json', 'utf8'));
const reports = 'docs/qa';
await mkdir(reports, { recursive: true });
const context = await chromium.launchPersistentContext('tests/.speech-browser', { channel: 'msedge', headless: true, viewport: { width: 1440, height: 1000 } });
const page = context.pages()[0] ?? await context.newPage();
if (process.env.FROSTCUT_QA_GPU_FAILURE) await context.route('**/*transcription.worker*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: `Object.defineProperty(navigator, 'gpu', { value: { requestAdapter: async () => { throw new Error('QA adapter failure'); } } });\n${await response.text()}` });
});
page.setDefaultTimeout(30000);
const errors = [], results = [];
page.on('pageerror', e => errors.push(e.message));
function tokens(text, language) { return text.toLocaleLowerCase(language === 'Turkish' ? 'tr' : 'en').normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean); }
function wer(reference, actual, language) {
  const a = tokens(reference, language), b = tokens(actual, language), rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  rows[0] = b.map((_, i) => i).concat(b.length);
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) rows[i][j] = Math.min(rows[i-1][j] + 1, rows[i][j-1] + 1, rows[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return +(rows[a.length][b.length] / Math.max(1, a.length)).toFixed(3);
}
const turkish = fixtures.find(f => f.language === 'Turkish');
const cases = [...fixtures.map(f => ({ ...f, device: 'auto', quality: 'balanced' })),
  { ...turkish, file: 'tests/fixtures/languages/tr_tr-noisy.mp4', device: 'auto', quality: 'balanced', variant: 'pink-noise' },
  { ...fixtures[0], device: 'cpu', quality: 'balanced', variant: 'CPU compatibility' }].filter(item => !process.env.FROSTCUT_QA_LANGUAGES || process.env.FROSTCUT_QA_LANGUAGES.split(',').includes(item.language));
try {
  for (const item of cases) {
    console.log(`START ${item.language} ${item.variant ?? ''} ${item.device}`);
    await page.goto(process.env.FROSTCUT_QA_URL ?? 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByLabel('Import video file').setInputFiles(item.file);
    await page.locator('[data-track="V1"] .timeline-clip').waitFor();
    await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
    await page.getByRole('combobox', { name: 'Spoken language', exact: true }).selectOption(item.language);
    const quality = process.env.FROSTCUT_QA_QUALITY ?? item.quality;
    await page.getByRole('group', { name: 'Transcription quality' }).getByRole('button', { name: quality === 'detailed' ? /Detailed/ : /Balanced/ }).click();
    await page.getByRole('combobox', { name: 'Speech processing', exact: true }).selectOption(item.device);
    const started = Date.now();
    await page.getByRole('button', { name: 'Start transcription', exact: true }).click();
    for (let second = 0; second < 360; second += 5) {
      await page.waitForTimeout(5000);
      if (await page.locator('.job-error').count()) throw new Error(await page.locator('.job-error').innerText());
      if (await page.locator('.left-panel .word').count()) break;
      if (second % 30 === 0) console.log((await page.locator('.processing > p').first().textContent().catch(() => 'Waiting')).slice(0, 180));
    }
    if (!await page.locator('.left-panel .word').count()) throw new Error(`${item.language}: recognition timeout`);
    await page.getByText('Saved locally', { exact: true }).waitFor();
    const project = await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('keyval-store');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result, read = db.transaction('keyval').objectStore('keyval').get('frostcut-project-v1'); read.onsuccess = () => { resolve(read.result); db.close(); }; read.onerror = () => { reject(read.error); db.close(); }; };
    }));
    const transcript = project.transcripts[0], words = transcript.words, actual = words.map(w => w.text).join(' ');
    const invalidTiming = words.some((w, i) => w.start < 0 || w.end < w.start || w.end > project.media[0].duration + 0.1 || (i > 0 && w.start < words[i - 1].start));
    const result = { language: item.language, variant: item.variant ?? 'clean', requestedDevice: item.device, model: transcript.model, duration: item.duration, elapsedSeconds: +((Date.now() - started) / 1000).toFixed(2), reference: item.reference, actual, wordErrorRate: wer(item.reference, actual, item.language), wordCount: words.length, invalidTiming, source: item.source, license: item.license };
    results.push(result);
    console.log(JSON.stringify(result));
    await writeFile(`${reports}/transcription${process.env.FROSTCUT_QA_GPU_FAILURE ? '-gpu-fallback' : process.env.FROSTCUT_QA_QUALITY ? '-' + process.env.FROSTCUT_QA_QUALITY : ''}.json`, JSON.stringify({ date: new Date().toISOString(), browser: context.browser()?.version(), description: 'One fixed sample per language. Small smoke test, not a population accuracy estimate. WER ignores case and punctuation.', simulatedAdapterFailure: !!process.env.FROSTCUT_QA_GPU_FAILURE, errors, results }, null, 2));
    if (invalidTiming) throw new Error('Invalid word timestamps');
  }
} finally { await context.close(); }
if (errors.length) process.exitCode = 1;
