import { useEffect, useRef, useState } from 'react';
import { discoverTopics, topicIdea, type Topic } from './discover';
import { downloadBlob } from './store';
import { safeFilename } from './zip';
export function DiscoverTools() {
  const [topics, setTopics] = useState<Topic[]>([]),
    [fetched, setFetched] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<Topic>(),
    [status, setStatus] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function load() {
    const c = new AbortController();
    abort.current = c;
    setBusy(true);
    setError('');
    try {
      setTopics(await discoverTopics(c.signal));
      setFetched(new Date().toLocaleString());
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof TypeError
            ? 'Could not reach the topic feed. Check your connection and try again.'
            : (e as Error).message,
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="creator-section">
      <p>
        Discover technology and science stories from the current Hacker News ranking. These
        community scores describe interest on Hacker News; they are not YouTube view forecasts.
      </p>
      <button className="primary" disabled={busy} onClick={load}>
        {busy
          ? 'Loading topics…'
          : topics.length
            ? 'Refresh current topics'
            : 'Load current topics'}
      </button>
      {fetched && <small>Hacker News · fetched {fetched}</small>}
      {error && <p role="alert">{error}</p>}
      <div className="topic-list">
        {topics.map((topic) => (
          <article key={topic.id}>
            <a href={topic.url} target="_blank" rel="noreferrer">
              {topic.title}
            </a>
            <small>
              {topic.score} points · published {new Date(topic.time * 1000).toLocaleDateString()}
            </small>
            <button
              className="text-button"
              onClick={() => {
                setSelected(topic);
                setStatus('');
              }}
            >
              Build video idea
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <div className="idea-draft">
          <pre className="wrap-text">{topicIdea(selected)}</pre>
          <div className="button-row">
            <button
              className="secondary"
              onClick={() =>
                downloadBlob(
                  new Blob([topicIdea(selected)], { type: 'text/plain;charset=utf-8' }),
                  `${safeFilename(selected.title)}-idea.txt`,
                )
              }
            >
              Download video idea
            </button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(topicIdea(selected));
                  setStatus('Idea copied.');
                } catch {
                  setStatus('Clipboard unavailable. Download the idea instead.');
                }
              }}
            >
              Copy video idea
            </button>
          </div>
        </div>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  );
}
