import { afterEach, describe, expect, it, vi } from 'vitest';
import { chapterEmbeddings } from './chapter-worker';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});
describe('chapter analysis worker lifecycle', () => {
  it('terminates on cancellation and never starts an already cancelled request', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    const pending = chapterEmbeddings(['Actual text'], controller.signal, () => {});
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    await expect(chapterEmbeddings(['Another'], controller.signal, () => {})).rejects.toMatchObject(
      { name: 'AbortError' },
    );
    expect(FakeWorker.instances).toHaveLength(1);
  });
  it('forwards progress/results and releases resources on model failure', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const progress = vi.fn(),
      controller = new AbortController();
    const result = chapterEmbeddings(['First'], controller.signal, progress);
    const worker = FakeWorker.instances[0];
    worker.onmessage?.({ data: { type: 'progress', message: 'Loading' } });
    worker.onmessage?.({ data: { type: 'result', vectors: [[1, 0]] } });
    await expect(result).resolves.toEqual([[1, 0]]);
    expect(progress).toHaveBeenCalledWith('Loading');
    expect(worker.terminate).toHaveBeenCalledOnce();
    controller.abort();
    expect(worker.terminate).toHaveBeenCalledOnce();
    const failed = chapterEmbeddings(['Second'], new AbortController().signal, progress);
    FakeWorker.instances[1].onmessage?.({ data: { type: 'error', message: 'Model unavailable' } });
    await expect(failed).rejects.toThrow('Model unavailable');
    expect(FakeWorker.instances[1].terminate).toHaveBeenCalledOnce();
  });
});
