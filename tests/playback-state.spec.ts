import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('playback and reverse seeking keep caption highlights, cursor and saved project consistent', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await page.getByLabel('Import subtitle file').setInputFiles({
    name: 'timing.srt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '1\n00:00:00,000 --> 00:00:01,000\nAlpha\n\n2\n00:00:02,000 --> 00:00:03,000\nBravo\n\n3\n00:00:04,000 --> 00:00:05,000\nCharlie\n',
    ),
  });
  const panel = page.locator('.left-panel');
  const save = async () => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  };
  const original = await save();
  for (const [word, time] of [
    ['Charlie', 4],
    ['Bravo', 2],
    ['Alpha', 0],
  ] as const) {
    await panel.getByRole('button', { name: word, exact: true }).click();
    await expect(page.getByLabel('Playhead', { exact: true })).toHaveValue(String(time));
    await expect(panel.locator('.word.current')).toHaveText(word);
    await expect(page.locator('.caption-block.current')).toHaveText(word);
    await expect(page.locator('.caption-overlay')).toContainText(word);
    const positions = await page.locator('.timeline-lanes').evaluate((lane) => ({
      start: lane.getBoundingClientRect().left,
      cursor: lane.querySelector('.playhead')!.getBoundingClientRect().left,
    }));
    expect(positions.cursor - positions.start).toBeCloseTo(time * 26, 0);
  }
  await page.getByLabel('Playback speed', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () => +(await page.getByLabel('Playhead', { exact: true }).inputValue()))
    .toBeGreaterThan(1.2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const t = +(await page.getByLabel('Playhead', { exact: true }).inputValue());
  const expected = t < 1 ? 'Alpha' : t >= 2 && t < 3 ? 'Bravo' : t >= 4 && t < 5 ? 'Charlie' : '';
  if (expected) await expect(panel.locator('.word.current')).toHaveText(expected);
  else {
    await expect(panel.locator('.word.current')).toHaveCount(0);
    await expect(page.locator('.caption-block.current')).toHaveCount(0);
    await expect(page.locator('.caption-overlay')).toHaveCount(0);
  }
  expect(await save()).toEqual(original);
  await page.getByRole('button', { name: 'Hide V1', exact: true }).click();
  await expect(panel.locator('.word')).toHaveCount(0);
  await expect(page.locator('.caption-block')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await panel.getByRole('button', { name: 'Bravo', exact: true }).click();
  await expect(panel.locator('.word.current')).toHaveText('Bravo');
  await expect(page.locator('.caption-block.current')).toHaveText('Bravo');
  await expect(page.locator('.caption-overlay')).toContainText('Bravo');
});
