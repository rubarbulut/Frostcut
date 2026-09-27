import { describe, expect, it } from 'vitest';
import { addMedia, createProject, type CaptionPreset } from './model';
import { analyticsCsv, analyticsNumber } from './analytics-csv';
import {
  ANALYTICS_KEY,
  analyticsContextKey,
  analyticsInsights,
  captureAnalyticsEdit,
  checkedAnalyticsContext,
  emptyAnalytics,
  importAnalyticsBackup,
  mapAnalyticsCsv,
  mergeAnalyticsRows,
  readAnalytics,
  validateAnalytics,
  writeAnalytics,
  type AnalyticsContext,
  type AnalyticsRow,
} from './analytics';

const context: AnalyticsContext = {
  platform: 'YouTube',
  account: 'Test channel',
  cohort: 'Organic Shorts',
  start: '2026-09-01',
  end: '2026-09-27',
};
const source = {
  file: 'report.csv',
  sha256: 'a'.repeat(64),
  importedAt: '2026-09-27T10:00:00.000Z',
};
const mapping = { videoId: 0, title: 1, views: 2, averageViewed: 3 };
function project(id: string, seconds = 25, preset: CaptionPreset = 'Clean') {
  const p = addMedia(createProject(id), {
    id: 'source',
    name: 'source.mp4',
    duration: seconds,
    width: 1080,
    height: 1920,
    size: 1000,
    type: 'video/mp4',
  });
  p.captions.preset = preset;
  p.captions.enabled = true;
  return p;
}
const row = (
  id: string,
  viewed = 70,
  preset: CaptionPreset = 'Clean',
  seconds = 25,
): AnalyticsRow => ({
  context,
  videoId: id,
  title: `Video ${id}`,
  views: 100,
  averageViewed: viewed,
  source: { ...source, row: 2 },
  edit: captureAnalyticsEdit(project(id, seconds, preset)),
});

