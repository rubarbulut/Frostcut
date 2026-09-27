import { brandStyle } from './brand-kits';
import { duration, type CaptionStyle, type Project } from './model';
import { memoryFormat } from './style-memory';
import { analyticsNumber } from './analytics-csv';

export const ANALYTICS_KEY = 'frostcut-analytics-v1';
export const ANALYTICS_LIMIT = 300;
export const analyticsPlatforms = ['YouTube', 'TikTok', 'Instagram', 'Other'] as const;
export type AnalyticsContext = {
  platform: typeof analyticsPlatforms[number];
  account: string;
  cohort: string;
  start: string;
  end: string;
};
export type EditSnapshot = {
  projectId: string;
  sequenceId: string;
  label: string;
  capturedAt: string;
  format: 'portrait' | 'landscape' | 'square';
  duration: number;
  baseClips: number;
  captions: { enabled: boolean; style: CaptionStyle };
};
export type AnalyticsRow = {
  context: AnalyticsContext;
  videoId: string;
  title: string;
  views: number;
  averageViewed: number;
  source: { file: string; sha256: string; row: number; importedAt: string };
  edit?: EditSnapshot;
};
export type AnalyticsLibrary = { version: 1; rows: AnalyticsRow[]; dismissed: string[] };
export type AnalyticsMapping = { videoId: number; title: number; views: number; averageViewed: number };
export const emptyAnalytics = (): AnalyticsLibrary => ({ version: 1, rows: [], dismissed: [] });
const text = (x: unknown, max: number): x is string => typeof x === 'string' && !!x.trim() && x.length <= max;
const finite = (x: unknown, max: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max;
const date = (x: unknown): x is string => text(x, 40) && Number.isFinite(Date.parse(x));
const day = (x: unknown): x is string => text(x, 10) && /^\d{4}-\d{2}-\d{2}$/.test(x) && date(x) && new Date(x).toISOString().slice(0, 10) === x;
const fail = (message = 'This analytics file contains invalid or unsupported data.'): never => { throw new Error(message); };

export function checkedAnalyticsContext(value: AnalyticsContext): AnalyticsContext {
  if (!value || !analyticsPlatforms.includes(value.platform) || !text(value.account, 100) || !text(value.cohort, 100) || !day(value.start) || !day(value.end) || value.start > value.end)
    return fail('Choose a platform, account, audience/report group and valid report dates.');
  return { platform: value.platform, account: value.account.trim(), cohort: value.cohort.trim(), start: value.start, end: value.end };
}
export const analyticsContextKey = (c: AnalyticsContext) => JSON.stringify([c.platform, c.account, c.cohort, c.start, c.end]);
export const analyticsRowKey = (r: AnalyticsRow) => JSON.stringify([analyticsContextKey(r.context), r.videoId]);
export const analyticsContextLabel = (c: AnalyticsContext) => `${c.platform} · ${c.account} · ${c.cohort} · ${c.start} to ${c.end}`;

function checkedSnapshot(s: EditSnapshot): EditSnapshot {
  if (!s || !text(s.projectId, 100) || !text(s.sequenceId, 100) || !text(s.label, 240) || !date(s.capturedAt) || !['portrait', 'landscape', 'square'].includes(s.format) || !finite(s.duration, 86400) || s.duration <= 0 || !Number.isInteger(s.baseClips) || s.baseClips < 1 || s.baseClips > 100000 || typeof s.captions?.enabled !== 'boolean') return fail();
  return { projectId: s.projectId, sequenceId: s.sequenceId, label: s.label, capturedAt: new Date(s.capturedAt).toISOString(), format: s.format, duration: s.duration, baseClips: s.baseClips, captions: { enabled: s.captions.enabled, style: brandStyle(s.captions.style) } };
}
export function captureAnalyticsEdit(p: Project): EditSnapshot {
  const videos = p.tracks.filter((t) => t.kind === 'video' && !t.hidden);
  const base = videos.find((t) => t.id === 'V1') ?? videos.at(-1);
  const baseClips = p.clips.filter((c) => c.trackId === base?.id && c.sourceEnd > c.sourceStart).length;
  if (!baseClips || duration(p) <= 0) return fail('Open the published video sequence with a visible base video track before linking it.');
  return checkedSnapshot({
    projectId: p.id, sequenceId: p.activeSequenceId ?? 'original',
    label: `${p.name}${p.activeSequenceId ? ` · ${p.sequences?.find((s) => s.id === p.activeSequenceId)?.name ?? p.activeSequenceId}` : ''}`.slice(0, 240),
    capturedAt: new Date().toISOString(), format: memoryFormat(p), duration: duration(p), baseClips,
    captions: { enabled: p.captions.enabled, style: brandStyle(p.captions) },
  });
}
export function validateAnalytics(value: unknown): AnalyticsLibrary {
  if (!value || typeof value !== 'object') return fail();
  const library = value as AnalyticsLibrary;
  if (library.version !== 1 || !Array.isArray(library.rows) || library.rows.length > ANALYTICS_LIMIT || !Array.isArray(library.dismissed) || library.dismissed.length > 100 || library.dismissed.some((s) => !text(s, 100))) return fail();
  const rows = library.rows.map((r) => {
    if (!r || !text(r.videoId, 200) || !text(r.title, 300) || !Number.isSafeInteger(r.views) || r.views < 0 || !finite(r.averageViewed, 1000) || !r.source || !text(r.source.file, 200) || !/^[a-f0-9]{64}$/.test(r.source.sha256) || !Number.isSafeInteger(r.source.row) || r.source.row < 2 || r.source.row > 301 || !date(r.source.importedAt)) return fail();
    return {
      context: checkedAnalyticsContext(r.context), videoId: r.videoId.trim(), title: r.title.trim(), views: r.views, averageViewed: r.averageViewed,
      source: { file: r.source.file, sha256: r.source.sha256, row: r.source.row, importedAt: new Date(r.source.importedAt).toISOString() },
      ...(r.edit !== undefined ? { edit: checkedSnapshot(r.edit) } : {}),
    };
  });
  if (new Set(rows.map(analyticsRowKey)).size !== rows.length) return fail('Duplicate videos in the same report period.');
  return { version: 1, rows, dismissed: [...new Set(library.dismissed)] };
}

export function mapAnalyticsCsv(
  csv: { headers: string[]; rows: string[][] }, mapping: AnalyticsMapping, context: AnalyticsContext,
  source: Omit<AnalyticsRow['source'], 'row'>, decimal: '.' | ',' = '.',
) {
  const checkedContext = checkedAnalyticsContext(context);
  const required = [mapping.videoId, mapping.views, mapping.averageViewed];
  if (required.some((i) => !Number.isInteger(i) || i < 0 || i >= csv.headers.length) || new Set(required).size !== required.length || (mapping.title !== -1 && (!Number.isInteger(mapping.title) || mapping.title < 0 || mapping.title >= csv.headers.length || required.includes(mapping.title))))
    return fail('Map different columns for video ID, views and average percentage viewed. Title is optional.');
  const seen = new Set<string>();
  const valid: AnalyticsRow[] = [], issues: { row: number; message: string }[] = [];
  csv.rows.forEach((cells, i) => {
    try {
      if (cells.length !== csv.headers.length) fail('Column count differs from the header.');
      const videoId = cells[mapping.videoId].trim();
      if (/^(total|totals|all videos)$/i.test(videoId)) fail('Aggregate row excluded; import individual videos only.');
      const row: AnalyticsRow = {
        context: checkedContext, videoId, title: (mapping.title >= 0 ? cells[mapping.title] : '') || videoId,
        views: analyticsNumber(cells[mapping.views], decimal, true),
        averageViewed: analyticsNumber(cells[mapping.averageViewed], decimal),
        source: { ...source, row: i + 2 },
      };
      const checked = validateAnalytics({ ...emptyAnalytics(), rows: [row] }).rows[0];
      if (seen.has(videoId)) fail('Duplicate video ID; only the first valid row is offered.');
      seen.add(videoId);
      valid.push(checked);
    } catch (e) { issues.push({ row: i + 2, message: e instanceof Error ? e.message : String(e) }); }
  });
  return { valid, issues };
}
export function mergeAnalyticsRows(current: AnalyticsLibrary, incoming: AnalyticsRow[]): AnalyticsLibrary {
  const rows = new Map(current.rows.map((r) => [analyticsRowKey(r), r]));
  for (const r of incoming) {
    const key = analyticsRowKey(r), old = rows.get(key);
    // Refresh metrics without silently recapturing the historical published edit.
    rows.set(key, { ...r, edit: old?.edit ?? r.edit });
  }
  if (rows.size > ANALYTICS_LIMIT) return fail('The library holds at most 300 video/report records. Export a backup and remove old records first.');
  return validateAnalytics({ ...current, rows: [...rows.values()] });
}
export function importAnalyticsBackup(current: AnalyticsLibrary, text: string) {
  if (text.length > 2_000_000) return fail('Choose a backup smaller than 2 MB.');
  const incoming = validateAnalytics(JSON.parse(text));
  // Existing local records win collisions, including their current links.
  const merged = mergeAnalyticsRows(incoming, current.rows);
  merged.rows = merged.rows.map((r) => current.rows.find((x) => analyticsRowKey(x) === analyticsRowKey(r)) ?? r);
  merged.dismissed = [...new Set([...incoming.dismissed, ...current.dismissed])].slice(-100);
  return validateAnalytics(merged);
}
export function readAnalytics(storage: Pick<Storage, 'getItem'> = localStorage) {
  const saved = storage.getItem(ANALYTICS_KEY);
  if (!saved) return emptyAnalytics();
  if (saved.length > 2_000_000) return fail('Saved analytics exceeds the supported size.');
  return validateAnalytics(JSON.parse(saved));
}
export function writeAnalytics(library: AnalyticsLibrary, storage: Pick<Storage, 'setItem'> = localStorage) {
  const checked = validateAnalytics(library), json = JSON.stringify(checked);
  if (json.length > 2_000_000) return fail('Analytics exceeds 2 MB. Export and remove older reports first.');
  storage.setItem(ANALYTICS_KEY, json);
  return checked;
}

export function analyticsDurationBand(seconds: number) {
  return seconds <= 30 ? 'up to 30s' : seconds <= 60 ? '30–60s' : seconds <= 180 ? '1–3min' : 'over 3min';
}
export type AnalyticsInsight = {
  id: string;
  kind: 'captions' | 'duration' | 'density';
  label: string;
  preferred: AnalyticsRow[];
  others: AnalyticsRow[];
  average: number;
  baseline: number;
  caption?: EditSnapshot['captions'];
  dismissed: boolean;
};
function insightId(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return `analytics:${input.length}:${hash >>> 0}`;
}
export function analyticsInsights(library: AnalyticsLibrary, contextKey: string, target: Pick<EditSnapshot, 'duration' | 'format'>) {
  // A view threshold is a visibility filter, not a claim of statistical significance.
  const eligible = library.rows.filter((r) => analyticsContextKey(r.context) === contextKey && r.views >= 100 && r.edit?.format === target.format);
  const insights: AnalyticsInsight[] = [];
  function compare(kind: AnalyticsInsight['kind'], rows: AnalyticsRow[], group: (r: AnalyticsRow) => { key: string; label: string; caption?: EditSnapshot['captions'] }) {
    const groups = new Map<string, { rows: AnalyticsRow[]; label: string; caption?: EditSnapshot['captions'] }>();
    for (const row of rows) {
      const value = group(row), g = groups.get(value.key) ?? { rows: [], label: value.label, caption: value.caption };
      g.rows.push(row); groups.set(value.key, g);
    }
    const mean = (rows: AnalyticsRow[]) => rows.reduce((sum, r) => sum + r.averageViewed, 0) / rows.length;
    const candidates = [...groups.entries()].filter(([, g]) => g.rows.length >= 2 && rows.length - g.rows.length >= 2).sort((a, b) => mean(b[1].rows) - mean(a[1].rows) || a[0].localeCompare(b[0]));
    const best = candidates[0];
    if (!best) return;
    const [key, value] = best, other = rows.filter((r) => !value.rows.includes(r));
    const average = mean(value.rows), baseline = mean(other);
    if (average - baseline < 1) return;
    const id = insightId(JSON.stringify([contextKey, target.format, kind, kind === 'duration' ? null : analyticsDurationBand(target.duration), key]));
    insights.push({ id, kind, label: value.label, preferred: value.rows, others: other, average, baseline, caption: value.caption ? structuredClone(value.caption) : undefined, dismissed: library.dismissed.includes(id) });
  }
  const similarDuration = eligible.filter((r) => analyticsDurationBand(r.edit!.duration) === analyticsDurationBand(target.duration));
  compare('captions', similarDuration, (r) => ({
    key: JSON.stringify(r.edit!.captions.enabled ? r.edit!.captions : { enabled: false }),
    label: r.edit!.captions.enabled ? `${r.edit!.captions.style.preset} captions · ${r.edit!.captions.style.appearance?.fontFamily} · ${r.edit!.captions.style.position}` : 'Captions off',
    caption: r.edit!.captions,
  }));
  compare('duration', eligible, (r) => ({ key: analyticsDurationBand(r.edit!.duration), label: `Timeline duration: ${analyticsDurationBand(r.edit!.duration)}` }));
  compare('density', similarDuration, (r) => {
    const rate = r.edit!.baseClips * 60 / r.edit!.duration;
    const band = rate <= 6 ? 'up to 6' : rate <= 20 ? '6–20' : 'over 20';
    return { key: band, label: `Base-track clips per minute: ${band}` };
  });
  return { eligible, insights };
}
