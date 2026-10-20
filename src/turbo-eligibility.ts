import { isAudioClip, type Project } from './model';
import { hasVisualEffects } from './visual-effects';
import { needsBlurFill } from './aspect-fill';

export type TurboEligibility = {
  eligible: boolean;
  reason?: string;
};

/**
 * Validates whether the project can be exported through the fast native FFmpeg path
 * without dropping edit semantics (speed, volume, fades, transforms, effects, transitions, multi-track).
 */
export function isTurboEligible(project: Project): TurboEligibility {
  const clips = project.clips || [];
  if (clips.length === 0) {
    return { eligible: false, reason: 'Project has no clips' };
  }

  // 1. Multi-track or separate audio tracks not supported by simple fast-path
  const videoClips = clips.filter((c) => !isAudioClip(project, c));
  const audioClips = clips.filter((c) => isAudioClip(project, c));
  if (audioClips.length > 0) {
    return { eligible: false, reason: 'Separate audio tracks require full audio mixer engine' };
  }
  if (videoClips.length === 0) {
    return { eligible: false, reason: 'No video clips found in project' };
  }

  const trackIds = new Set(videoClips.map((c) => c.trackId));
  if (trackIds.size > 1) {
    return {
      eligible: false,
      reason: 'Multi-layer composite video requires full visual compositor',
    };
  }

  // 2. Track mute / hidden states across all project tracks
  const tracks = project.tracks || [];
  for (const track of tracks) {
    if (track.muted || track.hidden) {
      return {
        eligible: false,
        reason: `Track ${track.id} (${track.name || 'unnamed'}) is ${track.muted ? 'muted' : 'hidden'}, requiring full renderer`,
      };
    }
  }

  // 3. Adjustments / Transitions
  if (project.adjustments && project.adjustments.length > 0) {
    return { eligible: false, reason: 'Adjustment layers require visual renderer' };
  }
  if (videoClips.some((c) => !!c.transition)) {
    return { eligible: false, reason: 'Transitions require WebGL transition blender' };
  }

  // 4. Settings & ExportSettings validation (numerical sanity, NaN/Infinity)
  const s = project.settings;
  if (
    !s ||
    !Number.isFinite(s.width) ||
    !Number.isFinite(s.height) ||
    !Number.isFinite(s.fps) ||
    s.width <= 0 ||
    s.height <= 0 ||
    s.fps <= 0
  ) {
    return {
      eligible: false,
      reason: 'Project settings contain invalid or non-finite dimensions/fps',
    };
  }

  const exp = project.exportSettings;
  if (
    !exp ||
    !Number.isFinite(exp.width) ||
    !Number.isFinite(exp.height) ||
    !Number.isFinite(exp.fps) ||
    exp.width <= 0 ||
    exp.height <= 0 ||
    exp.fps <= 0
  ) {
    return {
      eligible: false,
      reason: 'Project exportSettings contain invalid or non-finite dimensions/fps',
    };
  }
  // Custom export bitrate or non-default quality must not be assumed equivalent to turbo 6M scaler
  if (exp.videoBitrate !== undefined || (exp.quality !== undefined && exp.quality !== 75)) {
    return {
      eligible: false,
      reason: 'Custom export quality/bitrate requires custom bitrate encoder',
    };
  }

  // 5. Project array order vs Sequential Timeline order check
  if (clips.length !== videoClips.length) {
    return { eligible: false, reason: 'Project clips array contains mixed media types' };
  }
  for (let i = 0; i < clips.length; i++) {
    if (clips[i].id !== videoClips[i].id) {
      return { eligible: false, reason: 'Clip array order does not match sequential video list' };
    }
    if (i > 0 && videoClips[i].start < videoClips[i - 1].start) {
      return {
        eligible: false,
        reason: 'Clips are not in sequential timeline order in project array',
      };
    }
  }

  // 6. Fill mode / Aspect blur check (Crop and blur-background are NOT pad-fit)
  const fillMode = s.fillMode;
  if (fillMode === 'crop') {
    return {
      eligible: false,
      reason: "Fill mode 'crop' is not compatible with pad-fit turbo scaler",
    };
  }
  if (
    fillMode !== undefined &&
    fillMode !== 'fit' &&
    fillMode !== 'blur-background' &&
    (fillMode as string) !== 'letterbox'
  ) {
    return {
      eligible: false,
      reason: `Fill mode '${fillMode}' is not compatible with pad-fit turbo scaler`,
    };
  }

  for (const c of videoClips) {
    const asset = project.media?.find((m) => m.id === c.mediaId);
    if (!asset) {
      return {
        eligible: false,
        reason: `Clip ${c.id} references missing media asset ${c.mediaId}`,
      };
    }
    if (needsBlurFill(asset, s, fillMode)) {
      return { eligible: false, reason: 'Blur-background fill requires visual canvas renderer' };
    }
  }

  // 7. Per-clip properties: timing, zero gap tolerance, speed, volume/mute/fade, transforms/crop, effects, autoDuck/detached
  let expectedTimelinePos = 0;

  for (let i = 0; i < videoClips.length; i++) {
    const c = videoClips[i];
    const props = c.properties;

    // Numerical sanity check (NaN, Infinity, negative times)
    if (
      !Number.isFinite(c.start) ||
      !Number.isFinite(c.sourceStart) ||
      !Number.isFinite(c.sourceEnd) ||
      c.start < 0 ||
      c.sourceStart < 0 ||
      c.sourceEnd <= c.sourceStart
    ) {
      return { eligible: false, reason: `Clip ${c.id} has invalid or non-finite timing values` };
    }

    // Media asset bounds check
    const asset = project.media?.find((m) => m.id === c.mediaId);
    if (!asset) {
      return { eligible: false, reason: `Clip ${c.id} references missing media asset` };
    }
    if (!Number.isFinite(asset.duration) || asset.duration <= 0) {
      return {
        eligible: false,
        reason: `Media asset ${asset.id} has invalid or non-finite duration`,
      };
    }
    if (
      !Number.isFinite(asset.width) ||
      !Number.isFinite(asset.height) ||
      asset.width <= 0 ||
      asset.height <= 0
    ) {
      return {
        eligible: false,
        reason: `Media asset ${asset.id} has invalid or non-finite dimensions`,
      };
    }
    if (c.sourceEnd > asset.duration + 0.0001) {
      return { eligible: false, reason: `Clip ${c.id} sourceEnd exceeds media asset duration` };
    }

    // Timeline gaps or overlaps (strict: zero gap tolerance, 50ms gaps strictly rejected)
    if (Math.abs(c.start - expectedTimelinePos) > 0.0001) {
      return {
        eligible: false,
        reason: 'Timeline gaps or non-contiguous cuts require timeline compositor',
      };
    }
    const clipDur = (c.sourceEnd - c.sourceStart) / (props.speed || 1);
    expectedTimelinePos = c.start + clipDur;

    // Speed
    if (props.speed !== undefined && Math.abs(props.speed - 1.0) > 0.001) {
      return {
        eligible: false,
        reason: `Clip ${c.id} has custom playback speed (${props.speed}x)`,
      };
    }

    // Opacity
    if (props.opacity !== undefined && Math.abs(props.opacity - 1.0) > 0.001) {
      return { eligible: false, reason: `Clip ${c.id} has custom opacity (${props.opacity})` };
    }

    // Fades (default 0.015s sub-frame anti-click is permitted; custom transitions/fades are rejected)
    if (props.fadeIn !== undefined && props.fadeIn > 0.02) {
      return { eligible: false, reason: `Clip ${c.id} has custom fadeIn (${props.fadeIn}s)` };
    }
    if (props.fadeOut !== undefined && props.fadeOut > 0.02) {
      return { eligible: false, reason: `Clip ${c.id} has custom fadeOut (${props.fadeOut}s)` };
    }

    // Volume & audio properties
    if ((c as any).muted) {
      return { eligible: false, reason: `Clip ${c.id} is muted, requiring full audio engine` };
    }
    if (props.volume !== undefined && Math.abs(props.volume - 1.0) > 0.001) {
      return { eligible: false, reason: `Clip ${c.id} has non-standard volume (${props.volume})` };
    }
    if (c.voiceEnhance) {
      return { eligible: false, reason: `Clip ${c.id} has voice enhance DSP enabled` };
    }
    if (c.audioDetached) {
      return {
        eligible: false,
        reason: `Clip ${c.id} has audio detached, requiring multi-track mixer`,
      };
    }
    if (c.autoDuck) {
      return {
        eligible: false,
        reason: `Clip ${c.id} has auto-ducking enabled, requiring audio bus DSP`,
      };
    }

    // Transform & Crop
    if (
      (props.scale !== undefined && Math.abs(props.scale - 1.0) > 0.001) ||
      (props.x !== undefined && Math.abs(props.x) > 0.001) ||
      (props.y !== undefined && Math.abs(props.y) > 0.001) ||
      (props.rotation !== undefined && Math.abs(props.rotation) > 0.001) ||
      (props.crop !== undefined && props.crop > 0.001)
    ) {
      return { eligible: false, reason: `Clip ${c.id} has geometric transform or crop applied` };
    }

    // Visual effects (color grading, lens, LUT, chroma, mask, corner pin)
    if (c.effects && hasVisualEffects(c.effects)) {
      return { eligible: false, reason: `Clip ${c.id} has visual effects applied` };
    }

    // Keyframes
    if (c.keyframes && Object.values(c.keyframes).some((kfs) => kfs && kfs.length > 0)) {
      return { eligible: false, reason: `Clip ${c.id} has animated keyframes` };
    }
  }

  return { eligible: true };
}
