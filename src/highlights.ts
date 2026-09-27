import { clipEnd, duration, timelineWords, type Project } from './model';
import type { CutOptions } from './ai';

export const keywordPattern =
  /(?<![\p{L}\p{N}])(?:secret|best|never|always|stop|start|mistake|simple|powerful|perfect|hook|story|create|attention|seconds|better|free|fast|why|how|what|truth|hack|tip|trick|blueprint|crazy|insane|shocking|actually|important|proven|huge|danger|warning|rule|formula|solution|method|gamechanger|sırrı|sır|hata|yanlış|hikaye|hikâye|önemli|neden|nasıl|niye|sakın|asla|dikkat|ipucu|taktik|yöntem|püf|nokta|noktası|tüyo|hile|çözüm|kolay|pratik|harika|mükemmel|efsane|inanılmaz|şok|bomba|aslında|kesinlikle|gerçek|biliyor|muydunuz|özel|kuralı|mejor|secreto|historia|importante|error|nunca|siempre|cómo|por qué|truco|consejo|melhor|segredo|história|dica|histoire|meilleur|erreur|pourquoi|comment|jamais|wichtig|fehler|geschichte|besser|tipp|warum|wie|nie|ważne|błąd|lepiej|dlaczego|jak|sekret)(?![\p{L}\p{N}])/iu;

export const viralPhrases = [
  // Turkish viral hooks
  /bunu biliyor muydunuz/i,
  /bunu biliyor musunuz/i,
  /en büyük hata/i,
  /en sık yapılan hata/i,
  /sakın yapmayın/i,
  /asla yapmayın/i,
  /işte sırrı/i,
  /işte püf noktası/i,
  /püf noktası/i,
  /gerçek şu ki/i,
  /aslında olay şu/i,
  /kimse bilmiyor/i,
  /dikkat edin/i,
  /nasıl yapılır/i,
  /neden böyle/i,
  /fark ettiniz mi/i,
  /hiç merak ettiniz mi/i,
  /şok olacaksınız/i,
  /adım adım/i,
  /hayat kurtaran/i,
  /herkes yanlış biliyor/i,

  // English viral hooks
  /did you know/i,
  /here is why/i,
  /here's why/i,
  /the secret to/i,
  /the biggest mistake/i,
  /stop doing this/i,
  /never do this/i,
  /what if i told you/i,
  /you need to know/i,
  /the truth about/i,
  /watch till the end/i,
  /step by step/i,
  /game changer/i,
  /crazy truth/i,
  /pro tip/i,
  /you won't believe/i,
  /the #?1 reason/i,
];

export const LEADING_CONJUNCTIONS = new Set([
  // Turkish coordinating & subordinating conjunctions
  've',
  'veya',
  'ama',
  'fakat',
  'ancak',
  'çünkü',
  'lakin',
  'oysa',
  'oysaki',
  'halbuki',
  'ayrıca',
  'hatta',
  'yani',
  'zira',
  'yoksa',
  // English
  'and',
  'but',
  'so',
  'because',
  'or',
  'yet',
  'also',
  'plus',
  'furthermore',
]);

export const TRAILING_CONJUNCTIONS = new Set([
  // Turkish trailing connectors / hanging words
  've',
  'veya',
  'ama',
  'fakat',
  'ancak',
  'çünkü',
  'lakin',
  'ki',
  'diye',
  'ise',
  'ile',
  'hatta',
  'yani',
  'zira',
  'eğer',
  'gibi',
  // English
  'and',
  'but',
  'so',
  'because',
  'or',
  'if',
  'that',
  'which',
  'than',
  'as',
  'with',
  'to',
  'then',
]);

function cleanToken(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
}

function detectHookType(text: string): 'question' | 'secret' | 'mistake' | 'viral' | 'statement' {
  if (/\?/.test(text) || /(nasıl|neden|niye|muydunuz|did you|why|how|what if)/i.test(text))
    return 'question';
  if (/(hata|yanlış|sakın|asla|mistake|wrong|stop|never|avoid|warning)/i.test(text))
    return 'mistake';
  if (/(sırrı|sır|ipucu|taktik|püf|tüyo|secret|hack|tip|blueprint|trick)/i.test(text))
    return 'secret';
  if (
    viralPhrases.some((p) => p.test(text)) ||
    /(inanılmaz|şok|game changer|crazy|insane)/i.test(text)
  )
    return 'viral';
  return 'statement';
}

