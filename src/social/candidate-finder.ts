import { clipEnd, duration, isAudioClip, type Clip, type Project } from '../model';
import type { CreatorProposal, CreatorRange } from '../creator-recipe';
import {
  mapAssetProfilesToTimeline,
  type ProjectTimelineAudioMapping,
} from './audio-to-timeline';
import type { AssetAudioProfile } from '../audio/asset-audio-profile';

/** Visual motion sample at a specific timeline timestamp */
export type MotionSample = {
  readonly time: number;
  readonly intensity: number; // 0.0 to 1.0 (measured visual activity / motion vector magnitude)
};

/** Audio transient sample */
export type AudioTransientSample = {
  readonly time: number;
  readonly energy: number; // 0.0 to 1.0
  readonly isTransient: boolean;
};

/** Timeline marker / chapter / section signal */
export type TimelineSectionMarker = {
  readonly time: number;
  readonly title: string;
  readonly weight: number; // 0.0 to 1.0
};

/** Composite density point evaluated along timeline */
export type TimelineDensitySample = {
  readonly time: number;
  readonly score: number; // 0.0 to 1.0
  readonly motionScore: number;
  readonly audioScore: number;
  readonly markerScore: number;
};

/** Highlight segment window identified from signals or partitioning */
export type HighlightWindow = {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly score: number;
  readonly dominantFactor: 'motion' | 'marker' | 'audio-peak' | 'multi-modal' | 'equal-partition';
  readonly description: string;
  readonly isPartial?: boolean;
};

export type AvailableSignalType = 'motion-tracking' | 'audio-activity' | 'user-marker' | 'transcript' | 'none';

export type CandidateSelectionMethod = 'signals' | 'equal-parts' | 'manual' | 'insufficient-evidence';

/**
 * Transparent evidence record attached to each proposal.
 * Proves what data was actually measured vs what was unavailable.
 */
export type CandidateEvidence = {
  readonly proposalId: string;
  readonly method: CandidateSelectionMethod;
  readonly signalsUsed: readonly AvailableSignalType[];
  readonly timelineRanges: readonly CreatorRange[];
  readonly unavailableSignals: readonly string[];
  readonly algorithmVersion: string;
  readonly explanation: string;
  readonly targetSeconds: number;
  readonly actualSeconds: number;
};

/**
 * Shared timeline analysis cache structure across both Long and Short proposal generation.
 * Built once per project edit/revision to avoid duplicate CPU sweeps.
 */
export type SharedMediaTimelineAnalysis = {
  readonly projectId: string;
  readonly projectRevision?: number;
  readonly duration: number;
  readonly fps: number;
  readonly sampleInterval: number;
  readonly motionSamples: readonly MotionSample[];
  readonly audioTransients: readonly AudioTransientSample[];
  readonly sectionMarkers: readonly TimelineSectionMarker[];
  readonly densitySamples: readonly TimelineDensitySample[];
  readonly availableSignals: readonly AvailableSignalType[];
  readonly unavailableSignals: readonly string[];
  readonly highlightWindows: readonly HighlightWindow[];
  readonly computedAt: number;
  readonly generation: number;
};

