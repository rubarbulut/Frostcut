import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('multiple Shorts keep the original and independent edits through save and reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project' }).click();
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.getByRole('button', { name: 'Auto Cut', exact: true }).click();
  await page.getByRole('combobox', { name: 'Target length', exact: true }).selectOption('14');
  await page.getByRole('button', { name: 'Find the good parts' }).click();
  await expect(page.getByRole('heading', { name: 'The good parts, found.' })).toBeVisible();
  const choices = page.getByRole('checkbox', { name: /^Create Short:/ });
  expect(await choices.count()).toBeGreaterThanOrEqual(2);
  await choices.nth(0).check();
  await choices.nth(1).check();
  await page.getByRole('button', { name: 'Create 2 Shorts', exact: true }).click();
  await expect(page.getByLabel('Current sequence', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Current sequence', { exact: true }).locator('option')).toHaveCount(3);
  const first = await page.getByLabel('Current sequence', { exact: true }).inputValue();
  await page.getByLabel('Rename sequence').fill('My first Short');
  await page
    .locator('.editor-workspace')
    .getByLabel('Words per caption', { exact: true })
    .fill('2');
  await page.getByLabel('Current sequence', { exact: true }).selectOption({ label: 'Original edit' });
  await expect(page.locator('.transport')).toContainText('00:24');
  await expect(
    page.locator('.editor-workspace').getByLabel('Words per caption', { exact: true }),
  ).toHaveValue('4');
  await page.getByLabel('Current sequence', { exact: true }).selectOption(first);
  await expect(
    page.locator('.editor-workspace').getByLabel('Words per caption', { exact: true }),
  ).toHaveValue('2');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const file = await download;
  await file.saveAs('test-results/p0-sequences.json');
  const saved = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(saved.sequences).toHaveLength(3);
  await page.reload();
  await page.getByLabel('Open project file').setInputFiles('test-results/p0-sequences.json');
  await expect(page.getByLabel('Rename sequence')).toHaveValue('My first Short');
  await expect(page.getByText('Missing media · Relink', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Missing media · Relink' }).click();
  await page.getByLabel('Import video file').setInputFiles('public/demo.mp4');
  await page.getByLabel('Current sequence', { exact: true }).selectOption({ label: 'Original edit' });
  await expect(page.locator('.transport')).toContainText('00:24');
  await page.getByLabel('Current sequence', { exact: true }).selectOption(first);
  await page.screenshot({ path: 'test-results/p0-sequences.png', fullPage: true });
});
test('high-resolution footage gets a real proxy and can switch to the original', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Import video file').setInputFiles('tests/fixtures/4k.mp4');
  await expect(page.locator('.preview-quality')).toContainText('Preview 960 × 540', {
    timeout: 120000,
  });
  await expect
    .poll(() =>
      page
        .locator('.video-canvas > video')
        .first()
        .evaluate((v) => (v as HTMLVideoElement).videoWidth),
    )
    .toBe(960);
  await page.getByLabel('Preview quality', { exact: true }).selectOption('Full');
  await expect
    .poll(() =>
      page
        .locator('.video-canvas > video')
        .first()
        .evaluate((v) => (v as HTMLVideoElement).videoWidth),
    )
    .toBe(3840);
  await page.getByLabel('Preview quality', { exact: true }).selectOption('Quarter');
  await expect(page.locator('.preview-quality')).toContainText('Preview 960 × 540');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.screenshot({ path: 'test-results/p0-proxy.png', fullPage: true });
  expect(errors).toEqual([]);
});
