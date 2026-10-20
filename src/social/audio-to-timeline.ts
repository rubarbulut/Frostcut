import type { Project, Clip, Track } from '../model';
import { clipEnd, isAudioClip } from '../model';
import type {
  AssetAudioProfile,
  TimeRange,
  AudioHighlightCandidate,
} from '../audio/asset-audio-profile';

/**
 * Mapped time range on the timeline reflecting clip speed and source-to-timeline transformation.
 * All units are in seconds.
 */
export interface TimelineAudioRegion {
  readonly start: number; // timeline seconds
  readonly end: number; // timeline seconds
  readonly duration: number; // timeline seconds
  readonly sourceStart: number; // source seconds
  readonly sourceEnd: number; // source seconds
  readonly clipId: string;
  readonly trackId: string;
  readonly assetId: string;
  readonly speed: number;
  readonly isAudible: boolean;
}

/**
 * Highlight candidate mapped to timeline coordinates.
 */
export interface TimelineAudioHighlight {
  readonly start: number; // timeline seconds
  readonly end: number; // timeline seconds
  readonly duration: number; // timeline seconds
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly clipId: string;
  readonly trackId: string;
  readonly assetId: string;
  readonly speed: number;
  readonly score: number;
  readonly rawReason: string;
  readonly isAudible: boolean;
}

/**
 * Result of mapping one or more AssetAudioProfiles across the project timeline.
 */
export interface ProjectTimelineAudioMapping {
  readonly projectDuration: number;
  readonly silenceRegions: readonly TimelineAudioRegion[];
  readonly speechRegions: readonly TimelineAudioRegion[];
  readonly highlightRegions: readonly TimelineAudioHighlight[];
  readonly getAudioActivityAt: (timelineTime: number) => {
    readonly energy: number; // 0.0 to 1.0 (speech/reaction energy)
    readonly rmsDb: number; // dBFS (-100 to 0)
    readonly isAudible: boolean;
    readonly clipId?: string;
    readonly assetId?: string;
  };
}

/**
 * Converts a source-domain range [sourceStart, sourceEnd] through a timeline clip.
 * Returns null if the source range does not intersect the clip's used source interval.
 */
export function mapSourceRangeToClipTimeline(
  sourceStart: number,
  sourceEnd: number,
  clip: Clip,
  isAudible: boolean,
): TimelineAudioRegion | null {
  if (
    !Number.isFinite(sourceStart) ||
    !Number.isFinite(sourceEnd) ||
    sourceEnd <= sourceStart ||
    clip.properties.speed <= 0 ||
    !Number.isFinite(clip.properties.speed)
  ) {
    return null;
  }

  // Find intersection with clip's source range
  const intersectionStart = Math.max(sourceStart, clip.sourceStart);
  const intersectionEnd = Math.min(sourceEnd, clip.sourceEnd);

  if (intersectionEnd <= intersectionStart) {
    return null;
  }

  const speed = clip.properties.speed;
  const tlStart = clip.start + (intersectionStart - clip.sourceStart) / speed;
  const tlEnd = clip.start + (intersectionEnd - clip.sourceStart) / speed;

  return {
    start: Math.round(tlStart * 1000) / 1000,
    end: Math.round(tlEnd * 1000) / 1000,
    duration: Math.round((tlEnd - tlStart) * 1000) / 1000,
    sourceStart: intersectionStart,
    sourceEnd: intersectionEnd,
    clipId: clip.id,
    trackId: clip.trackId,
    assetId: clip.mediaId,
    speed,
    isAudible,
  };
}

/**
 * Determines whether a clip produces audible sound on the timeline based on:
 * - Track mute state (track.muted === true)
 * - Track kind / visibility (hidden audio track vs audible hidden video track)
 * - Clip volume setting (volume === 0)
 */
export function isClipAudibleOnTimeline(project: Project, clip: Clip): boolean {
  const track = project.tracks.find((t) => t.id === clip.trackId);
  if (!track) return false;

  // If track is explicitly muted, clip is silent
  if (track.muted) return false;

  // Clip volume at 0 is silent
  if (clip.properties.volume <= 0.001) return false;

  // Audio tracks that are hidden are treated as muted
  if (track.kind === 'audio' && track.hidden) return false;

  return true;
}

/**
 * Maps asset-level source-domain audio profiles onto the project's timeline clips.
 * Pure function: never mutates input profiles or project objects.
 * Correctly accounts for:
 * - 0.5x, 1x, 2x speeds (speed scaling)
 * - The same asset being used in multiple distinct clips
 * - Muted and hidden tracks
 * - Detached audio clips
 * - Source intervals outside clip bounds
 */
