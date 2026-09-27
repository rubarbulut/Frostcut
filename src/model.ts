import { animatedProperties, type KeyframeTracks } from './motion';
import type { SavedAnimation } from './animation-presets';
import {
  translatedWords,
  subtitleLanguages,
  type SubtitleLanguage,
  type SubtitleVariant,
} from './translations';
import type { PublishingMetadata } from './publishing';
import type { Attribution } from './stock';
import { validVisualEffects, type VisualEffects } from './visual-effects';
import { validChapterSet, type ChapterSet } from './chapter-data';
import type { CutOptions } from './ai';
export type Preset = 'YouTube Shorts' | 'TikTok' | 'Instagram Reel' | 'YouTube' | 'Custom';
export type CaptionPreset = 'Clean' | 'Bold' | 'Brainrot';
export type CaptionAnimation = 'none' | 'pop' | 'bounce' | 'glow' | 'typewriter' | 'karaoke';
export type CaptionFont = 'sans' | 'impact' | 'serif' | 'mono';
export type CaptionAppearance = {
  size: number;
  color: string;
  accent: string;
  speakerColors: boolean;
  outlineColor: string;
  outline: number;
  bold: boolean;
  margin: number;
  boxColor?: string;
  boxOpacity?: number;
  boxRadius?: number;
  boxPadding?: number;
  animation?: CaptionAnimation;
  shadow?: boolean;
  fontFamily?: CaptionFont;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
  /** Spacing is relative to font size, so it scales with preview and export resolution. */
  letterSpacing?: number;
  wordSpacing?: number;
  lineHeight?: number;
};
export type CaptionStyle = {
  preset: CaptionPreset;
  intensity: number;
  wordsPerCaption: number;
  position: 'bottom' | 'center' | 'top' | 'custom';
  customPosition?: { x: number; y: number };
  emoji?: 'None' | 'Low' | 'Medium' | 'High';
  appearance?: CaptionAppearance;
};
export type Word = {
  id: string;
  text: string;
  start: number;
  end: number;
  speakerId: string;
  important?: boolean;
  confidence?: number;
  cueId?: string;
  timingEstimated?: boolean;
};
export type Transcript = {
  mediaId: string;
  language: string;
  source: 'local' | 'demo' | 'imported';
  words: Word[];
  model?: string;
};
export type MediaAsset = {
  attribution?: Attribution;
  id: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  size: number;
  type: string;
  demo?: boolean;
  folder?: string;
  starred?: boolean;
};
export type ClipProps = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  volume: number;
  speed: number;
  fadeIn: number;
  fadeOut: number;
  crop: number;
  animation: string;
};
export type Clip = {
  effects?: VisualEffects;
  audioRole?: 'music' | 'voice';
  autoDuck?: boolean;
  voiceEnhance?: boolean;
  audioDetached?: boolean;
  keyframes?: KeyframeTracks;
  id: string;
  mediaId: string;
  trackId: string;
  start: number;
  sourceStart: number;
  sourceEnd: number;
  properties: ClipProps;
  groupId?: string;
  aiReason?: string;
  /** Source-time caption overrides belonging only to this timeline instance. */
  captionWords?: Word[];
};
export type Track = {
  id: string;
  name: string;
  kind: 'video' | 'audio';
  locked: boolean;
  muted: boolean;
  hidden: boolean;
  height: number;
};
export type Operation =
  | { type: 'delete-range'; start: number; end: number; ripple?: boolean }
  | { type: 'keep-range'; start: number; end: number }
  | { type: 'assemble'; ranges: { start: number; end: number }[] }
  | { type: 'speed-range'; start: number; speed: number }
  | { type: 'split'; clipId: string; time: number }
  | { type: 'move'; clipId: string; start: number; trackId?: string }
  | { type: 'trim'; clipId: string; sourceStart: number; sourceEnd: number }
  | { type: 'caption-style'; preset: CaptionPreset }
  | { type: 'speed'; clipId: string; speed: number };
