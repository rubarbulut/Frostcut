import { clipEnd, deleteRange, isLocked, timelineWords, type Project } from './model';

type TimelineWord = ReturnType<typeof timelineWords>[number];
export type SpeechSuggestion = {
  id: string;
  kind: 'filler' | 'repeat';
  clipId: string;
  wordIds: string[];
  text: string;
  context: string;
  start: number;
  end: number;
  estimated: boolean;
  reason: string;
  later?: { start: number; end: number; text: string };
};
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/\u0307/g, '')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
const quote = (words: TimelineWord[]) => words.map((w) => w.text).join(' ');
function candidate(
  words: TimelineWord[],
  kind: SpeechSuggestion['kind'],
  reason: string,
): SpeechSuggestion {
  return {
    id: `${kind}:${words[0].clipId}:${words.map((w) => w.id).join(':')}`,
    kind,
    clipId: words[0].clipId,
    wordIds: words.map((w) => w.id),
    text: quote(words),
    context: '',
    start: words[0].timelineStart,
    end: Math.max(...words.map((w) => w.timelineEnd)),
    estimated: words.some((w) => w.timingEstimated),
    reason,
  };
}
function sentences(words: TimelineWord[]) {
  const groups: TimelineWord[][] = [];
  for (const w of words) {
    const group = groups.at(-1),
      last = group?.at(-1);
    if (
      !group ||
      !last ||
      last.clipId !== w.clipId ||
      last.speakerId !== w.speakerId ||
      last.cueId !== w.cueId ||
      /[.!?]$/.test(last.text) ||
      w.timelineStart - last.timelineEnd > 0.8 ||
      group.length >= 60
    )
      groups.push([w]);
    else group.push(w);
  }
  return groups;
}
function similarity(a: string[], b: string[]) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++)
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] === b[j] ? 0 : 1)));
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}
// Changes to a number or a negation can reverse a statement's meaning.
const protectedWords =
  /^(?:\d.*|zero|one|two|three|four|five|six|seven|eight|nine|ten|bir|iki|üç|dört|beş|no|not|never|dont|doesnt|didnt|cant|cannot|wont|isnt|wasnt|without|değil|hayır|yok|asla)$/u;
export function repeatedTakes(p: Project): SpeechSuggestion[] {
  const groups = sentences(timelineWords(p)),
    result: SpeechSuggestion[] = [];
  for (let i = 0; i < groups.length - 1; i++) {
    const a = groups[i],
      tokens = a.map((w) => normalize(w.text)).filter(Boolean);
    if (tokens.length < 4) continue;
    for (let j = i + 1; j < Math.min(groups.length, i + 5); j++) {
      const b = groups[j];
      if (b[0].timelineStart - a.at(-1)!.timelineEnd > 30) break;
      if (
        b[0].clipId !== a[0].clipId ||
        b[0].speakerId !== a[0].speakerId ||
        b[0].timelineStart < a.at(-1)!.timelineEnd
      )
        continue;
      const other = b.map((w) => normalize(w.text)).filter(Boolean);
      if (
        other.length < 4 ||
        tokens.filter((t) => protectedWords.test(t)).join('|') !==
          other.filter((t) => protectedWords.test(t)).join('|')
      )
        continue;
      const score = similarity(tokens, other);
      if (score < 0.88) continue;
      const item = candidate(
        a,
        'repeat',
        score === 1 ? 'Same words in the same order.' : 'Very similar wording in the same order.',
      );
      item.later = { start: b[0].timelineStart, end: b.at(-1)!.timelineEnd, text: quote(b) };
      item.reason += ' Compare both takes before removing the earlier one.';
      result.push(item);
      break;
    }
  }
  return result;
}
export function speechSuggestions(p: Project, includePhrases = false): SpeechSuggestion[] {
  const words = timelineWords(p),
    result = repeatedTakes(p);
  for (let i = 0; i < words.length; i++) {
    const w = words[i],
      token = normalize(w.text);
    const hesitation = /^(?:u+m+|u+h+|e+r+m+|h+m+|ı{2,}|i{2,}|e{3,})$/u.test(token);
    const next = words[i + 1];
    const phrase =
      includePhrases &&
      next &&
      next.clipId === w.clipId &&
      next.speakerId === w.speakerId &&
      next.timelineStart - w.timelineEnd < 0.35 &&
      ['you know', 'ı mean', 'i mean'].includes(`${token} ${normalize(next.text)}`);
    const possible = includePhrases && ['şey', 'yani'].includes(token);
    if (!hesitation && !phrase && !possible) continue;
    const picked = phrase ? [w, next] : [w];
    const item = candidate(
      picked,
      'filler',
      hesitation
        ? 'Spoken hesitation.'
        : 'This phrase can carry meaning. Listen before removing it.',
    );
    item.context = quote(
      words.slice(Math.max(0, i - 4), i + picked.length + 4).filter((v) => v.clipId === w.clipId),
    );
    // Overlapping word estimates cannot safely describe an isolated audio cut.
    if (
      words.some(
        (v) =>
          v.clipId === w.clipId &&
          !item.wordIds.includes(v.id) &&
          v.timelineStart < item.end - 0.001 &&
          v.timelineEnd > item.start + 0.001,
      )
    )
      continue;
    if (item.end - item.start >= 0.04) result.push(item);
    if (phrase) i++;
  }
  return result.sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind));
}
export function cleanupRanges(items: SpeechSuggestion[]) {
  const ranges: { start: number; end: number }[] = [];
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    const previous = ranges.at(-1);
    if (previous && item.start <= previous.end + 0.001)
      previous.end = Math.max(previous.end, item.end);
    else ranges.push({ start: item.start, end: item.end });
  }
  return ranges;
}
export function applySpeechCleanup(p: Project, items: SpeechSuggestion[]): Project {
  if (!items.length) return p;
  const words = timelineWords(p);
  for (const item of items) {
    const picked = words.filter((w) => w.clipId === item.clipId && item.wordIds.includes(w.id));
    if (
      picked.length !== item.wordIds.length ||
      quote(picked) !== item.text ||
      Math.abs(picked[0].timelineStart - item.start) > 0.001 ||
      Math.abs(Math.max(...picked.map((w) => w.timelineEnd)) - item.end) > 0.001
    )
      throw new Error('The transcript changed. Review the suggestions again.');
  }
  const ranges = cleanupRanges(items);
  if (p.clips.some((c) => isLocked(p, c) && clipEnd(c) > ranges[0].start))
    throw new Error('Unlock the affected video and audio tracks before applying these cuts.');
  let next = p;
  for (const range of [...ranges].reverse()) next = deleteRange(next, range.start, range.end);
  return { ...next, suggestions: [] };
}