describe('analytics CSV import', () => {
  it('reads quoted delimiters, escaped quotes, embedded newlines, BOM and original record positions', () => {
    const csv = analyticsCsv(
      '\uFEFFid,title,views,percent\r\n\r\na,"A, \"\"quoted\"\"\nheading",123,72.5\r\nb,B,456,125\r\n',
    );
    expect(csv.headers).toEqual(['id', 'title', 'views', 'percent']);
    expect(csv.rows[0][1]).toBe('A, "quoted"\nheading');
    expect(csv.recordNumbers).toEqual([3, 4]);
    const mapped = mapAnalyticsCsv(csv, mapping, context, source);
    expect(mapped.issues).toEqual([]);
    expect(mapped.valid.map((r) => [r.source.row, r.averageViewed])).toEqual([
      [3, 72.5],
      [4, 125],
    ]);
    expect(analyticsCsv('id;title;views;percent\na;A;100;72,5', ';').rows[0][3]).toBe('72,5');
    expect(analyticsNumber('72,5%', ',')).toBe(72.5);
  });

  it('reports malformed, missing, duplicate and aggregate rows without manufacturing zero metrics', () => {
    const csv = analyticsCsv(
      'id,title,views,percent\na,A,100,70\na,A,200,80\nTotal,Total,1000,50\nb,B,,60\nc,C,100,\nd,D,not-a-number,50\ne,E,100,-1\nf,F,100,70,extra',
    );
    const result = mapAnalyticsCsv(csv, mapping, context, source);
    expect(result.valid.map((r) => r.videoId)).toEqual(['a']);
    expect(result.issues.map((i) => i.row)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(result.issues[1].message).toContain('Aggregate');
    expect(() => mapAnalyticsCsv(csv, { ...mapping, views: 0 }, context, source)).toThrow(
      'different columns',
    );
    expect(() => checkedAnalyticsContext({ ...context, start: '2026-02-30' })).toThrow(
      'valid report dates',
    );
    expect(() => checkedAnalyticsContext({ ...context, end: '2025-01-01' })).toThrow();
  });

  it('rejects ambiguous numbers, broken quotes and excessive input before importing', () => {
    expect(() => analyticsNumber('1,000', '.', true)).toThrow();
    expect(() => analyticsNumber('72.5', ',')).toThrow('decimal separator');
    expect(() => analyticsNumber('', '.')).toThrow();
    expect(() => analyticsCsv('id,title\na,"unclosed')).toThrow('unclosed');
    expect(() => analyticsCsv('id,title\na,b"c')).toThrow('quoting');
    expect(() => analyticsCsv('x'.repeat(1_000_001))).toThrow('1 MB');
    expect(() => analyticsCsv('id,title\n' + 'a,b\n'.repeat(301))).toThrow('300');
    expect(() =>
      analyticsCsv(Array.from({ length: 101 }, (_, i) => `h${i}`).join(',') + '\na,b'),
    ).toThrow('100 columns');
  });
});

describe('linked performance records', () => {
  it('captures detached published-edit settings without footage or transcript content', () => {
    const p = project('Published'),
      captured = captureAnalyticsEdit(p);
    expect(captured).toMatchObject({ format: 'portrait', duration: 25, baseClips: 1 });
    expect(captured).not.toHaveProperty('media');
    expect(captured).not.toHaveProperty('transcripts');
    p.captions.preset = 'Brainrot';
    expect(captured.captions.style.preset).toBe('Clean');
    expect(() => captureAnalyticsEdit(createProject())).toThrow('visible base video track');
  });

  it('updates matching metrics while preserving their historical edit; separates dates and channels', () => {
    const first = row('a'),
      changed = { ...row('a', 82, 'Bold'), views: 2500 };
    const current = { ...emptyAnalytics(), rows: [first] };
    const refreshed = mergeAnalyticsRows(current, [changed]);
    expect(refreshed.rows).toHaveLength(1);
    expect(refreshed.rows[0]).toMatchObject({ views: 2500, averageViewed: 82 });
    expect(refreshed.rows[0].edit?.captions.style.preset).toBe('Clean');
    expect(refreshed.rows[0].edit).not.toBe(first.edit);
    const periods = mergeAnalyticsRows(refreshed, [
      { ...changed, context: { ...context, end: '2026-09-26' } },
      { ...changed, context: { ...context, account: 'Second channel' } },
    ]);
    expect(periods.rows).toHaveLength(3);
    // A local unlink is also a decision: an imported old backup must not reattach it.
    const unlinked = { ...refreshed, rows: [{ ...refreshed.rows[0], edit: undefined }] };
    const restored = importAnalyticsBackup(unlinked, JSON.stringify(current));
    expect(restored.rows[0].edit).toBeUndefined();
    expect(restored.rows[0].views).toBe(2500);
  });

  it('validates backups, strips unrelated data and leaves existing storage intact on invalid writes', () => {
    const library = { ...emptyAnalytics(), rows: [row('a')] };
    const valid = validateAnalytics({
      ...library,
      media: 'not analytics',
      rows: [{ ...library.rows[0], prompts: 'discard' }],
    });
    expect(valid).not.toHaveProperty('media');
    expect(valid.rows[0]).not.toHaveProperty('prompts');
    const values = new Map<string, string>(),
      storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      };
    expect(readAnalytics(storage)).toEqual(emptyAnalytics());
    writeAnalytics(library, storage);
    expect(readAnalytics(storage)).toEqual(valid);
    for (const rows of [
      [library.rows[0], library.rows[0]],
      [{ ...row('a'), averageViewed: -1 }],
      [{ ...row('a'), views: 1.5 }],
      [{ ...row('a'), source: { ...source, row: 2, sha256: 'bad' } }],
      [{ ...row('a'), edit: { ...row('a').edit, duration: 0 } }],
    ])
      expect(() => writeAnalytics({ ...library, rows } as typeof library, storage)).toThrow();
    expect(readAnalytics(storage)).toEqual(valid);
    expect(() =>
      writeAnalytics(library, {
        setItem: () => {
          throw new Error('Quota exceeded');
        },
      }),
    ).toThrow('Quota');
    values.set(ANALYTICS_KEY, 'corrupt');
    expect(() => readAnalytics(storage)).toThrow();
    expect(() => importAnalyticsBackup(library, 'x'.repeat(2_000_001))).toThrow('2 MB');
  });
});

