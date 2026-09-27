import type { Project, TimelineWord } from './model';
/** Only emphasize a relevant important word, at a stable density across caption groups. */
export function captionEmoji(p: Project, group: TimelineWord[]) {
  if (p.captions.emoji === 'None') return '';
  const important = group.filter((w) => w.important);
  if (!important.length) return '';
  const stride = p.captions.emoji === 'Low' ? 4 : p.captions.emoji === 'Medium' ? 2 : 1;
  if (Math.floor(group[0].timelineStart / 2) % stride) return '';
  const text = important
    .map((w) => w.text)
    .join(' ')
    .toLocaleLowerCase();
  if (/stop|mistake|hata|erreur|fehler|błąd/.test(text)) return '🛑';
  if (/story|hikaye|hikâye|historia|histoire|geschichte/.test(text)) return '📖';
  if (/fast|seconds|hız|rápido/.test(text)) return '⚡';
  if (/secret|why|how|sırrı|neden|nasıl|secreto|segredo/.test(text)) return '💡';
  return '✨';
}
export function captionLayout(p: Project) {
  const custom = p.captions.position === 'custom';
  const { x = 50, y = 75 } = p.captions.customPosition ?? {};
  return {
    x: custom ? x : 50,
    y: custom ? y : 50,
    width: custom ? Math.min(86, 2 * Math.min(x, 100 - x)) : 86,
  };
}
