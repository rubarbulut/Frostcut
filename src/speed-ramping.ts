export type TimeRemapPoint = {
  timelineTime: number; // seconds
  sourceTime: number; // seconds
  easing?: 'linear' | 'smooth';
};

export type SpeedCurvePoint = {
  time: number; // timeline seconds
  speed: number; // speed multiplier (e.g., 0.5 = 50% slow-mo, 2.0 = 2x fast-motion)
};

export class SpeedRampingEngine {
  private points: TimeRemapPoint[];

  constructor(points: TimeRemapPoint[]) {
    if (!points || points.length < 2) {
      throw new Error('Speed ramp requires at least 2 points (start and end).');
    }
    // Sort strictly by timeline time
    this.points = [...points].sort((a, b) => a.timelineTime - b.timelineTime);
  }

  evaluateSourceTime(t: number): number {
    const pts = this.points;
    if (t <= pts[0].timelineTime) return pts[0].sourceTime;
    if (t >= pts[pts.length - 1].timelineTime) return pts[pts.length - 1].sourceTime;

    // Find bounding segment
    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i];
      const p0 = pts[i - 1];
      if (t > p1.timelineTime) continue;

      const dt = p1.timelineTime - p0.timelineTime;
      if (dt <= 0) return p0.sourceTime;

      const norm = Math.max(0, Math.min(1, (t - p0.timelineTime) / dt));

      let factor = norm;
      if (p0.easing === 'smooth') {
        factor = norm * norm * (3 - 2 * norm);
      }

      return p0.sourceTime + (p1.sourceTime - p0.sourceTime) * factor;
    }

    return pts[pts.length - 1].sourceTime;
  }

  evaluateInstantaneousSpeed(t: number, dt = 0.005): number {
    const t0 = Math.max(0, t - dt);
    const t1 = t + dt;
    const s0 = this.evaluateSourceTime(t0);
    const s1 = this.evaluateSourceTime(t1);

    const actualDt = t1 - t0;
    return actualDt > 0 ? (s1 - s0) / actualDt : 1.0;
  }
}

/**
 * Builds a monotonic time-remapping track from a sequence of desired speed zones.
 * e.g., "Run at 1.0x for 2s, then smooth ramp to 0.25x for 3s, then ramp to 2.0x".
 */
export function buildRampFromSpeedProfile(
  initialSourceTime: number,
  speeds: { duration: number; speed: number; smooth?: boolean }[],
): TimeRemapPoint[] {
  const points: TimeRemapPoint[] = [];

  let curTimeline = 0;
  let curSource = initialSourceTime;

  points.push({
    timelineTime: curTimeline,
    sourceTime: curSource,
    easing: speeds[0]?.smooth ? 'smooth' : 'linear',
  });

  for (const seg of speeds) {
    curTimeline += seg.duration;
    curSource += seg.duration * seg.speed;
    points.push({
      timelineTime: curTimeline,
      sourceTime: curSource,
      easing: seg.smooth ? 'smooth' : 'linear',
    });
  }

  return points;
}
