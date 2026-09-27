import { test, expect } from '@playwright/test';
test('dismiss is undoable and manual timing edits invalidate prior AI suggestions', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.getByRole('button', { name: 'Auto Cut', exact: true }).click();
  await page.getByRole('button', { name: 'Find the good parts', exact: true }).click();
  const cards = page.locator('.suggestion-card');
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  await cards
    .first()
    .getByRole('button', { name: /^Dismiss suggestion:/ })
    .click();
  await expect(cards).toHaveCount(count - 1);
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('.suggestion-banner').click();
  await expect(cards).toHaveCount(count);
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page.locator('[data-track="V1"] .timeline-clip').click();
  const props = page.locator('.editor-workspace .properties-panel');
  await props.getByRole('button', { name: 'Properties', exact: true }).click();
  await props.getByLabel('Source out (s)', { exact: true }).fill('10');
  await expect(page.locator('.suggestion-banner')).toHaveCount(0);
});
test('canceling export preserves edits and the engine can export on retry', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel processing', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.locator('[data-track="V1"] .timeline-clip').click();
  const props = page.locator('.editor-workspace .properties-panel');
  await props.getByRole('button', { name: 'Properties', exact: true }).click();
  await props.getByLabel('Source out (s)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('combobox', { name: 'Resolution', exact: true }).selectOption('480x854');
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your story is ready.' })).toBeVisible({
    timeout: 90000,
  });
});
test('failed and canceled speech jobs retain existing caption corrections', async ({ page }) => {
  // Offline model failure must never replace text that is already in the project.
  await page.route('https://huggingface.co/**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
  await page.getByRole('button', { name: 'Retranscribe', exact: true }).click();
  await expect(page.locator('.job-error')).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Back to editor', exact: true }).click();
  await page
    .locator('.left-panel')
    .getByRole('button', { name: 'Transcript', exact: true })
    .click();
  await expect(page.locator('.left-panel .word').first()).toHaveText('The');
  const count = await page.locator('.left-panel .word').count();
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
  await page.getByRole('button', { name: 'Retranscribe', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
  await expect(page.locator('.left-panel .word')).toHaveCount(count);
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
});
test('spoken demo shows real speech, practice correction and separate Shorts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a spoken demo', exact: false }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(
    'Speech demo · practice edit',
  );
  const typo = page.locator('.left-panel .word').filter({ hasText: /^captains\./ });
  await typo.dblclick();
  await page.getByLabel('Edit subtitle word', { exact: true }).fill('captions.');
  await page.getByRole('button', { name: 'Save text', exact: true }).click();
  await expect(typo).toHaveCount(0);
  await page.getByRole('button', { name: 'Auto Cut', exact: true }).click();
  await page.getByRole('combobox', { name: 'Target length', exact: true }).selectOption('45');
  await page.getByRole('button', { name: 'Find the good parts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The good parts, found.' })).toBeVisible({
    timeout: 60000,
  });
  const candidates = page.getByRole('checkbox', { name: /^Create Short:/ });
  await expect(candidates).toHaveCount(3);
  await candidates.nth(0).check();
  await candidates.nth(1).check();
  await candidates.nth(2).check();
  await page.getByRole('button', { name: 'Create 3 Shorts', exact: true }).click();
  await expect(page.getByLabel('Current sequence', { exact: true }).locator('option')).toHaveCount(
    4,
  );
  await expect
    .poll(() =>
      page
        .locator('.video-canvas > video')
        .first()
        .evaluate((v) => (v as HTMLVideoElement).readyState),
    )
    .toBeGreaterThan(1);
  await page.locator('.left-panel .word').first().click();
  await page.screenshot({ path: 'test-results/spoken-demo.png', fullPage: true });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Current sequence', { exact: true })).toHaveCount(0);
});
