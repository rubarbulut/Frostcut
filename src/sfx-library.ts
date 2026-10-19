import { uid, type Clip, type MediaAsset, type Project, clipEnd, defaultProps, isAudioClip, timelineWords } from './model';
import { mediaFiles, mediaUrls, audioWaveforms, registerMedia, useEditor } from './store';

export type SfxCategory = 'whoosh' | 'impact' | 'pop' | 'riser';

export type SfxPreset = {
  id: string;
  name: string;
  category: SfxCategory;
  categoryLabel: string;
  duration: number; // in seconds
  description: string;
  tags: string[];
  generateSamples: (sampleRate?: number) => { left: Float32Array; right?: Float32Array };
};

// 2-Pole State Variable Filter (Chamberlin SVF)
class SVFilter {
  low = 0;
  band = 0;
  high = 0;
  sampleRate: number;

  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
  }

  process(input: number, cutoff: number, q: number) {
    const safeCutoff = Math.max(20, Math.min(this.sampleRate * 0.48, cutoff));
    const f = 2 * Math.sin((Math.PI * safeCutoff) / this.sampleRate);
    this.low = this.low + f * this.band;
    this.high = input - this.low - q * this.band;
    this.band = f * this.high + this.band;
    return { low: this.low, band: this.band, high: this.high };
  }
}

function normalize(left: Float32Array, right?: Float32Array, targetPeak = 0.88) {
  let max = 0;
  for (let i = 0; i < left.length; i++) {
    const absL = Math.abs(left[i]);
    if (absL > max) max = absL;
    if (right) {
      const absR = Math.abs(right[i]);
      if (absR > max) max = absR;
    }
  }
  if (max > 0.0001) {
    const scale = targetPeak / max;
    for (let i = 0; i < left.length; i++) {
      left[i] *= scale;
      if (right) right[i] *= scale;
    }
  }
}

/**
 * Encodes Float32Array samples into a standard 16-bit PCM WAV binary format (RIFF).
 */
export function encodeWav(
  samplesLeft: Float32Array,
  samplesRight?: Float32Array,
  sampleRate = 44100,
): Uint8Array {
  const numChannels = samplesRight ? 2 : 1;
  const numSamples = samplesLeft.length;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = numSamples * numChannels * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat: 1 = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sL = Math.max(-1, Math.min(1, samplesLeft[i]));
    view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7fff, true);
    offset += 2;
    if (samplesRight) {
      const sR = Math.max(-1, Math.min(1, samplesRight[i]));
      view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7fff, true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

/**
 * Computes normalized waveform peak bars for the timeline display.
 */
export function computeWaveformPeaks(
  left: Float32Array,
  right?: Float32Array,
  sampleRate = 44100,
  duration = 1,
): number[] {
  // 10 samples per second to match timeline zoom step
  const totalSlots = Math.max(6, Math.ceil(duration * 10));
  const samplesPerSlot = Math.max(1, Math.floor(left.length / totalSlots));
  const peaks: number[] = [];

  for (let s = 0; s < totalSlots; s++) {
    const start = s * samplesPerSlot;
    const end = Math.min(left.length, start + samplesPerSlot);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const valL = Math.abs(left[i]);
      if (valL > peak) peak = valL;
      if (right) {
        const valR = Math.abs(right[i]);
        if (valR > peak) peak = valR;
      }
    }
    peaks.push(Math.min(1, Math.max(0.08, peak)));
  }

  return peaks;
}

// -------------------------------------------------------------
// 18 Procedural Sound Effect Presets
// -------------------------------------------------------------

