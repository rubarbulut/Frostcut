import { test, expect } from '@playwright/test';
import path from 'node:path';
test('landing, demo editing, AI preview, undo, save, reopen, relink', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /10 minutes/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/landing.png', fullPage: true });
  await page.getByRole('button', { name: 'Try a sample project' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('A better story');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page
    .locator('.left-panel')
    .getByRole('button', { name: 'Transcript', exact: true })
    .click();
  await page
    .locator('.left-panel .word')
    .filter({ hasText: /^secret$/ })
    .click();
  await page.getByRole('button', { name: 'Split at playhead', exact: true }).click();
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.locator('.left-panel .word').first().dblclick();
  await page.getByLabel('Edit subtitle word').fill('Our');
  await page.getByRole('button', { name: 'Save text' }).click();
  await expect(page.locator('.left-panel .word').first()).toHaveText('Our');
  await page
    .locator('.editor-workspace')
    .getByRole('button', { name: /Your story.*Brainrot/ })
    .click();
  await expect(page.locator('.editor-workspace').getByLabel('Brainrot intensity')).toBeVisible();
  await page.getByRole('button', { name: 'Auto Cut', exact: true }).click();
  await page.getByRole('button', { name: 'Find the good parts' }).click();
  await expect(page.getByRole('heading', { name: 'The good parts, found.' })).toBeVisible();
  await page
    .locator('.suggestion-card')
    .filter({ hasText: 'SILENCE REMOVAL' })
    .getByRole('button', { name: 'Apply edit' })
    .click();
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/editor.png', fullPage: true });
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const download = await dl;
  await download.saveAs('test-results/saved.frostcut.json');
  await page.reload();
  await page.getByRole('button', { name: /Continue “A better story”/ }).click();
  await expect(page.getByRole('button', { name: 'Missing media · Relink' })).toBeVisible();
  await page
    .getByLabel('Open project file')
    .setInputFiles(path.resolve('test-results/saved.frostcut.json'));
  await page.getByRole('button', { name: 'Missing media · Relink' }).click({ noWaitAfter: true });
  await page.getByLabel('Import video file').setInputFiles(path.resolve('public/demo.mp4'));
  await expect(page.getByRole('button', { name: 'Missing media · Relink' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('real media import, MP4 export with audio and captions', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
  await page.getByLabel('Project name', { exact: true }).fill('Export QA');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByLabel('Import video file')
    .setInputFiles(path.resolve('tests/fixtures/short.mp4'));
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page
    .getByLabel('Import subtitle file')
    .setInputFiles({
      name: 'test.srt',
      mimeType: 'text/plain',
      buffer: Buffer.from('1\n00:00:00,000 --> 00:00:01,900\nA better story.\n'),
    });
  await page
    .getByRole('button', { name: /Export/ })
    .first()
    .click();
  await page.getByRole('combobox', { name: 'Resolution', exact: true }).selectOption('480x854');
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your story is ready.' })).toBeVisible({
    timeout: 150000,
  });
  const video = page.locator('.export-result');
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThan(0);
  expect(await video.evaluate((v) => (v as HTMLVideoElement).duration)).toBeCloseTo(2, 0);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MP4' }).click();
  await (await dl).saveAs('test-results/export.mp4');
});
test('mobile simplified workflow has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Try a sample project' }).click();
  await expect(page.getByRole('button', { name: 'Clips', exact: true })).toBeVisible();
  await expect(page.locator('.timeline-panel')).toBeHidden();
  await page.getByRole('button', { name: 'Style', exact: true }).click();
  await expect(
    page.locator('.mobile-flow').getByRole('slider', { name: /Words per caption/ }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
test('precise trim, pointer move, lock, delete, and redo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project' }).click();
  const clip = page.locator('[data-track="V1"] .timeline-clip');
  await clip.click();
  await page
    .locator('.editor-workspace')
    .getByRole('button', { name: 'Properties', exact: true })
    .click();
  const sourceIn = page.locator('.editor-workspace').getByLabel('Source in (s)', { exact: true }),
    start = page.locator('.editor-workspace').getByLabel('Timeline start', { exact: true });
  await sourceIn.fill('1');
  await expect(sourceIn).toHaveValue('1');
  await start.fill('2');
  const box = (await clip.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 92, box.y + 15, { steps: 5 });
  await page.mouse.up();
  await expect(start).toHaveValue('4');
  await page.getByRole('button', { name: 'Lock V1', exact: true }).click();
  await expect(sourceIn).toBeDisabled();
  await page.getByRole('button', { name: 'Delete selected clips', exact: true }).click();
  await expect(clip).toHaveCount(1);
  await page.getByRole('button', { name: 'Unlock V1', exact: true }).click();
  await page.getByRole('button', { name: 'Delete selected clips', exact: true }).click();
  await expect(clip).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(clip).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(clip).toHaveCount(0);
});
