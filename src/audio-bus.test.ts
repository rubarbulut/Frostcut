import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { MultiTrackAudioBus, getMultiTrackAudioBus, resetMultiTrackAudioBus } from './audio-bus';
import { PreviewAudioOutput } from './preview-audio-output';
import { usePreviewAudio, getAudioRoute, syncPreviewAudioRoute, cleanupPreviewAudioRoute } from './preview-audio';

class MockAudioNode {
  readonly connections: MockAudioNode[] = [];
  gain?: {
    value: number;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
    setTargetAtTime: ReturnType<typeof vi.fn>;
  };
  frequency?: { value: number };
  Q?: { value: number };
  threshold?: { value: number };
  ratio?: { value: number };
  attack?: { value: number };
  release?: { value: number };
  knee?: { value: number };
  type?: string;
  fftSize = 1024;
  frequencyBinCount = 512;
  smoothingTimeConstant = 0.8;
  minDecibels = -90;
  maxDecibels = -10;
  channelCount = 2;
  channelCountMode = 'explicit';
  channelInterpretation = 'speakers';
  getByteFrequencyData?: (arr: Uint8Array) => void;
  getFloatTimeDomainData?: (arr: Float32Array) => void;

  constructor(readonly name: string) {}

  connect(target: MockAudioNode) {
    if (!this.connections.includes(target)) {
      this.connections.push(target);
    }
    return target;
  }

  disconnect(target?: MockAudioNode) {
    if (target) {
      const idx = this.connections.indexOf(target);
      if (idx !== -1) this.connections.splice(idx, 1);
    } else {
      this.connections.length = 0;
    }
  }

  isConnectedTo(target: MockAudioNode): boolean {
    return this.connections.includes(target);
  }

  hasPathTo(target: MockAudioNode, visited = new Set<MockAudioNode>()): boolean {
    if (this === target) return true;
    if (visited.has(this)) return false;
    visited.add(this);
    for (const next of this.connections) {
      if (next.hasPathTo(target, visited)) return true;
    }
    return false;
  }
}

function createMockAudioGraph() {
  const allNodes: MockAudioNode[] = [];
  const destination = new MockAudioNode('AudioDestinationNode');
  allNodes.push(destination);

  const makeNode = (name: string) => {
    const n = new MockAudioNode(name);
    allNodes.push(n);
    return n;
  };

  const mediaSourceMap = new Map<HTMLMediaElement, MockAudioNode>();

  const ctx: any = {
    currentTime: 1.0,
    sampleRate: 48000,
    state: 'running',
    destination,
    createGain: vi.fn(() => {
      const g = makeNode('GainNode');
      g.gain = {
        value: 1.0,
        cancelScheduledValues: vi.fn(),
        setTargetAtTime: vi.fn((val) => {
          g.gain!.value = val;
        }),
      };
      return g;
    }),
    createBiquadFilter: vi.fn(() => {
      const f = makeNode('BiquadFilterNode');
      f.frequency = { value: 1000 };
      f.Q = { value: 1.0 };
      f.gain = {
        value: 0,
        cancelScheduledValues: vi.fn(),
        setTargetAtTime: vi.fn((val) => {
          f.gain!.value = val;
        }),
      };
      return f;
    }),
    createDynamicsCompressor: vi.fn(() => {
      const c = makeNode('DynamicsCompressorNode');
      c.threshold = { value: -24 };
      c.ratio = { value: 20 };
      c.attack = { value: 0.001 };
      c.release = { value: 0.05 };
      c.knee = { value: 6 };
      return c;
    }),
    createAnalyser: vi.fn(() => {
      const a = makeNode('AnalyserNode');
      a.getByteFrequencyData = vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.round(128 + 64 * Math.sin(i * 0.1));
      });
      a.getFloatTimeDomainData = vi.fn((arr: Float32Array) => {
        // Voice simulation amplitude ~0.15 = ~-16.5 dB > -24 dB
        for (let i = 0; i < arr.length; i++) arr[i] = 0.15 * Math.sin(i * 0.2);
      });
      return a;
    }),
    createChannelSplitter: vi.fn(() => makeNode('ChannelSplitterNode')),
    createMediaElementSource: vi.fn((media: HTMLMediaElement) => {
      if (mediaSourceMap.has(media)) {
        throw new Error('InvalidStateError: HTMLMediaElement already connected to MediaElementSourceNode');
      }
      const s = makeNode('MediaElementAudioSourceNode');
      mediaSourceMap.set(media, s);
      return s;
    }),
    resume: vi.fn(async () => {}),
  };

  return { ctx: ctx as AudioContext, destination, allNodes, mediaSourceMap };
}

