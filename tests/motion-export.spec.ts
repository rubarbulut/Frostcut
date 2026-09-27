import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';

for (const mode of ['browser', 'software', 'failed-browser'] as const) {
  test(`${mode} animation renderer produces moving H264 with audio`, async ({ page }) => {
    test.setTimeout(180000);
    if (mode === 'software')
      await page.addInitScript(() =>
        Object.defineProperty(window, 'VideoEncoder', { value: undefined, configurable: true }),
      );
    if (mode === 'failed-browser')
      await page.addInitScript(() => {
        const original = VideoEncoder;
        class FailedEncoder {
          state = 'unconfigured';
          encodeQueueSize = 0;
          error: (e: DOMException) => void;
          constructor(callbacks: { error: (e: DOMException) => void }) {
            this.error = callbacks.error;
          }
          static isConfigSupported(config: VideoEncoderConfig) {
            return original.isConfigSupported(config);
          }
          configure() {
            this.state = 'configured';
          }
          encode() {
            this.state = 'closed';
            this.error(new DOMException('Simulated device failure', 'EncodingError'));
          }
          flush() {
            return Promise.reject(new Error('Simulated device failure'));
          }
          close() {
            this.state = 'closed';
          }
        }
        Object.defineProperty(window, 'VideoEncoder', { value: FailedEncoder, configurable: true });
      });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'Start editing', exact: true }).first().click();
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByLabel('Import video file').setInputFiles('tests/fixtures/short.mp4');
    await expect(page.locator('[data-track="V1"] .timeline-clip')).toHaveCount(1);
    await page.locator('[data-track="V1"] .timeline-clip').click();
    const props = page.locator('.editor-workspace .properties-panel');
    await props.getByRole('button', { name: 'Properties', exact: true }).click();
    await props.getByLabel('Scale', { exact: true }).fill('0.5');
    await props
      .getByRole('combobox', { name: 'Motion preset', exact: true })
      .selectOption('Slide Left');
    await props.getByRole('combobox', { name: 'Keyframe property', exact: true }).selectOption('x');
    await expect(props.locator('.keyframe-nav')).toContainText('3 keyframes');
    await props.getByRole('button', { name: 'Next keyframe', exact: true }).click();
    const box = await page.getByLabel('Selected clip transform').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 10, box!.y + box!.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect(props.getByRole('combobox', { name: 'Motion preset', exact: true })).toHaveValue(
      'Custom',
    );
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('combobox', { name: 'Resolution', exact: true }).selectOption('480x854');
    await page.getByText('Advanced settings', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Frame rate', exact: true }).selectOption('24');
    await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your story is ready.' })).toBeVisible({
      timeout: 150000,
    });
    await expect
      .poll(() =>
        page.locator('.export-result').evaluate((v) => (v as HTMLVideoElement).readyState),
      )
      .toBeGreaterThan(0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download MP4', exact: true }).click();
    const output = `test-results/motion-${mode}.mp4`;
    await (await download).saveAs(output);
    const probe = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
      { encoding: 'utf8' },
    );
    expect(probe.status).toBe(0);
    const data = JSON.parse(probe.stdout);
    expect(data.streams.find((s: any) => s.codec_type === 'video')).toMatchObject({
      codec_name: 'h264',
      width: 480,
      height: 854,
      r_frame_rate: '24/1',
    });
    expect(data.streams.find((s: any) => s.codec_type === 'audio').codec_name).toBe('aac');
    expect(+data.format.duration).toBeGreaterThan(1.9);
    expect(+data.format.duration).toBeLessThan(2.2);
    // The top-left picture boundary moves from right to center as Slide Left settles.
    const raw = (time: string) =>
      spawnSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-ss',
          time,
          '-i',
          output,
          '-frames:v',
          '1',
          '-vf',
          'crop=120:360:120:200,signalstats,metadata=print:file=-',
          '-f',
          'null',
          '-',
        ],
        { encoding: 'utf8' },
      );
    const first = raw('0'),
      later = raw('0.7');
    const luminance = (text: string) => Number(text.match(/lavfi.signalstats.YAVG=([\d.]+)/)?.[1]);
    expect(Math.abs(luminance(first.stdout) - luminance(later.stdout))).toBeGreaterThan(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/motion-${mode}.png`, fullPage: true });
  });
}