export const SFX_PRESETS: SfxPreset[] = [
  // 1. Whoosh Clean
  {
    id: 'whoosh-clean',
    name: 'Clean Whoosh',
    category: 'whoosh',
    categoryLabel: 'Whooshes & Swishes',
    duration: 0.45,
    description: 'Smooth airy stereo swoosh for clean video cuts and slides.',
    tags: ['whoosh', 'transition', 'cut', 'air', 'smooth'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.45;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      const right = new Float32Array(len);
      const fltL = new SVFilter(sampleRate);
      const fltR = new SVFilter(sampleRate);

      for (let i = 0; i < len; i++) {
        const progress = i / len;
        const env = Math.sin(Math.PI * progress) ** 2.2;
        const cutoff = 320 + 2600 * Math.sin(Math.PI * progress);
        const noiseL = Math.random() * 2 - 1;
        const noiseR = Math.random() * 2 - 1;
        const filteredL = fltL.process(noiseL, cutoff, 0.22).band;
        const filteredR = fltR.process(noiseR, cutoff, 0.22).band;

        const pan = (progress - 0.5) * 1.3; // Stereo panning left to right
        left[i] = filteredL * env * (1 - pan) * 0.5;
        right[i] = filteredR * env * (1 + pan) * 0.5;
      }
      normalize(left, right);
      return { left, right };
    },
  },

  // 2. Whoosh Whip
  {
    id: 'whoosh-whip',
    name: 'Whip Pan Swoosh',
    category: 'whoosh',
    categoryLabel: 'Whooshes & Swishes',
    duration: 0.22,
    description: 'Fast, sharp, high-speed camera whip transition.',
    tags: ['whoosh', 'whip', 'fast', 'snap', 'action'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.22;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      const right = new Float32Array(len);
      const fltL = new SVFilter(sampleRate);
      const fltR = new SVFilter(sampleRate);

      for (let i = 0; i < len; i++) {
        const progress = i / len;
        const env = Math.sin(Math.PI * progress) ** 1.8;
        const cutoff = 450 + 4200 * Math.pow(Math.sin(Math.PI * progress), 1.5);
        const noise = Math.random() * 2 - 1;
        const filteredL = fltL.process(noise, cutoff, 0.35).band;
        const filteredR = fltR.process(noise * 0.95, cutoff, 0.35).band;

        const pan = (progress - 0.5) * 1.6;
        left[i] = filteredL * env * (1 - pan) * 0.5;
        right[i] = filteredR * env * (1 + pan) * 0.5;
      }
      normalize(left, right);
      return { left, right };
    },
  },

  // 3. Whoosh Deep
  {
    id: 'whoosh-deep',
    name: 'Cinematic Sub Whoosh',
    category: 'whoosh',
    categoryLabel: 'Whooshes & Swishes',
    duration: 0.65,
    description: 'Heavy sub-bass movement whoosh for dramatic moments.',
    tags: ['whoosh', 'deep', 'sub', 'bass', 'cinematic'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.65;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      const flt = new SVFilter(sampleRate);
      let phase = 0;

      for (let i = 0; i < len; i++) {
        const progress = i / len;
        const env = Math.sin(Math.PI * progress) ** 2.0;
        const freq = 110 - 65 * progress;
        phase += (2 * Math.PI * freq) / sampleRate;
        const sub = Math.sin(phase) * 0.7;

        const noise = Math.random() * 2 - 1;
        const filteredNoise = flt.process(noise, 220 + 380 * Math.sin(Math.PI * progress), 0.3).low;
        left[i] = (sub + filteredNoise * 0.5) * env;
      }
      normalize(left);
      return { left };
    },
  },

  // 4. Whoosh Air
  {
    id: 'whoosh-air',
    name: 'Soft Air Swish',
    category: 'whoosh',
    categoryLabel: 'Whooshes & Swishes',
    duration: 0.35,
    description: 'Gentle, breathy air swish for subtle lower-thirds and captions.',
    tags: ['whoosh', 'air', 'soft', 'subtle', 'gentle'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.35;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      const flt = new SVFilter(sampleRate);

      for (let i = 0; i < len; i++) {
        const progress = i / len;
        const env = Math.sin(Math.PI * progress) ** 2.5;
        const cutoff = 1100 + 1600 * Math.sin(Math.PI * progress);
        const noise = Math.random() * 2 - 1;
        left[i] = flt.process(noise, cutoff, 0.15).band * env;
      }
      normalize(left);
      return { left };
    },
  },

  // 5. Impact Bass Drop
  {
    id: 'impact-bass-drop',
    name: '808 Bass Drop',
    category: 'impact',
    categoryLabel: 'Impacts & Accents',
    duration: 0.9,
    description: 'Deep resonant 808 sub-bass drop for video hooks and punchlines.',
    tags: ['impact', 'bass', 'drop', '808', 'hook', 'hit'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.9;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let phase = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const freq = 34 + 85 * Math.exp(-t * 6.5);
        phase += (2 * Math.PI * freq) / sampleRate;
        const env = Math.min(1, t / 0.003) * Math.exp(-t * 4.2);
        const raw = Math.sin(phase);
        left[i] = Math.tanh(raw * 1.6) * env;
      }
      normalize(left);
      return { left };
    },
  },

  // 6. Impact Punch
  {
    id: 'impact-punch',
    name: 'Punchy Accent Hit',
    category: 'impact',
    categoryLabel: 'Impacts & Accents',
    duration: 0.32,
    description: 'Crisp, punchy transient hit for quick smash cuts.',
    tags: ['impact', 'punch', 'kick', 'hit', 'smash'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.32;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let phase = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const freq = 55 + 230 * Math.exp(-t * 35);
        phase += (2 * Math.PI * freq) / sampleRate;
        const transient = t < 0.006 ? (Math.random() * 2 - 1) * 0.4 : 0;
        const env = Math.exp(-t * 12);
        left[i] = (Math.sin(phase) + transient) * env;
      }
      normalize(left);
      return { left };
    },
  },

  // 7. Impact Cinematic Hit
  {
    id: 'impact-cinematic-hit',
    name: 'Cinematic Metal Hit',
    category: 'impact',
    categoryLabel: 'Impacts & Accents',
    duration: 1.2,
    description: 'Layered trailer boom with metallic resonant tail.',
    tags: ['impact', 'cinematic', 'metal', 'trailer', 'boom'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 1.2;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let pSub = 0, pH1 = 0, pH2 = 0, pH3 = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        pSub += (2 * Math.PI * (48 + 50 * Math.exp(-t * 8))) / sampleRate;
        pH1 += (2 * Math.PI * 345) / sampleRate;
        pH2 += (2 * Math.PI * 692) / sampleRate;
        pH3 += (2 * Math.PI * 1260) / sampleRate;

        const sub = Math.sin(pSub) * Math.exp(-t * 3.5);
        const metal =
          (Math.sin(pH1) * 0.4 * Math.exp(-t * 4.5) +
            Math.sin(pH2) * 0.25 * Math.exp(-t * 6) +
            Math.sin(pH3) * 0.15 * Math.exp(-t * 8)) *
          Math.min(1, t / 0.002);
        const noiseBurst = t < 0.015 ? (Math.random() * 2 - 1) * (1 - t / 0.015) * 0.3 : 0;

        left[i] = sub * 0.65 + metal * 0.45 + noiseBurst;
      }
      normalize(left);
      return { left };
    },
  },

  // 8. Impact Glitch
  {
    id: 'impact-glitch',
    name: 'Digital Glitch Burst',
    category: 'impact',
    categoryLabel: 'Impacts & Accents',
    duration: 0.28,
    description: 'Bitcrushed digital glitch / cyber stutter effect.',
    tags: ['impact', 'glitch', 'digital', 'cyber', 'error'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.28;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let phase = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const gate = Math.sin(2 * Math.PI * 36 * t) > 0 ? 1 : 0.15;
        phase += (2 * Math.PI * (160 + (t > 0.14 ? 80 : 0))) / sampleRate;
        const sqr = Math.sin(phase) > 0 ? 1 : -1;
        const noise = Math.random() * 2 - 1;
        const env = Math.exp(-t * 8);

        // Bitcrush quantize simulation
        const raw = (sqr * 0.6 + noise * 0.4) * gate * env;
        const steps = 6;
        left[i] = Math.round(raw * steps) / steps;
      }
      normalize(left);
      return { left };
    },
  },

  // 9. Pop Bubble
  {
    id: 'pop-bubble',
    name: 'Bubble Pop',
    category: 'pop',
    categoryLabel: 'UI, Pops & Bells',
    duration: 0.12,
    description: 'The viral CapCut & TikTok pop sound for text & sticker reveals.',
    tags: ['pop', 'bubble', 'caption', 'text', 'reveal', 'viral'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.12;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let phase = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        let freq: number;
        if (t < 0.012) {
          // Sharp upward chirp
          freq = 420 + 940 * (t / 0.012);
        } else {
          // Rapid decay drop
          freq = 660 + 700 * Math.exp(-(t - 0.012) * 45);
        }
        phase += (2 * Math.PI * freq) / sampleRate;
        const env = Math.exp(-t * 26);
        left[i] = Math.sin(phase) * env;
      }
      normalize(left);
      return { left };
    },
  },

  // 10. Chime Bell
  {
    id: 'chime-bell',
    name: 'Sparkle Ding / Bell',
    category: 'pop',
    categoryLabel: 'UI, Pops & Bells',
    duration: 1.1,
    description: 'Bright harmonic chime bell for key takeaways or subscribe prompts.',
    tags: ['bell', 'ding', 'chime', 'subscribe', 'keypoint', 'bright'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 1.1;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let p1 = 0, p2 = 0, p3 = 0, p4 = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const vibrato = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t);
        p1 += (2 * Math.PI * 1046.5 * vibrato) / sampleRate; // C6
        p2 += (2 * Math.PI * 1318.5 * vibrato) / sampleRate; // E6
        p3 += (2 * Math.PI * 1568.0 * vibrato) / sampleRate; // G6
        p4 += (2 * Math.PI * 2093.0 * vibrato) / sampleRate; // C7

        const h1 = Math.sin(p1) * Math.exp(-t * 2.8);
        const h2 = Math.sin(p2) * 0.65 * Math.exp(-t * 3.4);
        const h3 = Math.sin(p3) * 0.45 * Math.exp(-t * 4.0);
        const h4 = Math.sin(p4) * 0.3 * Math.exp(-t * 4.8);

        left[i] = (h1 + h2 + h3 + h4) * Math.min(1, t / 0.002);
      }
      normalize(left);
      return { left };
    },
  },

  // 11. Camera Shutter
  {
    id: 'camera-shutter',
    name: 'Camera Shutter Click',
    category: 'pop',
    categoryLabel: 'UI, Pops & Bells',
    duration: 0.28,
    description: 'Mechanical DSLR camera shutter for photo freeze-frames.',
    tags: ['camera', 'shutter', 'click', 'photo', 'freeze'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.28;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      const flt = new SVFilter(sampleRate);

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        let sig = 0;

        // Click 1 (Mirror flip at 0ms)
        if (t < 0.03) {
          const noise = Math.random() * 2 - 1;
          const thud = Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t * 90);
          sig += (flt.process(noise, 2200, 0.4).high * 0.6 + thud * 0.6) * Math.exp(-t * 80);
        }

        // Click 2 (Curtain close at 85ms)
        if (t >= 0.085 && t < 0.13) {
          const t2 = t - 0.085;
          const noise = Math.random() * 2 - 1;
          sig += flt.process(noise, 3400, 0.5).high * Math.exp(-t2 * 95);
        }

        left[i] = sig;
      }
      normalize(left);
      return { left };
    },
  },

  // 12. Mouse Click
  {
    id: 'mouse-click',
    name: 'Mouse Click / Tap',
    category: 'pop',
    categoryLabel: 'UI, Pops & Bells',
    duration: 0.08,
    description: 'Tactile switch click for modern screencast & tutorial edits.',
    tags: ['click', 'mouse', 'tap', 'ui', 'tutorial'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.08;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      const flt = new SVFilter(sampleRate);

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        let sig = 0;

        // Down click
        if (t < 0.015) {
          const noise = Math.random() * 2 - 1;
          sig += flt.process(noise, 1950, 0.6).band * Math.exp(-t * 220);
        }
        // Up click release
        if (t >= 0.022 && t < 0.04) {
          const t2 = t - 0.022;
          const noise = Math.random() * 2 - 1;
          sig += flt.process(noise, 2600, 0.6).band * Math.exp(-t2 * 240) * 0.6;
        }

        left[i] = sig;
      }
      normalize(left);
      return { left };
    },
  },

  // 13. Typewriter
  {
    id: 'typewriter',
    name: 'Typewriter Key Strike',
    category: 'pop',
    categoryLabel: 'UI, Pops & Bells',
    duration: 0.15,
    description: 'Mechanical vintage typewriter hammer strike for typing effects.',
    tags: ['typewriter', 'key', 'strike', 'retro', 'text'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.15;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const metal = Math.sin(2 * Math.PI * 840 * t) * Math.exp(-t * 45);
        const highSnap = Math.sin(2 * Math.PI * 2600 * t) * 0.5 * Math.exp(-t * 90);
        const noise = (Math.random() * 2 - 1) * 0.3 * Math.exp(-t * 120);

        // Platen return rattle at 38ms
        let rattle = 0;
        if (t >= 0.038 && t < 0.09) {
          const t2 = t - 0.038;
          rattle = Math.sin(2 * Math.PI * 1200 * t2) * 0.25 * Math.exp(-t2 * 60);
        }

        left[i] = (metal + highSnap + noise + rattle) * Math.min(1, t / 0.001);
      }
      normalize(left);
      return { left };
    },
  },

  // 14. Riser Pitch
  {
    id: 'riser-pitch',
    name: 'Pitch Tension Riser',
    category: 'riser',
    categoryLabel: 'Risers & Tension',
    duration: 1.5,
    description: 'Accelerating frequency pitch rise leading up to a climax or beat drop.',
    tags: ['riser', 'tension', 'build', 'pitch', 'climax'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 1.5;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let phase = 0;
      const flt = new SVFilter(sampleRate);

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const progress = t / dur;
        const freq = 125 * Math.pow(1500 / 125, progress);
        phase += (2 * Math.PI * freq) / sampleRate;

        const noise = Math.random() * 2 - 1;
        const filteredNoise = flt.process(noise, freq * 1.5, 0.25).band;
        const saw = (phase % (2 * Math.PI)) / Math.PI - 1;

        const vol = Math.pow(progress, 1.7) * (progress > 0.98 ? (1 - progress) / 0.02 : 1);
        left[i] = (saw * 0.55 + filteredNoise * 0.45) * vol;
      }
      normalize(left);
      return { left };
    },
  },

  // 15. Riser Swell
  {
    id: 'riser-swell',
    name: 'Cinematic Orchestral Swell',
    category: 'riser',
    categoryLabel: 'Risers & Tension',
    duration: 1.8,
    description: 'Reverse-reverb cinematic swell with sudden silent drop.',
    tags: ['riser', 'swell', 'cinematic', 'reverse', 'drop'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 1.8;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let p1 = 0, p2 = 0, p3 = 0, p4 = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const progress = t / dur;
        p1 += (2 * Math.PI * 110) / sampleRate;
        p2 += (2 * Math.PI * 165.2) / sampleRate;
        p3 += (2 * Math.PI * 220.5) / sampleRate;
        p4 += (2 * Math.PI * 277.4) / sampleRate;

        const chord =
          Math.sin(p1) * 0.35 +
          Math.sin(p2) * 0.25 +
          Math.sin(p3) * 0.25 +
          Math.sin(p4) * 0.2;
        const vol = Math.pow(progress, 2.2) * (progress > 0.985 ? (1 - progress) / 0.015 : 1);
        left[i] = chord * vol;
      }
      normalize(left);
      return { left };
    },
  },

  // 16. Tape Stop
  {
    id: 'tape-stop',
    name: 'Vinyl / Tape Stop',
    category: 'riser',
    categoryLabel: 'Risers & Tension',
    duration: 0.45,
    description: 'Decelerating turntable motor stop for unexpected pauses or jokes.',
    tags: ['tape', 'vinyl', 'stop', 'pause', 'rewind'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.45;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let phase = 0;
      const flt = new SVFilter(sampleRate);

      for (let i = 0; i < len; i++) {
        const progress = i / len;
        const freq = 480 * Math.max(0.01, 1 - Math.pow(progress, 1.4));
        phase += (2 * Math.PI * freq) / sampleRate;
        const sqr = Math.sin(phase) + 0.3 * Math.sin(phase * 2);
        const filtered = flt.process(sqr, Math.max(100, freq * 2.5), 0.3).low;
        const env = (1 - progress * 0.8) * (progress > 0.95 ? (1 - progress) / 0.05 : 1);
        left[i] = filtered * env;
      }
      normalize(left);
      return { left };
    },
  },

  // 17. Coin Reward
  {
    id: 'coin-reward',
    name: '8-Bit Coin Reward',
    category: 'pop',
    categoryLabel: 'UI, Pops & Bells',
    duration: 0.35,
    description: 'Retro game coin chime arpeggio for score reveals or achievement badges.',
    tags: ['coin', 'reward', '8bit', 'retro', 'game'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.35;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let phase = 0;

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        // B5 (987.77Hz) for 0.08s then E6 (1318.51Hz)
        const freq = t < 0.085 ? 987.77 : 1318.51;
        phase += (2 * Math.PI * freq) / sampleRate;
        const sqr = Math.sin(phase) > 0 ? 0.7 : -0.7;
        const env = t < 0.085 ? 1 : Math.exp(-(t - 0.085) * 8);
        left[i] = sqr * env;
      }
      normalize(left);
      return { left };
    },
  },

  // 18. Record Scratch
  {
    id: 'record-scratch',
    name: 'Record Scratch',
    category: 'impact',
    categoryLabel: 'Impacts & Accents',
    duration: 0.35,
    description: 'Classic comedic needle scratch for funny interruptions.',
    tags: ['scratch', 'vinyl', 'record', 'comedy', 'humor'],
    generateSamples: (sampleRate = 44100) => {
      const dur = 0.35;
      const len = Math.floor(dur * sampleRate);
      const left = new Float32Array(len);
      let phase = 0;
      const flt = new SVFilter(sampleRate);

      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const progress = t / dur;
        // Oscillating needle scratch velocity
        const freq = 350 + 900 * Math.abs(Math.sin(progress * Math.PI * 4.5));
        phase += (2 * Math.PI * freq) / sampleRate;
        const noise = Math.random() * 2 - 1;
        const filtered = flt.process(noise * 0.6 + Math.sin(phase) * 0.4, freq, 0.4).band;
        const env = Math.sin(Math.PI * progress) ** 1.3;
        left[i] = filtered * env;
      }
      normalize(left);
      return { left };
    },
  },
];

