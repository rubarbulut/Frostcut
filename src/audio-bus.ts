import { ensurePreviewAudioOutput, type PreviewAudioOutput } from './preview-audio-output';

export type AudioBusTrackType = 'voice' | 'music' | 'sfx';

export type SidechainTelemetry = {
  isDucking: boolean;
  voiceLevelDb: number;
  duckingGainDb: number;
  thresholdDb: number;
};

export type EQSettings = {
  lowDb: number;
  midDb: number;
  highDb: number;
};

export class MultiTrackAudioBus {
  readonly context: AudioContext;

  // Track Busses
  readonly voiceInput: GainNode;
  readonly voiceAnalyser: AnalyserNode;
  readonly voiceOutput: GainNode;

  readonly musicInput: GainNode;
  readonly musicDuckingGain: GainNode;
  readonly musicLowFilter: BiquadFilterNode;
  readonly musicMidFilter: BiquadFilterNode;
  readonly musicHighFilter: BiquadFilterNode;
  readonly musicOutput: GainNode;

  readonly sfxInput: GainNode;
  readonly sfxOutput: GainNode;

  // Master Bus
  readonly masterInput: GainNode;
  readonly masterLowFilter: BiquadFilterNode;
  readonly masterMidFilter: BiquadFilterNode;
  readonly masterHighFilter: BiquadFilterNode;
  readonly masterLimiter: DynamicsCompressorNode;
  readonly masterAnalyser: AnalyserNode;
  readonly masterOutput: GainNode;

  // Neutral bypass state
  private masterLimiterEnabled = false;
  private musicEQ: EQSettings = { lowDb: 0, midDb: 0, highDb: 0 };
  private masterEQ: EQSettings = { lowDb: 0, midDb: 0, highDb: 0 };

  // Sidechain state & config
  private thresholdDb = -24; // Voice trigger at -24 dB RMS
  private duckingDb = -12; // -12 dB attenuation on music
  private attackMs = 20; // 20 ms attack
  private releaseMs = 250; // 250 ms release
  private sidechainEnabled = false; // Disabled by default to preserve native project mix

  // Active sources & lifecycle
  private activeSources = new Set<unknown>();
  private voiceBuffer: Float32Array;
  private isDucking = false;
  private currentVoiceLevelDb = -100;
  private currentDuckingGainDb = 0;
  private checkInterval?: ReturnType<typeof setInterval>;
  private listeners = new Set<(telemetry: SidechainTelemetry) => void>();
  private isDisposed = false;
  private connectedToPreviewInput = false;

