import { useEffect, useMemo, useRef, useState } from 'react';
import { Field } from './components';
import { downloadBlob, useEditor } from './store';
import { brandStyle } from './brand-kits';
import { analyticsCsv } from './analytics-csv';
import {
  ANALYTICS_KEY,
  analyticsContextKey,
  analyticsContextLabel,
  analyticsDurationBand,
  analyticsInsights,
  analyticsPlatforms,
  analyticsRowKey,
  captureAnalyticsEdit,
  emptyAnalytics,
  importAnalyticsBackup,
  mapAnalyticsCsv,
  mergeAnalyticsRows,
  readAnalytics,
  writeAnalytics,
  type AnalyticsContext,
  type AnalyticsLibrary,
  type AnalyticsMapping,
  type EditSnapshot,
} from './analytics';
import './analytics.css';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const blankMapping = (): AnalyticsMapping => ({
  videoId: -1,
  title: -1,
  views: -1,
  averageViewed: -1,
});
function initial() {
  try {
    return { library: readAnalytics(), error: '', blocked: false };
  } catch (e) {
    return {
      library: emptyAnalytics(),
      error: `Saved analytics could not be read: ${message(e)}`,
      blocked: true,
    };
  }
}
type CsvFile = { text: string; file: string; sha256: string; importedAt: string };
export function AnalyticsTools() {
  const p = useEditor((s) => s.project);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState('');
  const [context, setContext] = useState<AnalyticsContext>({
    platform: 'YouTube',
    account: '',
    cohort: 'All traffic',
    start: '',
    end: new Date().toISOString().slice(0, 10),
  });
  const [file, setFile] = useState<CsvFile>();
  const [delimiter, setDelimiter] = useState(',');
  const [decimal, setDecimal] = useState<'.' | ','>('.');
  const [mapping, setMapping] = useState(blankMapping);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [report, setReport] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [link, setLink] = useState<{ key: string; title: string; edit: EditSnapshot }>();
  const [confirmed, setConfirmed] = useState(false);
  const csvInput = useRef<HTMLInputElement>(null),
    backupInput = useRef<HTMLInputElement>(null),
    reading = useRef(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const reload = (e: StorageEvent) => {
      if (e.key === ANALYTICS_KEY || e.key === null) setSaved(initial());
    };
    window.addEventListener('storage', reload);
    return () => {
      reading.current++;
      window.removeEventListener('storage', reload);
    };
  }, []);

  function mutate(change: (current: AnalyticsLibrary) => AnalyticsLibrary, notice: string) {
    try {
      const library = writeAnalytics(change(readAnalytics()));
      setSaved({ library, error: '', blocked: false });
      setStatus(notice);
      return true;
    } catch (e) {
      setSaved((s) => ({ ...s, error: message(e) }));
      setStatus('');
      return false;
    }
  }
  const parsed = useMemo(() => {
    if (!file) return;
    try {
      return { value: analyticsCsv(file.text, delimiter), error: '' };
    } catch (e) {
      return { value: undefined, error: message(e) };
    }
  }, [file, delimiter]);
  const preview = useMemo(() => {
    if (!parsed?.value || !file) return;
    try {
      return { ...mapAnalyticsCsv(parsed.value, mapping, context, file, decimal), error: '' };
    } catch (e) {
      return { valid: [], issues: [], error: message(e) };
    }
  }, [parsed, file, mapping, context, decimal]);
  const importRows = preview?.valid.filter((r) => !excluded.includes(r.source.row)) ?? [];
  const contexts = useMemo(
    () => [
      ...new Map(
        saved.library.rows.map((r) => [analyticsContextKey(r.context), r.context]),
      ).entries(),
    ],
    [saved.library],
  );
  const activeReport = contexts.some(([key]) => key === report) ? report : (contexts[0]?.[0] ?? '');
  const reportRows = saved.library.rows.filter(
    (r) => analyticsContextKey(r.context) === activeReport,
  );
  const current = useMemo(() => {
    try {
      return captureAnalyticsEdit(p);
    } catch {
      return undefined;
    }
  }, [p]);
  const result = useMemo(
    () => (current ? analyticsInsights(saved.library, activeReport, current) : undefined),
    [saved.library, activeReport, current],
  );
  const visibleInsights = result?.insights.filter((i) => !i.dismissed) ?? [];
  const columns: [keyof AnalyticsMapping, string][] = [
    ['videoId', 'Video ID (required)'],
    ['title', 'Video title (optional)'],
    ['views', 'Views (required)'],
    ['averageViewed', 'Average percentage viewed (required)'],
  ];

  return (
    <div className="creator-section analytics-tools">
      <p>
        Import your actual video results, then link each video to its published edit. Compare
        observed caption, duration and clip-density choices across your own videos. Everything stays
        in this browser.
      </p>
      <small className="subtle">
        This compares imported results; it does not predict performance or establish cause and
        effect. Topic, audience, video age and distribution can change results.
      </small>
      {saved.error && (
        <p role="alert">
          {saved.error} No successful save is claimed. Keep your source report or backup.
        </p>
      )}
      <details open={!saved.library.rows.length}>
        <summary>Import performance CSV</summary>
        <div className="analytics-fields">
          <Field label="Platform">
            <select
              value={context.platform}
              onChange={(e) =>
                setContext({ ...context, platform: e.target.value as AnalyticsContext['platform'] })
              }
            >
              {analyticsPlatforms.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Channel / account">
            <input
              maxLength={100}
              value={context.account}
              onChange={(e) => setContext({ ...context, account: e.target.value })}
              placeholder="Your channel name"
            />
          </Field>
          <Field label="Audience / report group">
            <input
              maxLength={100}
              value={context.cohort}
              onChange={(e) => setContext({ ...context, cohort: e.target.value })}
              placeholder="For example: organic Shorts"
            />
          </Field>
          <Field label="Report period starts">
            <input
              type="date"
              value={context.start}
              onChange={(e) => setContext({ ...context, start: e.target.value })}
            />
          </Field>
          <Field label="Report period ends">
            <input
              type="date"
              value={context.end}
              onChange={(e) => setContext({ ...context, end: e.target.value })}
            />
          </Field>
          <Field label="Column delimiter">
            <select
              value={delimiter}
              onChange={(e) => {
                setDelimiter(e.target.value);
                setMapping(blankMapping());
                setExcluded([]);
              }}
            >
              <option value=",">Comma</option>
              <option value=";">Semicolon</option>
              <option value={'\t'}>Tab</option>
            </select>
          </Field>
          <Field label="Decimal separator">
            <select value={decimal} onChange={(e) => setDecimal(e.target.value as '.' | ',')}>
              <option value=".">Period (72.5)</option>
              <option value=",">Comma (72,5)</option>
            </select>
          </Field>
        </div>
        <p className="subtle">
          Use one row per video, a stable video ID, and the same report period and audience filter.
          Enter percentages as 72.5 for 72.5%, not 0.725. Plain numbers only; remove thousands
          separators. Replay values above 100% are supported up to 1000%.
        </p>
        <div className="button-row">
          <button
            className="secondary"
            disabled={busy || saved.blocked}
            onClick={() => csvInput.current?.click()}
          >
            {busy ? 'Reading file…' : 'Choose CSV'}
          </button>
          <button
            className="text-button"
            onClick={() =>
              downloadBlob(
                new Blob(['video_id,title,views,average_percentage_viewed\n'], {
                  type: 'text/csv;charset=utf-8',
                }),
                'frostcut-analytics-template.csv',
              )
            }
          >
            Download empty CSV template
          </button>
        </div>
        <input
          hidden
          ref={csvInput}
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          aria-label="Import analytics CSV"
          onChange={async (e) => {
            const chosen = e.target.files?.[0];
            e.target.value = '';
            if (!chosen) return;
            const request = ++reading.current;
            if (chosen.size > 1_000_000) {
              setBusy(false);
              setFile(undefined);
              setStatus('Choose a CSV smaller than 1 MB.');
              return;
            }
            setBusy(true);
            setFile(undefined);
            try {
              const bytes = await chosen.arrayBuffer();
              const hash = await crypto.subtle.digest('SHA-256', bytes);
              if (request !== reading.current) return;
              setFile({
                text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
                file: chosen.name.slice(0, 200),
                sha256: [...new Uint8Array(hash)]
                  .map((v) => v.toString(16).padStart(2, '0'))
                  .join(''),
                importedAt: new Date().toISOString(),
              });
              setMapping(blankMapping());
              setExcluded([]);
              setStatus('Map your report columns and review the rows before importing.');
            } catch (e) {
              if (request === reading.current) setStatus(`Could not read UTF-8 CSV: ${message(e)}`);
            } finally {
              if (request === reading.current) setBusy(false);
            }
          }}
        />
        {file && <p>Selected: {file.file}</p>}
        {parsed?.error && <p role="alert">{parsed.error}</p>}
        {parsed?.value && (
          <div className="analytics-fields">
            {columns.map(([key, label]) => (
              <Field key={key} label={label}>
                <select
                  value={mapping[key]}
                  onChange={(e) => {
                    setMapping({ ...mapping, [key]: Number(e.target.value) });
                    setExcluded([]);
                  }}
                >
                  <option value={-1}>{key === 'title' ? 'Use video ID' : 'Choose column'}</option>
                  {parsed.value!.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {i + 1}: {h || '(blank heading)'}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        )}
        {preview?.error && <p role="status">{preview.error}</p>}
        {!!preview?.issues.length && (
          <details>
            <summary>{preview.issues.length} invalid or aggregate rows will be skipped</summary>
            <ul>
              {preview.issues.map((i) => (
                <li key={i.row}>
                  Record {i.row}: {i.message}
                </li>
              ))}
            </ul>
          </details>
        )}
        {!!preview?.valid.length && (
          <>
            <div className="analytics-table">
              <table>
                <caption>
                  Review import rows. Uncheck totals or videos you do not want to include.
                </caption>
                <thead>
                  <tr>
                    <th>Include</th>
                    <th>Video</th>
                    <th>Views</th>
                    <th>Average viewed</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.valid.map((r) => (
                    <tr key={r.source.row}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Include ${r.title}`}
                          checked={!excluded.includes(r.source.row)}
                          onChange={(e) =>
                            setExcluded(
                              e.target.checked
                                ? excluded.filter((n) => n !== r.source.row)
                                : [...excluded, r.source.row],
                            )
                          }
                        />
                      </td>
                      <td>
                        {r.title}
                        <small>
                          {r.videoId} · record {r.source.row}
                        </small>
                      </td>
                      <td>{r.views.toLocaleString()}</td>
                      <td>{r.averageViewed}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="primary"
              disabled={!importRows.length || saved.blocked}
              onClick={() => {
                if (
                  mutate(
                    (m) => mergeAnalyticsRows(m, importRows),
                    `Imported ${importRows.length} video records. Matching video/report IDs update metrics while keeping linked edits.`,
                  )
                ) {
                  setReport(analyticsContextKey(importRows[0].context));
                  setFile(undefined);
                }
              }}
            >
              Import {importRows.length} selected rows
            </button>
          </>
        )}
      </details>
      <div className="button-row">
        <button
          className="secondary"
          disabled={!saved.library.rows.length}
          onClick={() =>
            downloadBlob(
              new Blob([JSON.stringify(saved.library, null, 2)], { type: 'application/json' }),
              'frostcut-analytics.json',
            )
          }
        >
          Export analytics backup
        </button>
        <button
          className="secondary"
          disabled={busy || saved.blocked}
          onClick={() => backupInput.current?.click()}
        >
          Merge JSON backup
        </button>
        <button
          className="text-button"
          onClick={() => {
            const next = initial();
            setSaved(next);
            setStatus(next.error ? '' : 'Reloaded analytics from this browser.');
          }}
        >
          Reload saved analytics
        </button>
      </div>
      <input
        ref={backupInput}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Import analytics backup"
        onChange={async (e) => {
          const chosen = e.target.files?.[0];
          e.target.value = '';
          if (!chosen) return;
          if (chosen.size > 2_000_000) {
            setStatus('Choose a backup smaller than 2 MB.');
            return;
          }
          const request = ++reading.current;
          setBusy(true);
          try {
            const text = await chosen.text();
            if (request === reading.current)
              mutate(
                (m) => importAnalyticsBackup(m, text),
                'Backup merged. Existing local records won ID collisions.',
              );
          } catch (e) {
            if (request === reading.current) setStatus(message(e));
          } finally {
            if (request === reading.current) setBusy(false);
          }
        }}
      />
      {!!contexts.length && (
        <Field label="Report to compare">
          <select
            value={activeReport}
            onChange={(e) => {
              setReport(e.target.value);
              setShowAll(false);
              setLink(undefined);
            }}
          >
            {contexts.map(([key, c]) => (
              <option key={key} value={key}>
                {analyticsContextLabel(c)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <p>
        <b>{saved.library.rows.length}</b> saved video/report records ·{' '}
        {reportRows.filter((r) => r.edit).length} linked in this report.
      </p>
      {!!reportRows.length && (
        <div className="analytics-table">
          <table>
            <caption>
              Link only the edit that matches the published video; links are saved snapshots.
            </caption>
            <thead>
              <tr>
                <th>Video / source</th>
                <th>Results</th>
                <th>Published edit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.slice(0, showAll ? undefined : 30).map((r) => (
                <tr key={analyticsRowKey(r)}>
                  <td>
                    {r.title}
                    <small>{r.videoId}</small>
                    <details>
                      <summary>Source</summary>
                      <p>
                        {r.source.file} · CSV record {r.source.row}
                        <br />
                        Imported {new Date(r.source.importedAt).toLocaleString()}
                      </p>
                      <code>{r.source.sha256}</code>
                    </details>
                  </td>
                  <td>
                    {r.views.toLocaleString()} views<small>{r.averageViewed}% average viewed</small>
                    {r.views < 100 && <small>Excluded from learning: under 100 views</small>}
                  </td>
                  <td>
                    {r.edit ? (
                      <>
                        {r.edit.label}
                        <small>
                          {r.edit.duration.toFixed(1)}s · {r.edit.format} · {r.edit.baseClips}{' '}
                          base-track clips
                        </small>
                        <small>
                          {r.edit.captions.enabled
                            ? r.edit.captions.style.preset + ' captions'
                            : 'Captions off'}
                        </small>
                        <small>Captured {new Date(r.edit.capturedAt).toLocaleString()}</small>
                      </>
                    ) : (
                      'Not linked'
                    )}
                  </td>
                  <td>
                    <div className="analytics-actions">
                      <button
                        className="secondary"
                        disabled={!current || saved.blocked}
                        onClick={() => {
                          if (current) {
                            setLink({
                              key: analyticsRowKey(r),
                              title: r.title,
                              edit: structuredClone(current),
                            });
                            setConfirmed(false);
                          }
                        }}
                      >
                        {r.edit ? 'Review replacement link' : 'Link current edit'}
                      </button>
                      {r.edit && (
                        <button
                          className="text-button"
                          disabled={saved.blocked}
                          onClick={() =>
                            mutate(
                              (m) => ({
                                ...m,
                                rows: m.rows.map((x) =>
                                  analyticsRowKey(x) === analyticsRowKey(r)
                                    ? { ...x, edit: undefined }
                                    : x,
                                ),
                              }),
                              'Edit link removed; source metrics kept.',
                            )
                          }
                        >
                          Unlink
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={saved.blocked}
                        onClick={() =>
                          mutate(
                            (m) => ({
                              ...m,
                              rows: m.rows.filter((x) => analyticsRowKey(x) !== analyticsRowKey(r)),
                            }),
                            'Analytics record removed.',
                          )
                        }
                      >
                        Remove record
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reportRows.length > 30 && (
        <button className="text-button" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show first 30' : `Show all ${reportRows.length} records`}
        </button>
      )}
      {link && (
        <section className="analytics-card" aria-label="Confirm published edit link">
          <b>
            Link “{link.title}” to “{link.edit.label}”
          </b>
          <p>
            {link.edit.duration.toFixed(1)}s · {link.edit.format} · {link.edit.baseClips} base-track
            clips ·{' '}
            {link.edit.captions.enabled
              ? link.edit.captions.style.preset + ' captions'
              : 'captions off'}
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            This captured edit matches the video that produced these results.
          </label>
          <div className="button-row">
            <button
              className="primary"
              disabled={!confirmed || saved.blocked}
              onClick={() => {
                if (
                  mutate((m) => {
                    if (!m.rows.some((r) => analyticsRowKey(r) === link.key))
                      throw new Error('This record was removed. Select another video.');
                    return {
                      ...m,
                      rows: m.rows.map((r) =>
                        analyticsRowKey(r) === link.key ? { ...r, edit: link.edit } : r,
                      ),
                    };
                  }, 'Published edit snapshot linked. Future project edits will not rewrite it.')
                )
                  setLink(undefined);
              }}
            >
              Save verified link
            </button>
            <button className="secondary" onClick={() => setLink(undefined)}>
              Cancel
            </button>
          </div>
        </section>
      )}
      <section aria-label="Analytics observations">
        <b>Learn from linked results</b>
        <p className="subtle">
          Each comparison uses the selected report, at least two videos in the suggested group and
          two others, at least 100 views per video, and the current video format. Caption and
          clip-density comparisons also use its duration band. Averages give each video one vote,
          regardless of view count. The 100-view filter is not a statistical confidence threshold.
        </p>
        {current ? (
          <p>
            Current edit: {current.format} · {analyticsDurationBand(current.duration)}.{' '}
            {result?.eligible.length ?? 0} eligible linked videos in this report.
          </p>
        ) : (
          <p>Open a video sequence to see relevant comparisons and link published edits.</p>
        )}
        {!visibleInsights.length && (
          <p className="subtle">
            No visible comparison meets these rules with a difference of at least 1 percentage
            point. Import/link more comparable results or restore dismissed observations.
          </p>
        )}
        {visibleInsights.map((i) => (
          <article className="analytics-card" key={i.id}>
            <b>Observed pattern: {i.label}</b>
            <p>
              {i.average.toFixed(1)}% mean viewed across {i.preferred.length} videos versus{' '}
              {i.baseline.toFixed(1)}% across {i.others.length} other videos (
              {(i.average - i.baseline).toFixed(1)} percentage points higher).
            </p>
            <details>
              <summary>Evidence and exact settings</summary>
              <p>Suggested group:</p>
              <ul>
                {i.preferred.map((r) => (
                  <li key={analyticsRowKey(r)}>
                    {r.title} ({r.videoId}): {r.averageViewed}% · {r.views.toLocaleString()} views ·{' '}
                    {r.source.file}, record {r.source.row}
                  </li>
                ))}
              </ul>
              <p>Other videos:</p>
              <ul>
                {i.others.map((r) => (
                  <li key={analyticsRowKey(r)}>
                    {r.title} ({r.videoId}): {r.averageViewed}% · {r.views.toLocaleString()} views ·{' '}
                    {r.source.file}, record {r.source.row}
                  </li>
                ))}
              </ul>
              {i.caption && <pre>{JSON.stringify(i.caption, null, 2)}</pre>}
            </details>
            <div className="button-row">
              {i.caption && (
                <button
                  className="secondary"
                  onClick={() => {
                    const editor = useEditor.getState();
                    editor.commit(
                      {
                        ...editor.project,
                        captions: {
                          ...editor.project.captions,
                          ...brandStyle(i.caption!.style),
                          enabled: i.caption!.enabled,
                        },
                      },
                      'Try caption settings from imported analytics',
                    );
                    setStatus(
                      'Caption settings applied. Review the preview; Undo restores the previous settings.',
                    );
                  }}
                >
                  Try these caption settings
                </button>
              )}
              <button
                className="text-button"
                disabled={saved.blocked}
                onClick={() =>
                  mutate(
                    (m) => ({ ...m, dismissed: [...new Set([...m.dismissed, i.id])].slice(-100) }),
                    'Observation dismissed.',
                  )
                }
              >
                Dismiss observation
              </button>
            </div>
            {i.kind !== 'captions' && (
              <small>
                Use this as an idea for your next edit. Timeline timing has not been changed.
              </small>
            )}
          </article>
        ))}
      </section>
      <div className="button-row">
        <button
          className="secondary"
          disabled={!saved.library.dismissed.length || saved.blocked}
          onClick={() =>
            mutate((m) => ({ ...m, dismissed: [] }), 'Dismissed observations restored.')
          }
        >
          Show dismissed observations
        </button>
        <button
          className="text-button"
          onClick={() => {
            try {
              const library = writeAnalytics(emptyAnalytics());
              setSaved({ library, error: '', blocked: false });
              setLink(undefined);
              setStatus('Analytics cleared. Project edits are unchanged.');
            } catch (e) {
              setSaved((s) => ({ ...s, error: message(e) }));
            }
          }}
        >
          Clear local analytics
        </button>
      </div>
      <small className="subtle">
        Export a backup before clearing. Stores up to 300 video/report records, source
        filenames/hashes and linked edit settings. No footage or transcript is stored here; no
        analytics account is connected.
      </small>
      {status && <p role="status">{status}</p>}
    </div>
  );
}
