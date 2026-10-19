import { describe, expect, it } from 'vitest';
import { addMedia, createProject, defaultProps, duration, timelineWords, validateProject, type Project } from './model';
import { newAdjustment } from './adjustments';
import { defaultChroma } from './visual-effects';
import { sequenceSnapshot, switchSequence } from './sequences';
import {
  createCreatorRecipe, creatorRecipeIsCurrent, materializeCreatorOutput, parseCreatorProfile,
  type CreatorProfile, type CreatorProposal,
} from './creator-recipe';

const profile: CreatorProfile = { version: 1, id: 'channel-profile', name: 'Gaming', game: 'Example game',
  language: 'tr', audience: 'Turkish gaming viewers', commentary: 'unspecified', longTargetSeconds: 600,
  shortTargetSeconds: 45, shortCount: 3, fillMode: 'blur-background' };
const proposals: readonly CreatorProposal[] = [
  { id: 'long', name: 'Full story', kind: 'youtube-long', ranges: [{ start: 1, end: 3 }, { start: 5, end: 8 }],
    reason: 'Explicit editor-selected setup and outcome; not an AI claim.' },
  { id: 'short', name: 'One moment', kind: 'youtube-short', ranges: [{ start: 2, end: 4 }], reason: 'Explicit editor selection.' },
];
function fixture() {
  const p = addMedia(createProject('Gameplay', 'YouTube'), { id: 'game', name: 'game.mp4', duration: 60,
    width: 1920, height: 1080, size: 1, type: 'video/mp4' });
  p.tracks.find((track) => track.id === 'V2')!.name = 'Overlay';
  p.media.push({ id: 'music', name: 'music.mp3', duration: 60, width: 1, height: 1, size: 1, type: 'audio/mpeg' });
  p.clips = [
    { id: 'game-clip', mediaId: 'game', trackId: 'V1', start: 0, sourceStart: 10, sourceEnd: 30,
      properties: { ...defaultProps, speed: 2, volume: 0.75 }, voiceEnhance: true,
      captionWords: [{ id: 'word', text: 'Original caption', start: 12, end: 14, speakerId: 'speaker-1' }] },
    { id: 'overlay', mediaId: 'game', trackId: 'V2', start: 0, sourceStart: 0, sourceEnd: 10,
      properties: { ...defaultProps, opacity: 0.5, volume: 0 }, effects: { chroma: defaultChroma() },
      keyframes: { x: [{ time: 0, value: 0, easing: 'linear' }, { time: 10, value: 100, easing: 'linear' }] } },
    { id: 'music-clip', mediaId: 'music', trackId: 'A1', start: 0, sourceStart: 0, sourceEnd: 30,
      properties: { ...defaultProps, volume: 0.25 }, audioRole: 'music', autoDuck: true },
  ];
  p.adjustments = [newAdjustment(0, 10)];
  const files = new Map([['game', new File(['metadata-only original'], 'game.mp4')], ['music', new File(['music'], 'music.mp3')]]);
  return { p, files };
}

