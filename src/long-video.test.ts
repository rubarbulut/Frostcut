import { describe, expect, it } from 'vitest';
import {
  analysisWindows,
  mergeWindowWords,
  rmsEnvelope,
  silencesFromEnvelope,
} from './audio-analysis';
import { proxyDimensions } from './proxies';
import { addMedia, createProject, type Word } from './model';
import { highlightRanges } from './highlights';
import type { CutOptions } from './ai';
const options: CutOptions = {
  goal: 'Short-form clips',
  count: 3,
  length: 25,
  pacing: 'Fast',
  sensitivity: 50,
  composite: false,
  reorder: true,
};
describe('long media processing', () => {
  it('bounds decoded input and covers all of a ten-minute source with overlap', () => {
    const windows = analysisWindows(600);
    expect(windows).toHaveLength(7);
    expect(windows.every((w) => w.duration <= 92)).toBe(true);
    expect(windows.reduce((n, w) => n + w.coreEnd - w.coreStart, 0)).toBe(600);
    expect(windows[1]).toEqual({ start: 89, duration: 92, coreStart: 90, coreEnd: 180 });
    expect(windows.at(-1)?.coreEnd).toBe(600);
  });
  it('merges words by source time without repeating overlap context', () => {
    const word = (id: string, start: number, end: number): Word => ({
      id,
      text: id,
      start,
      end,
      speakerId: 'speaker-1',
    });
    const incoming = [word('old', 0.1, 0.4), word('next', 1.2, 1.7)];
    const merged = mergeWindowWords([word('old', 89.1, 89.4)], incoming, analysisWindows(180)[1]);
    expect(merged.map((w) => [w.text, w.start])).toEqual([
      ['old', 89.1],
      ['next', 90.2],
    ]);
  });
  it('stores an energy envelope rather than the whole decoded waveform', () => {
    const samples = new Float32Array(16000 * 3);
    samples.fill(0.2, 0, 16000);
    samples.fill(0.2, 32000);
    const energy = rmsEnvelope(samples);
    expect(energy).toHaveLength(150);
    expect(silencesFromEnvelope(energy)).toEqual([{ start: 1.08, end: 1.92 }]);
  });
  it('avoids light-video proxies and reduces heavy or dropped-frame playback', () => {
    const asset = {
      id: 'm',
      name: 'source.mp4',
      duration: 24,
      width: 1280,
      height: 720,
      size: 1000,
      type: 'video/mp4',
    };
    expect(proxyDimensions(asset, 'Auto')).toBeNull();
    expect(proxyDimensions({ ...asset, duration: 600 }, 'Auto')).toEqual({
      width: 640,
      height: 360,
    });
    expect(proxyDimensions({ ...asset, width: 3840, height: 2160 }, 'Auto')).toEqual({
      width: 960,
      height: 540,
    });
    expect(proxyDimensions(asset, 'Auto', true)).toEqual({ width: 320, height: 180 });
    expect(proxyDimensions(asset, 'Full', true)).toBeNull();
  });
  it('honors a length ceiling, avoids overlapping picks and gives Auto a real count', () => {
    const p = addMedia(createProject(), {
      id: 'm',
      name: 'long.mp4',
      duration: 600,
      width: 1920,
      height: 1080,
      size: 1000,
      type: 'video/mp4',
    });
    p.transcripts = [
      {
        mediaId: 'm',
        source: 'local',
        language: 'English',
        words: Array.from({ length: 120 }, (_, sentence) =>
          Array.from({ length: 8 }, (_, i) => ({
            id: `${sentence}-${i}`,
            text: ['Here', 'is', 'the', 'secret', 'to', 'a', 'better', 'story.'][i],
            start: sentence * 5 + i * 0.5,
            end: sentence * 5 + i * 0.5 + 0.4,
            speakerId: 'speaker-1',
          })),
        ).flat(),
      },
    ];
    const clips = highlightRanges(p, options);
    expect(clips).toHaveLength(3);
    expect(clips.every((c) => c.end - c.start >= 15 && c.end - c.start <= 30)).toBe(true);
    expect(highlightRanges(p, { ...options, count: 0 }).length).toBeGreaterThan(3);
    const chronological = [...clips].sort((a, b) => a.start - b.start);
    expect(chronological[1].start).toBeGreaterThanOrEqual(chronological[0].end);
    expect(highlightRanges(p, { ...options, length: 14 }).every((c) => c.end - c.start < 15)).toBe(
      true,
    );
  });
});