// In-memory memoization cache for synthesized WAV files and peaks
const sfxFileCache = new Map<string, { file: File; waveform: number[]; duration: number }>();

/**
 * Returns a cached File object and waveform peaks for a given SFX preset ID.
 * Generates it on the fly if not already cached.
 */
export function getSfxFile(presetId: string): { file: File; waveform: number[]; duration: number } {
  const cached = sfxFileCache.get(presetId);
  if (cached) return cached;

  const preset = SFX_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`Unknown SFX preset: ${presetId}`);

  const sampleRate = 44100;
  const { left, right } = preset.generateSamples(sampleRate);
  const wavBytes = encodeWav(left, right, sampleRate);
  const file = new File([wavBytes.buffer as ArrayBuffer], `SFX - ${preset.name}.wav`, {
    type: 'audio/wav',
  });
  const waveform = computeWaveformPeaks(left, right, sampleRate, preset.duration);

  const result = { file, waveform, duration: preset.duration };
  sfxFileCache.set(presetId, result);
  return result;
}

// Global active preview node for stopping previous preview
let activePreviewAudio: HTMLAudioElement | null = null;

/**
 * Plays an instant preview of the SFX preset using HTMLAudioElement or WebAudio.
 * Returns a function to stop the sound prematurely.
 */
export function playSfxPreview(presetId: string, volume = 0.85): () => void {
  // Stop existing preview
  if (activePreviewAudio) {
    try {
      activePreviewAudio.pause();
      activePreviewAudio.currentTime = 0;
    } catch {}
    activePreviewAudio = null;
  }

  if (typeof window === 'undefined') return () => {};

  try {
    const { file } = getSfxFile(presetId);
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    activePreviewAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (activePreviewAudio === audio) activePreviewAudio = null;
    };

    audio.play().catch(() => {});

    return () => {
      try {
        audio.pause();
        audio.currentTime = 0;
        URL.revokeObjectURL(url);
      } catch {}
      if (activePreviewAudio === audio) activePreviewAudio = null;
    };
  } catch {
    return () => {};
  }
}

