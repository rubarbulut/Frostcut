import { RegionTracker, trackingGray } from './region-tracker';
import type { TrackingReply, TrackingRequest } from './tracking-protocol';

let tracker: RegionTracker | undefined;
self.onmessage = ({ data }: MessageEvent<TrackingRequest>) => {
  let reply: TrackingReply;
  try {
    const frame = trackingGray(data.frame);
    if (data.type === 'init') tracker = new RegionTracker(frame, data.region, data.options);
    else if (!tracker) throw new Error('Start with a reference tracking frame.');
    const step = data.type === 'init' ? tracker!.seed : tracker!.next(frame);
    reply = { id: data.id, type: 'step', step };
  } catch (error) {
    reply = { id: data.id, type: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
};
