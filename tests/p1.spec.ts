import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const srt = `1
00:00:00,200 --> 00:00:00,600
Um,

2
00:00:01,000 --> 00:00:03,000
A better video needs a better story.

3
00:00:04,000 --> 00:00:06,000
A better video needs a better story.

4
00:00:07,000 --> 00:00:08,000
Türkçe ışık güzel.
`;
test('review fillers and repeated takes, listen, apply and undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project' }).click();
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page
    .getByLabel('Import subtitle file')
    .setInputFiles({ name: 'speech.srt', mimeType: 'text/plain', buffer: Buffer.from(srt) });
  const panel = page.locator('.left-panel');
  await panel.getByRole('button', { name: 'Clean up speech' }).click();
  await expect(page.locator('.cleanup-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Apply selected cuts' })).toBeDisabled();
  await page.getByRole('button', { name: 'Listen in context' }).click();
  await expect(page.getByLabel('Speech suggestion preview')).toBeVisible();
  await page.getByRole('button', { name: 'Listen to later take' }).click();
  await expect(page.locator('.cleanup-preview')).toContainText('Later take · comparison');
  await page.getByRole('checkbox', { name: 'Remove filler: Um,' }).check();
  await page
    .getByRole('checkbox', { name: 'Remove repeat: A better video needs a better story.' })
    .check();
  await page.screenshot({ path: 'test-results/p1-cleanup.png', fullPage: true });
  await page.getByRole('button', { name: 'Apply selected cuts' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(panel.locator('.word').filter({ hasText: /^Um,$/ })).toHaveCount(0);
  await expect(panel.locator('.word').filter({ hasText: /^story\.$/ })).toHaveCount(1);
  const dl = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export SRT' }).click();
  const text = await readFile((await (await dl).path())!, 'utf8');
  expect(text).toContain('00:00:01,600');
  expect(text).toContain('Türkçe ışık güzel.');
  expect(text).not.toContain('Um,');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(panel.locator('.word').filter({ hasText: /^Um,$/ })).toHaveCount(1);
  await expect(panel.locator('.word').filter({ hasText: /^story\.$/ })).toHaveCount(2);
  expect(errors).toEqual([]);
});
test('custom caption style survives save/open and renders into a real MP4', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Import video file').setInputFiles('tests/fixtures/short.mp4');
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add timeline caption', exact: true }).click();
  await page.getByLabel('Caption text', { exact: true }).fill('Türkçe ışık.');
  await page.getByLabel('Caption start', { exact: true }).fill('0.3');
  await page.getByLabel('Caption end', { exact: true }).fill('1.5');
  await page.getByRole('dialog').getByRole('button', { name: 'Add caption', exact: true }).click();
  const props = page.locator('.editor-workspace .properties-panel');
  await props.getByText('Customize & save style', { exact: true }).click();
  await props.getByLabel('Caption size', { exact: true }).fill('8');
  await props.getByLabel('Text color', { exact: true }).fill('#ffcc55');
  await props.getByLabel('Outline width', { exact: true }).fill('4');
  await props.getByLabel('Vertical margin', { exact: true }).fill('25');
  await props.getByLabel('New caption style name').fill('Golden');
  await props.getByRole('button', { name: 'Save style', exact: true }).click();
  await expect(page.locator('.caption-overlay')).toHaveCSS('color', 'rgb(255, 204, 85)');
  await props.getByRole('button', { name: /Your story.*Clean/ }).click();
  await expect(props.getByLabel('Caption size', { exact: true })).toHaveValue('5.2');
  await props.getByRole('button', { name: 'Golden', exact: true }).click();
  await expect(props.getByLabel('Caption size', { exact: true })).toHaveValue('8');
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await (await saved).saveAs('test-results/p1-style-project.json');
  await page.getByLabel('Open project file').setInputFiles('test-results/p1-style-project.json');
  await expect(props.getByRole('button', { name: 'Golden', exact: true })).toBeVisible();
  await expect(props.getByLabel('Text color', { exact: true })).toHaveValue('#ffcc55');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('combobox', { name: 'Resolution', exact: true }).selectOption('480x854');
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your story is ready.' })).toBeVisible({
    timeout: 60000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MP4', exact: true }).click();
  await (await download).saveAs('test-results/p1-custom-caption.mp4');
});
test('mobile speech review and caption customization fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project' }).click();
  await page
    .locator('.mobile-flow')
    .getByRole('button', { name: 'Transcript', exact: true })
    .click();
  await page.locator('.mobile-flow').getByRole('button', { name: 'Clean up speech' }).click();
  await expect(page.locator('.cleanup-card')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/p1-mobile-cleanup.png', fullPage: true });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Style', exact: true }).click();
  await page.locator('.mobile-flow').getByText('Customize & save style', { exact: true }).click();
  await expect(
    page.locator('.mobile-flow').getByLabel('Caption size', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
