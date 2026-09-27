import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
test('publishing drafts persist, multiple Shorts export as independently decodable MP4s', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.getByRole('button', { name: 'Creator tools', exact: true }).click();
  await page.getByRole('tab', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'YouTube description', exact: true })).toHaveValue(
    /The secret to a better video/,
  );
  await page.getByLabel('YouTube title', { exact: true }).fill('My edited story');
  await page.getByRole('button', { name: 'Save publishing draft', exact: true }).click();
  const metadata = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download metadata', exact: true }).click();
  expect(await readFile((await (await metadata).path())!, 'utf8')).toContain('My edited story');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const saving = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const p = JSON.parse(await readFile((await (await saving).path())!, 'utf8'));
  expect(p.publishing.title).toBe('My edited story');
  const snapshot = (id: string, name: string, sourceStart: number) => ({
    id,
    name,
    clips: [{ ...p.clips[0], start: 0, sourceStart, sourceEnd: sourceStart + 1 }],
    tracks: p.tracks,
    settings: p.settings,
    captions: { ...p.captions, enabled: false },
    exportSettings: { ...p.exportSettings, width: 240, height: 426 },
    suggestions: [],
    publishing: p.publishing,
  });
  p.sequences = [
    snapshot('original', 'Original edit', 0),
    snapshot('a', 'Short one', 0),
    snapshot('b', 'Short two', 1),
  ];
  p.activeSequenceId = 'original';
  Object.assign(p, {
    clips: p.sequences[0].clips,
    captions: p.sequences[0].captions,
    exportSettings: p.sequences[0].exportSettings,
  });
  const fixture = test.info().outputPath('batch.frostcut');
  await writeFile(fixture, JSON.stringify(p));
  await page.getByLabel('Open project file').setInputFiles(fixture);
  await expect(page.getByLabel('Current sequence', { exact: true })).toHaveValue('original');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Batch export saved Shorts', exact: true }).click();
  await page.getByRole('button', { name: 'Export selected Shorts (.zip)', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel batch export', exact: true }).click();
  await expect(
    page.getByText('Batch cancelled. No partial ZIP was created.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Shorts ZIP', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Export selected Shorts (.zip)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download Shorts ZIP', exact: true })).toBeVisible({
    timeout: 90000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Shorts ZIP', exact: true }).click();
  const zip = test.info().outputPath('shorts.zip');
  await (await download).saveAs(zip);
  const check = spawnSync(
    'python',
    [
      '-X',
      'utf8',
      '-c',
      'import zipfile,sys,subprocess,tempfile,pathlib; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert len(z.namelist())==2; d=tempfile.TemporaryDirectory(); z.extractall(d.name); [subprocess.run(["ffmpeg","-v","error","-i",str(f),"-f","null","-"],check=True) for f in pathlib.Path(d.name).glob("*.mp4")]; print(z.namelist())',
      zip,
    ],
    { encoding: 'utf8' },
  );
  expect(check.status, check.stderr).toBe(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByLabel('Current sequence', { exact: true })).toHaveValue('original');
});
test('live stock search inserts licensed footage and live Discover generates a sourced idea', async ({
  page,
}) => {
  test.skip(process.env.FROSTCUT_NETWORK_QA !== '1', 'Opt-in live public source QA.');
  test.setTimeout(180000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.getByRole('button', { name: 'Creator tools', exact: true }).click();
  await page.getByRole('tab', { name: 'B-roll', exact: true }).click();
  await page.getByLabel('Stock video search').fill('PIO06 Ovcarsko');
  await page.getByRole('button', { name: 'Search free footage', exact: true }).click();
  await expect(page.locator('.stock-card').first()).toBeVisible({ timeout: 45000 });
  await expect(
    page.locator('.stock-card').first().getByRole('link', { name: 'CC BY-SA 4.0', exact: true }),
  ).toHaveAttribute('href', /creativecommons.org/);
  await page.getByLabel('B-roll end (s)').fill('2');
  await page.getByRole('button', { name: 'Insert B-roll', exact: true }).first().click();
  await expect(page.getByText(/Inserted silently on V2/)).toBeVisible({ timeout: 60000 });
  await page.getByRole('tab', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'YouTube description', exact: true })).toHaveValue(
    /CC BY-SA 4.0/,
  );
  await page.getByRole('tab', { name: 'Discover', exact: true }).click();
  await page.getByRole('button', { name: 'Load current topics', exact: true }).click();
  await expect(page.locator('.topic-list article').first()).toBeVisible({ timeout: 45000 });
  await page.getByRole('button', { name: 'Build video idea', exact: true }).first().click();
  const idea = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download video idea', exact: true }).click();
  expect(await readFile((await (await idea).path())!, 'utf8')).toContain(
    'Research source: https://',
  );
  await page.screenshot({ path: test.info().outputPath('discover-desktop.png') });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('[data-track="V2"] .timeline-clip')).toHaveCount(1);
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const path = (await (await saved).path())!,
    p = JSON.parse(await readFile(path, 'utf8'));
  expect(p.media.find((m: { attribution?: unknown }) => m.attribution).attribution.license).toBe(
    'CC BY-SA 4.0',
  );
  await page.getByLabel('Open project file').setInputFiles(path);
  await expect(page.locator('[data-track="V2"] .timeline-clip')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
test('creator tools fit mobile; offline sources show errors; cancelling translation keeps captions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.getByRole('button', { name: 'Creator tools', exact: true }).click();
  await page.getByRole('tab', { name: 'Subtitles', exact: true }).click();
  let releaseModelRequest!: () => void;
  const modelPending = new Promise<void>((resolve) => {
    releaseModelRequest = resolve;
  });
  await page.route('https://huggingface.co/**', async (route) => {
    await modelPending;
    await route.abort().catch(() => {});
  });
  await page.getByRole('button', { name: 'Translate captions', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel translation', exact: true }).click();
  releaseModelRequest();
  await expect(
    page.getByText('Cancelled. Your captions are unchanged.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'B-roll', exact: true }).click();
  await page.route('https://commons.wikimedia.org/**', (route) => route.abort());
  await page.getByLabel('Stock video search').fill('ocean');
  await page.getByRole('button', { name: 'Search free footage', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.stock-card')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Discover', exact: true }).click();
  await page.route('https://hacker-news.firebaseio.com/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Load current topics', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('creator-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