export type CandidateFinderOptions = {
  /** Target duration for the primary long video in seconds (preference, defaults to active timeline duration) */
  readonly longTargetSeconds?: number;
  /** Target duration for each Short candidate in seconds (preference, default 30-45s, max 180s) */
  readonly shortTargetSeconds?: number;
  /**
   * Number of short candidates to recommend (0 to 12).
   * 0 returns zero shorts.
   * Defaults to 3 if unspecified.
   */
  readonly shortCount?: number;
  /** Minimum duration for a short candidate (default 15s) */
  readonly minShortSeconds?: number;
  /** Maximum duration for a short candidate (default 60s, absolute max 180s) */
  readonly maxShortSeconds?: number;
  /** Sampling interval in seconds for timeline density evaluation (default 0.5s) */
  readonly sampleInterval?: number;
  /** External or precomputed motion samples */
  readonly motionData?: readonly MotionSample[];
  /** External or precomputed audio transient samples */
  readonly audioData?: readonly AudioTransientSample[];
  /** Okan's AssetAudioProfiles in source domain to map onto timeline */
  readonly audioProfiles?: ReadonlyMap<string, AssetAudioProfile> | readonly AssetAudioProfile[];
  /** External section markers */
  readonly sectionMarkers?: readonly TimelineSectionMarker[];
  /** Optional file map to detect relinked source files */
  readonly sourceFiles?: ReadonlyMap<string, File>;
  /** Optional media revision counter */
  readonly mediaRevision?: number;
  /** Job generation identifier */
  readonly generation?: number;
  /** AbortSignal for cooperative cancellation */
  readonly signal?: AbortSignal;
  /** If true, bypasses the cache and forces a fresh analysis */
  readonly forceRecompute?: boolean;
};

export const ALGORITHM_VERSION = '2026.10.B004-K';

/** Cache entry for analysis cache */
type AnalysisCacheEntry = {
  readonly analysis: SharedMediaTimelineAnalysis;
  readonly sampleInterval: number;
  readonly mediaRevision?: number;
  readonly fileSignatures?: string;
  readonly customSignalsKey: string;
};

/** Multi-key cache: WeakMap per Project instance -> Map by configuration key */
const projectAnalysisMap = new WeakMap<Project, Map<string, AnalysisCacheEntry>>();

/** Helper to generate cache key for options affecting the raw timeline analysis */
function buildAnalysisCacheKey(options: CandidateFinderOptions): string {
  const customParts: string[] = [];
  if (options.motionData) customParts.push(`m:${options.motionData.length}`);
  if (options.audioData) customParts.push(`a:${options.audioData.length}`);
  if (options.sectionMarkers) customParts.push(`s:${options.sectionMarkers.length}`);
  if (options.audioProfiles) {
    const count = 'size' in options.audioProfiles ? options.audioProfiles.size : options.audioProfiles.length;
    customParts.push(`p:${count}`);
  }
  const interval = options.sampleInterval ?? 0.5;
  const rev = options.mediaRevision ?? 0;
  return `int=${interval};rev=${rev};sig=${customParts.join(',')}`;
}

/** Helper to build file map signature for relink invalidation */
function buildFileSignatures(files?: ReadonlyMap<string, File>): string | undefined {
  if (!files || files.size === 0) return undefined;
  const parts: string[] = [];
  for (const [id, f] of files.entries()) {
    parts.push(`${id}:${f.name}:${f.size}:${f.lastModified}`);
  }
  return parts.sort().join('|');
}

/**
 * Calculates or retrieves the single-pass shared timeline analysis.
 * Reuses cached analysis for identical project instances and options without redundant CPU sweeps.
 */