describe('B002-O Multi-Track Audio Bus & Real WebAudio Graph', () => {
  beforeEach(() => {
    resetMultiTrackAudioBus();
  });

  afterEach(() => {
    resetMultiTrackAudioBus();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('guarantees single destination connection: only previewOutput connects to destination', () => {
    const { ctx, destination, allNodes } = createMockAudioGraph();
    const previewOut = new PreviewAudioOutput(ctx);
    const bus = new MultiTrackAudioBus(ctx, previewOut.input);

    // Verify masterOutput connects to previewOut.input
    expect((bus.masterOutput as unknown as MockAudioNode).isConnectedTo(previewOut.input as unknown as MockAudioNode)).toBe(true);

    // Master bus must NOT connect directly to ctx.destination
    expect((bus.masterOutput as unknown as MockAudioNode).isConnectedTo(destination)).toBe(false);

    // Filter all nodes in the graph that connect directly to destination
    const nodesConnectedToDest = allNodes.filter((n) => n.connections.includes(destination));
    expect(nodesConnectedToDest.length).toBe(1);
    expect(nodesConnectedToDest[0]).toBe(previewOut.input as unknown as MockAudioNode);

    bus.dispose();
  });

  it('routes source -> processor -> master -> destination with full path integrity', () => {
    const { ctx, destination } = createMockAudioGraph();
    const previewOut = new PreviewAudioOutput(ctx);
    const bus = new MultiTrackAudioBus(ctx, previewOut.input);

    const voiceNode = bus.voiceInput as unknown as MockAudioNode;
    const musicNode = bus.musicInput as unknown as MockAudioNode;
    const sfxNode = bus.sfxInput as unknown as MockAudioNode;
    const masterOut = bus.masterOutput as unknown as MockAudioNode;

    // Verify track inputs trace all the way to destination through master bus
    expect(voiceNode.hasPathTo(destination)).toBe(true);
    expect(musicNode.hasPathTo(destination)).toBe(true);
    expect(sfxNode.hasPathTo(destination)).toBe(true);
    expect(masterOut.hasPathTo(destination)).toBe(true);

    bus.dispose();
  });

  it('enforces 100% neutral bypass default: limiter and EQ filters are bypassed when unconfigured', () => {
    const { ctx } = createMockAudioGraph();
    const previewOut = new PreviewAudioOutput(ctx);
    const bus = new MultiTrackAudioBus(ctx, previewOut.input);

    const masterInputNode = bus.masterInput as unknown as MockAudioNode;
    const masterLimiterNode = bus.masterLimiter as unknown as MockAudioNode;
    const masterLowFilter = bus.masterLowFilter as unknown as MockAudioNode;
    const musicDuckingGain = bus.musicDuckingGain as unknown as MockAudioNode;
    const musicLowFilter = bus.musicLowFilter as unknown as MockAudioNode;
    const masterAnalyser = bus.masterAnalyser as unknown as MockAudioNode;

    // Default neutral state: masterLimiter is NOT enabled
    expect(bus.isMasterLimiterEnabled()).toBe(false);

    // In neutral bypass, masterInput connects directly to masterAnalyser -> masterOutput
    expect(masterInputNode.isConnectedTo(masterAnalyser)).toBe(true);
    // Limiter and EQ filters must NOT be connected in the active signal path
    expect(masterInputNode.isConnectedTo(masterLowFilter)).toBe(false);
    expect(masterInputNode.isConnectedTo(masterLimiterNode)).toBe(false);
    expect(musicDuckingGain.isConnectedTo(musicLowFilter)).toBe(false);

    // Now engage master limiter explicitly
    bus.setMasterLimiterEnabled(true);
    expect(bus.isMasterLimiterEnabled()).toBe(true);
    // Master input now routes into masterLimiter before analyser
    expect(masterLimiterNode.isConnectedTo(masterAnalyser)).toBe(true);

    // Now set Music EQ
    bus.setEQ('low', 3.5, 'music');
    expect(musicDuckingGain.isConnectedTo(musicLowFilter)).toBe(true);

    // Reset Music EQ back to 0 dB => neutral bypass restored
    bus.setEQ('low', 0, 'music');
    expect(musicDuckingGain.isConnectedTo(musicLowFilter)).toBe(false);

    bus.dispose();
  });

  it('connects clip through route builder, supports role switching, and prevents duplicate MediaElementSource', () => {
    const { ctx, destination } = createMockAudioGraph();
    vi.stubGlobal('AudioContext', class {
      constructor() {
        return ctx;
      }
    });

    const previewOut = new PreviewAudioOutput(ctx);
    const bus = getMultiTrackAudioBus(ctx);
    bus.connectToOutput(previewOut.input);

    // Mock HTMLMediaElement
    const fakeMedia = {
      volume: 1,
      paused: false,
    } as unknown as HTMLVideoElement;

    // 1. Sync route with voice role and playing = true
    const route1 = syncPreviewAudioRoute(fakeMedia, 1.0, true, false, 'voice', false);

    expect(route1).toBeDefined();
    expect(route1?.connected).toBe(true);
    expect(route1?.role).toBe('voice');

    const routeGainNode = route1!.gain as unknown as MockAudioNode;
    const voiceInputNode = bus.voiceInput as unknown as MockAudioNode;
    const musicInputNode = bus.musicInput as unknown as MockAudioNode;

    // route.gain must connect to bus.voiceInput
    expect(routeGainNode.isConnectedTo(voiceInputNode)).toBe(true);
    expect(routeGainNode.isConnectedTo(musicInputNode)).toBe(false);
    expect(routeGainNode.hasPathTo(destination)).toBe(true);
    expect(bus.getActiveSourceCount()).toBe(1);

    // 2. Switch role from 'voice' to 'music'
    const route2 = syncPreviewAudioRoute(fakeMedia, 1.0, true, false, 'music', false);

    expect(route2).toBe(route1); // Must reuse existing route record
    expect(route2?.role).toBe('music');
    // Must disconnect from voiceInput and connect to musicInput
    expect(routeGainNode.isConnectedTo(voiceInputNode)).toBe(false);
    expect(routeGainNode.isConnectedTo(musicInputNode)).toBe(true);
    expect(routeGainNode.hasPathTo(destination)).toBe(true);

    // 3. Verify single MediaElementSource rule: context.createMediaElementSource called exactly ONCE
    expect(ctx.createMediaElementSource).toHaveBeenCalledOnce();

    // 4. Pause playback
    syncPreviewAudioRoute(fakeMedia, 1.0, false, false, 'music', false);
    expect(route2?.connected).toBe(false);
    expect(routeGainNode.isConnectedTo(musicInputNode)).toBe(false);
    expect(bus.getActiveSourceCount()).toBe(0);

    // 5. Resume playback - verify it re-connects WITHOUT creating a second MediaElementSourceNode
    syncPreviewAudioRoute(fakeMedia, 1.0, true, false, 'music', false);
    expect(route2?.connected).toBe(true);
    expect(routeGainNode.isConnectedTo(musicInputNode)).toBe(true);
    expect(ctx.createMediaElementSource).toHaveBeenCalledOnce();

    // 6. Cleanup on unmount
    cleanupPreviewAudioRoute(fakeMedia);
    expect(route2?.connected).toBe(false);
    expect(bus.getActiveSourceCount()).toBe(0);

    bus.dispose();
  });

  it('runs sidechain timer only when active sources exist and sidechain is enabled', () => {
    const { ctx } = createMockAudioGraph();
    const previewOut = new PreviewAudioOutput(ctx);
    const bus = new MultiTrackAudioBus(ctx, previewOut.input);

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    // 1. Sidechain enabled, but no sources playing: interval must NOT start
    bus.setSidechainConfig({ enabled: true });
    expect(setIntervalSpy).not.toHaveBeenCalled();

    // 2. Notify active source playing: interval must start
    const dummySource = {};
    bus.notifySourceActive(dummySource, true);
    expect(bus.getActiveSourceCount()).toBe(1);
    expect(setIntervalSpy).toHaveBeenCalledOnce();

    // 3. Audio paused: interval must stop immediately
    bus.notifySourceActive(dummySource, false);
    expect(bus.getActiveSourceCount()).toBe(0);
    expect(clearIntervalSpy).toHaveBeenCalled();

    bus.dispose();
  });

  it('reflects master mute on the heard mix without breaking the audio graph', () => {
    const { ctx, destination } = createMockAudioGraph();
    const previewOut = new PreviewAudioOutput(ctx);
    const bus = new MultiTrackAudioBus(ctx, previewOut.input);

    expect((previewOut.input as unknown as MockAudioNode).gain!.value).toBe(1);

    previewOut.setMuted(true);
    expect((previewOut.input as unknown as MockAudioNode).gain!.value).toBe(0);

    previewOut.setMuted(false);
    expect((previewOut.input as unknown as MockAudioNode).gain!.value).toBe(1);

    // Connection to destination must remain intact
    expect((previewOut.input as unknown as MockAudioNode).isConnectedTo(destination)).toBe(true);

    bus.dispose();
  });

  it('evaluates sidechain ducking and ramps gain with smooth target curve', () => {
    const { ctx } = createMockAudioGraph();
    const previewOut = new PreviewAudioOutput(ctx);
    const bus = new MultiTrackAudioBus(ctx, previewOut.input);
    bus.setSidechainConfig({ enabled: true });

    let telemetryData: any = null;
    bus.subscribeTelemetry((t) => {
      telemetryData = t;
    });

    bus.evaluateSidechain();

    expect(bus.musicDuckingGain.gain.setTargetAtTime).toHaveBeenCalled();
    expect(telemetryData).toBeDefined();
    expect(telemetryData.isDucking).toBe(true);
    expect(telemetryData.voiceLevelDb).toBeGreaterThan(-24);
    expect(telemetryData.duckingGainDb).toBe(-12);

    bus.dispose();
  });
});
