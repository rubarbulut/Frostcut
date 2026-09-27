import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const browser = await chromium.launchPersistentContext('tests/.speech-browser', { channel: 'msedge', headless: true, viewport: { width: 1440, height: 1000 } });
const page = browser.pages()[0] ?? await browser.newPage();
page.setDefaultTimeout(300000);
try {
  await page.goto(process.env.FROSTCUT_QA_URL ?? 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Import video file').setInputFiles('public/spoken-demo.mp4');
  await page.locator('[data-track="V1"] .timeline-clip').waitFor();
  await page.getByRole('button', { name: 'Auto Cut', exact: true }).click();
  await page.getByRole('combobox', { name: 'Spoken language', exact: true }).selectOption('English');
  const started = Date.now();
  await page.getByRole('button', { name: 'Find the good parts', exact: true }).click();
  let earlyPreview = false;
  for (let seconds = 0; seconds < 480; seconds += 5) {
    await page.waitForTimeout(5000);
    if (await page.locator('.job-error').count()) throw new Error(await page.locator('.job-error').innerText());
    if (await page.getByRole('heading', { name: 'The good parts, found.' }).count()) break;
    const first = page.getByText('Preview the first clip while processing continues', { exact: true });
    if (!earlyPreview && await first.isVisible()) {
      await first.click();
      await page.getByRole('button', { name: 'Play edited preview', exact: true }).click();
      earlyPreview = true;
    }
    if (seconds % 30 === 0) console.log(await page.locator('.processing > p').first().textContent().catch(() => 'Finishing'));
  }
  await page.getByRole('heading', { name: 'The good parts, found.' }).waitFor();
  const candidates = await page.getByRole('checkbox', { name: /^Create Short:/ }).count();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page.getByText('Saved locally', { exact: true }).waitFor();
  const p = await page.evaluate(() => new Promise((resolve, reject) => { const open = indexedDB.open('keyval-store'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, read = db.transaction('keyval').objectStore('keyval').get('frostcut-project-v1'); read.onsuccess = () => { resolve(read.result); db.close(); }; read.onerror = () => { reject(read.error); db.close(); }; }; })), transcript = p.transcripts[0];
  const report = { date: new Date().toISOString(), source: '148s locally synthesized original speech with pauses and repeated take; no imported transcript', duration: p.media[0].duration, model: transcript.model, elapsedSeconds: +((Date.now() - started) / 1000).toFixed(1), earlyPreview, candidates, words: transcript.words.length, firstWord: transcript.words[0], lastWord: transcript.words.at(-1), boundaryWords: transcript.words.filter(w => w.start >= 85 && w.start <= 95) };
  await mkdir('docs/qa', { recursive: true });
  await writeFile('docs/qa/long-speech.json', JSON.stringify(report, null, 2));
  console.log(report);
  if (!earlyPreview || candidates < 2 || transcript.words.length < 200 || transcript.words.at(-1).end < 140) throw new Error('Long speech requirements not met');
} finally { await browser.close(); }
