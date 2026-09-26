import { test, expect } from '@playwright/test';
test('manual captions without a transcript render into MP4', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Import video file').setInputFiles('tests/fixtures/short.mp4');
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add timeline caption', exact: true }).click();
  await page.getByLabel('Caption text', { exact: true }).fill('My own caption.');
  await page.getByLabel('Caption start', { exact: true }).fill('0.4');
  await page.getByLabel('Caption end', { exact: true }).fill('1.3');
  await page.getByRole('dialog').getByRole('button', { name: 'Add caption', exact: true }).click();
  await expect(page.locator('.caption-overlay')).toContainText('My own caption.');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('combobox', { name: 'Resolution', exact: true }).selectOption('480x854');
  const font = page.waitForResponse((r) => r.url().endsWith('/fonts/NotoSans.ttf'));
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await font;
  await expect(page.getByRole('heading', { name: 'Your story is ready.' })).toBeVisible({
    timeout: 60000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MP4', exact: true }).click();
  await (await download).saveAs('test-results/manual-caption.mp4');
});
test('caption text, exact times, adding, drag, resize, undo and persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project' }).click();
  await page
    .locator('.left-panel')
    .getByRole('button', { name: 'Transcript', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit caption 1 timing', exact: true }).click();
  await page.getByLabel('Caption start', { exact: true }).fill('0.5');
  await page.getByLabel('Caption end', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Save caption', exact: true }).click();
  await expect(
    page.locator('.left-panel').getByRole('button', { name: 'Edit caption 1 timing', exact: true }),
  ).toContainText('00:00.50 → 00:04.00');
  await page
    .locator('.left-panel')
    .getByRole('button', { name: 'Add caption', exact: true })
    .click();
  await page.getByLabel('Caption text', { exact: true }).fill('Keep this moment.');
  await page.getByLabel('Caption start', { exact: true }).fill('4.3');
  await page.getByLabel('Caption end', { exact: true }).fill('4.8');
  await page.getByRole('dialog').getByRole('button', { name: 'Add caption', exact: true }).click();
  const block = page.locator('.caption-block').filter({ hasText: 'Keep this moment.' });
  await expect(block).toHaveCount(1);
  await page.getByLabel('Timeline zoom', { exact: true }).fill('70');
  await page.getByRole('button', { name: 'Toggle snapping' }).click();
  let box = (await block.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 14);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 21, box.y + 14, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Number.parseFloat(await block.evaluate((el) => (el as HTMLElement).style.left)),
    )
    .toBeCloseTo(4.6 * 70, 0);
  box = (await block.boundingBox())!;
  await page.mouse.move(box.x + box.width - 2, box.y + 14);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 12, box.y + 14, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Number.parseFloat(await block.evaluate((el) => (el as HTMLElement).style.width)),
    )
    .toBeCloseTo(0.7 * 70, 0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(async () =>
      Number.parseFloat(await block.evaluate((el) => (el as HTMLElement).style.width)),
    )
    .toBeCloseTo(0.5 * 70, 0);
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/caption-editing.png', fullPage: true });
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const dl = await saved;
  await dl.saveAs('test-results/caption-project.json');
  await page.getByLabel('Open project file').setInputFiles('test-results/caption-project.json');
  await expect(block).toHaveCount(1);
  await block.click();
  await expect(page.getByLabel('Caption start', { exact: true })).toHaveValue('4.600');
  await page.getByRole('button', { name: 'Remove caption only', exact: true }).click();
  await expect(block).toHaveCount(0);
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('timing validation keeps existing captions intact', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project' }).click();
  await page
    .locator('.left-panel')
    .getByRole('button', { name: 'Transcript', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit caption 1 timing', exact: true }).click();
  await page.getByLabel('Caption end', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Save caption', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('overlaps');
  await page.getByLabel('Caption end', { exact: true }).fill('0.1');
  await page.getByRole('button', { name: 'Save caption', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('end time');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('.caption-block')).toHaveCount(8);
});
test('transcription offers model and language selection and warns on replacement', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project' }).click();
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
  await expect(page.getByRole('button', { name: /Balanced.*Whisper Base/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('combobox', { name: 'Spoken language', exact: true })
    .selectOption('Turkish');
  await page.getByRole('button', { name: /Detailed.*Whisper Small/ }).click();
  await expect(page.getByRole('button', { name: /Detailed.*Whisper Small/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText(/This replaces the existing transcript/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retranscribe', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
});