export type Suggestion = {
  sourceOptions?: CutOptions;
  id: string;
  type: 'highlight' | 'silence' | 'repeat' | 'edit';
  title: string;
  reason: string;
  start: number;
  end: number;
  score: number;
  operations: Operation[];
  status: 'pending' | 'applied' | 'dismissed';
};
export type Project = {
  chapters?: ChapterSet;
  publishing?: PublishingMetadata;
  subtitleVariants?: SubtitleVariant[];
  beats?: Record<string, number[]>;
  animationPresets?: SavedAnimation[];
  appliedEdits?: { label: string; date: string; sequenceId?: string }[];
  activeSequenceId?: string;
  sequences?: ProjectSequence[];
  id: string;
  version: 1;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: {
    preset: Preset;
    width: number;
    height: number;
    fps: number;
    language: string;
    transcriptionQuality?: 'fast' | 'balanced' | 'detailed';
    transcriptionDevice?: 'auto' | 'cpu';
  };
  media: MediaAsset[];
  tracks: Track[];
  clips: Clip[];
  transcripts: Transcript[];
  speakers: { id: string; name: string; color: string }[];
  captions: CaptionStyle & {
    language?: SubtitleLanguage;
    enabled: boolean;
    preset: CaptionPreset;
    intensity: number;
    wordsPerCaption: number;
    position: CaptionStyle['position'];
    emoji: 'None' | 'Low' | 'Medium' | 'High';
    safeArea: boolean;
    savedStyles?: { id: string; name: string; style: CaptionStyle }[];
  };
  suggestions: Suggestion[];
  exportSettings: {
    width: number;
    height: number;
    fps: number;
    quality: number;
    videoBitrate?: number;
    audioBitrate?: number;
  };
};
export type ProjectSequence = Pick<
  Project,
  | 'clips'
  | 'tracks'
  | 'settings'
  | 'captions'
  | 'exportSettings'
  | 'suggestions'
  | 'subtitleVariants'
  | 'publishing'
  | 'chapters'
> & {
  id: string;
  name: string;
};
export const uid = () => crypto.randomUUID();
export const presets: Preset[] = [
  'YouTube Shorts',
  'TikTok',
  'Instagram Reel',
  'YouTube',
  'Custom',
];
export const languages = [
  'Auto Detect',
  'English',
  'Spanish',
  'Portuguese',
  'French',
  'German',
  'Turkish',
  'Polish',
];
export const defaultProps: ClipProps = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  volume: 1,
  speed: 1,
  fadeIn: 0.015,
  fadeOut: 0.015,
  crop: 0,
  animation: 'None',
};
export function createProject(
  name = 'Untitled project',
  preset: Preset = 'YouTube Shorts',
  width?: number,
  height?: number,
): Project {
  const w = width ?? (preset === 'YouTube' ? 1920 : 1080),
    h = height ?? (preset === 'YouTube' ? 1080 : 1920);
  return {
    id: uid(),
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      preset,
      width: w,
      height: h,
      fps: 30,
      language: 'Auto Detect',
      transcriptionQuality: 'balanced',
    },
    media: [],
    clips: [],
    transcripts: [],
    tracks: ['V3', 'V2', 'V1', 'A1', 'A2'].map((name) => ({
      id: name,
      name,
      kind: name[0] === 'V' ? 'video' : 'audio',
      locked: false,
      muted: false,
      hidden: false,
      height: name[0] === 'V' ? 56 : 40,
    })),
    speakers: [
      { id: 'speaker-1', name: 'Speaker 1', color: '#b9e9ff' },
      { id: 'speaker-2', name: 'Speaker 2', color: '#ffd39c' },
    ],
    captions: {
      enabled: true,
      preset: 'Bold',
      intensity: 50,
      wordsPerCaption: 4,
      position: 'bottom',
      emoji: 'Low',
      safeArea: false,
    },
    suggestions: [],
    exportSettings: { width: w, height: h, fps: 30, quality: 75 },
  };
}
export const clipDuration = (c: Clip) => (c.sourceEnd - c.sourceStart) / c.properties.speed;
export const clipEnd = (c: Clip) => c.start + clipDuration(c);
export const duration = (p: Project) => Math.max(0, ...p.clips.map(clipEnd));
export const sortedClips = (p: Project) => [...p.clips].sort((a, b) => a.start - b.start);
export const isAudioClip = (p: Project, c: Clip) =>
  p.tracks.find((t) => t.id === c.trackId)?.kind === 'audio';
export const isLocked = (p: Project, c: Clip) =>
  p.tracks.some(
    (t) =>
      (t.id === c.trackId || (!isAudioClip(p, c) && !c.audioDetached && t.id === 'A1')) && t.locked,
  );
export const clipAudible = (p: Project, c: Clip) =>
  !p.tracks.find((t) => t.id === c.trackId)?.muted &&
  (isAudioClip(p, c) || (!c.audioDetached && !p.tracks.find((t) => t.id === 'A1')?.muted));