describe('YouTube creator output recipes', () => {
  it('parses independent preferences without account credentials or hidden publishing consent', () => {
    const input = { ...profile, name: '  Gaming  ', accountToken: 'not a real credential', publishAutomatically: true };
    const result = parseCreatorProfile(input);
    expect(result).toEqual(profile); expect(result).not.toBe(input);
    expect('accountToken' in result).toBe(false); expect('publishAutomatically' in result).toBe(false);
    for (const invalid of [null, { ...profile, version: 2 }, { ...profile, language: ' ' },
      { ...profile, language: 'tr/fake' }, { ...profile, shortCount: 1.5 }, { ...profile, shortCount: -1 },
      { ...profile, shortCount: 13 }, { ...profile, shortTargetSeconds: Infinity },
      { ...profile, longTargetSeconds: 0 }, { ...profile, game: '' }, { ...profile, fillMode: 'unknown' }])
      expect(() => parseCreatorProfile(invalid)).toThrow('profile');
    expect(parseCreatorProfile({ ...profile, language: 'zh-Hans-CN' }).language).toBe('zh-Hans-CN');
  });

  it('compiles one bounded plan over real source versions, with actual durations distinct from requested targets', () => {
    const { p, files } = fixture(), recipe = createCreatorRecipe(p, files, profile, proposals);
    expect(recipe.sourceIds).toEqual(['game', 'music']);
    expect(recipe.outputs.map((output) => [output.kind, output.seconds, output.targetSeconds]))
      .toEqual([['youtube-long', 5, 600], ['youtube-short', 2, 45]]);
    expect(creatorRecipeIsCurrent(recipe, p, files)).toBe(true);
    expect(Object.isFrozen(recipe)).toBe(true); expect(Object.isFrozen(recipe.outputs[0].ranges[0])).toBe(true);
    expect(recipe.outputs[0].reason).toContain('not an AI claim');
  });

  it('materializes real all-track edits with source trims/speed/captions/audio/effects/motion preserved', () => {
    const { p, files } = fixture(), before = structuredClone(p), recipe = createCreatorRecipe(p, files, profile, proposals);
    const draft = materializeCreatorOutput(recipe, p, files, 'long');
    expect(duration(draft)).toBe(5); expect(draft.clips).toHaveLength(6);
    expect(draft.clips.filter((clip) => clip.trackId === 'V1').map((clip) =>
      [clip.start, clip.sourceStart, clip.sourceEnd, clip.properties.speed, clip.properties.volume]))
      .toEqual([[0, 12, 16, 2, 0.75], [2, 20, 26, 2, 0.75]]);
    expect(draft.clips.find((clip) => clip.trackId === 'V1')?.voiceEnhance).toBe(true);
    expect(timelineWords(draft).find((word) => word.id === 'word')?.timelineStart).toBe(0);
    expect(draft.clips.filter((clip) => clip.trackId === 'A1').map((clip) => [clip.autoDuck, clip.audioRole, clip.properties.volume]))
      .toEqual([[true, 'music', 0.25], [true, 'music', 0.25]]);
    const overlay = draft.clips.find((clip) => clip.trackId === 'V2')!;
    expect(overlay.effects).toEqual(p.clips[1].effects); expect(overlay.keyframes).toEqual(p.clips[1].keyframes);
    expect(overlay.properties.opacity).toBe(0.5);
    expect(draft.adjustments?.map((layer) => [layer.start, layer.end])).toEqual([[0, 5]]);
    expect(draft.id).not.toBe(p.id); expect(draft.settings.aspectRatio).toBe('16:9'); expect(draft.name).toBe('Full story');
    expect(validateProject(JSON.parse(JSON.stringify(draft))).name).toBe('Full story');
    expect(p).toEqual(before);
  });

  it('derives independent vertical Shorts and wide edits from the same snapshot without changing originals', () => {
    const { p, files } = fixture(), recipe = createCreatorRecipe(p, files, { ...profile, fillMode: 'fit' }, proposals);
    const short = materializeCreatorOutput(recipe, p, files, 'short'), long = materializeCreatorOutput(recipe, p, files, 'long');
    expect([short.settings.width, short.settings.height, short.exportSettings.width, short.exportSettings.height]).toEqual([1080, 1920, 1080, 1920]);
    expect(short.settings.fillMode).toBe('fit'); expect(duration(short)).toBe(2);
    expect([long.settings.width, long.settings.height]).toEqual([1920, 1080]);
    short.clips[0].properties.volume = 0; short.media[0].name = 'Changed derived project';
    expect(long.clips[0].properties.volume).toBe(0.75); expect(p.clips[0].properties.volume).toBe(0.75);
    expect(p.media[0].name).toBe('game.mp4'); expect(recipe.outputs[0].seconds).toBe(5);
  });

  it('invalidates on an immutable edit or exact File relink, including equal name/size metadata', () => {
    const { p, files } = fixture(), recipe = createCreatorRecipe(p, files, profile, proposals);
    const next = { ...p, name: 'New edit' };
    expect(creatorRecipeIsCurrent(recipe, next, files)).toBe(false);
    expect(() => materializeCreatorOutput(recipe, next, files, 'long')).toThrow('Rebuild');
    const changed = new Map(files); changed.set('game', new File(['metadata-only original'], 'game.mp4'));
    expect(creatorRecipeIsCurrent(recipe, p, changed)).toBe(false);
    expect(() => materializeCreatorOutput(recipe, p, changed, 'short')).toThrow('Rebuild');
    changed.delete('music'); expect(creatorRecipeIsCurrent(recipe, p, changed)).toBe(false);
    expect(() => materializeCreatorOutput(recipe, p, files, 'missing')).toThrow('Choose an output');
  });

  it('rejects malformed proposals before returning an apparent ready plan', () => {
    const { p, files } = fixture();
    for (const ranges of [[{ start: NaN, end: 4 }], [{ start: 0, end: Infinity }], [{ start: -1, end: 4 }],
      [{ start: 0, end: 31 }], [{ start: 2, end: 2 }], [{ start: 3, end: 1 }]])
      expect(() => createCreatorRecipe(p, files, profile, [{ ...proposals[0], ranges }])).toThrow('ranges');
    for (const items of [[], [proposals[0], { ...proposals[0] }], [{ ...proposals[0], name: '' }],
      [{ ...proposals[0], ranges: [] }], [{ ...proposals[0], reason: ' ' }]])
      expect(() => createCreatorRecipe(p, files, profile, items)).toThrow();
    expect(() => createCreatorRecipe(p, files, { ...profile, shortCount: 0 }, [proposals[1]])).toThrow('configured');
    expect(() => createCreatorRecipe(p, files, profile, [proposals[1], { ...proposals[1], id: ' short ' }])).toThrow('unique');
  });

  it('refuses locked edits rather than returning an unchanged source as successful assembly', () => {
    const { p, files } = fixture();
    p.tracks.find((track) => track.id === 'V1')!.locked = true;
    expect(() => createCreatorRecipe(p, files, profile, proposals)).toThrow('Unlock');
    p.tracks.find((track) => track.id === 'V1')!.locked = false; p.adjustments![0].locked = true;
    expect(() => createCreatorRecipe(p, files, profile, proposals)).toThrow('Unlock');
  });

  it('requires actual selected source files and valid source timing', () => {
    const { p, files } = fixture(), missing = new Map(files); missing.delete('music');
    expect(() => createCreatorRecipe(p, missing, profile, proposals)).toThrow('Relink');
    p.clips[0].sourceEnd = 61;
    expect(() => createCreatorRecipe(p, files, profile, proposals)).toThrow('timing');
    const empty = createProject(); expect(() => createCreatorRecipe(empty, files, profile, proposals)).toThrow('playable');
  });

  it('preserves chosen internal gaps and explicit reorder/replay instead of silently filling or merging them', () => {
    const { p, files } = fixture(); p.adjustments = [];
    const clip = p.clips[0]; p.clips = [
      { ...clip, start: 1, sourceStart: 1, sourceEnd: 3, properties: { ...defaultProps } },
      { ...clip, id: 'second', start: 9, sourceStart: 9, sourceEnd: 11, properties: { ...defaultProps } },
    ];
    const reordered = [{ ...proposals[0], ranges: [{ start: 1, end: 6 }, { start: 9, end: 11 }, { start: 1, end: 3 }] }];
    const recipe = createCreatorRecipe(p, files, profile, reordered), draft = materializeCreatorOutput(recipe, p, files, 'long');
    expect(duration(draft)).toBe(9); expect(draft.clips.map((c) => [c.start, c.sourceStart, c.sourceEnd]))
      .toEqual([[0, 1, 3], [5, 9, 11], [7, 1, 3]]);
    expect(() => createCreatorRecipe(p, files, profile, [{ ...proposals[0], ranges: [{ start: 4, end: 6 }] }])).toThrow('contain');
    expect(() => createCreatorRecipe(p, files, profile, [{ ...proposals[0], ranges: [{ start: 1, end: 6 }] }])).toThrow('trailing');
  });

  it('does not import a serialized plan as trusted or invent metadata/chapter readiness for derived cuts', () => {
    const { p, files } = fixture();
    p.publishing = { title: 'Old title', description: 'Old description', hashtags: '#old' };
    const recipe = createCreatorRecipe(p, files, profile, proposals);
    expect(creatorRecipeIsCurrent(JSON.parse(JSON.stringify(recipe)), p, files)).toBe(false);
    const draft = materializeCreatorOutput(recipe, p, files, 'long');
    expect(draft.publishing).toBeUndefined(); expect(draft.chapters).toBeUndefined(); expect(draft.suggestions).toEqual([]);
    expect(p.publishing.title).toBe('Old title');
  });

  it('synchronizes derived active sequence data rather than retaining a stale uncut saved view', () => {
    const { p, files } = fixture(), source = sequenceSnapshot(p, 'root', 'Original');
    const project: Project = { ...p, activeSequenceId: 'root', sequences: [source] };
    const recipe = createCreatorRecipe(project, files, profile, proposals), draft = materializeCreatorOutput(recipe, project, files, 'short');
    expect(duration(switchSequence(draft, 'root'))).toBe(2);
    expect(duration(project)).toBe(30); expect(duration({ ...p, ...source })).toBe(30);
  });

  it('has an explicit pilot output budget and freezes copied proposals, not caller-owned data', () => {
    const { p, files } = fixture(), input = proposals.map((proposal) => ({ ...proposal,
      ranges: proposal.ranges.map((range) => ({ ...range })) })), prefs = { ...profile };
    const recipe = createCreatorRecipe(p, files, prefs, input);
    input[0].ranges[0].start = 0; prefs.game = 'Changed after compilation';
    expect(recipe.outputs[0].ranges[0].start).toBe(1); expect(recipe.profile.game).toBe('Example game');
    p.clips = [{ ...p.clips[0], sourceStart: 0, sourceEnd: 60, properties: { ...defaultProps, speed: 0.25 } }];
    expect(() => createCreatorRecipe(p, files, profile, [{ ...proposals[1], ranges: [{ start: 0, end: 200 }] }])).toThrow('180 seconds');
  });
});