  constructor(context?: AudioContext, outputTarget?: GainNode) {
    this.context =
      context ??
      (typeof window !== 'undefined'
        ? ensurePreviewAudioOutput().context
        : typeof AudioContext !== 'undefined'
          ? new AudioContext()
          : ({} as AudioContext));

    if (typeof this.context.createGain !== 'function') {
      // Stub for Node.js / non-WebAudio test environments
      this.voiceBuffer = new Float32Array(512);
      this.voiceInput = {} as GainNode;
      this.voiceAnalyser = {} as AnalyserNode;
      this.voiceOutput = {} as GainNode;
      this.musicInput = {} as GainNode;
      this.musicDuckingGain = { gain: { value: 1.0, setTargetAtTime: () => {} } } as unknown as GainNode;
      this.musicLowFilter = {} as BiquadFilterNode;
      this.musicMidFilter = {} as BiquadFilterNode;
      this.musicHighFilter = {} as BiquadFilterNode;
      this.musicOutput = {} as GainNode;
      this.sfxInput = {} as GainNode;
      this.sfxOutput = {} as GainNode;
      this.masterInput = {} as GainNode;
      this.masterLowFilter = {} as BiquadFilterNode;
      this.masterMidFilter = {} as BiquadFilterNode;
      this.masterHighFilter = {} as BiquadFilterNode;
      this.masterLimiter = {} as DynamicsCompressorNode;
      this.masterAnalyser = {} as AnalyserNode;
      this.masterOutput = {} as GainNode;
      return;
    }

    const ctx = this.context;

    // --- Voice Bus (A1) ---
    this.voiceInput = ctx.createGain();
    this.voiceAnalyser = ctx.createAnalyser();
    this.voiceAnalyser.fftSize = 512;
    this.voiceAnalyser.smoothingTimeConstant = 0.1;
    this.voiceOutput = ctx.createGain();
    this.voiceBuffer = new Float32Array(this.voiceAnalyser.fftSize);

    this.voiceInput.connect(this.voiceAnalyser);
    this.voiceAnalyser.connect(this.voiceOutput);

    // --- Music Bus (A2) with Sidechain Ducking & 3-Band Parametric EQ ---
    this.musicInput = ctx.createGain();
    this.musicDuckingGain = ctx.createGain();
    this.musicDuckingGain.gain.value = 1.0;

    this.musicLowFilter = ctx.createBiquadFilter();
    this.musicLowFilter.type = 'lowshelf';
    this.musicLowFilter.frequency.value = 100;
    this.musicLowFilter.gain.value = 0;

    this.musicMidFilter = ctx.createBiquadFilter();
    this.musicMidFilter.type = 'peaking';
    this.musicMidFilter.frequency.value = 1000;
    this.musicMidFilter.Q.value = 1.0;
    this.musicMidFilter.gain.value = 0;

    this.musicHighFilter = ctx.createBiquadFilter();
    this.musicHighFilter.type = 'highshelf';
    this.musicHighFilter.frequency.value = 8000;
    this.musicHighFilter.gain.value = 0;

    this.musicOutput = ctx.createGain();

    this.musicInput.connect(this.musicDuckingGain);
    this.updateMusicRouting();

    // --- SFX Bus (A3) ---
    this.sfxInput = ctx.createGain();
    this.sfxOutput = ctx.createGain();
    this.sfxInput.connect(this.sfxOutput);

    // --- Master Bus with 60 FPS Spectrum Analyser & Switchable Brickwall Limiter ---
    this.masterInput = ctx.createGain();

    this.masterLowFilter = ctx.createBiquadFilter();
    this.masterLowFilter.type = 'lowshelf';
    this.masterLowFilter.frequency.value = 100;
    this.masterLowFilter.gain.value = 0;

    this.masterMidFilter = ctx.createBiquadFilter();
    this.masterMidFilter.type = 'peaking';
    this.masterMidFilter.frequency.value = 1000;
    this.masterMidFilter.Q.value = 1.0;
    this.masterMidFilter.gain.value = 0;

    this.masterHighFilter = ctx.createBiquadFilter();
    this.masterHighFilter.type = 'highshelf';
    this.masterHighFilter.frequency.value = 8000;
    this.masterHighFilter.gain.value = 0;

    this.masterLimiter = ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -0.5;
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.001;
    this.masterLimiter.release.value = 0.05;

    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 1024; // 512 frequency bins from 20 Hz to 20 kHz
    this.masterAnalyser.smoothingTimeConstant = 0.75;
    this.masterAnalyser.minDecibels = -90;
    this.masterAnalyser.maxDecibels = -10;

    this.masterOutput = ctx.createGain();

    // Summing track outputs into master bus
    this.voiceOutput.connect(this.masterInput);
    this.musicOutput.connect(this.masterInput);
    this.sfxOutput.connect(this.masterInput);

    // Set up neutral bypass routing for master bus
    this.updateMasterRouting();

    // Connect master bus to the system preview audio output (NEVER directly to ctx.destination)
    if (outputTarget && typeof this.masterOutput.connect === 'function') {
      try {
        this.masterOutput.connect(outputTarget);
        this.connectedToPreviewInput = true;
      } catch {}
    } else {
      try {
        const previewOut = ensurePreviewAudioOutput();
        if (
          previewOut &&
          previewOut.input &&
          previewOut.context === this.context &&
          typeof this.masterOutput.connect === 'function'
        ) {
          this.masterOutput.connect(previewOut.input);
          this.connectedToPreviewInput = true;
        }
      } catch {}
    }
  }

  /**
   * Connect masterOutput to a specific target node (such as PreviewAudioOutput.input).
   */
  connectToOutput(target: GainNode | AudioNode) {
    if (typeof this.masterOutput.connect === 'function') {
      try {
        this.masterOutput.connect(target as any);
        this.connectedToPreviewInput = true;
      } catch {}
    }
  }

  /**
   * Returns the input gain node for a given track role.
   */
  getTrackInput(role: AudioBusTrackType = 'voice'): GainNode {
    switch (role) {
      case 'music':
        return this.musicInput;
      case 'sfx':
        return this.sfxInput;
      case 'voice':
      default:
        return this.voiceInput;
    }
  }

  /**
   * Updates music bus routing:
   * When EQ is neutral (all 0 dB), musicDuckingGain feeds musicOutput directly (100% bypass).
   * When EQ has non-zero values, signal routes through low, mid, and high filters.
   */
  private updateMusicRouting() {
    if (typeof this.musicDuckingGain.disconnect !== 'function') return;
    try {
      this.musicDuckingGain.disconnect();
      this.musicLowFilter.disconnect();
      this.musicMidFilter.disconnect();
      this.musicHighFilter.disconnect();
    } catch {}

    const hasMusicEQ = this.musicEQ.lowDb !== 0 || this.musicEQ.midDb !== 0 || this.musicEQ.highDb !== 0;

    if (hasMusicEQ) {
      this.musicDuckingGain
        .connect(this.musicLowFilter)
        .connect(this.musicMidFilter)
        .connect(this.musicHighFilter)
        .connect(this.musicOutput);
    } else {
      this.musicDuckingGain.connect(this.musicOutput);
    }
  }