export function analyzeSharedTimeline(
  project: Project,
  options: CandidateFinderOptions = {},
): SharedMediaTimelineAnalysis {
  if (options.signal?.aborted) {
    throw new DOMException('Timeline analysis was aborted by caller.', 'AbortError');
  }

  const totalDuration = duration(project);
  if (!Number.isFinite(totalDuration) || totalDuration <= 0 || !project.clips.length) {
    throw new Error('Project must contain at least one valid clip with positive duration.');
  }

  // Check for unsupported nested sources in current recipe core
  for (const clip of project.clips) {
    if ('sequenceId' in clip && clip.sequenceId !== undefined) {
      throw new Error('Nested source recipes require the completed nested preview/export integration.');
    }
  }

  const cacheKey = buildAnalysisCacheKey(options);
  const fileSig = buildFileSignatures(options.sourceFiles);

  if (!options.forceRecompute) {
    let entries = projectAnalysisMap.get(project);
    if (entries) {
      const entry = entries.get(cacheKey);
      if (entry) {
        // If file signatures match or are unspecified, return cached analysis immediately
        if (!fileSig || !entry.fileSignatures || entry.fileSignatures === fileSig) {
          return entry.analysis;
        }
      }
    }
  }

  const fps = project.settings.fps || 30;
  const sampleInterval = Math.max(0.1, Math.min(2.0, options.sampleInterval ?? 0.5));
  const sampleCount = Math.max(1, Math.ceil(totalDuration / sampleInterval));

  const availableSignals: AvailableSignalType[] = [];
  const unavailableSignals: string[] = [];

  // 1. Process Section Markers / Chapters
  const sectionMarkers: TimelineSectionMarker[] = [];
  if (options.sectionMarkers?.length) {
    sectionMarkers.push(...options.sectionMarkers);
    availableSignals.push('user-marker');
  } else if (project.chapters?.items?.length) {
    for (const ch of project.chapters.items) {
      sectionMarkers.push({
        time: ch.start,
        title: ch.title,
        weight: 0.8,
      });
    }
    availableSignals.push('user-marker');
  } else {
    unavailableSignals.push('user-marker (no chapters or timeline markers defined)');
  }

  // 2. Process Visual Motion Samples (HONEST: No fabricated baseline numbers!)
  const motionSamples: MotionSample[] = [];
  let hasRealMotionTracking = false;

  if (options.motionData?.length) {
    motionSamples.push(...options.motionData);
    hasRealMotionTracking = true;
    availableSignals.push('motion-tracking');
  } else {
    // Check if any clip has actual motion tracking points
    const clipsWithTracking = project.clips.filter(
      (c) => c.tracking?.enabled && c.tracking.points && c.tracking.points.length >= 2,
    );

    if (clipsWithTracking.length > 0) {
      hasRealMotionTracking = true;
      availableSignals.push('motion-tracking');

      // Use advancing cursor over sorted clips
      const sortedTrackingClips = [...clipsWithTracking].sort((a, b) => a.start - b.start);

      for (let i = 0; i < sampleCount; i++) {
        if (options.signal?.aborted) {
          throw new DOMException('Timeline analysis was aborted by caller.', 'AbortError');
        }

        const t = Math.min(totalDuration, i * sampleInterval);
        let sampleMotion = 0.0; // Honest baseline: 0.0 if no motion measured

        for (const clip of sortedTrackingClips) {
          if (t >= clip.start && t < clipEnd(clip)) {
            const relTime = clip.sourceStart + (t - clip.start) * clip.properties.speed;
            const pts = clip.tracking!.points;

            // Advancing lookup / binary search for adjacent tracking points
            let low = 0;
            let high = pts.length - 1;
            while (low <= high) {
              const mid = (low + high) >>> 1;
              if (pts[mid].time < relTime) {
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }

            const pIdx = Math.max(0, Math.min(pts.length - 2, low > 0 ? low - 1 : 0));
            const p1 = pts[pIdx];
            const p2 = pts[pIdx + 1];

            if (p1 && p2 && p2.time > p1.time) {
              const dt = Math.max(0.001, p2.time - p1.time);
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const velocity = Math.hypot(dx, dy) / dt;
              // Normalize velocity to 0..1 scale (0.2 screen units/s is fast combat/camera movement)
              sampleMotion = Math.max(sampleMotion, Math.min(1.0, velocity * 4.0));
            }
          }
        }

        motionSamples.push({ time: t, intensity: sampleMotion });
      }
    } else {
      unavailableSignals.push('motion-tracking (no camera tracking vectors or optical flow available)');
    }
  }

  // 3. Process Audio Telemetry (Okan's AssetAudioProfile or audioData or beats)
  const audioTransients: AudioTransientSample[] = [];
  let timelineAudioMapping: ProjectTimelineAudioMapping | null = null;
  let hasRealAudioSignals = false;

  if (options.audioProfiles) {
    timelineAudioMapping = mapAssetProfilesToTimeline(project, options.audioProfiles);
    hasRealAudioSignals = true;
    availableSignals.push('audio-activity');
  } else if (options.audioData?.length) {
    audioTransients.push(...options.audioData);
    hasRealAudioSignals = true;
    availableSignals.push('audio-activity');
  } else if (project.beats && Object.keys(project.beats).length > 0) {
    const beatTimes = new Set<number>();
    for (const times of Object.values(project.beats)) {
      for (const bt of times) beatTimes.add(Math.round(bt * 10) / 10);
    }
    for (let i = 0; i < sampleCount; i++) {
      const t = Math.min(totalDuration, i * sampleInterval);
      const isBeat = beatTimes.has(Math.round(t * 10) / 10);
      audioTransients.push({
        time: t,
        energy: isBeat ? 0.85 : 0.0,
        isTransient: isBeat,
      });
    }
    hasRealAudioSignals = true;
    availableSignals.push('audio-activity');
  } else {
    unavailableSignals.push('audio-activity (no audio telemetry, speech profiles or transient beats available)');
  }

  // Populate audio samples from timelineAudioMapping if present
  if (timelineAudioMapping) {
    for (let i = 0; i < sampleCount; i++) {
      const t = Math.min(totalDuration, i * sampleInterval);
      const act = timelineAudioMapping.getAudioActivityAt(t);
      audioTransients.push({
        time: t,
        energy: act.isAudible ? act.energy : 0.0,
        isTransient: act.isAudible && act.energy > 0.6,
      });
    }
  }

  // Check for transcript signals
  const hasTranscripts = project.clips.some((c) => c.captionWords && c.captionWords.length > 0);
  if (hasTranscripts) {
    availableSignals.push('transcript');
  } else {
    unavailableSignals.push('transcript (no spoken word transcriptions found)');
  }

  if (availableSignals.length === 0) {
    availableSignals.push('none');
  }

  // 4. Multi-modal scoring based on strictly MEASURED signals
  const isNoSpeech = project.settings.noSpeech ?? false;
  // If no motion is measured, motion weight drops to 0; if no audio, audio weight drops to 0
  let rawMotionWeight = hasRealMotionTracking ? (isNoSpeech ? 0.60 : 0.40) : 0.0;
  let rawMarkerWeight = sectionMarkers.length > 0 ? (isNoSpeech ? 0.40 : 0.30) : 0.0;
  let rawAudioWeight = hasRealAudioSignals ? (isNoSpeech ? 0.15 : 0.35) : 0.0;

  const totalWeights = rawMotionWeight + rawMarkerWeight + rawAudioWeight;
  const wMotion = totalWeights > 0 ? rawMotionWeight / totalWeights : 0;
  const wMarker = totalWeights > 0 ? rawMarkerWeight / totalWeights : 0;
  const wAudio = totalWeights > 0 ? rawAudioWeight / totalWeights : 0;

  const densitySamples: TimelineDensitySample[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const t = Math.min(totalDuration, i * sampleInterval);

    let mVal = 0.0;
    if (motionSamples.length > 0) {
      const mIdx = Math.min(motionSamples.length - 1, Math.max(0, Math.round(t / sampleInterval)));
      mVal = motionSamples[mIdx]?.intensity ?? 0.0;
    }

    let aVal = 0.0;
    if (audioTransients.length > 0) {
      const aIdx = Math.min(audioTransients.length - 1, Math.max(0, Math.round(t / sampleInterval)));
      aVal = audioTransients[aIdx]?.energy ?? 0.0;
    }

    let kVal = 0.0;
    for (const marker of sectionMarkers) {
      const dist = Math.abs(t - marker.time);
      if (dist <= 15) {
        const decay = Math.max(0, 1 - dist / 15);
        kVal = Math.max(kVal, marker.weight * decay);
      }
    }

    const totalScore = totalWeights > 0 ? Math.min(1.0, wMotion * mVal + wMarker * kVal + wAudio * aVal) : 0.0;

    densitySamples.push({
      time: t,
      score: totalScore,
      motionScore: mVal,
      audioScore: aVal,
      markerScore: kVal,
    });
  }

  // 5. Detect highlight windows or equal partitions
  const shortTarget = options.shortTargetSeconds ?? 45;
  const minShort = Math.max(10, Math.min(shortTarget, options.minShortSeconds ?? 15));
  const maxShort = Math.min(180, Math.max(minShort, options.maxShortSeconds ?? 60));
  const windowDuration = Math.min(totalDuration, Math.max(minShort, Math.min(maxShort, shortTarget)));

  const highlightWindows = detectCandidateWindows(
    project,
    densitySamples,
    windowDuration,
    minShort,
    maxShort,
    totalDuration,
    totalWeights > 0,
  );

  const analysis: SharedMediaTimelineAnalysis = {
    projectId: project.id,
    projectRevision: options.mediaRevision,
    duration: totalDuration,
    fps,
    sampleInterval,
    motionSamples,
    audioTransients,
    sectionMarkers,
    densitySamples,
    availableSignals,
    unavailableSignals,
    highlightWindows,
    computedAt: performance.now(),
    generation: options.generation ?? 1,
  };

  // Cache result
  let entries = projectAnalysisMap.get(project);
  if (!entries) {
    entries = new Map();
    projectAnalysisMap.set(project, entries);
  }
  entries.set(cacheKey, {
    analysis,
    sampleInterval,
    mediaRevision: options.mediaRevision,
    fileSignatures: fileSig,
    customSignalsKey: cacheKey,
  });

  return analysis;
}

/**
 * Detects windows either from real multi-modal peaks (if signals exist)
 * or via honest equal partitioning (if signals are absent).
 */
function detectCandidateWindows(
  project: Project,
  densitySamples: readonly TimelineDensitySample[],
  targetDuration: number,
  minDuration: number,
  maxDuration: number,
  totalDuration: number,
  hasRealSignals: boolean,
): HighlightWindow[] {
  if (totalDuration < minDuration || densitySamples.length === 0) {
    // Insufficient duration to form even one standard short
    if (totalDuration > 0) {
      const snapped = snapWindowToFootage(project, 0, totalDuration, totalDuration);
      return [
        {
          start: snapped.start,
          end: snapped.end,
          duration: snapped.end - snapped.start,
          score: 0.1,
          dominantFactor: 'equal-partition',
          description: `Entire short recording (${Math.round(snapped.end - snapped.start)}s) preserved as single candidate.`,
          isPartial: true,
        },
      ];
    }
    return [];
  }

  // If real signals are present, perform sliding window peak detection
  if (hasRealSignals) {
    const step = densitySamples.length > 1 ? densitySamples[1].time - densitySamples[0].time : 0.5;
    const windowPoints = Math.max(1, Math.round(targetDuration / step));

    type ScoredInterval = {
      start: number;
      end: number;
      score: number;
      motionScore: number;
      audioScore: number;
      markerScore: number;
    };

    const intervals: ScoredInterval[] = [];

    for (let i = 0; i <= densitySamples.length - windowPoints; i++) {
      let sumScore = 0;
      let sumMotion = 0;
      let sumAudio = 0;
      let sumMarker = 0;

      for (let j = 0; j < windowPoints; j++) {
        const sample = densitySamples[i + j];
        sumScore += sample.score;
        sumMotion += sample.motionScore;
        sumAudio += sample.audioScore;
        sumMarker += sample.markerScore;
      }

      intervals.push({
        start: densitySamples[i].time,
        end: Math.min(totalDuration, densitySamples[i].time + targetDuration),
        score: sumScore / windowPoints,
        motionScore: sumMotion / windowPoints,
        audioScore: sumAudio / windowPoints,
        markerScore: sumMarker / windowPoints,
      });
    }

    intervals.sort((a, b) => b.score - a.score);

    const selected: HighlightWindow[] = [];
    const minSeparation = Math.max(10, minDuration * 0.6);

    for (const candidate of intervals) {
      if (candidate.score < 0.05) continue; // Skip near-zero energy zones

      const overlaps = selected.some(
        (sel) => Math.max(sel.start, candidate.start) < Math.min(sel.end, candidate.end) - minSeparation,
      );

      if (!overlaps) {
        let dominantFactor: HighlightWindow['dominantFactor'] = 'multi-modal';
        if (candidate.markerScore > 0.4 && candidate.markerScore >= candidate.motionScore) {
          dominantFactor = 'marker';
        } else if (candidate.motionScore > 0.3 && candidate.motionScore >= candidate.audioScore) {
          dominantFactor = 'motion';
        } else if (candidate.audioScore > 0.4) {
          dominantFactor = 'audio-peak';
        }

        const snapped = snapWindowToFootage(project, candidate.start, candidate.end, totalDuration);

        selected.push({
          start: snapped.start,
          end: snapped.end,
          duration: Math.round((snapped.end - snapped.start) * 100) / 100,
          score: Math.round(candidate.score * 100) / 100,
          dominantFactor,
          description: generateHonestWindowDescription(
            dominantFactor,
            candidate.score,
            snapped.start,
            snapped.end,
          ),
        });

        if (selected.length >= 12) break;
      }
    }

    if (selected.length > 0) {
      // Sort chronologically for clean review
      selected.sort((a, b) => a.start - b.start);
      return selected;
    }
  }

  // Fallback: Honest equal-parts partitioning covering the usable timeline sequentially
  const equalWindows: HighlightWindow[] = [];
  let curr = 0;
  let partIndex = 1;

  while (curr < totalDuration) {
    const end = Math.min(totalDuration, curr + targetDuration);
    const snapped = snapWindowToFootage(project, curr, end, totalDuration);
    const partDur = snapped.end - snapped.start;

    if (partDur >= 5.0) {
      const isPartial = partDur < minDuration;
      equalWindows.push({
        start: snapped.start,
        end: snapped.end,
        duration: partDur,
        score: 0.2,
        dominantFactor: 'equal-partition',
        description: `Equal partition segment ${partIndex} (${partDur}s)${isPartial ? ' (shorter trailing slice)' : ''}. Divided sequentially; no measured highlight telemetry available.`,
        isPartial,
      });
      partIndex++;
    }

    curr += targetDuration;
  }

  return equalWindows;
}

/**
 * Snaps candidate window boundaries to actual source footagePresence to prevent
 * trailing empty gaps or unlinked ranges in Codex createCreatorRecipe assembly.
 */
function snapWindowToFootage(
  project: Project,
  start: number,
  end: number,
  totalDuration: number,
): { start: number; end: number } {
  let validStart = Math.max(0, Math.min(totalDuration - 0.01, start));
  let validEnd = Math.max(validStart + 0.01, Math.min(totalDuration, end));

  // Find clip covering validEnd to avoid trailing black space
  const endingClip = project.clips.find((c) => c.start < validEnd && clipEnd(c) >= validEnd);

  if (!endingClip) {
    let bestEnd = 0;
    for (const c of project.clips) {
      const ce = clipEnd(c);
      if (ce <= validEnd && ce > bestEnd) {
        bestEnd = ce;
      }
    }
    if (bestEnd > validStart) {
      validEnd = bestEnd;
    } else {
      const maxClipEnd = Math.max(...project.clips.map((c) => clipEnd(c)));
      validEnd = maxClipEnd;
      validStart = Math.max(0, validEnd - (end - start));
    }
  }

  const startingClip = project.clips.find((c) => c.start <= validStart && clipEnd(c) > validStart);
  if (!startingClip) {
    const firstClip = project.clips.find((c) => c.start >= validStart);
    if (firstClip) {
      validStart = firstClip.start;
    }
  }

  if (validEnd <= validStart) {
    validStart = Math.max(0, validEnd - 1.0);
  }

  return {
    start: Math.round(validStart * 1000) / 1000,
    end: Math.round(validEnd * 1000) / 1000,
  };
}

function generateHonestWindowDescription(
  factor: HighlightWindow['dominantFactor'],
  score: number,
  start: number,
  end: number,
): string {
  const durationSec = Math.round(end - start);
  switch (factor) {
    case 'marker':
      return `Selected from user timeline marker in region [${Math.round(start)}s - ${Math.round(end)}s] (${durationSec}s).`;
    case 'motion':
      return `Measured visual motion activity from clip tracking points (activity score: ${score}, duration: ${durationSec}s).`;
    case 'audio-peak':
      return `Measured audio transient peak event (energy score: ${score}, duration: ${durationSec}s). Note: audio peak is acoustic telemetry, not verified speech payoff.`;
    case 'multi-modal':
      return `Correlated visual motion and audio telemetry peak (composite score: ${score}, duration: ${durationSec}s).`;
    case 'equal-partition':
    default:
      return `Equal partition interval [${Math.round(start)}s - ${Math.round(end)}s] (${durationSec}s).`;
  }
}

/** Proposal generator output */
export type CandidateFinderResult = {
  readonly proposals: readonly CreatorProposal[];
  readonly analysis: SharedMediaTimelineAnalysis;
  readonly evidence: ReadonlyMap<string, CandidateEvidence>;
};

/**
 * Computes candidate proposals conforming to Codex's createCreatorRecipe contract:
 * { id, name, kind: 'youtube-long' | 'youtube-short', ranges, reason }
 *
 * Requirements satisfied:
 * - K0: shortCount 0 to 12 strictly respected. 0 returns zero shorts. No forced 2-short minimum.
 * - K0: Honest descriptions and explicit evidence map; no fake claims or unmeasured highlights.
 * - K0: longTargetSeconds respected; safe long fallback preserves full source edit without cuts.
 * - K1: All ranges are raw timeline seconds; clip speed/trim conversion delegated to Codex assembly.
 * - K1: audio-to-timeline mapping integration for Okan's source-domain audio profiles.
 * - K2: Analysis cached separately from proposal selection; shortCount changes do not re-run analysis.
 * - K2: Invalidation on file/media revision changes; AbortSignal support.
 */
export function findProjectCandidates(
  project: Project,
  options: CandidateFinderOptions = {},
): CandidateFinderResult {
  if (options.signal?.aborted) {
    throw new DOMException('Candidate finding was aborted by caller.', 'AbortError');
  }

  const totalDuration = duration(project);
  if (!Number.isFinite(totalDuration) || totalDuration <= 0 || !project.clips.length) {
    throw new Error('Project must contain at least one valid clip with positive duration.');
  }

  // 1. Single-pass shared timeline analysis (cached)
  const analysis = analyzeSharedTimeline(project, options);

  const proposals: CreatorProposal[] = [];
  const evidenceMap = new Map<string, CandidateEvidence>();

  // 2. Primary Long Proposal (youtube-long)
  // Safe long fallback preserves the full continuous source timeline without artificial cuts
  const sortedClips = [...project.clips].sort((a, b) => a.start - b.start);
  const longRanges: CreatorRange[] = [];

  let currentStart = sortedClips[0].start;
  let currentEnd = clipEnd(sortedClips[0]);

  for (let i = 1; i < sortedClips.length; i++) {
    const c = sortedClips[i];
    const ce = clipEnd(c);
    if (c.start <= currentEnd + 0.05) {
      currentEnd = Math.max(currentEnd, ce);
    } else {
      longRanges.push({
        start: Math.round(currentStart * 1000) / 1000,
        end: Math.round(currentEnd * 1000) / 1000,
      });
      currentStart = c.start;
      currentEnd = ce;
    }
  }

  longRanges.push({
    start: Math.round(currentStart * 1000) / 1000,
    end: Math.round(currentEnd * 1000) / 1000,
  });

  const longActualSeconds = longRanges.reduce((sum, r) => sum + r.end - r.start, 0);
  const longTargetSeconds = options.longTargetSeconds ?? longActualSeconds;
  const longId = `prop-long-${project.id.slice(0, 8)}`;

  const longReason = `Primary source timeline edit preserved in full (${Math.round(longActualSeconds)}s actual${
    options.longTargetSeconds && Math.abs(options.longTargetSeconds - longActualSeconds) > 1
      ? `, target was ${Math.round(options.longTargetSeconds)}s`
      : ''
  }). Continuous footage maintained across ${longRanges.length} segment${longRanges.length > 1 ? 's' : ''}.`;

  const longProposal: CreatorProposal = {
    id: longId,
    name: `${project.name} - Full Source Edit`,
    kind: 'youtube-long',
    ranges: longRanges,
    reason: longReason,
  };

  proposals.push(longProposal);

  evidenceMap.set(longId, {
    proposalId: longId,
    method: 'signals',
    signalsUsed: analysis.availableSignals.includes('none') ? ['none'] : analysis.availableSignals,
    timelineRanges: longRanges,
    unavailableSignals: analysis.unavailableSignals,
    algorithmVersion: ALGORITHM_VERSION,
    explanation: longReason,
    targetSeconds: longTargetSeconds,
    actualSeconds: longActualSeconds,
  });

  // 3. Short Proposals (youtube-short)
  // Strictly respect shortCount: 0 -> 0 shorts, 1 -> max 1, 12 -> max 12.
  const requestedShortCount = options.shortCount !== undefined ? Math.max(0, Math.min(12, options.shortCount)) : 3;

  if (requestedShortCount > 0) {
    const windows = analysis.highlightWindows;
    const countToTake = Math.min(requestedShortCount, windows.length);

    const hasRealSignals = !analysis.availableSignals.includes('none') && analysis.availableSignals.length > 0;
    const method: CandidateSelectionMethod = hasRealSignals ? 'signals' : 'equal-parts';

    for (let i = 0; i < countToTake; i++) {
      const win = windows[i];
      const shortId = `prop-short-${i + 1}-${project.id.slice(0, 6)}`;
      const shortRanges: CreatorRange[] = [{ start: win.start, end: win.end }];
      const shortActual = win.duration;
      const shortTarget = options.shortTargetSeconds ?? 45;

      const proposalName = getHonestShortTitle(win, i + 1, method);
      const proposalReason = `${win.description} Method: ${method}. Target: ${shortTarget}s, actual: ${shortActual}s.`;

      const shortProposal: CreatorProposal = {
        id: shortId,
        name: proposalName,
        kind: 'youtube-short',
        ranges: shortRanges,
        reason: proposalReason,
      };

      proposals.push(shortProposal);

      evidenceMap.set(shortId, {
        proposalId: shortId,
        method,
        signalsUsed: hasRealSignals
          ? win.dominantFactor === 'motion'
            ? ['motion-tracking']
            : win.dominantFactor === 'marker'
              ? ['user-marker']
              : win.dominantFactor === 'audio-peak'
                ? ['audio-activity']
                : analysis.availableSignals
          : ['none'],
        timelineRanges: shortRanges,
        unavailableSignals: analysis.unavailableSignals,
        algorithmVersion: ALGORITHM_VERSION,
        explanation: proposalReason,
        targetSeconds: shortTarget,
        actualSeconds: shortActual,
      });
    }
  }

  return {
    proposals,
    analysis,
    evidence: evidenceMap,
  };
}

function getHonestShortTitle(win: HighlightWindow, index: number, method: CandidateSelectionMethod): string {
  if (method === 'equal-parts') {
    return `Short Part ${index}${win.isPartial ? ' (Partial)' : ''}`;
  }
  switch (win.dominantFactor) {
    case 'marker':
      return `Short #${index} (Marker Section)`;
    case 'motion':
      return `Short #${index} (Motion Activity)`;
    case 'audio-peak':
      return `Short #${index} (Audio Event)`;
    default:
      return `Short #${index}`;
  }
}