export function mapAssetProfilesToTimeline(
  project: Project,
  profiles: ReadonlyMap<string, AssetAudioProfile> | readonly AssetAudioProfile[],
): ProjectTimelineAudioMapping {
  const profileMap = new Map<string, AssetAudioProfile>();
  if (Array.isArray(profiles)) {
    for (const p of profiles) profileMap.set(p.assetId, p);
  } else {
    for (const [id, p] of (profiles as ReadonlyMap<string, AssetAudioProfile>).entries()) {
      profileMap.set(id, p);
    }
  }

  const silenceRegions: TimelineAudioRegion[] = [];
  const speechRegions: TimelineAudioRegion[] = [];
  const highlightRegions: TimelineAudioHighlight[] = [];

  // Group clips by mediaId for indexed lookup
  const clipsByMedia = new Map<string, Clip[]>();
  for (const clip of project.clips) {
    if (!clipsByMedia.has(clip.mediaId)) {
      clipsByMedia.set(clip.mediaId, []);
    }
    clipsByMedia.get(clip.mediaId)!.push(clip);
  }

  // Map each asset profile across all clips using it
  for (const [assetId, profile] of profileMap.entries()) {
    if (profile.status && profile.status !== 'available') {
      continue;
    }
    const clips = clipsByMedia.get(assetId);
    if (!clips || clips.length === 0) continue;

    for (const clip of clips) {
      const isAudible = isClipAudibleOnTimeline(project, clip);

      // 1. Map silence regions
      if (profile.silenceMask?.length) {
        for (const range of profile.silenceMask) {
          const mapped = mapSourceRangeToClipTimeline(range.start, range.end, clip, isAudible);
          if (mapped) {
            silenceRegions.push(mapped);
          }
        }
      }

      // 2. Map speech regions
      if (profile.activeSpeechRegions?.length) {
        for (const range of profile.activeSpeechRegions) {
          const mapped = mapSourceRangeToClipTimeline(range.start, range.end, clip, isAudible);
          if (mapped) {
            speechRegions.push(mapped);
          }
        }
      }

      // 3. Map highlights
      if (profile.highlights?.length) {
        for (const hl of profile.highlights) {
          const mapped = mapSourceRangeToClipTimeline(hl.start, hl.end, clip, isAudible);
          if (mapped) {
            highlightRegions.push({
              start: mapped.start,
              end: mapped.end,
              duration: mapped.duration,
              sourceStart: mapped.sourceStart,
              sourceEnd: mapped.sourceEnd,
              clipId: mapped.clipId,
              trackId: mapped.trackId,
              assetId: mapped.assetId,
              speed: mapped.speed,
              score: hl.peakSpeechScore ?? 0.5,
              rawReason: hl.reason,
              isAudible,
            });
          }
        }
      }
    }
  }

  // Sort timeline regions chronologically
  silenceRegions.sort((a, b) => a.start - b.start);
  speechRegions.sort((a, b) => a.start - b.start);
  highlightRegions.sort((a, b) => a.start - b.start);

  // Prepare point-in-time sampler
  // Find active clips at timeline time t
  const getAudioActivityAt = (timelineTime: number) => {
    let maxEnergy = 0;
    let maxRmsDb = -100;
    let foundAudible = false;
    let activeClipId: string | undefined;
    let activeAssetId: string | undefined;

    for (const clip of project.clips) {
      if (timelineTime >= clip.start && timelineTime < clipEnd(clip)) {
        const isAudible = isClipAudibleOnTimeline(project, clip);
        const profile = profileMap.get(clip.mediaId);

        if (profile && (!profile.status || profile.status === 'available')) {
          const speed = clip.properties.speed;
          const sourceTime = clip.sourceStart + (timelineTime - clip.start) * speed;

          if (sourceTime >= 0 && sourceTime <= profile.duration) {
            const frameIdx = Math.min(
              profile.frameCount - 1,
              Math.max(0, Math.round((sourceTime * 1000) / profile.hopSizeMs)),
            );

            const energy = isAudible && profile.speechEnergyScore
              ? (profile.speechEnergyScore[frameIdx] ?? 0)
              : 0;
            const rms = isAudible && profile.rmsDb
              ? (profile.rmsDb[frameIdx] ?? -100)
              : -100;

            if (energy > maxEnergy || rms > maxRmsDb) {
              maxEnergy = Math.max(maxEnergy, energy);
              maxRmsDb = Math.max(maxRmsDb, rms);
              foundAudible = foundAudible || isAudible;
              activeClipId = clip.id;
              activeAssetId = clip.mediaId;
            }
          }
        }
      }
    }

    return {
      energy: maxEnergy,
      rmsDb: maxRmsDb,
      isAudible: foundAudible,
      clipId: activeClipId,
      assetId: activeAssetId,
    };
  };

  // Compute total project duration safely
  let maxEnd = 0;
  for (const c of project.clips) {
    const end = clipEnd(c);
    if (end > maxEnd) maxEnd = end;
  }

  return {
    projectDuration: maxEnd,
    silenceRegions,
    speechRegions,
    highlightRegions,
    getAudioActivityAt,
  };
}
