import {
  type Project,
  type Suggestion,
  type Operation,
  type Word,
  uid,
  duration,
  timelineWords,
  clipEnd,
} from './model';
import { repeatedTakes } from './speech-cleanup';
export type CutOptions = {
  goal: string;
  count: number;
  length: number;
  pacing: string;
  reorder: boolean;
  composite: boolean;
  sensitivity: number;
};
const important =
  /\b(secret|best|never|always|stop|start|mistake|simple|powerful|perfect|hook|story|create|attention|seconds|better|free|fast)\b/i;
export function markKeywords(words: Word[]) {
  return words.map((w, i) => ({
    ...w,
    important: important.test(w.text) && (i === 0 || !important.test(words[i - 1].text)),
  }));
}
export function makeDemoWords(): Word[] {
  const lines: [number, number, string][] = [
    [0.3, 4.2, 'The secret to a better video is a better story.'],
    [5.4, 8.5, 'Start with the moment that makes people stop scrolling.'],
    [9.6, 12.6, 'You do not need a perfect camera.'],
    [13.5, 17.1, 'You do not need a perfect camera. You need a hook.'],
    [18.4, 22.8, 'Cut the silence. Keep the feeling. Then go create something.'],
  ];
  return markKeywords(
    lines.flatMap(([start, end, text]) => {
      const list = text.split(' ');
      return list.map((text, i) => ({
        id: uid(),
        text,
        start: start + (i * (end - start)) / list.length,
        end: start + ((i + 0.85) * (end - start)) / list.length,
        speakerId: 'speaker-1',
      }));
    }),
  );
}
export function suggestCuts(
  p: Project,
  opts: CutOptions,
  silenceRanges: { start: number; end: number }[] = [],
): Suggestion[] {
  const words = timelineWords(p),
    total = duration(p),
    suggestions: Suggestion[] = [];
  const pauses = silenceRanges.filter(
    (r) =>
      r.end - r.start > (opts.pacing === 'Natural' ? 0.55 : opts.pacing === 'Hyper' ? 0.18 : 0.3),
  );
  function retained(range: { start: number; end: number }) {
    let pieces = [range];
    for (const pause of pauses) {
      pieces = pieces.flatMap((r) =>
        pause.end <= r.start || pause.start >= r.end
          ? [r]
          : [
              ...(pause.start > r.start ? [{ start: r.start, end: pause.start }] : []),
              ...(pause.end < r.end ? [{ start: pause.end, end: r.end }] : []),
            ],
      );
    }
    return pieces;
  }
  const sentenceGroups: (typeof words)[] = [];
  for (const w of words) {
    let group = sentenceGroups.at(-1);
    if (
      !group ||
      group[0].clipId !== w.clipId ||
      group[0].speakerId !== w.speakerId ||
      /[.!?]$/.test(group.at(-1)!.text) ||
      w.timelineStart - group.at(-1)!.timelineEnd > 0.8
    ) {
      group = [];
      sentenceGroups.push(group);
    }
    group.push(w);
  }
  const candidates = sentenceGroups
    .map((group, i) => {
      const start = Math.max(0, group[0].timelineStart - 0.1);
      let end = group.at(-1)!.timelineEnd + 0.15;
      const desired = opts.length || 30;
      for (let j = i + 1; j < sentenceGroups.length && end - start < desired * 0.65; j++) {
        const proposed = sentenceGroups[j].at(-1)!.timelineEnd + 0.15;
        if (proposed - start > desired * 1.2) break;
        end = proposed;
      }
      const text = group.map((w) => w.text).join(' '),
        score = Math.min(
          98,
          62 +
            (important.test(text) ? 20 : 0) +
            (/[?!]/.test(text) ? 9 : 0) +
            Math.min(7, group.length),
        );
      return { start, end: Math.min(total, end), text, score };
    })
    .sort((a, b) => b.score - a.score);
  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (chosen.length >= opts.count) break;
    if (
      chosen.some(
        (x) =>
          Math.min(c.end, x.end) - Math.max(c.start, x.start) >
          Math.min(c.end - c.start, x.end - x.start) * 0.6,
      )
    )
      continue;
    chosen.push(c);
  }
  if (opts.goal !== 'Remove silences') {
    for (const c of chosen)
      suggestions.push({
        id: uid(),
        type: 'highlight',
        title: c.text,
        reason: important.test(c.text) ? 'Strong hook' : 'Clear statement',
        start: c.start,
        end: c.end,
        score: c.score,
        operations: [
          { type: 'assemble', ranges: retained({ start: c.start, end: c.end }) },
          { type: 'caption-style', preset: p.captions.preset },
        ],
        status: 'pending',
      });
    if (opts.composite && chosen.length > 1) {
      const order = opts.reorder ? [...chosen] : [...chosen].sort((a, b) => a.start - b.start);
      const ops: Operation[] = [
        { type: 'assemble', ranges: order.flatMap(retained) },
        { type: 'caption-style', preset: p.captions.preset },
      ];
      suggestions.unshift({
        id: uid(),
        type: 'edit',
        title: 'A story from your strongest moments',
        reason: opts.reorder ? 'Composite · strongest hook first' : 'Composite · original order',
        start: 0,
        end: order.reduce((n, c) => n + c.end - c.start, 0),
        score: 91,
        operations: ops,
        status: 'pending',
      });
    }
  }
  const silenceOps = silenceRanges
    .filter(
      (r) =>
        r.end - r.start > (opts.pacing === 'Natural' ? 0.55 : opts.pacing === 'Hyper' ? 0.18 : 0.3),
    )
    .sort((a, b) => b.start - a.start)
    .map((r) => ({ type: 'delete-range' as const, start: r.start, end: r.end }));
  if (opts.goal === 'Clean full video')
    suggestions.unshift({
      id: uid(),
      type: 'edit',
      title: 'Your full story, with cleaner pacing',
      reason: 'Remove measured pauses and add captions. Repeated takes stay for your review.',
      start: 0,
      end: total,
      score: 90,
      operations: [...silenceOps, { type: 'caption-style', preset: p.captions.preset }],
      status: 'pending',
    });
  if (silenceOps.length)
    suggestions.push({
      id: uid(),
      type: 'silence',
      title: `Remove ${silenceOps.reduce((n, r) => n + r.end - r.start, 0).toFixed(1)} seconds of silence`,
      reason: `${silenceOps.length} pauses · ${opts.pacing.toLowerCase()} pacing · short audio fades`,
      start: 0,
      end: total,
      score: 90,
      operations: silenceOps,
      status: 'pending',
    });
  for (const repeat of repeatedTakes(p)) {
    suggestions.push({
      id: uid(),
      type: 'repeat',
      title: repeat.text,
      reason: repeat.reason,
      start: repeat.start,
      end: repeat.later!.end,
      score: 90,
      operations: [{ type: 'delete-range', start: repeat.start, end: repeat.end }],
      status: 'pending',
    });
  }
  return suggestions;
}
export function silenceFromSamples(
  samples: Float32Array,
  sampleRate = 16000,
  sensitivity = 50,
): { start: number; end: number }[] {
  const hop = Math.floor(sampleRate * 0.02),
    threshold = 0.001 + Math.pow(sensitivity / 100, 2) * 0.024,
    ranges: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i < samples.length; i += hop) {
    let sum = 0;
    const end = Math.min(i + hop, samples.length);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    const silent = Math.sqrt(sum / (end - i)) < threshold;
    if (silent && start < 0) start = i / sampleRate;
    if (!silent && start >= 0) {
      if (i / sampleRate - start > 0.35)
        ranges.push({ start: start + 0.08, end: i / sampleRate - 0.08 });
      start = -1;
    }
  }
  if (start >= 0 && samples.length / sampleRate - start > 0.35)
    ranges.push({ start: start + 0.08, end: samples.length / sampleRate });
  return ranges;
}
export function mapSilences(p: Project, mediaId: string, ranges: { start: number; end: number }[]) {
  return p.clips
    .filter((c) => c.mediaId === mediaId)
    .flatMap((c) =>
      ranges
        .filter((r) => r.end > c.sourceStart && r.start < c.sourceEnd)
        .map((r) => ({
          start: c.start + (Math.max(c.sourceStart, r.start) - c.sourceStart) / c.properties.speed,
          end: c.start + (Math.min(c.sourceEnd, r.end) - c.sourceStart) / c.properties.speed,
        })),
    )
    .filter((r) => r.end > r.start);
}
export function promptOperations(
  p: Project,
  prompt: string,
): { operations: Operation[]; description: string; needsAnalysis?: boolean } {
  const s = prompt.toLowerCase();
  if (/music|beat/.test(s))
    return {
      operations: [],
      description: 'Music sync is planned after P0. Try captions, faster pacing, or Auto Cut.',
    };
  if (/silence|hook|short|highlight/.test(s))
    return {
      operations: [],
      description: 'Open guided Auto Cut to analyze the footage and preview suggestions.',
      needsAnalysis: true,
    };
  if (/caption|subtitle/.test(s))
    return {
      operations: [
        {
          type: 'caption-style',
          preset: s.includes('clean') ? 'Clean' : s.includes('brainrot') ? 'Brainrot' : 'Bold',
        },
      ],
      description: 'Turn on dynamic captions and apply the selected style.',
    };
  if (/fast|speed/.test(s)) {
    const keep = Number(s.match(/first\s+(\d+)\s*seconds?/)?.[1] ?? 0);
    return {
      operations: p.clips.length ? [{ type: 'speed-range', start: keep, speed: 1.25 }] : [],
      description: `${keep ? `Keep the opening ${keep} seconds, then speed up the rest` : 'Speed up the sequence'} to 1.25× and close the gaps. Audio pitch is preserved.`,
    };
  }
  return {
    operations: [],
    description:
      'P0 supports captions, faster pacing, silence removal, and finding highlights. Try one of the suggestions above.',
  };
}
