import { captionGroups, type Project } from './model';

export function srtTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, length = 2) => n.toString().padStart(length, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
export function createSrt(p: Project) {
  return captionGroups(p)
    .map((group, i) => {
      const start = Math.round(group[0].timelineStart * 1000) / 1000;
      const end = Math.max(start + 0.001, Math.max(...group.map((w) => w.timelineEnd)));
      const text = group.map((w) => w.text.replace(/[\r\n]+/g, ' ').trim()).join(' ');
      return `${i + 1}\r\n${srtTime(start)} --> ${srtTime(end)}\r\n${text}\r\n`;
    })
    .join('\r\n');
}