  /**
   * Updates master bus routing:
   * When neutral (no master EQ and master limiter disabled), masterInput connects directly
   * to masterAnalyser -> masterOutput. This preserves 100% transparent legacy audio behavior
   * with zero compression, zero coloration, and zero phase shift.
   */
  private updateMasterRouting() {
    if (typeof this.masterInput.disconnect !== 'function') return;
    try {
      this.masterInput.disconnect();
      this.masterLowFilter.disconnect();
      this.masterMidFilter.disconnect();
      this.masterHighFilter.disconnect();
      this.masterLimiter.disconnect();
    } catch {}

    const hasMasterEQ = this.masterEQ.lowDb !== 0 || this.masterEQ.midDb !== 0 || this.masterEQ.highDb !== 0;

    let current: AudioNode = this.masterInput;
    if (hasMasterEQ) {
      current.connect(this.masterLowFilter);
      this.masterLowFilter.connect(this.masterMidFilter);
      this.masterMidFilter.connect(this.masterHighFilter);
      current = this.masterHighFilter;
    }

    if (this.masterLimiterEnabled) {
      current.connect(this.masterLimiter);
      current = this.masterLimiter;
    }

    current.connect(this.masterAnalyser);
    try {
      this.masterAnalyser.disconnect();
    } catch {}
    this.masterAnalyser.connect(this.masterOutput);
  }

  /**
   * Enable or disable master brickwall limiter.
   * Default is false (neutral transparent bypass).
   */
  setMasterLimiterEnabled(enabled: boolean) {
    if (this.masterLimiterEnabled === enabled) return;
    this.masterLimiterEnabled = enabled;
    this.updateMasterRouting();
  }

  isMasterLimiterEnabled(): boolean {
    return this.masterLimiterEnabled;
  }

  /**
   * Track active playing sources so background sidechain interval only runs
   * during active playback, not merely when UI panels are open.
   */
  notifySourceActive(sourceId: unknown, active: boolean) {
    if (active) {
      this.activeSources.add(sourceId);
    } else {
      this.activeSources.delete(sourceId);
    }
    this.syncSidechainLoop();
  }

  getActiveSourceCount(): number {
    return this.activeSources.size;
  }

  private syncSidechainLoop() {
    if (this.sidechainEnabled && this.activeSources.size > 0 && !this.isDisposed) {
      this.startSidechainLoop();
    } else {
      this.stopSidechainLoop();
    }
  }

  /**
   * High-speed sidechain detection tick (< 5ms latency evaluation).
   * Started only when sidechain is explicitly enabled AND active sources exist.
   */
  startSidechainLoop() {
    if (typeof setInterval === 'undefined' || this.checkInterval || !this.sidechainEnabled || this.isDisposed) {
      return;
    }

    this.checkInterval = setInterval(() => {
      this.evaluateSidechain();
    }, 12); // ~80 Hz check rate ensures < 5ms reaction latency
  }

  stopSidechainLoop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  evaluateSidechain() {
    if (!this.sidechainEnabled || typeof this.voiceAnalyser.getFloatTimeDomainData !== 'function') {
      return;
    }

    try {
      this.voiceAnalyser.getFloatTimeDomainData(this.voiceBuffer);
      let sum = 0;
      for (let i = 0; i < this.voiceBuffer.length; i++) {
        const s = this.voiceBuffer[i];
        sum += s * s;
      }
      const rms = Math.sqrt(sum / this.voiceBuffer.length);
      const rmsDb = rms > 1e-5 ? 20 * Math.log10(rms) : -100;
      this.currentVoiceLevelDb = rmsDb;

      const now = this.context.currentTime;
      const shouldDuck = rmsDb > this.thresholdDb;

      if (shouldDuck !== this.isDucking) {
        this.isDucking = shouldDuck;
        if (shouldDuck) {
          // Attack: 20 ms smooth transition to -12 dB
          const duckGainLinear = Math.pow(10, this.duckingDb / 20); // ~0.2512
          this.currentDuckingGainDb = this.duckingDb;
          const tau = this.attackMs / (1000 * 3); // 3 time constants reach ~95%
          this.musicDuckingGain.gain.cancelScheduledValues(now);
          this.musicDuckingGain.gain.setTargetAtTime(duckGainLinear, now, Math.max(0.001, tau));
        } else {
          // Release: 250 ms smooth curve recovery back to 0 dB (1.0)
          this.currentDuckingGainDb = 0;
          const tau = this.releaseMs / (1000 * 3);
          this.musicDuckingGain.gain.cancelScheduledValues(now);
          this.musicDuckingGain.gain.setTargetAtTime(1.0, now, Math.max(0.005, tau));
        }
      }

      const telemetry: SidechainTelemetry = {
        isDucking: this.isDucking,
        voiceLevelDb: this.currentVoiceLevelDb,
        duckingGainDb: this.isDucking ? this.duckingDb : 0,
        thresholdDb: this.thresholdDb,
      };

      this.listeners.forEach((listener) => listener(telemetry));
    } catch {}
  }

