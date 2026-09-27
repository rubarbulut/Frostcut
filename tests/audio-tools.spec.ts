import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

test('music imports under footage, detects beats, ducks real exported audio and saves effects', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.locator('[data-track="V1"] .timeline-clip').click();
  const props = page.locator('.editor-workspace .properties-panel');
  await props.getByRole('button', { name: 'Properties', exact: true }).click();
  await props.getByLabel('Source out (s)', { exact: true }).fill('6');
  // A deterministic 2 Hz percussion track plus a quiet steady tone.
  const track = test.info().outputPath('music.wav');
  const prepared = spawnSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'aevalsrc=0.2*sin(2*PI*440*t)+0.5*sin(2*PI*90*t)*exp(-80*mod(t+0.25\\,0.5)):s=16000:d=6',
    track,
  ]);
  expect(prepared.status, prepared.stderr.toString()).toBe(0);
  await page.getByLabel('Import video file').setInputFiles(track);
  await expect(page.locator('[data-track="A2"] .timeline-clip')).toHaveCount(1);
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.locator('[data-track="A2"] .timeline-clip').click();
  await props.getByRole('button', { name: 'Detect beats', exact: true }).click();
  await expect(page.locator('.beat-marker').first()).toBeVisible({ timeout: 60000 });
  await props.getByLabel('Lower music during speech', { exact: true }).check();
  await props.getByLabel('Enhance voice', { exact: true }).check();
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const project = JSON.parse(await readFile((await (await saved).path())!, 'utf8'));
  expect(project.clips.find((c: { trackId: string }) => c.trackId === 'A2')).toMatchObject({
    autoDuck: true,
    voiceEnhance: true,
  });
  expect(Object.values(project.beats)[0]).not.toHaveLength(0);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByText('Advanced settings', { exact: true }).click();
  await page.getByLabel('Export width', { exact: true }).fill('240');
  await page.getByLabel('Export height', { exact: true }).fill('426');
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your story is ready.' })).toBeVisible({
    timeout: 90000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MP4', exact: true }).click();
  const output = test.info().outputPath('music-ducked.mp4');
  await (await download).saveAs(output);
  const rms = (at: string) => {
    const samples = spawnSync('ffmpeg', [
      '-v',
      'error',
      '-ss',
      at,
      '-i',
      output,
      '-t',
      '0.15',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'f32le',
      '-',
    ]);
    expect(samples.status).toBe(0);
    let power = 0;
    for (let i = 0; i < samples.stdout.length; i += 4) power += samples.stdout.readFloatLE(i) ** 2;
    return Math.sqrt(power / (samples.stdout.length / 4));
  };
  expect(rms('4.7')).toBeGreaterThan(rms('2.7') * 2);
});

test('a saved animation restores motion and survives project reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.locator('[data-track="V1"] .timeline-clip').click();
  const props = page.locator('.editor-workspace .properties-panel');
  await props.getByRole('button', { name: 'Properties', exact: true }).click();
  await props
    .getByRole('combobox', { name: 'Motion preset', exact: true })
    .selectOption('Smooth Zoom');
  await props.getByText('Save & reuse animation', { exact: true }).click();
  await props.getByLabel('Animation preset name').fill('My zoom');
  await props.getByRole('button', { name: 'Save animation', exact: true }).click();
  await props.getByRole('combobox', { name: 'Motion preset', exact: true }).selectOption('None');
  await props.getByRole('button', { name: 'My zoom', exact: true }).click();
  await expect(props.getByRole('combobox', { name: 'Motion preset', exact: true })).toHaveValue(
    'Custom',
  );
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const path = (await (await saved).path())!;
  await page.getByLabel('Open project file').setInputFiles(path);
  await page.locator('[data-track="V1"] .timeline-clip').click();
  await props.getByText('Save & reuse animation', { exact: true }).click();
  await expect(props.getByRole('button', { name: 'My zoom', exact: true })).toBeVisible();
});
