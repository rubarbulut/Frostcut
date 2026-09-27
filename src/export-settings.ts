import { duration, type Project } from './model';
export function videoBitrate(p: Project) {
  const s = p.exportSettings;
  return (
    s.videoBitrate ??
    Math.max(
      500000,
      Math.min(30000000, Math.round(s.width * s.height * s.fps * 0.08 * (0.3 + s.quality / 100))),
    )
  );
}
export const estimatedMegabytes = (p: Project) =>
  (duration(p) * (videoBitrate(p) + (p.exportSettings.audioBitrate ?? 160) * 1000)) / 8000000;
