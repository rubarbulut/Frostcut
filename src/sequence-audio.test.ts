import { describe, expect, it } from 'vitest';
import { addMedia, createProject, defaultProps, type Project, type SequenceClip } from './model';
import { sequenceSnapshot } from './sequences';
import { requireMediaClip } from './clip-source';
import { audioWindow, createClipAudioPlan } from './audio-crossfades';
import { speechRanges, duckGain, audioEffectsFilter } from './audio-tools';
import { compileSequenceAudio } from './sequence-audio';

function fixture() {
  let p = addMedia(createProject('Audio buses', 'YouTube'), { id: 'voice', name: 'voice.mp4', duration: 20,
    width: 1920, height: 1080, size: 1, type: 'video/mp4' });
  p = addMedia(p, { id: 'music', name: 'music.mp3', duration: 40, width: 1, height: 1, size: 1, type: 'audio/mpeg' });
  p.transcripts = [{ mediaId: 'voice', language: 'English', source: 'imported',
    words: [{ id: 'word', text: 'Speech', start: 4, end: 6, speakerId: 'speaker-1' }] }];
  const child = sequenceSnapshot(p, 'child', 'Child');
  child.clips = [{ ...requireMediaClip(p.clips[0]), id: 'voice-leaf', sourceStart: 2, sourceEnd: 12,
    properties: { ...defaultProps, speed: 2, volume: 0.8 } },
    { ...requireMediaClip(p.clips[1]), id: 'music-leaf', start: 0, sourceStart: 5, sourceEnd: 15, trackId: 'A2',
      audioRole: 'music', autoDuck: true, properties: { ...defaultProps, volume: 0.4 } }];
  const first: SequenceClip = { id: 'first', sequenceId: 'child', trackId: 'V1', start: 10, sourceStart: 0, sourceEnd: 10,
    voiceEnhance: true, properties: { ...defaultProps, speed: 2, volume: 0.5, fadeIn: 0.2, fadeOut: 0.4 } };
  const second: SequenceClip = { ...first, id: 'second', start: 20, sourceStart: 2, sourceEnd: 8,
    voiceEnhance: false, properties: { ...defaultProps, speed: 0.5, volume: 1.2 } };
  const root = sequenceSnapshot(p, 'root', 'Root');
  root.clips = [first, second, { ...requireMediaClip(p.clips[1]), id: 'root-music', start: 0, sourceStart: 0, sourceEnd: 40,
    trackId: 'A2', audioRole: 'music', autoDuck: true, properties: { ...defaultProps, volume: 0.6 } }];
  const project: Project = { ...p, ...root, id: p.id, name: p.name, activeSequenceId: 'root', sequences: [root, child] };
  return { project, first, second, child };
}
const reports = new Map([['voice', true], ['music', true]]);

