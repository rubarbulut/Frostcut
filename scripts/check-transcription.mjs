import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('Page error:', e.message));
page.on('requestfailed', (r) => {
  if (!r.url().startsWith('blob:')) console.log('Request failed:', r.url(), r.failure());
});
await page.goto('http://127.0.0.1:5173');
await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
await page.getByRole('button', { name: 'Create project' }).click();
await page.getByLabel('Import video file').setInputFiles('tests/fixtures/speech.mp4');
await page.locator('[data-track="V1"] .timeline-clip').waitFor();
await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
await page.getByRole('button', { name: 'Start transcription', exact: true }).click();
let done = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const error = (await page.locator('.job-error').count())
    ? await page.locator('.job-error').textContent()
    : null;
  if (error) {
    console.log('TRANSCRIPTION ERROR', error);
    break;
  }
  if (await page.locator('.left-panel .word').count()) {
    console.log('TRANSCRIPT:', await page.locator('.left-panel .transcript-content').innerText());
    done = true;
    break;
  }
  console.log(
    'Progress:',
    await page
      .locator('.processing>p')
      .textContent()
      .catch(() => null),
  );
}
await page.screenshot({ path: 'test-results/transcription.png' });
await browser.close();
if (!done) process.exitCode = 1;
