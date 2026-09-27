import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
test('real face detection creates reviewed editable framing, persists and exports', async ({
  page,
}) => {
  test.skip(
    !existsSync('tests/fixtures/p1-local/moving-face.mp4'),
    'See docs/P1-closure.md for the real-face QA fixture.',
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.locator('[data-track="V1"] .timeline-clip').click();
  await page.keyboard.press('Delete');
  await page
    .getByLabel('Import video file')
    .setInputFiles('tests/fixtures/p1-local/moving-face.mp4');
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.getByRole('button', { name: 'Creator tools', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze face framing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply framing', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const detected = await page.getByText(/sampled frames contain a face/).innerText();
  expect(Number(detected.split('/')[0])).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Apply framing', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const saving = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const p = JSON.parse(await readFile((await (await saving).path())!, 'utf8'));
  const clip = p.clips[0];
  expect(clip.properties.scale).toBeGreaterThan(3);
  expect(clip.keyframes.x[0].value - clip.keyframes.x.at(-1).value).toBeGreaterThan(500);
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
  const file = test.info().outputPath('reframed.mp4');
  await (await download).saveAs(file);
  expect(spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']).status).toBe(0);
  await page.screenshot({ path: test.info().outputPath('reframe-export.png') });
});
test('real local translation produces Turkish subtitles, review and multilingual ZIP', async ({
  page,
}) => {
  test.skip(process.env.FROSTCUT_MODEL_QA !== '1', 'Opt-in ~640 MB model download.');
  test.setTimeout(900000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.locator('[data-track="V1"] .timeline-clip').click();
  const props = page.locator('.editor-workspace .properties-panel');
  await props.getByRole('button', { name: 'Properties', exact: true }).click();
  await props.getByLabel('Source out (s)', { exact: true }).fill('4.3');
  await page.getByRole('button', { name: 'Creator tools', exact: true }).click();
  await page.getByRole('tab', { name: 'Subtitles', exact: true }).click();
  await page.getByRole('button', { name: 'Translate captions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save translation', exact: true })).toBeVisible({
    timeout: 840000,
  });
  const translation = await page.locator('.translation-cues textarea').first().inputValue();
  expect(translation.length).toBeGreaterThan(10);
  expect(translation.toLowerCase()).toMatch(/video|hik[aâ]ye|öykü/);
  await page.getByRole('button', { name: 'Save translation', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download all current SRT languages (.zip)', exact: true })
    .click();
  const file = test.info().outputPath('languages.zip');
  await (await downloading).saveAs(file);
  const check = spawnSync(
    'python',
    [
      '-X',
      'utf8',
      '-c',
      'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert set(z.namelist())=={"original.srt","tr.srt"}; print(z.read("tr.srt").decode("utf-8"))',
      file,
    ],
    { encoding: 'utf8' },
  );
  expect(check.status, check.stderr).toBe(0);
  expect(check.stdout).toContain(translation);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const savedPath = (await (await saved).path())!;
  const project = JSON.parse(await readFile(savedPath, 'utf8'));
  expect(project.subtitleVariants[0].cues[0].text).toBe(translation);
  expect(project.captions.language).toBe('tr');
  await page.getByLabel('Open project file').setInputFiles(savedPath);
  await props.getByRole('button', { name: 'Captions', exact: true }).click();
  await expect(props.getByRole('combobox', { name: 'Caption language', exact: true })).toHaveValue(
    'tr',
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByText('Advanced settings', { exact: true }).click();
  await page.getByLabel('Export width', { exact: true }).fill('240');
  await page.getByLabel('Export height', { exact: true }).fill('426');
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your story is ready.' })).toBeVisible({
    timeout: 90000,
  });
  const videoDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MP4', exact: true }).click();
  const videoPath = test.info().outputPath('turkish.mp4');
  await (await videoDownload).saveAs(videoPath);
  const frame = test.info().outputPath('turkish-caption.png');
  expect(
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', videoPath, '-frames:v', '1', frame])
      .status,
  ).toBe(0);
});
