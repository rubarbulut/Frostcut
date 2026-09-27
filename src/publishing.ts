import type { Project } from './model';
import { sourceCues } from './translations';
const stop = new Set(
  'the a an and or to of in on for from with that this it is are was be as at by you your we our they their i my can will have has do not just more most how what why when where then than about into out start make makes video bir bu şu ve veya ile için gibi ama daha çok az ben sen biz siz onlar onun benim senin olan olmak olarak ise de da mi mı mu mü ne nasıl neden nerede birisi şey the le la les un une des et du de el los las y en que por una der die das und ein eine mit ist zu auf o os as um uma e que do da em jak jest nie się na w z oraz'.split(
    /\s+/,
  ),
);
export function keywords(text: string, limit = 5) {
  const counts = new Map<string, number>();
  for (const raw of text.match(/[\p{L}\p{N}]+/gu) ?? []) {
    const word = raw.toLocaleLowerCase();
    if (word.length < 4 || stop.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}
export type PublishingMetadata = {
  title: string;
  description: string;
  hashtags: string;
  chapterAttachment?: { sourceFingerprint: string; text: string };
};
export function mediaCredits(p: Project) {
  return p.media
    .filter((m) => m.attribution && p.clips.some((c) => c.mediaId === m.id))
    .map((m) => {
      const a = m.attribution!;
      return `${a.title} — ${a.creator}. ${a.license} (${a.licenseUrl}). Source: ${a.url}. Edited/trimmed for this video.`;
    })
    .join('\n');
}
export function metadataDrafts(p: Project) {
  const cues = sourceCues(p),
    text = cues.map((c) => c.text).join(' ');
  const titles = [
    ...new Set(
      cues
        .filter((c) => c.text.length > 15)
        .slice(0, 3)
        .map((c) => c.text.replace(/[.!?]+$/, '').slice(0, 100)),
    ),
  ];
  if (!titles.length) titles.push(p.name.slice(0, 100));
  const credits = mediaCredits(p);
  return {
    titles,
    description: [
      cues
        .slice(0, 3)
        .map((c) => c.text)
        .join(' '),
      credits ? `Footage credits\n${credits}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 5000),
    hashtags: keywords(text, 5)
      .map((w) => `#${w}`)
      .join(' '),
  };
}
export function brollSuggestions(p: Project) {
  const cues = sourceCues(p).filter((c) => keywords(c.text).length);
  const step = Math.max(1, Math.floor(cues.length / 6));
  return cues
    .filter((_, i) => i % step === 0)
    .slice(0, 6)
    .map((c) => ({
      ...c,
      query: keywords(c.text, 2).join(' '),
      end: Math.min(c.end, c.start + 6),
    }));
}
