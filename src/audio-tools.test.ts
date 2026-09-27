import { describe, expect, it } from 'vitest';
import { addMedia, createProject, validateProject } from './model';
import { detectBeats, duckGain, timelineBeats, audioEffectsFilter } from './audio-tools';
import { captureAnimation, applyAnimation } from './animation-presets';

function fixture() {
  let p = addMedia(createProject(), {
    id: 'video',
    name: 'voice.mp4',
    type: 'video/mp4',
    duration: 8,
    width: 1920,
    height: 1080,
    size: 1,
  });
  p = addMedia(p, {
    id: 'music',
    name: 'music.mp3',
    type: 'audio/mpeg',
    duration: 20,
    width: 1280,
    height: 720,
    size: 1,
  });
  return p;
}
describe('music and reusable animation', () => {
  it('places music on A2 under footage and maps source beats through trim/speed', () => {
    const p = fixture();
    expect(p.clips[1]).toMatchObject({ trackId: 'A2', start: 0, sourceEnd: 8, audioRole: 'music' });
    p.beats = { music: [1, 2, 3, 4, 5] };
    Object.assign(p.clips[1], { sourceStart: 2, sourceEnd: 5, start: 1 });
    p.clips[1].properties.speed = 2;
    expect(timelineBeats(p)).toEqual([1, 1.5, 2, 2.5]);
    expect(timelineBeats(p, [p.clips[1].id])).toEqual([]);
    expect(validateProject(JSON.parse(JSON.stringify(p))).beats).toEqual(p.beats);
  });
  it('detects real percussion peaks and returns no beats for silence', () => {
    const samples = new Float32Array(16000 * 4);
    for (const t of [0.5, 1, 1.5, 2, 2.5, 3])
      for (let i = 0; i < 400; i++)
        samples[Math.round(t * 16000) + i] = Math.sin(i * 0.1) * Math.exp(-i / 100);
    const beats = detectBeats(samples);
    expect(beats).toHaveLength(6);
    beats.forEach((beat, i) => expect(Math.abs(beat - (i + 1) * 0.5)).toBeLessThan(0.04));
    expect(detectBeats(new Float32Array(16000))).toEqual([]);
  });
  it('ducks during audible speech, ramps and returns between passages; mute restores music', () => {
    const p = fixture(),
      music = p.clips[1];
    music.autoDuck = true;
    p.transcripts = [
      {
        mediaId: 'video',
        language: 'English',
        source: 'local',
        words: [{ id: 'w', text: 'hello', start: 2, end: 3, speakerId: 'speaker-1' }],
      },
    ];
    expect(duckGain(p, music, 1)).toBe(1);
    expect(duckGain(p, music, 2.5)).toBe(0.25);
    expect(duckGain(p, music, 3.15)).toBeCloseTo(0.625);
    expect(duckGain(p, music, 4)).toBe(1);
    expect(audioEffectsFilter(p, music, 0)).toContain('eval=frame');
    p.clips[0].properties.volume = 0;
    expect(duckGain(p, music, 2.5)).toBe(1);
    p.clips[0].properties.volume = 1;
    p.tracks.find((t) => t.id === 'A1')!.muted = true;
    expect(duckGain(p, music, 2.5)).toBe(1);
  });
  it('rescales saved animation time and canvas position without changing source audio', () => {
    const p = fixture(),
      clip = p.clips[0];
    clip.keyframes = {
      x: [
        { time: 0, value: 0 },
        { time: 8, value: 540, easing: 'smooth' },
      ],
    };
    const preset = captureAnimation(p, clip, 'Pan');
    p.animationPresets = [preset];
    const loaded = validateProject(JSON.parse(JSON.stringify(p)));
    const target = { ...clip, sourceStart: 2, sourceEnd: 6 };
    const applied = applyAnimation(
      { ...p, settings: { ...p.settings, width: 2160 } },
      target,
      loaded.animationPresets![0],
    );
    expect(applied.keyframes!.x).toMatchObject([
      { time: 2, value: 0 },
      { time: 6, value: 1080 },
    ]);
    expect(applied.properties.speed).toBe(clip.properties.speed);
    expect(applied.properties.volume).toBe(clip.properties.volume);
    p.beats = { music: [2, 1] };
    expect(() => validateProject(p)).toThrow();
  });
});