export function detachAudio(p: Project, id: string): Project {
  const clip = p.clips.find((c) => c.id === id);
  if (!clip || isLocked(p, clip) || isAudioClip(p, clip) || clip.audioDetached) return p;
  const next = structuredClone(p),
    original = next.clips.find((c) => c.id === id)!;
  original.audioDetached = true;
  next.clips.push({
    ...structuredClone(clip),
    id: uid(),
    trackId: 'A1',
    groupId: undefined,
    audioDetached: undefined,
    audioRole: 'voice',
    captionWords: [],
    keyframes: undefined,
    properties: {
      ...defaultProps,
      speed: clip.properties.speed,
      volume: clip.properties.volume,
      fadeIn: clip.properties.fadeIn,
      fadeOut: clip.properties.fadeOut,
    },
  });
  return next;
}
export const timecode = (t: number, decimals = false) => {
  const seconds = Number.isFinite(t) ? Math.max(0, t) : 0;
  const ticks = decimals ? Math.round(seconds * 100) : Math.floor(seconds) * 100;
  return `${Math.floor(ticks / 6000)
    .toString()
    .padStart(
      2,
      '0',
    )}:${(Math.floor(ticks / 100) % 60).toString().padStart(2, '0')}${decimals ? '.' + (ticks % 100).toString().padStart(2, '0') : ''}`;
};
export function addMedia(p: Project, asset: MediaAsset): Project {
  const next = structuredClone(p);
  const audio = asset.type.startsWith('audio/');
  next.media.push(asset);
  next.clips.push({
    id: uid(),
    mediaId: asset.id,
    trackId: audio ? 'A2' : 'V1',
    ...(audio ? { audioRole: 'music' as const } : {}),
    start: audio ? 0 : duration(p),
    sourceStart: 0,
    sourceEnd: audio && duration(p) ? Math.min(asset.duration, duration(p)) : asset.duration,
    properties: { ...defaultProps },
  });
  return next;
}
export function removeMedia(p: Project, assetId: string): Project {
  const next = structuredClone(p);
  next.media = next.media.filter((m) => m.id !== assetId);
  next.clips = next.clips.filter((c) => c.mediaId !== assetId);
  next.transcripts = next.transcripts.filter((t) => t.mediaId !== assetId);
  if (next.beats) {
    delete next.beats[assetId];
  }
  if (next.sequences) {
    next.sequences = next.sequences.map((seq) => ({
      ...seq,
      clips: seq.clips.filter((c) => c.mediaId !== assetId),
    }));
  }
  return next;
}
export function insertMediaClip(
  p: Project,
  assetId: string,
  startTime?: number,
  trackId?: string,
): Project {
  const asset = p.media.find((m) => m.id === assetId);
  if (!asset) return p;
  const next = structuredClone(p);
  const audio = asset.type.startsWith('audio/');
  const targetTrack = trackId ?? (audio ? 'A2' : 'V1');
  const at = Number.isFinite(startTime) ? Math.max(0, startTime!) : duration(p);
  next.clips.push({
    id: uid(),
    mediaId: asset.id,
    trackId: targetTrack,
    ...(audio ? { audioRole: 'music' as const } : {}),
    start: at,
    sourceStart: 0,
    sourceEnd: asset.duration,
    properties: { ...defaultProps },
  });
  return next;
}
export function updateMediaAsset(
  p: Project,
  assetId: string,
  patch: Partial<Pick<MediaAsset, 'name' | 'folder' | 'starred'>>,
): Project {
  const next = structuredClone(p);
  const asset = next.media.find((m) => m.id === assetId);
  if (!asset) return p;
  Object.assign(asset, patch);
  return next;
}
export function splitClip(p: Project, id: string, time: number): Project {
  const next = structuredClone(p),
    c = next.clips.find((c) => c.id === id);
  if (!c || isLocked(p, c) || time <= c.start + 0.02 || time >= clipEnd(c) - 0.02) return p;
  const sourceTime = c.sourceStart + (time - c.start) * c.properties.speed;
  next.clips.push({ ...structuredClone(c), id: uid(), start: time, sourceStart: sourceTime });
  c.sourceEnd = sourceTime;
  return next;
}
export function deleteRange(p: Project, start: number, end: number, ripple = true): Project {
  if (end <= start) return p;
  // Ripple editing a locked track would desynchronise it. Keep all tracks unchanged.
  if (ripple && p.clips.some((c) => isLocked(p, c) && clipEnd(c) > start)) return p;
  const next = structuredClone(p);
  next.clips = [];
  for (const c of p.clips) {
    if (isLocked(p, c)) {
      next.clips.push(structuredClone(c));
      continue;
    }
    const finish = clipEnd(c),
      speed = c.properties.speed;
    if (finish <= start || c.start >= end) {
      next.clips.push({
        ...structuredClone(c),
        start: c.start >= end && ripple ? c.start - (end - start) : c.start,
      });
      continue;
    }
    if (c.start < start)
      next.clips.push({
        ...structuredClone(c),
        sourceEnd: c.sourceStart + (start - c.start) * speed,
      });
    if (finish > end)
      next.clips.push({
        ...structuredClone(c),
        id: c.start < start ? uid() : c.id,
        start: ripple ? Math.max(start, c.start) : end,
        sourceStart: c.sourceStart + (end - c.start) * speed,
      });
  }
  return next;
}
export function applyOperations(project: Project, ops: Operation[], reason?: string): Project {
  let p = structuredClone(project);
  for (const op of ops) {
    if (op.type === 'delete-range') p = deleteRange(p, op.start, op.end, op.ripple ?? true);
    if (op.type === 'keep-range') {
      p = deleteRange(p, op.end, duration(p));
      p = deleteRange(p, 0, op.start);
    }
    if (op.type === 'assemble' && !p.clips.some((c) => isLocked(p, c))) {
      const source = p.clips;
      p.clips = [];
      let cursor = 0;
      for (const range of op.ranges) {
        if (range.end <= range.start) continue;
        for (const c of source) {
          const start = Math.max(range.start, c.start),
            end = Math.min(range.end, clipEnd(c));
          if (end <= start) continue;
          p.clips.push({
            ...structuredClone(c),
            id: uid(),
            start: cursor + start - range.start,
            sourceStart: c.sourceStart + (start - c.start) * c.properties.speed,
            sourceEnd: c.sourceStart + (end - c.start) * c.properties.speed,
          });
        }
        cursor += range.end - range.start;
      }
    }
    if (op.type === 'speed-range' && !p.clips.some((c) => isLocked(p, c))) {
      for (const c of [...p.clips])
        if (c.start < op.start && clipEnd(c) > op.start) p = splitClip(p, c.id, op.start);
      const factor = Math.max(0.25, Math.min(4, op.speed));
      for (const c of p.clips) {
        if (c.start >= op.start - 0.001) {
          c.start = op.start + (c.start - op.start) / factor;
          c.properties.speed = Math.max(0.25, Math.min(4, c.properties.speed * factor));
        }
      }
    }
    if (op.type === 'split') p = splitClip(p, op.clipId, op.time);
    if (op.type === 'caption-style')
      p.captions = { ...p.captions, enabled: true, preset: op.preset };
    if (op.type === 'move' || op.type === 'trim' || op.type === 'speed') {
      const c = p.clips.find((c) => c.id === op.clipId);
      if (!c || isLocked(p, c)) continue;
      if (op.type === 'move') {
        if (
          op.trackId &&
          !p.tracks.some(
            (t) =>
              t.id === op.trackId &&
              !t.locked &&
              t.kind === (isAudioClip(p, c) ? 'audio' : 'video'),
          )
        )
          continue;
        c.start = Math.max(0, op.start);
        if (op.trackId) c.trackId = op.trackId;
      }
      if (op.type === 'trim') {
        const m = p.media.find((m) => m.id === c.mediaId)!;
        c.sourceStart = Math.max(0, Math.min(op.sourceStart, m.duration - 0.05));
        c.sourceEnd = Math.max(c.sourceStart + 0.05, Math.min(op.sourceEnd, m.duration));
      }
      if (op.type === 'speed') c.properties.speed = Math.max(0.25, Math.min(4, op.speed));
    }
  }
  if (reason)
    p.clips.forEach((c) => {
      c.aiReason = reason;
    });
  return p;
}
export type TimelineWord = Word & {
  timelineStart: number;
  timelineEnd: number;
  clipId: string;
  mediaId: string;
};
export function timelineWords(p: Project): TimelineWord[] {
  return sortedClips(p)
    .filter((c) => !isAudioClip(p, c) && !p.tracks.find((t) => t.id === c.trackId)?.hidden)
    .flatMap((c) =>
      (c.captionWords ?? p.transcripts.find((t) => t.mediaId === c.mediaId)?.words ?? [])
        .filter((w) => w.end > c.sourceStart && w.start < c.sourceEnd)
        .map((w) => ({
          ...w,
          clipId: c.id,
          mediaId: c.mediaId,
          timelineStart:
            c.start + (Math.max(w.start, c.sourceStart) - c.sourceStart) / c.properties.speed,
          timelineEnd:
            c.start + (Math.min(w.end, c.sourceEnd) - c.sourceStart) / c.properties.speed,
        })),
    )
    .sort((a, b) => a.timelineStart - b.timelineStart);
}
export function captionGroups(p: Project) {
  const words = translatedWords(p) ?? timelineWords(p),
    groups: TimelineWord[][] = [];
  for (const w of words) {
    const g = groups.at(-1);
    if (
      !g ||
      g.length >= p.captions.wordsPerCaption ||
      g.at(-1)!.timelineEnd + 0.7 < w.timelineStart ||
      g[0].clipId !== w.clipId ||
      g[0].speakerId !== w.speakerId ||
      g[0].cueId !== w.cueId ||
      /[.!?]$/.test(g.at(-1)!.text)
    )
      groups.push([w]);
    else g.push(w);
  }
  return groups;
}
export function captionAt(p: Project, time: number) {
  return p.captions.enabled
    ? captionGroups(p).find((g) => time >= g[0].timelineStart && time < g.at(-1)!.timelineEnd)
    : undefined;
}
export function validateProject(value: unknown): Project {
  // A file is untrusted input: validate the full nested model before loading it.
  const p = value as Project;
  const fail = () => {
    throw new Error('This is not a valid FrostCut v1 project.');
  };
  const finite = (v: unknown, low = 0, high = 86400) =>
    typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
  const string = (v: unknown) => typeof v === 'string' && v.length < 100000;
  try {
    if (
      !p ||
      p.version !== 1 ||
      !string(p.id) ||
      !string(p.name) ||
      !string(p.createdAt) ||
      !string(p.updatedAt)
    )
      fail();
    if (
      !presets.includes(p.settings.preset) ||
      !finite(p.settings.width, 16, 7680) ||
      !finite(p.settings.height, 16, 7680) ||
      !finite(p.settings.fps, 1, 60) ||
      !string(p.settings.language)
    )
      fail();
    if (
      !Array.isArray(p.media) ||
      !Array.isArray(p.clips) ||
      !Array.isArray(p.tracks) ||
      !Array.isArray(p.transcripts) ||
      !Array.isArray(p.speakers) ||
      !Array.isArray(p.suggestions)
    )
      fail();
    if (p.media.length > 500 || p.clips.length > 10000) fail();
    if (p.chapters !== undefined && !validChapterSet(p.chapters)) fail();
    const chapterAttachment = p.publishing?.chapterAttachment;
    if (chapterAttachment !== undefined && (!chapterAttachment ||
      !string(chapterAttachment.sourceFingerprint) || !chapterAttachment.sourceFingerprint.trim() || chapterAttachment.sourceFingerprint.length > 500 ||
      !string(chapterAttachment.text) || !chapterAttachment.text.trim() || chapterAttachment.text.length > 5000)) fail();
    if (
      p.publishing !== undefined &&
      (!p.publishing ||
        !string(p.publishing.title) ||
        p.publishing.title.length > 100 ||
        !string(p.publishing.description) ||
        p.publishing.description.length > 5000 ||
        !string(p.publishing.hashtags) ||
        p.publishing.hashtags.length > 1000)
    )
      fail();
    for (const m of p.media)
      if (m.attribution !== undefined) {
        const a = m.attribution;
        if (
          !a ||
          [a.title, a.creator, a.license].some((s) => !string(s) || s.length > 600) ||
          [a.url, a.licenseUrl].some(
            (s) => !string(s) || s.length > 2000 || !/^https:\/\//i.test(s),
          )
        )
          fail();
      }
    if (p.captions.language !== undefined && !Object.hasOwn(subtitleLanguages, p.captions.language))
      fail();
    if (p.subtitleVariants !== undefined) {
      if (
        !Array.isArray(p.subtitleVariants) ||
        p.subtitleVariants.length > 7 ||
        new Set(p.subtitleVariants.map((v) => v.language)).size !== p.subtitleVariants.length
      )
        fail();
      for (const v of p.subtitleVariants) {
        if (
          !v ||
          !Object.hasOwn(subtitleLanguages, v.language) ||
          !string(v.sourceFingerprint) ||
          !Array.isArray(v.cues) ||
          v.cues.length > 20000
        )
          fail();
        for (const c of v.cues) {
          if (
            !c ||
            !finite(c.start) ||
            !finite(c.end, c.start + 0.001) ||
            !string(c.text) ||
            !c.text.trim() ||
            c.text.length > 2000 ||
            !string(c.speakerId)
          )
            fail();
          if (c.words !== undefined && (
            !Array.isArray(c.words) || !c.words.length || c.words.length > 2000 ||
            c.words.some((w, index) => !w || !string(w.text) || !w.text.trim() ||
              !finite(w.start, c.start, c.end) || !finite(w.end, w.start + 0.000001, c.end) ||
              (index > 0 && w.start < c.words![index - 1].end)) ||
            c.words.map((w) => w.text).join(' ') !== c.text
          )) fail();
        }
      }
    }
    if (p.beats !== undefined) {
      if (
        !p.beats ||
        typeof p.beats !== 'object' ||
        Array.isArray(p.beats) ||
        Object.keys(p.beats).length > 500
      )
        fail();
      for (const [id, beats] of Object.entries(p.beats)) {
        const asset = p.media.find((m) => m.id === id);
        if (
          !asset ||
          !Array.isArray(beats) ||
          beats.length > 100000 ||
          beats.some((t, i) => !finite(t, 0, asset.duration) || (i > 0 && t <= beats[i - 1]))
        )
          fail();
      }
    }
    if (p.animationPresets !== undefined) {
      if (!Array.isArray(p.animationPresets) || p.animationPresets.length > 20) fail();
      for (const preset of p.animationPresets) {
        if (
          !preset ||
          !string(preset.id) ||
          !string(preset.name) ||
          !preset.name.trim() ||
          preset.name.length > 60 ||
          !preset.tracks ||
          typeof preset.tracks !== 'object'
        )
          fail();
        for (const [key, frames] of Object.entries(preset.tracks)) {
          if (
            !(animatedProperties as readonly string[]).includes(key) ||
            !Array.isArray(frames) ||
            frames.length > 258
          )
            fail();
          for (let i = 0; i < frames.length; i++) {
            const f = frames[i];
            if (
              !f ||
              !finite(f.time, 0, 1) ||
              !finite(f.value, -10000, 10000) ||
              (i > 0 && f.time <= frames[i - 1].time) ||
              (f.easing !== undefined && !['linear', 'smooth'].includes(f.easing))
            )
              fail();
          }
        }
      }
    }
    if (
      p.appliedEdits !== undefined &&
      (!Array.isArray(p.appliedEdits) ||
        p.appliedEdits.length > 200 ||
        p.appliedEdits.some(
          (edit) =>
            !edit ||
            !string(edit.label) ||
            edit.label.length > 500 ||
            !string(edit.date) ||
            !Number.isFinite(Date.parse(edit.date)) ||
            (edit.sequenceId !== undefined && !string(edit.sequenceId)),
        ))
    )
      fail();
    if (
      p.settings.transcriptionQuality !== undefined &&
      !['fast', 'balanced', 'detailed'].includes(p.settings.transcriptionQuality)
    )
      fail();
    if (
      p.settings.transcriptionDevice !== undefined &&
      !['auto', 'cpu'].includes(p.settings.transcriptionDevice)
    )
      fail();
    const validateWords = (words: Word[], maxDuration: number) => {
      if (!Array.isArray(words) || words.length > 200000) fail();
      for (const w of words)
        if (
          !string(w.id) ||
          !string(w.text) ||
          !string(w.speakerId) ||
          !finite(w.start, 0, maxDuration) ||
          !finite(w.end, w.start, maxDuration + 0.1) ||
          (w.cueId !== undefined && !string(w.cueId)) ||
          (w.timingEstimated !== undefined && typeof w.timingEstimated !== 'boolean')
        )
          fail();
    };
    for (const m of p.media)
      if (
        !string(m.id) ||
        !string(m.name) ||
        !finite(m.duration, 0.01) ||
        !finite(m.width, 1, 16384) ||
        !finite(m.height, 1, 16384) ||
        !finite(m.size, 0, 1e12) ||
        !string(m.type) ||
        (m.folder !== undefined && (!string(m.folder) || m.folder.length > 60)) ||
        (m.starred !== undefined && typeof m.starred !== 'boolean')
      )
        fail();
    for (const t of p.tracks)
      if (
        !string(t.id) ||
        !string(t.name) ||
        !['video', 'audio'].includes(t.kind) ||
        !finite(t.height, 28, 200) ||
        ['locked', 'muted', 'hidden'].some((k) => typeof t[k as keyof Track] !== 'boolean')
      )
        fail();
    for (const c of p.clips) {
      const m = p.media.find((m) => m.id === c.mediaId);
      if (
        !m ||
        !string(c.id) ||
        !p.tracks.some((t) => t.id === c.trackId) ||
        (c.audioDetached !== undefined && typeof c.audioDetached !== 'boolean') ||
        (c.audioRole !== undefined && !['voice', 'music'].includes(c.audioRole)) ||
        (c.autoDuck !== undefined && typeof c.autoDuck !== 'boolean') ||
        (c.voiceEnhance !== undefined && typeof c.voiceEnhance !== 'boolean') ||
        !finite(c.start) ||
        !finite(c.sourceStart) ||
        !finite(c.sourceEnd, c.sourceStart + 0.001, m.duration + 0.1)
      )
        fail();
      if (c.captionWords !== undefined) validateWords(c.captionWords, m!.duration);
      if (c.effects !== undefined && !validVisualEffects(c.effects)) fail();
      if (c.keyframes !== undefined) {
        if (
          !c.keyframes ||
          typeof c.keyframes !== 'object' ||
          Object.keys(c.keyframes).some(
            (key) => !animatedProperties.includes(key as (typeof animatedProperties)[number]),
          )
        )
          fail();
        for (const key of animatedProperties) {
          const frames = c.keyframes[key];
          if (frames === undefined) continue;
          if (!Array.isArray(frames) || frames.length > 258) fail();
          frames.forEach((frame, i) => {
            if (
              !finite(frame.time, 0, m!.duration) ||
              !finite(
                frame.value,
                key === 'scale' ? 0.1 : key === 'opacity' ? 0 : -10000,
                key === 'scale' ? 5 : key === 'opacity' ? 1 : 10000,
              ) ||
              (i > 0 && frame.time <= frames[i - 1].time) ||
              (frame.easing !== undefined && !['linear', 'smooth'].includes(frame.easing))
            )
              fail();
          });
        }
      }
      for (const k of [
        'x',
        'y',
        'scale',
        'rotation',
        'opacity',
        'volume',
        'speed',
        'fadeIn',
        'fadeOut',
        'crop',
      ] as const)
        if (
          !finite(c.properties[k], k === 'x' || k === 'y' || k === 'rotation' ? -10000 : 0, 10000)
        )
          fail();
      if (
        !finite(c.properties.speed, 0.25, 4) ||
        !finite(c.properties.scale, 0.1, 5) ||
        !finite(c.properties.opacity, 0, 1) ||
        !finite(c.properties.volume, 0, 2) ||
        !finite(c.properties.crop, 0, 45) ||
        ![
          'None',
          'Custom',
          'Punch In',
          'Punch Out',
          'Smooth Zoom',
          'Bounce',
          'Slide Left',
          'Slide Right',
          'Shake',
        ].includes(c.properties.animation)
      )
        fail();
    }
    for (const t of p.transcripts) {
      if (
        !p.media.some((m) => m.id === t.mediaId) ||
        !string(t.language) ||
        !['local', 'demo', 'imported'].includes(t.source) ||
        !Array.isArray(t.words) ||
        t.words.length > 200000
      )
        fail();
      validateWords(t.words, 86400);
      if (t.model !== undefined && !string(t.model)) fail();
    }
    for (const s of p.speakers)
      if (!string(s.id) || !string(s.name) || !/^#[0-9a-f]{6}$/i.test(s.color)) fail();
    function validateStyle(style: CaptionStyle) {
      if (
        !['Clean', 'Bold', 'Brainrot'].includes(style.preset) ||
        !finite(style.intensity, 0, 100) ||
        !Number.isInteger(style.wordsPerCaption) ||
        !finite(style.wordsPerCaption, 1, 8) ||
        !['bottom', 'center', 'top', 'custom'].includes(style.position) ||
        (style.customPosition !== undefined &&
          (!finite(style.customPosition.x, 5, 95) || !finite(style.customPosition.y, 5, 95))) ||
        (style.emoji !== undefined && !['None', 'Low', 'Medium', 'High'].includes(style.emoji))
      )
        fail();
      const a = style.appearance;
      if (
        a !== undefined &&
        (!finite(a.size, 1, 20) ||
          !finite(a.outline, 0, 8) ||
          !finite(a.margin, 5, 35) ||
          typeof a.bold !== 'boolean' ||
          typeof a.speakerColors !== 'boolean' ||
          [a.color, a.accent, a.outlineColor].some((c) => !/^#[0-9a-f]{6}$/i.test(c)) ||
          (a.boxColor !== undefined && !/^#[0-9a-f]{6}$/i.test(a.boxColor)) ||
          (a.boxOpacity !== undefined && !finite(a.boxOpacity, 0, 1)) ||
          (a.boxRadius !== undefined && !finite(a.boxRadius, 0, 50)) ||
          (a.boxPadding !== undefined && !finite(a.boxPadding, 0, 50)) ||
          (a.animation !== undefined &&
            !['none', 'pop', 'bounce', 'glow', 'typewriter', 'karaoke'].includes(a.animation)) ||
          (a.shadow !== undefined && typeof a.shadow !== 'boolean') ||
          (a.italic !== undefined && typeof a.italic !== 'boolean') ||
          (a.underline !== undefined && typeof a.underline !== 'boolean') ||
          (a.strikethrough !== undefined && typeof a.strikethrough !== 'boolean') ||
          (a.align !== undefined && !['left', 'center', 'right', 'justify'].includes(a.align)) ||
          (a.letterSpacing !== undefined && !finite(a.letterSpacing, -0.05, 0.5)) ||
          (a.wordSpacing !== undefined && !finite(a.wordSpacing, -0.15, 1)) ||
          (a.lineHeight !== undefined && !finite(a.lineHeight, 0.8, 3)) ||
          (a.fontFamily !== undefined && !['sans', 'impact', 'serif', 'mono'].includes(a.fontFamily)))
      )
        fail();
    }
    validateStyle(p.captions);
    if (p.captions.savedStyles !== undefined) {
      if (!Array.isArray(p.captions.savedStyles) || p.captions.savedStyles.length > 20) fail();
      for (const saved of p.captions.savedStyles) {
        if (
          !string(saved.id) ||
          !string(saved.name) ||
          !saved.name.trim() ||
          saved.name.length > 40
        )
          fail();
        validateStyle(saved.style);
      }
      if (new Set(p.captions.savedStyles.map((s) => s.id)).size !== p.captions.savedStyles.length)
        fail();
    }
    if (
      !['None', 'Low', 'Medium', 'High'].includes(p.captions.emoji) ||
      typeof p.captions.enabled !== 'boolean' ||
      typeof p.captions.safeArea !== 'boolean'
    )
      fail();
    if (
      !finite(p.exportSettings.width, 16, 3840) ||
      !finite(p.exportSettings.height, 16, 3840) ||
      !finite(p.exportSettings.fps, 1, 60) ||
      !finite(p.exportSettings.quality, 1, 100) ||
      (p.exportSettings.videoBitrate !== undefined &&
        !finite(p.exportSettings.videoBitrate, 100000, 60000000)) ||
      (p.exportSettings.audioBitrate !== undefined &&
        ![64, 96, 128, 160, 192, 256, 320].includes(p.exportSettings.audioBitrate))
    )
      fail();
    if (p.sequences !== undefined) {
      if (
        !Array.isArray(p.sequences) ||
        !p.sequences.length ||
        p.sequences.length > 30 ||
        !p.sequences.some((s) => s.id === p.activeSequenceId) ||
        new Set(p.sequences.map((s) => s.id)).size !== p.sequences.length
      )
        fail();
      p.sequences = p.sequences.map((s) => {
        if (!string(s.id) || !string(s.name) || !s.name.trim() || s.name.length > 80) fail();
        const checked = validateProject({
          ...p,
          settings: s.settings,
          clips: s.clips,
          tracks: s.tracks,
          captions: s.captions,
          subtitleVariants: s.subtitleVariants,
          publishing: s.publishing,
          chapters: s.chapters,
          exportSettings: s.exportSettings,
          suggestions: [],
          sequences: undefined,
          activeSequenceId: undefined,
        });
        return {
          id: s.id,
          name: s.name,
          settings: checked.settings,
          clips: checked.clips,
          tracks: checked.tracks,
          captions: checked.captions,
          subtitleVariants: checked.subtitleVariants,
          publishing: checked.publishing,
          chapters: checked.chapters,
          exportSettings: checked.exportSettings,
          suggestions: [],
        };
      });
    } else if (p.activeSequenceId !== undefined) fail();
    // Suggestions are regenerated from the validated timeline; never trust imported operations.
    p.suggestions = [];
    if (
      new Set(p.media.map((m) => m.id)).size !== p.media.length ||
      new Set(p.clips.map((c) => c.id)).size !== p.clips.length
    )
      fail();
    return p;
  } catch {
    return fail() as never;
  }
}