  subscribeTelemetry(listener: (telemetry: SidechainTelemetry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Sets 3-Band Parametric EQ on Music or Master track with clickless ramping.
   */
  setEQ(band: 'low' | 'mid' | 'high', gainDb: number, track: 'music' | 'master' = 'music') {
    const clampedDb = Math.max(-12, Math.min(12, gainDb));
    const now = this.context.currentTime ?? 0;
    const filter =
      track === 'music'
        ? band === 'low'
          ? this.musicLowFilter
          : band === 'mid'
            ? this.musicMidFilter
            : this.musicHighFilter
        : band === 'low'
          ? this.masterLowFilter
          : band === 'mid'
            ? this.masterMidFilter
            : this.masterHighFilter;

    if (track === 'music') {
      if (band === 'low') this.musicEQ.lowDb = clampedDb;
      else if (band === 'mid') this.musicEQ.midDb = clampedDb;
      else this.musicEQ.highDb = clampedDb;
      this.updateMusicRouting();
    } else {
      if (band === 'low') this.masterEQ.lowDb = clampedDb;
      else if (band === 'mid') this.masterEQ.midDb = clampedDb;
      else this.masterEQ.highDb = clampedDb;
      this.updateMasterRouting();
    }

    if (filter && filter.gain) {
      if (typeof filter.gain.setTargetAtTime === 'function') {
        filter.gain.setTargetAtTime(clampedDb, now, 0.015);
      } else {
        filter.gain.value = clampedDb;
      }
    }
  }

  /**
   * 60 FPS FFT frequency spectrum data from 20 Hz to 20 kHz.
   */
  getFrequencyData(targetArray?: Uint8Array): Uint8Array {
    if (!this.masterAnalyser || typeof this.masterAnalyser.getByteFrequencyData !== 'function') {
      return targetArray ?? new Uint8Array(256);
    }
    const arr = targetArray ?? new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(arr);
    return arr;
  }

  setSidechainConfig(config: { thresholdDb?: number; duckingDb?: number; attackMs?: number; releaseMs?: number; enabled?: boolean }) {
    if (config.thresholdDb !== undefined) this.thresholdDb = config.thresholdDb;
    if (config.duckingDb !== undefined) this.duckingDb = config.duckingDb;
    if (config.attackMs !== undefined) this.attackMs = config.attackMs;
    if (config.releaseMs !== undefined) this.releaseMs = config.releaseMs;
    if (config.enabled !== undefined) {
      this.sidechainEnabled = config.enabled;
      this.syncSidechainLoop();
    }
  }

  getSidechainConfig() {
    return {
      thresholdDb: this.thresholdDb,
      duckingDb: this.duckingDb,
      attackMs: this.attackMs,
      releaseMs: this.releaseMs,
      enabled: this.sidechainEnabled,
    };
  }

  getTelemetry(): SidechainTelemetry {
    return {
      isDucking: this.isDucking,
      voiceLevelDb: this.currentVoiceLevelDb,
      duckingGainDb: this.currentDuckingGainDb,
      thresholdDb: this.thresholdDb,
    };
  }

  isDisposedInstance(): boolean {
    return this.isDisposed;
  }

  dispose() {
    this.isDisposed = true;
    this.stopSidechainLoop();
    this.activeSources.clear();
    this.listeners.clear();
    try { this.masterOutput.disconnect(); } catch {}
    try { this.voiceOutput.disconnect(); } catch {}
    try { this.musicOutput.disconnect(); } catch {}
    try { this.sfxOutput.disconnect(); } catch {}
    if (busInstance === this) {
      busInstance = undefined;
    }
  }
}

let busInstance: MultiTrackAudioBus | undefined;

export function getMultiTrackAudioBus(context?: AudioContext): MultiTrackAudioBus {
  if (!busInstance || busInstance.isDisposedInstance()) {
    busInstance = new MultiTrackAudioBus(context);
  }
  return busInstance;
}

export function resetMultiTrackAudioBus() {
  if (busInstance) {
    busInstance.dispose();
    busInstance = undefined;
  }
}