/**
 * Adds an SFX sound clip to the project at the specified timeline time.
 * Reuses existing MediaAsset if already present in the project to avoid duplication.
 */
export function addSfxToProject(
  p: Project,
  presetId: string,
  atTime?: number,
  targetTrack = 'A2',
): { nextProject: Project; clipId: string; assetId: string } {
  const preset = SFX_PRESETS.find((x) => x.id === presetId);
  if (!preset) throw new Error(`Unknown SFX preset: ${presetId}`);

  const { file, waveform, duration } = getSfxFile(presetId);
  const next = structuredClone(p);

  // Look for existing MediaAsset for this SFX preset
  const expectedName = `SFX - ${preset.name}.wav`;
  let asset = next.media.find((m) => m.name === expectedName && m.type === 'audio/wav');

  if (!asset) {
    asset = {
      id: `sfx_${preset.id}_${uid()}`,
      name: expectedName,
      duration,
      width: 1280,
      height: 720,
      size: file.size,
      type: 'audio/wav',
      folder: 'SFX',
    };
    next.media.push(asset);
  }

  // Ensure media registration & waveform in runtime store
  if (!mediaFiles.has(asset.id)) {
    registerMedia(asset, file);
  }
  audioWaveforms.set(asset.id, waveform);

  // Ensure target track exists
  const hasTrack = next.tracks.some((t) => t.id === targetTrack);
  const trackId = hasTrack
    ? targetTrack
    : next.tracks.find((t) => t.kind === 'audio')?.id ?? 'A2';

  const startTime = Number.isFinite(atTime) ? Math.max(0, atTime!) : 0;
  const clipId = uid();

  const clip: Clip = {
    id: clipId,
    mediaId: asset.id,
    trackId,
    start: startTime,
    sourceStart: 0,
    sourceEnd: duration,
    audioRole: 'sfx',
    properties: {
      ...defaultProps,
      volume: 1.0,
    },
  };

  next.clips.push(clip);
  return { nextProject: next, clipId, assetId: asset.id };
}

