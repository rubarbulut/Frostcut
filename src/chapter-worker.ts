export async function chapterEmbeddings(
  texts: string[],
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<number[][]> {
  signal.throwIfAborted();
  const worker = new Worker(new URL('./chapters.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || 'The local chapter model could not start.'));
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') progress(data.message);
      else if (data.type === 'result') {
        cleanup();
        resolve(data.vectors);
      } else if (data.type === 'error') {
        cleanup();
        reject(new Error(data.message));
      }
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    else {
      try {
        worker.postMessage({ texts });
      } catch (error) {
        cleanup();
        reject(error);
      }
    }
  });
}
