import type { AudioInspectionResult } from './types';

/**
 * Checks if a file is an audio-only format (MP3, WAV, AAC, M4A, OGG, FLAC).
 */
export function isAudioOnlyFile(file: File): boolean {
  if (!file) return false;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type.startsWith('audio/') ||
    /\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i.test(name)
  );
}

/**
 * Inspects an audio file via the Web Audio API without requiring any external libraries.
 * Extracts accurate duration, sample rate, channels, and downsampled waveform envelope.
 */
export async function inspectAudioFile(file: File): Promise<AudioInspectionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  
  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this environment.');
  }

  const audioCtx = new AudioContextClass();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;

    // Downsample first channel into 100 normalized waveform peaks for UI rendering
    const channelData = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(channelData.length / 100));
    const waveform: number[] = [];

    for (let i = 0; i < 100; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(channelData.length, start + step);
      for (let j = start; j < end; j++) {
        const val = Math.abs(channelData[j]);
        if (val > max) max = val;
      }
      waveform.push(Number(max.toFixed(3)));
    }

    return {
      duration,
      sampleRate,
      channels,
      waveform,
    };
  } finally {
    audioCtx.close().catch(() => {});
  }
}

/**
 * Creates an audio-card video blob for audio-only files so they can seamlessly render
 * in pure HTML5 video elements and video tracks when required.
 */
export function createAudioPosterBlob(title: string, duration: number): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      resolve(new Blob([], { type: 'image/png' }));
      return;
    }

    // Draw Nordic Gothic Obsidian Poster
    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, '#04070d');
    grad.addColorStop(0.5, '#0b1320');
    grad.addColorStop(1, '#050a12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);

    // Audio Waveform Visual Accent
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 36px "Cinzel", serif';
    ctx.textAlign = 'center';
    ctx.fillText('AUDIO TRACK', 640, 320);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(title.slice(0, 50), 640, 380);

    canvas.toBlob((blob) => {
      resolve(blob || new Blob([], { type: 'image/png' }));
    }, 'image/png');
  });
}
