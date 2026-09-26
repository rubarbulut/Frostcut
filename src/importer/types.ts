export type IngestMediaType = 'video' | 'audio';

export interface RemoteMediaMeta {
  url: string;
  source: 'youtube' | 'direct';
  id?: string;
  title: string;
  thumbnailUrl?: string;
  duration?: number;
  availableFormats: Array<{
    formatId: string;
    type: IngestMediaType;
    quality: string;
    ext: 'mp4' | 'mp3';
    downloadUrl: string;
  }>;
}

export interface IngestJobProgress {
  phase: 'idle' | 'parsing' | 'resolving' | 'downloading' | 'processing' | 'ready' | 'error';
  percent: number;
  message: string;
  error?: string;
}

export interface AudioInspectionResult {
  duration: number;
  sampleRate: number;
  channels: number;
  waveform?: number[];
  syntheticVideoBlob?: Blob;
}
