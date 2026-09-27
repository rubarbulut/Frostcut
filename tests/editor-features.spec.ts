import { test, expect } from '@playwright/test';

test('validates media organizer, asset deletion safeguards, viral caption palettes and animations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample project' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('A better story');

  // Switch to Media tab on left panel
  await page.locator('.left-panel').getByRole('button', { name: 'Media', exact: true }).click();
  await expect(page.locator('.panel-title span').first()).toHaveText('Project media');

  // Verify Media Panel has assets
  const assetCards = page.locator('.asset-card');
  await expect(assetCards).toHaveCount(1);

  // Star asset
  const starBtn = page.locator('.asset-btn.star').first();
  await starBtn.click();
  await expect(page.locator('.asset-card.is-starred')).toBeVisible();

  // Assign to a folder
  const folderBtn = page.locator('.asset-btn.folder').first();
  await folderBtn.click();
  await expect(page.getByRole('heading', { name: /Organize/ })).toBeVisible();
  await page.getByPlaceholder(/B-Roll/).fill('Cinematic Shots');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Verify folder tag on card and filter chip
  await expect(page.locator('.asset-folder-tag')).toContainText('Cinematic Shots');
  await expect(page.locator('.filter-chip', { hasText: 'Cinematic Shots' })).toBeVisible();

  // Test search filtering
  const searchInput = page.getByLabel('Filter media by name');
  await searchInput.fill('Cinematic');
  await expect(assetCards).toHaveCount(1);
  await searchInput.fill('nonexistent_file_query');
  await expect(page.locator('.no-media-match')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(assetCards).toHaveCount(1);

  // Add duplicate clip to timeline via '+' button
  const initialClips = await page.locator('[data-track="V1"] .timeline-clip').count();
  await page.locator('.asset-btn.add').first().click();
  await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(initialClips + 1);

  // Test Delete Asset Safeguard Dialog
  const deleteBtn = page.locator('.asset-btn.delete').first();
  await deleteBtn.click();
  await expect(page.getByRole('heading', { name: 'Delete media asset?' })).toBeVisible();
  await expect(page.locator('.media-delete-warning')).toContainText('timeline clip');

  // Cancel deletion
  await page.getByRole('button', { name: 'Keep asset' }).click();
  await expect(page.getByRole('heading', { name: 'Delete media asset?' })).not.toBeVisible();
  await expect(assetCards).toHaveCount(1);

  // Take screenshot of the media organizer
  await page.locator('.left-panel').screenshot({
    path: 'C:/Users/Arenb/.gemini/antigravity/brain/b6b81b53-0756-4073-8d28-d85e15ee1853/editor_media_organizer_preview.png',
  });

  // Switch to Captions Customizer in Properties Panel
  await page.locator('.properties-panel').getByRole('button', { name: 'Captions', exact: true }).click();
  const customizerDetails = page.locator('.caption-customization');
  await customizerDetails.locator('summary').click();
  await expect(customizerDetails).toHaveAttribute('open', '');

  // Click Glacier viral palette
  const glacierChip = page.locator('.caption-palette-chip', { hasText: 'Glacier' });
  await glacierChip.click();

  // Select Glow word animation
  const glowAnimBtn = page.locator('.caption-anim-btn', { hasText: 'Glow' });
  await glowAnimBtn.click();
  await expect(glowAnimBtn).toHaveClass(/active/);

  // Take screenshot of the caption palette and animation panel
  await page.locator('.properties-panel').screenshot({
    path: 'C:/Users/Arenb/.gemini/antigravity/brain/b6b81b53-0756-4073-8d28-d85e15ee1853/editor_caption_palettes_preview.png',
  });

  // Seek to subtitle time to preview the caption overlay
  await page.locator('.left-panel').getByRole('button', { name: 'Transcript', exact: true }).click();
  await page.locator('.left-panel .word').first().click();
  await expect(page.locator('.caption-overlay')).toBeVisible();

  // Take screenshot of the preview canvas with styled caption pill
  await page.locator('.center-panel').screenshot({
    path: 'C:/Users/Arenb/.gemini/antigravity/brain/b6b81b53-0756-4073-8d28-d85e15ee1853/editor_styled_subtitles_preview.png',
  });

  // Take screenshot of the full editor workspace showing the harmonious UI
  await page.screenshot({
    path: 'C:/Users/Arenb/.gemini/antigravity/brain/b6b81b53-0756-4073-8d28-d85e15ee1853/editor_full_workspace_preview.png',
  });
});