export function generateShortTitle(openingText: string, hookType?: string): string {
  let clean = openingText.trim();
  clean = clean.replace(/^(ve|veya|ama|fakat|çünkü|and|but|so|because)\s+/i, '');
  if (!clean) clean = openingText.trim();
  clean = clean.replace(/[,;:\s]+$/, '');
  clean = clean.charAt(0).toLocaleUpperCase() + clean.slice(1);

  if (clean.length > 58) {
    const cut = clean.slice(0, 55);
    const lastSpace = cut.lastIndexOf(' ');
    clean = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  const icon =
    hookType === 'question'
      ? '❓'
      : hookType === 'secret'
        ? '💡'
        : hookType === 'mistake'
          ? '⚠️'
          : hookType === 'viral'
            ? '🔥'
            : '🎬';

  return `${icon} "${clean}"`;
}

export function speechSafeSilences(p: Project, ranges: { start: number; end: number }[]) {
  const words = timelineWords(p);
  const result: { start: number; end: number }[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    let start = range.start;
    for (const word of words) {
      if (word.timelineEnd + 0.05 <= start) continue;
      if (word.timelineStart - 0.05 >= range.end) break;
      if (word.timelineStart - 0.05 > start) result.push({ start, end: word.timelineStart - 0.05 });
      start = Math.max(start, word.timelineEnd + 0.05);
      if (start >= range.end) break;
    }
    if (start < range.end) result.push({ start, end: range.end });
  }
  const merged: typeof result = [];
  for (const range of result.sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push(range);
  }
  return merged;
}

export function targetLengthBounds(length: number, total: number) {
  if (length === 14) return { min: 0, max: 14.99, target: 12 };
  if (length === 25) return { min: 15, max: 30, target: 25 };
  if (length === 45) return { min: 30, max: 60, target: 45 };
  if (length === 75) return { min: 60, max: 90, target: 75 };
  return { min: Math.min(10, total), max: Math.min(60, total), target: Math.min(30, total) };
}

export function highlightRanges(p: Project, opts: CutOptions) {
  const words = timelineWords(p),
    total = duration(p),
    bounds = targetLengthBounds(opts.length, total);

  if (!words.length) return [];

  // Group words into semantic sentences / thought units rather than splitting arbitrarily at commas
  const groups: (typeof words)[] = [];
  for (const word of words) {
    const group = groups.at(-1),
      last = group?.at(-1);
    const breakHere =
      !group ||
      !last ||
      last.clipId !== word.clipId ||
      last.speakerId !== word.speakerId ||
      /[.!?]$/.test(last.text) ||
      word.timelineStart - last.timelineEnd > 0.85 ||
      (group.length >= 25 &&
        word.timelineEnd - group[0].timelineStart > 12 &&
        /[,;:\-—]$/.test(last.text));
    if (breakHere) groups.push([word]);
    else group.push(word);
  }

  type Candidate = {
    start: number;
    end: number;
    text: string;
    score: number;
    reason: string;
  };

  const candidates: Candidate[] = [];

  for (let i = 0; i < groups.length; i++) {
    const startGroup = groups[i];
    const firstWord = startGroup[0];
    const clip = p.clips.find((c) => c.id === firstWord.clipId);
    if (!clip) continue;

    const cleanFirst = cleanToken(firstWord.text);
    const startsHanging = LEADING_CONJUNCTIONS.has(cleanFirst);
    const start = Math.max(clip.start, firstWord.timelineStart - 0.08);

    const openingText = startGroup.map((w) => w.text).join(' ');
    const hookType = detectHookType(openingText);
    const hasViralPhrase = viralPhrases.some((pattern) => pattern.test(openingText));
    const hasHookKeyword = keywordPattern.test(openingText);
    const isQuestion = /\?/.test(openingText) || hookType === 'question';

    let bestChoice: { end: number; lastIndex: number; outroScore: number } | null = null;
    let fallbackChoice: { end: number; lastIndex: number; outroScore: number } | null = null;

    for (let j = i; j < groups.length; j++) {
      const currentGroup = groups[j];
      const endWord = currentGroup.at(-1)!;

      if (currentGroup[0].clipId !== firstWord.clipId) break;
      if (j > i && currentGroup[0].timelineStart - groups[j - 1].at(-1)!.timelineEnd > 3.0) break;

      const end = Math.min(clipEnd(clip), endWord.timelineEnd + 0.12);
      const curDuration = end - start;

      if (curDuration > bounds.max + 0.001) break;

      const cleanLast = cleanToken(endWord.text);
      const endsHanging = TRAILING_CONJUNCTIONS.has(cleanLast);
      const hasTerminal = /[.!?]$/.test(endWord.text);
      const hasExclamation = /!$/.test(endWord.text);

      let outroScore = 0;
      if (hasTerminal) outroScore += 24;
      if (hasExclamation) outroScore += 6;
      if (endsHanging) outroScore -= 35;

      const diffFromTarget = Math.abs(curDuration - bounds.target);
      const targetScore = Math.max(0, 20 - diffFromTarget * 0.75);
      const candidateFitScore = outroScore + targetScore;

      const meetsMin = bounds.min <= 0 || curDuration >= bounds.min || total < bounds.min;

      if (meetsMin) {
        if (!bestChoice || candidateFitScore > bestChoice.outroScore) {
          bestChoice = { end, lastIndex: j, outroScore: candidateFitScore };
        }
      } else {
        if (!fallbackChoice || candidateFitScore > fallbackChoice.outroScore) {
          fallbackChoice = { end, lastIndex: j, outroScore: candidateFitScore };
        }
      }
    }

    const picked = bestChoice ?? fallbackChoice;
    if (!picked) continue;

    const shortDuration = picked.end - start;
    if (shortDuration < 2.0) continue;

    if (bounds.min > 0 && total >= bounds.min && shortDuration < bounds.min) continue;

    const shortWords = groups.slice(i, picked.lastIndex + 1).flat();
    const wps = shortWords.length / Math.max(1, shortDuration);

    let score = 50;

    // 1. Hook Power (Opening 3-5s)
    if (hasViralPhrase) score += 30;
    else if (hasHookKeyword) score += 20;
    else score += 6;

    if (isQuestion) score += 12;
    if (startsHanging) score -= 16;

    // 2. Outro & Resolution
    const finalWord = groups[picked.lastIndex].at(-1)!;
    const finalClean = cleanToken(finalWord.text);
    if (/[.!?]$/.test(finalWord.text)) score += 18;
    if (TRAILING_CONJUNCTIONS.has(finalClean)) score -= 30;

    // 3. Speech Density / Pacing
    if (wps >= 2.0 && wps <= 4.2) score += 12;
    else if (wps < 1.1) score -= 12;

    // 4. Target Duration Precision
    const diff = Math.abs(shortDuration - bounds.target);
    score += Math.max(0, 15 - (diff / Math.max(1, bounds.target)) * 15);
    if (shortDuration >= bounds.min) score += 8;

    const finalScore = Math.min(98, Math.max(72, Math.round(score)));

    const hookLabel =
      hookType === 'question'
        ? 'Question Hook'
        : hookType === 'secret'
          ? 'Secret / Insight Hook'
          : hookType === 'mistake'
            ? 'Mistake / Warning Hook'
            : hasViralPhrase
              ? 'Viral Pattern Hook'
              : 'Clean Narrative Arc';

    const reason = `${finalScore}% Viral Potential · ${hookLabel} · Complete ${Math.round(shortDuration)}s Thought`;
    const title = generateShortTitle(openingText, hookType);

    candidates.push({
      start,
      end: picked.end,
      text: title,
      score: finalScore,
      reason,
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.start - b.start);

  const count =
    opts.count || Math.min(10, Math.max(1, Math.floor(total / Math.max(35, bounds.target * 1.5))));
  const chosen: Candidate[] = [];

  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    const overlap = chosen.some(
      (x) => Math.min(x.end, candidate.end) - Math.max(x.start, candidate.start) > 0.1,
    );
    if (!overlap) chosen.push(candidate);
  }

  return chosen;
}
