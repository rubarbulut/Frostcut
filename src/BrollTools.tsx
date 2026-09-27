import { useEffect, useRef, useState } from 'react';
import { useEditor, registerMedia } from './store';
import { brollSuggestions } from './publishing';
import { searchStock, downloadStock, insertBroll, type StockVideo } from './stock';
import { inspectMedia } from './media';
import { Field } from './components';
import { duration, timecode } from './model';
export function BrollTools() {
  const { project: p, playhead, commit, select, seek, mediaChanged } = useEditor(),
    suggestions = brollSuggestions(p);
  const [query, setQuery] = useState(''),
    [start, setStart] = useState(playhead),
    [end, setEnd] = useState(Math.min(duration(p), playhead + 4));
  const [results, setResults] = useState<StockVideo[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function search() {
    const c = new AbortController();
    abort.current = c;
    setBusy(true);
    setError('');
    setResults([]);
    try {
      setStatus('Searching Wikimedia Commons…');
      const found = await searchStock(query, c.signal);
      setResults(found);
      setStatus(
        found.length
          ? `${found.length} playable sources under 100 MB. Review the source and license before inserting.`
          : 'No supported small videos found. Try a broader English search term.',
      );
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof TypeError
            ? 'Could not reach Wikimedia Commons. Check your connection and try again.'
            : (e as Error).message,
        );
      else setStatus('Cancelled.');
    } finally {
      setBusy(false);
    }
  }
  async function insert(video: StockVideo) {
    const c = new AbortController();
    abort.current = c;
    setBusy(true);
    setError('');
    const base = p;
    try {
      if (p.tracks.find((t) => t.id === 'V2')?.locked)
        throw new Error('Unlock V2 before inserting B-roll.');
      const file = await downloadStock(video, c.signal, setStatus);
      const asset = { ...(await inspectMedia(file)), attribution: video.attribution };
      c.signal.throwIfAborted();
      if (useEditor.getState().project !== base)
        throw new Error('The timeline changed during download. Search and insert again.');
      const next = insertBroll(base, asset, start, end);
      registerMedia(asset, file);
      commit(next, 'Insert licensed B-roll', true);
      mediaChanged();
      select([next.clips.at(-1)!.id]);
      seek(start);
      setStatus(
        'Inserted silently on V2. Resize or trim it in Properties. Credits are saved with the media and available in Publish.',
      );
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof TypeError
            ? 'Could not download this source. Check your connection or choose another clip.'
            : (e as Error).message,
        );
      else setStatus('Cancelled.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="creator-section">
      <p>
        Illustrate a phrase with stock footage. Suggestions use transcript keywords; you choose the
        footage and timing. Only your search query is sent to Wikimedia Commons.
      </p>
      {suggestions.length > 0 && (
        <div className="broll-suggestions">
          {suggestions.map((s, i) => (
            <button
              className="secondary"
              key={i}
              disabled={busy}
              onClick={() => {
                setQuery(s.query);
                setStart(s.start);
                setEnd(s.end);
              }}
            >
              <b>{timecode(s.start, true)}</b> {s.text}
            </button>
          ))}
        </div>
      )}
      <form
        className="button-row"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Field label="Stock video search">
          <input
            maxLength={120}
            value={query}
            disabled={busy}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ocean, city, camera…"
          />
        </Field>
        <button className="primary" disabled={busy || !query.trim()}>
          Search free footage
        </button>
      </form>
      <div className="creator-grid">
        <Field label="B-roll start (s)">
          <input
            type="number"
            min={0}
            max={duration(p)}
            step={0.1}
            value={start}
            disabled={busy}
            onChange={(e) => setStart(+e.target.value)}
          />
        </Field>
        <Field label="B-roll end (s)">
          <input
            type="number"
            min={start + 0.1}
            max={duration(p)}
            step={0.1}
            value={end}
            disabled={busy}
            onChange={(e) => setEnd(+e.target.value)}
          />
        </Field>
      </div>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {busy && (
        <button className="secondary" onClick={() => abort.current?.abort()}>
          Cancel stock request
        </button>
      )}
      <div className="stock-results">
        {results.map((video) => (
          <article className="stock-card" key={video.id}>
            {video.thumbnail && (
              <img src={video.thumbnail} crossOrigin="anonymous" alt="" loading="lazy" />
            )}
            <b>{video.attribution.title}</b>
            <small>
              {video.attribution.creator} · {(video.size / 1024 / 1024).toFixed(1)} MB
            </small>
            <div className="button-row">
              <a href={video.attribution.url} target="_blank" rel="noreferrer">
                Source & preview
              </a>
              <a href={video.attribution.licenseUrl} target="_blank" rel="noreferrer">
                {video.attribution.license}
              </a>
            </div>
            {/BY-SA/.test(video.attribution.license) && (
              <small>ShareAlike license: check the linked terms for adapted footage.</small>
            )}
            <button
              className="secondary"
              disabled={busy || !p.clips.length || end - start < 0.1}
              onClick={() => void insert(video)}
            >
              Insert B-roll
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
