import { test, expect, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
async function shortProject(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Import video file').setInputFiles('tests/fixtures/short.mp4');
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
}
async function exportSmall(page: Page, name: string) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByText('Advanced settings', { exact: true }).click();
  await page.getByLabel('Export width', { exact: true }).fill('240');
  await page.getByLabel('Export height', { exact: true }).fill('426');
  await page.getByRole('combobox', { name: 'Frame rate', exact: true }).selectOption('24');
  await page.getByLabel('Video bitrate (Mbps)', { exact: true }).fill('1.2');
  await page.getByRole('combobox', { name: 'Audio bitrate', exact: true }).selectOption('96');
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your story is ready.' })).toBeVisible({
    timeout: 120000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MP4', exact: true }).click();
  const path = `test-results/${name}.mp4`;
  await (await download).saveAs(path);
  return path;
}
test('custom caption position and emoji are saved and burned into MP4', async ({ page }) => {
  await shortProject(page);
  await page
    .getByLabel('Import subtitle file')
    .setInputFiles({
      name: 'caption.srt',
      mimeType: 'text/plain',
      buffer: Buffer.from('1\n00:00:00,000 --> 00:00:02,000\nThe secret.\n'),
    });
  const props = page.locator('.editor-workspace .properties-panel');
  await props.getByRole('combobox', { name: 'Position', exact: true }).selectOption('custom');
  await props.getByLabel('Caption Y (%)').fill('25');
  await props.getByRole('combobox', { name: 'Emoji frequency', exact: true }).selectOption('High');
  await expect(page.locator('.caption-emoji')).toHaveText('💡');
  await props.getByText('Customize & save style', { exact: true }).click();
  await props.getByLabel('Text color', { exact: true }).fill('#ffff00');
  const output = await exportSmall(page, 'custom-caption');
  const frame = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-ss',
      '0.1',
      '-i',
      output,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { maxBuffer: 2e6 },
  );
  expect(frame.status).toBe(0);
  const yellow = (from: number, to: number) => {
    let pixels = 0;
    for (let i = from * 240 * 3; i < to * 240 * 3; i += 3)
      if (frame.stdout[i] > 170 && frame.stdout[i + 1] > 150 && frame.stdout[i + 2] < 100) pixels++;
    return pixels;
  };
  expect(yellow(70, 150)).toBeGreaterThan(40);
  expect(yellow(70, 150)).toBeGreaterThan(yellow(280, 400));
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await (await saved).saveAs('test-results/custom-caption.json');
  await page.getByLabel('Open project file').setInputFiles('test-results/custom-caption.json');
  await expect(props.getByLabel('Caption Y (%)')).toHaveValue('25');
  await expect(props.getByRole('combobox', { name: 'Emoji frequency', exact: true })).toHaveValue(
    'High',
  );
});
test('detached source audio moves and exports independently without doubled audio', async ({
  page,
}) => {
  await shortProject(page);
  await page.locator('[data-track="V1"] .timeline-clip').click();
  const props = page.locator('.editor-workspace .properties-panel');
  await props.getByRole('button', { name: 'Properties', exact: true }).click();
  await props.getByRole('button', { name: 'Detach audio for independent editing' }).click();
  await expect(page.locator('[data-track="A1"] .timeline-clip')).toHaveCount(1);
  await page.locator('[data-track="A1"] .timeline-clip').click();
  await props.getByRole('combobox', { name: 'Audio track', exact: true }).selectOption('A2');
  await props.getByLabel('Source out (s)', { exact: true }).fill('1');
  await props.getByLabel('Timeline start', { exact: true }).fill('0.5');
  await expect(page.locator('[data-track="A2"] .timeline-clip')).toHaveCount(1);
  await expect(page.locator('[data-track="A1"] .timeline-clip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mute A1', exact: true }).click();
  const metadata = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await (await metadata).saveAs('test-results/detached-project.json');
  const output = await exportSmall(page, 'detached-audio');
  const energy = (time: string) => {
    const wav = spawnSync('ffmpeg', [
      '-v',
      'error',
      '-ss',
      time,
      '-i',
      output,
      '-t',
      '0.2',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'f32le',
      '-',
    ]);
    expect(wav.status).toBe(0);
    let power = 0;
    for (let i = 0; i < wav.stdout.length; i += 4) power += wav.stdout.readFloatLE(i) ** 2;
    return power / (wav.stdout.length / 4);
  };
  expect(energy('0.7')).toBeGreaterThan(Math.max(1e-9, energy('0.1') * 10));
});
test('guided preview plays the proposed edit without applying it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.getByRole('button', { name: 'Auto Cut', exact: true }).click();
  await page.getByRole('button', { name: 'Find the good parts', exact: true }).click();
  const card = page.locator('.suggestion-card').filter({ hasText: 'SILENCE REMOVAL' });
  await card.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = card.getByRole('region', { name: 'Edited preview', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('5 clips');
  await preview.getByRole('button', { name: 'Play edited preview', exact: true }).click();
  await expect.poll(() => preview.getByLabel('Edited preview playhead').inputValue()).not.toBe('0');
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
});
