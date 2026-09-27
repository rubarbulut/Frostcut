import { httpsUrl } from './stock';
export type Topic = { id: number; title: string; url: string; score: number; time: number };
export async function discoverTopics(signal: AbortSignal): Promise<Topic[]> {
  const fetchJson = async (url: string) => {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`Topic feed unavailable (${r.status}). Try again later.`);
    return r.json();
  };
  const ids = await fetchJson('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!Array.isArray(ids)) throw new Error('The topic feed returned an unexpected response.');
  const settled = await Promise.allSettled(
    ids
      .slice(0, 15)
      .map((id) => fetchJson(`https://hacker-news.firebaseio.com/v0/item/${Number(id)}.json`)),
  );
  signal.throwIfAborted();
  const topics = settled.flatMap((result) => {
    if (result.status !== 'fulfilled') return [];
    const item = result.value;
    if (
      !item ||
      item.deleted ||
      item.dead ||
      item.type !== 'story' ||
      typeof item.title !== 'string' ||
      !Number.isFinite(item.id) ||
      !Number.isFinite(item.time)
    )
      return [];
    return [
      {
        id: item.id,
        title: item.title,
        url: httpsUrl(item.url) || `https://news.ycombinator.com/item?id=${item.id}`,
        score: Number(item.score) || 0,
        time: item.time,
      },
    ];
  });
  if (!topics.length) throw new Error('No current topics were available. Try refreshing later.');
  return topics;
}
export function topicIdea(topic: Topic) {
  return `Video idea: ${topic.title}\n\nHook: What should a newcomer understand about this story?\n1. Explain the reported development, with a dated source.\n2. Demonstrate one concrete example.\n3. Separate verified facts from open questions.\n4. Close with what to watch next.\n\nResearch source: ${topic.url}\nDiscussion: https://news.ycombinator.com/item?id=${topic.id}\n\nPlanning outline only. Read the source and verify claims before recording.`;
}