describe('traceable performance comparisons', () => {
  it('computes equal-video means with exact evidence, no hidden view weighting, and detached settings', () => {
    const rows = [
      row('a', 90),
      { ...row('b', 70), views: 100000 },
      row('c', 50, 'Bold'),
      row('d', 60, 'Bold'),
    ];
    const library = { ...emptyAnalytics(), rows };
    const result = analyticsInsights(library, analyticsContextKey(context), {
      format: 'portrait',
      duration: 25,
    });
    const caption = result.insights.find((i) => i.kind === 'captions')!;
    expect(caption.average).toBe(80);
    expect(caption.baseline).toBe(55);
    expect(caption.preferred.map((r) => r.videoId)).toEqual(['a', 'b']);
    expect(caption.others.map((r) => r.videoId)).toEqual(['c', 'd']);
    caption.caption!.style.preset = 'Brainrot';
    expect(rows[0].edit?.captions.style.preset).toBe('Clean');
    library.dismissed = [caption.id];
    expect(
      analyticsInsights(library, analyticsContextKey(context), { format: 'portrait', duration: 25 })
        .insights[0].dismissed,
    ).toBe(true);
  });

  it('requires two videos on each side and excludes low views, unlinked and mismatched reports/formats', () => {
    const rows = [row('a', 90), row('b', 80), row('c', 60, 'Bold')];
    const target = { format: 'portrait' as const, duration: 25 },
      key = analyticsContextKey(context);
    expect(analyticsInsights({ ...emptyAnalytics(), rows }, key, target).insights).toEqual([]);
    const variants = [
      { ...row('d', 50, 'Bold'), views: 99 },
      { ...row('d', 50, 'Bold'), edit: undefined },
      { ...row('d', 50, 'Bold'), context: { ...context, account: 'Other' } },
      { ...row('d', 50, 'Bold'), context: { ...context, end: '2026-09-26' } },
      { ...row('d', 50, 'Bold'), edit: { ...row('d').edit!, format: 'landscape' as const } },
    ];
    for (const r of variants)
      expect(
        analyticsInsights({ ...emptyAnalytics(), rows: [...rows, r] }, key, target).insights,
      ).toEqual([]);
    expect(
      analyticsInsights({ ...emptyAnalytics(), rows: [...rows, row('d', 50, 'Bold')] }, key, target)
        .insights,
    ).toHaveLength(1);
  });

  it('compares duration separately while caption and density evidence stays in the current duration band', () => {
    const rows = [row('a', 90), row('b', 80), row('c', 50, 'Bold', 90), row('d', 60, 'Bold', 90)];
    const result = analyticsInsights({ ...emptyAnalytics(), rows }, analyticsContextKey(context), {
      format: 'portrait',
      duration: 25,
    });
    expect(result.insights.map((i) => i.kind)).toEqual(['duration']);
    expect(result.insights[0].label).toContain('up to 30s');
    const densityRows = rows.map((r, i) => ({
      ...r,
      edit: {
        ...r.edit!,
        duration: 25,
        baseClips: i < 2 ? 2 : 15,
        captions: rows[0].edit!.captions,
      },
    }));
    const density = analyticsInsights(
      { ...emptyAnalytics(), rows: densityRows },
      analyticsContextKey(context),
      { format: 'portrait', duration: 25 },
    );
    expect(density.insights.map((i) => i.kind)).toEqual(['density']);
    expect(density.insights[0].label).toContain('up to 6');
  });
});
