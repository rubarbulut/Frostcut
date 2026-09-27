import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const directory = 'test-results/p2-fixtures';
test.beforeAll(async () => {
  await mkdir(directory, { recursive: true });
  for (const [name, color, filter] of [
    ['green', '0x00ff00', 'drawbox=x=100:y=40:w=120:h=100:color=red:t=fill'],
    ['blue', 'blue', 'null'],
  ]) {
    const result = spawnSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${color}:s=320x180:r=24:d=1`,
        '-vf',
        filter,
        '-c:v',
        'libx264',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        `${directory}/${name}.mp4`,
      ],
      { encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
  }
});
async function savedProject(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}
async function setup(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByLabel('Import video file').setInputFiles(`${directory}/green.mp4`);
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  await page.getByLabel('Import video file').setInputFiles(`${directory}/blue.mp4`);
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(2);
  const p = await savedProject(page);
  p.settings = { ...p.settings, preset: 'Custom', width: 320, height: 180, fps: 24 };
  p.exportSettings = { ...p.exportSettings, width: 320, height: 180, fps: 24 };
  p.captions.enabled = false;
  p.clips[0].trackId = 'V2';
  p.clips[0].start = 0;
  p.clips[1].trackId = 'V1';
  p.clips[1].start = 0;
  const path = test.info().outputPath('effects.frostcut.json');
  await writeFile(path, JSON.stringify(p));
  await page.getByLabel('Open project file').setInputFiles(path);
  await page.locator('[data-track="V2"] .timeline-clip').click();
  await page
    .locator('.properties-panel')
    .getByRole('button', { name: 'Properties', exact: true })
    .click();
}
async function pixel(page: Page, x: number, y: number) {
  return page.locator('canvas.effect-preview').evaluate(
    (element, point) => {
      const source = element as HTMLCanvasElement;
      const c = document.createElement('canvas');
      c.width = source.width;
      c.height = source.height;
      const context = c.getContext('2d')!;
      context.drawImage(source, 0, 0);
      return [...context.getImageData(point.x, point.y, 1, 1).data];
    },
    { x, y },
  );
}
async function exportedPixels(page: Page, name: string) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  const outcome = await Promise.race([
    page
      .getByRole('heading', { name: 'Your story is ready.' })
      .waitFor({ timeout: 40000 })
      .then(() => 'ready'),
    page
      .getByText('Your project is safe. You can adjust the settings and retry.', { exact: true })
      .waitFor({ timeout: 40000 })
      .then(() => page.getByRole('dialog').innerText()),
  ]);
  expect(outcome).toBe('ready');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MP4', exact: true }).click();
  const output = test.info().outputPath(`${name}.mp4`);
  await (await download).saveAs(output);
  const decoded = spawnSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    output,
    '-frames:v',
    '1',
    '-vf',
    'scale=320:180',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);
  expect(decoded.status, decoded.stderr.toString()).toBe(0);
  return (x: number, y: number) => [
    ...decoded.stdout.subarray((y * 320 + x) * 3, (y * 320 + x) * 3 + 3),
  ];
}
test('chroma key and feathered masks affect actual decoded frames and the exported MP4', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  await page.getByLabel('Chroma key', { exact: true }).check();
  await expect(page.locator('canvas.effect-preview')).toBeVisible();
  await expect.poll(async () => (await pixel(page, 20, 20))[3]).toBe(0);
  await expect.poll(async () => (await pixel(page, 160, 90))[0]).toBeGreaterThan(230);
  await expect(page.locator('.effect-preview-error')).toHaveCount(0);
  await page.getByLabel('Clip mask', { exact: true }).check();
  await page.getByLabel('Mask width (%)', { exact: true }).fill('30');
  await page.getByLabel('Mask width (%)', { exact: true }).press('Enter');
  await page.getByLabel('Mask feather (%)', { exact: true }).fill('4');
  await expect.poll(async () => (await pixel(page, 100, 90))[3]).toBe(0);
  await expect.poll(async () => (await pixel(page, 112, 90))[3]).toBeGreaterThan(70);
  expect((await pixel(page, 112, 90))[3]).toBeLessThan(220);
  await page.getByLabel('Invert mask', { exact: true }).check();
  await expect.poll(async () => (await pixel(page, 160, 90))[3]).toBe(0);
  await page.getByLabel('Invert mask', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await pixel(page, 160, 90))[3]).toBe(255);
  await page.screenshot({
    path: test.info().outputPath('chroma-mask-preview.png'),
    fullPage: true,
  });
  const sample = await exportedPixels(page, 'chroma-mask');
  expect(sample(20, 20)[2]).toBeGreaterThan(220);
  expect(sample(160, 90)[0]).toBeGreaterThan(220);
  expect(sample(100, 90)[2]).toBeGreaterThan(220);
  expect(errors).toEqual([]);
});
test('polygon vertices, feather/invert, undo and project save/open retain independent clip settings', async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel('Clip mask', { exact: true }).check();
  await page.getByRole('combobox', { name: 'Mask shape', exact: true }).selectOption('rectangle');
  await page.getByLabel('Mask width (%)', { exact: true }).fill('30');
  await page.getByLabel('Mask width (%)', { exact: true }).press('Enter');
  await expect.poll(async () => (await pixel(page, 110, 90))[3]).toBe(0);
  await page.getByLabel('Mask rotation (°)', { exact: true }).fill('90');
  await page.getByLabel('Mask rotation (°)', { exact: true }).press('Enter');
  await expect.poll(async () => (await pixel(page, 110, 90))[3]).toBe(255);
  await page.getByRole('combobox', { name: 'Mask shape', exact: true }).selectOption('polygon');
  await expect.poll(async () => (await pixel(page, 20, 20))[3]).toBe(0);
  await expect.poll(async () => (await pixel(page, 160, 90))[3]).toBe(255);
  await page.getByRole('button', { name: 'Mask vertex 1', exact: true }).focus();
  await page.getByRole('button', { name: 'Mask vertex 1', exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Vertex X (%)')).toHaveValue('21');
  const vertex = (await page
    .getByRole('button', { name: 'Mask vertex 1', exact: true })
    .boundingBox())!;
  const polygon = (await page
    .getByRole('group', { name: 'Polygon mask vertices', exact: true })
    .boundingBox())!;
  await page.mouse.move(vertex.x + vertex.width / 2, vertex.y + vertex.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    vertex.x + vertex.width / 2 + polygon.width * 0.1,
    vertex.y + vertex.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(page.getByLabel('Vertex X (%)')).toHaveValue('31');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('[data-track="V2"] .timeline-clip').click();
  await expect(page.getByLabel('Vertex X (%)')).toHaveValue('21');
  await page.getByRole('button', { name: 'Add vertex', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Mask vertex / })).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('[data-track="V2"] .timeline-clip').click();
  await expect(page.getByRole('button', { name: /^Mask vertex / })).toHaveCount(4);
  await page.getByLabel('Mask feather (%)', { exact: true }).fill('3');
  await page.getByLabel('Invert mask', { exact: true }).check();
  const project = await savedProject(page);
  expect(project.clips[0].effects.mask).toMatchObject({
    shape: 'polygon',
    feather: 3,
    invert: true,
    points: [
      { x: 21, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 80 },
      { x: 20, y: 80 },
    ],
  });
  expect(project.clips[1].effects).toBeUndefined();
  const file = test.info().outputPath('roundtrip.frostcut.json');
  await writeFile(file, JSON.stringify(project));
  await page.getByLabel('Open project file').setInputFiles(file);
  await page.locator('[data-track="V2"] .timeline-clip').click();
  await expect(page.getByRole('combobox', { name: 'Mask shape', exact: true })).toHaveValue(
    'polygon',
  );
  await expect(page.getByLabel('Invert mask', { exact: true })).toBeChecked();
  await expect(page.locator('.effect-preview-error')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Mask shape', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath('polygon-mask-controls.png'),
    fullPage: true,
  });
  const sample = await exportedPixels(page, 'polygon-mask');
  expect(sample(160, 90)[2]).toBeGreaterThan(220);
  expect(sample(20, 20)[1]).toBeGreaterThan(220);
});
test('unavailable graphics acceleration is reported and effects can be disabled', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (name: string, ...options: unknown[]) {
      if (name === 'webgl') return null;
      return (original as Function).call(this, name, ...options);
    } as typeof original;
  });
  await setup(page);
  await page.getByLabel('Chroma key', { exact: true }).check();
  await expect(page.locator('.effect-preview-error')).toContainText('Visual effects need WebGL');
  await page.getByLabel('Chroma key', { exact: true }).uncheck();
  await expect(page.locator('.effect-preview-error')).toHaveCount(0);
  await expect(page.locator('canvas.effect-preview')).toHaveCount(0);
});