/**
 * Smart Production: Automatically scans all video cuts on V1 and inserts a Whoosh at each transition.
 */
export function autoAddWhooshesToCuts(
  p: Project,
  presetId = 'whoosh-clean',
): { nextProject: Project; count: number } {
  const v1Clips = [...p.clips]
    .filter((c) => !isAudioClip(p, c) && c.trackId === 'V1')
    .sort((a, b) => a.start - b.start);

  if (v1Clips.length <= 1) return { nextProject: p, count: 0 };

  const cutTimes: number[] = [];
  for (let i = 1; i < v1Clips.length; i++) {
    const cut = v1Clips[i].start;
    // Minimum 1.2s between automatic whooshes to keep sound design tasteful
    if (cut >= 0.2 && (!cutTimes.length || cut - cutTimes[cutTimes.length - 1] >= 1.2)) {
      cutTimes.push(cut);
    }
  }

  let next = structuredClone(p);
  let count = 0;

  for (const cut of cutTimes) {
    // Lead whoosh slightly so its peak lands right on the frame cut
    const at = Math.max(0, cut - 0.18);
    const res = addSfxToProject(next, presetId, at, 'A2');
    next = res.nextProject;
    count++;
  }

  return { nextProject: next, count };
}

/**
 * Smart Production: Automatically scans highlighted / important words in captions
 * and places a Bubble Pop sound effect when each keyword appears.
 */
