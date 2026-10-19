import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model';

async function sample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project', exact: true }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('A better story');
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
}
async function backup(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.frostcut\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const text = await readFile(path!, 'utf8');
  const project = JSON.parse(text) as Project;
  expect(project.media).toHaveLength(1);
  expect(project.media[0].name).toMatch(/sample\.(mp4|webm)$/);
  expect(project.media[0].duration).toBeGreaterThanOrEqual(24);
  expect(project.media[0].duration).toBeLessThan(24.05);
  expect(text).not.toMatch(/blob:|data:video|data:audio/);
  expect(Buffer.byteLength(text)).toBeLessThan(100_000);
  return { path: path!, project };
}

test('hosted backup: downloads actual caption/style edits and reopens that file', async ({ page }) => {
  await sample(page);
  await page.getByLabel('Project name', { exact: true }).fill('Backup proof');
  await page.getByRole('button', { name: /^Caption 1:/ }).click();
  await page.getByLabel('Caption text', { exact: true }).fill('Saved caption proof.');
  await page.getByLabel('Caption start', { exact: true }).fill('0.5');
  await page.getByLabel('Caption end', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Save caption', exact: true }).click();
  await page.getByRole('combobox', { name: 'Text alignment', exact: true }).selectOption('right');
  const saved = await backup(page);
  expect(saved.project.name).toBe('Backup proof');
  expect(saved.project.captions.appearance?.align).toBe('right');
  const caption = saved.project.clips[0].captionWords?.slice(0, 3);
  expect(caption?.map((word) => word.text).join(' ')).toBe('Saved caption proof.');
  expect(caption?.[0].start).toBe(0.5);
  expect(caption?.[2].end).toBe(4);
  // Changing the current edit proves file import rather than merely redisplaying autosave.
  await page.getByLabel('Project name', { exact: true }).fill('Unsaved different name');
  await page.getByRole('combobox', { name: 'Text alignment', exact: true }).selectOption('left');
  await page.getByLabel('Open project file', { exact: true }).setInputFiles(saved.path);
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Backup proof');
  await expect(page.getByRole('combobox', { name: 'Text alignment', exact: true })).toHaveValue('right');
  await page.getByRole('button', { name: /^Caption 1: Saved caption proof\./ }).click();
  await expect(page.getByLabel('Caption start', { exact: true })).toHaveValue('0.500');
  await expect(page.getByLabel('Caption end', { exact: true })).toHaveValue('4.000');
});

test('hosted backup: rejects malformed and wrong-file downloads without losing the edit', async ({ page }) => {
  await sample(page);
  await page.getByLabel('Project name', { exact: true }).fill('Keep my edit');
  await page.getByLabel('Open project file', { exact: true }).setInputFiles({
    name: 'invalid.frostcut.json', mimeType: 'application/json',
    buffer: Buffer.from('{ definitely invalid JSON'),
  });
  await expect(page.getByText('This project file could not be read as JSON. Choose a FrostCut project backup.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Keep my edit');
  await page.locator('.left-panel').getByRole('button', { name: 'Transcript', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SRT', exact: true }).click();
  const srt = await pending;
  const path = await srt.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, 'utf8')).toContain('-->');
  await page.getByLabel('Open project file', { exact: true }).setInputFiles(path!);
  await expect(page.getByText('This project file could not be read as JSON. Choose a FrostCut project backup.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Keep my edit');
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  expect((await backup(page)).project.name).toBe('Keep my edit');
});

test('hosted backup: equal parts and original survive an actual file roundtrip', async ({ page }) => {
  await sample(page);
  await page.getByRole('button', { name: 'Auto Cut', exact: true }).click();
  await page.getByRole('tab', { name: 'Equal parts', exact: true }).click();
  await page.getByLabel('Number of parts', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Create 3 parts', exact: true }).click();
  const picker = page.getByLabel('Current sequence', { exact: true });
  await expect(picker.locator('option')).toHaveText(['Original edit', 'Part 01', 'Part 02', 'Part 03']);
  const saved = await backup(page);
  expect(saved.project.sequences).toBeDefined();
  const sequences = saved.project.sequences!;
  expect(sequences.map((s) => s.name))
    .toEqual(['Original edit', 'Part 01', 'Part 02', 'Part 03']);
  for (const part of sequences.slice(1)) {
    const end = Math.max(...part.clips.map((clip: {
      start: number; sourceStart: number; sourceEnd: number; properties: { speed: number };
    }) => clip.start + (clip.sourceEnd - clip.sourceStart) / clip.properties.speed));
    expect(Math.abs(end - 8)).toBeLessThan(1 / 30);
  }
  await page.getByLabel('Open project file', { exact: true }).setInputFiles(saved.path);
  await expect(picker.locator('option')).toHaveText(['Original edit', 'Part 01', 'Part 02', 'Part 03']);
  await picker.selectOption({ label: 'Original edit' });
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
  const reopened = await backup(page);
  const original = reopened.project.clips[0];
  expect(original.sourceEnd - original.sourceStart).toBeCloseTo(saved.project.media[0].duration, 3);
});
