import type { TrackingOptions, TrackingRegion, TrackingRgbaFrame, TrackingStep } from './region-tracker';

export type TrackingRequest = { id: number; frame: TrackingRgbaFrame } & (
  | { type: 'init'; region: TrackingRegion; options: TrackingOptions }
  | { type: 'frame' }
);
export type TrackingReply = { id: number } & (
  | { type: 'step'; step: TrackingStep }
  | { type: 'error'; message: string }
);