export function autoAddPopsToCaptions(
  p: Project,
  presetId = 'pop-bubble',
): { nextProject: Project; count: number } {
  const words = timelineWords(p).filter((w) => w.important);
  if (!words.length) return { nextProject: p, count: 0 };

  const popTimes: number[] = [];
  for (const word of words) {
    const at = word.timelineStart;
    // Space pops by at least 0.8s
    if (!popTimes.length || at - popTimes[popTimes.length - 1] >= 0.8) {
      popTimes.push(at);
    }
  }

  let next = structuredClone(p);
  let count = 0;

  for (const at of popTimes) {
    const res = addSfxToProject(next, presetId, at, 'A2');
    next = res.nextProject;
    count++;
  }

  return { nextProject: next, count };
}

/**
 * Smart Production: Adds an 808 Bass Drop or Cinematic Impact right at the opening hook (0.0s).
 */
export function autoAddImpactToHook(
  p: Project,
  presetId = 'impact-bass-drop',
): { nextProject: Project; added: boolean } {
  // If an SFX already exists at 0.0s, don't duplicate
  const alreadyHas = p.clips.some(
    (c) => isAudioClip(p, c) && c.audioRole === 'sfx' && c.start <= 0.1,
  );
  if (alreadyHas) return { nextProject: p, added: false };

  const { nextProject } = addSfxToProject(p, presetId, 0, 'A2');
  return { nextProject, added: true };
}

/**
 * Removes all sound effects clips from the project.
 */
export function clearSfxClips(p: Project): Project {
  const next = structuredClone(p);
  next.clips = next.clips.filter((c) => c.audioRole !== 'sfx');
  return next;
}
