import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('middle mouse and hand tool pan without editing; wheel zoom stays under the cursor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.getByLabel('Timeline zoom', { exact: true }).fill('100');
  const scroll = page.locator('.timeline-scroll');
  const box = (await scroll.boundingBox())!;
  const x = box.x + 650, y = box.y + 20;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(x - 300, y, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(250);
  await expect(page.getByLabel('Playhead', { exact: true })).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Pan tool', exact: true }).click();
  const before = await scroll.evaluate((el) => el.scrollLeft);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 150, y, { steps: 5 });
  await page.mouse.up();
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 100);
  const anchor = async () => {
    const left = await scroll.evaluate((el) => el.scrollLeft);
    const labels = (await page.locator('.track-labels').boundingBox())!.width;
    return (left + x - box.x - labels) / +(await page.getByLabel('Timeline zoom', { exact: true }).inputValue());
  };
  const at = await anchor();
  await page.mouse.move(x, y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect.poll(() => page.getByLabel('Timeline zoom', { exact: true }).inputValue()).not.toBe('100');
  expect(Math.abs((await anchor()) - at)).toBeLessThan(0.03);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('preview speed advances playback faster without changing saved clip or export speed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.getByRole('combobox', { name: 'Playback speed', exact: true }).selectOption('4');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('.video-canvas > video').first().evaluate((v) => (v as HTMLVideoElement).playbackRate)).toBe(4);
  const start = +(await page.getByLabel('Playhead', { exact: true }).inputValue());
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(+(await page.getByLabel('Playhead', { exact: true }).inputValue()) - start).toBeGreaterThan(1.5);
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const path = await (await saved).path();
  const project = JSON.parse(await readFile(path!, 'utf8'));
  expect(project.clips[0].properties.speed).toBe(1);
  expect(project.previewRate).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