describe('hierarchical sequence audio export', () => {
  it('mixes one child bus and gives repeated placements independent trim/tempo/volume/fade processing', () => {
    const { project: p } = fixture(), before = JSON.stringify(p), graph = compileSequenceAudio(p, reports);
    expect(graph.inputs.map((input) => [input.mediaId, input.start, input.end, input.index])).toEqual([
      ['voice', 2, 12, 1], ['music', 5, 15, 2], ['music', 0, 40, 3] ]);
    const text = graph.filters.join(';');
    expect(text).toContain('asplit=2[seqaudio1_out0][seqaudio1_out1]');
    const first = graph.filters.find((filter) => filter.startsWith('[seqaudio1_out0]'))!;
    const second = graph.filters.find((filter) => filter.startsWith('[seqaudio1_out1]'))!;
    expect(first).toContain('atrim=start=0:end=10,asetpts=PTS-STARTPTS,atempo=2');
    expect(first).toContain('acompressor='); expect(first).toContain('volume=0.5');
    expect(first).toContain('afade=t=in:d=0.2,afade=t=out:st=4.6:d=0.4');
    expect(first).toContain('adelay=delays=480000S:all=1');
    expect(second).toContain('atrim=start=2:end=8,asetpts=PTS-STARTPTS,atempo=0.5');
    expect(second).toContain('volume=1.2'); expect(second).not.toContain('acompressor');
    expect(graph.filters.indexOf(first)).toBeGreaterThan(graph.filters.findIndex((filter) => filter.includes('[seqaudio1_mix]')));
    expect(graph.filters.filter((filter) => filter.startsWith('[1:a]'))[0]).not.toContain('acompressor');
    expect(graph.output).toBe('seqaudio0_out0'); expect(JSON.stringify(p)).toBe(before);
    // Every generated output pad is consumed once (or mapped as the final bus).
    const produced = graph.filters.flatMap((filter) => [...filter.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]))
      .filter((tag) => !/^\d+:a$/.test(tag));
    const counts = new Map<string, number>(); produced.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    for (const [tag, count] of counts) expect(count).toBe(tag === graph.output ? 1 : 2);
  });

  it('maps actual child speech into parent ducking while excluding child music and clipped speech', () => {
    const { project: p } = fixture(), rootMusic = p.clips[2];
    expect(speechRanges(p, rootMusic.id)).toEqual([{ start: 10.5, end: 11 }]);
    expect(duckGain(p, rootMusic, 10.75)).toBe(0.25);
    expect(duckGain(p, rootMusic, 22)).toBe(1);
    const cached = createClipAudioPlan(p, rootMusic);
    expect(cached.gainAt(10.75)).toBeCloseTo(0.15);
    expect(audioEffectsFilter(p, rootMusic, 0)).toContain('10.5000');
    p.sequences![1].tracks = p.sequences![1].tracks.map((track) => ({ ...track, muted: track.id === 'A1' }));
    expect(speechRanges(p, rootMusic.id)).toEqual([]);
    expect(duckGain(p, rootMusic, 10.75)).toBe(1);
  });

  it('keeps shortened/empty child out points as real silence rather than invalid trim windows or repeated sound', () => {
    const { project: p } = fixture();
    p.sequences![1].clips = [];
    p.clips[0] = { ...p.clips[0], sourceStart: 4 };
    const window = audioWindow(p, p.clips[0]);
    expect([window.start, window.end, window.duration]).toEqual([4, 10, 3]);
    const graph = compileSequenceAudio(p, new Map([['music', true]]));
    expect(graph.inputs.map((input) => input.mediaId)).toEqual(['music']);
    expect(graph.filters.some((filter) => filter.includes('anullsrc') && filter.includes('atrim=duration=10'))).toBe(true);
    expect(graph.filters.find((filter) => filter.startsWith('[seqaudio1_out0]'))).toContain('atrim=start=4:end=10');
    expect(speechRanges(p, p.clips[2].id)).toEqual([]);
  });

  it('honors parent/child mute, detachment, audio-only routing and actual no-audio probe reports', () => {
    const { project: p } = fixture();
    p.clips = [p.clips[0]];
    const hidden = { ...p, tracks: p.tracks.map((track) => ({ ...track, hidden: track.id === 'V1' })) };
    expect(compileSequenceAudio(hidden, reports).inputs).toHaveLength(2);
    const muted = { ...p, tracks: p.tracks.map((track) => ({ ...track, muted: track.id === 'A1' })) };
    expect(compileSequenceAudio(muted, new Map()).inputs).toEqual([]);
    const detached = { ...p, clips: p.clips.map((clip) => ({ ...clip, audioDetached: true })) };
    expect(compileSequenceAudio(detached, new Map()).inputs).toEqual([]);
    const audioOnly = { ...detached, clips: detached.clips.map((clip) => ({ ...clip, trackId: 'A2' })) };
    expect(compileSequenceAudio(audioOnly, reports).inputs).toHaveLength(2);
    expect(compileSequenceAudio(p, new Map([['voice', false], ['music', false]])).inputs).toEqual([]);
    expect(() => compileSequenceAudio(p, new Map([['music', true]]))).toThrow('report is incomplete');
  });

  it('preserves short crossfade handles before t=0, rate chains and input offsets', () => {
    const { project: p } = fixture();
    const child = p.sequences![1], voice = requireMediaClip(child.clips[0]);
    child.clips = [{ ...voice, id: 'tiny', sourceStart: 0, sourceEnd: 0.005, properties: { ...defaultProps } },
      { ...voice, id: 'next', start: 0.005, sourceStart: 1, sourceEnd: 2, properties: { ...defaultProps, speed: 0.25 } }];
    p.clips = [p.clips[0]]; p.clips[0].properties.speed = 4;
    const graph = compileSequenceAudio(p, new Map([['voice', true]]), 5);
    expect(graph.inputs.map((input) => input.index)).toEqual([5, 6]);
    expect(graph.filters.some((filter) => filter.includes('atempo=0.5,atempo=0.5'))).toBe(true);
    expect(graph.filters.some((filter) => filter.includes('atempo=2,atempo=2'))).toBe(true);
    const next = graph.filters.find((filter) => filter.startsWith('[6:a]'))!;
    expect(next).toContain('atrim=start=0.01,asetpts=PTS-STARTPTS,adelay=delays=0S:all=1');
    expect(() => compileSequenceAudio(p, reports, -1)).toThrow('input offset');
  });

  it('does not invent speech ducking from a video proven to have no audio stream', () => {
    const { project: p } = fixture(), available = new Map([['voice', false], ['music', true]]);
    expect(speechRanges(p, p.clips[2].id, available)).toEqual([]);
    expect(createClipAudioPlan(p, p.clips[2], available).gainAt(10.75)).toBeCloseTo(0.6);
    const graph = compileSequenceAudio(p, available);
    expect(graph.inputs.every((input) => input.mediaId === 'music')).toBe(true);
    expect(graph.filters.join(';')).not.toContain('eval=frame');
  });

  it('rejects inactive cycles and missing sources before producing any audio graph', () => {
    const { project: p, first } = fixture();
    const inactive = sequenceSnapshot(p, 'inactive', 'Inactive');
    inactive.clips = [{ ...first, id: 'cycle', sequenceId: 'inactive' }];
    expect(() => compileSequenceAudio({ ...p, sequences: [...p.sequences!, inactive] }, reports)).toThrow('cycle');
    p.clips = [{ ...first, sequenceId: 'missing' }];
    expect(() => compileSequenceAudio(p, reports)).toThrow('missing');
  });
});
