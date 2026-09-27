export type TranscriptionQuality = 'fast' | 'balanced' | 'detailed';
export const transcriptionModels = {
  fast: {
    id: 'onnx-community/whisper-tiny_timestamped',
    label: 'Fast',
    name: 'Whisper Tiny',
    description: 'Quick drafts on lighter devices.',
  },
  balanced: {
    id: 'onnx-community/whisper-base_timestamped',
    label: 'Balanced',
    name: 'Whisper Base',
    description: 'A stronger model for everyday speech.',
  },
  detailed: {
    id: 'onnx-community/whisper-small_timestamped',
    label: 'Detailed',
    name: 'Whisper Small',
    description: 'A larger model for difficult speech. More memory and processing time.',
  },
} as const;
export const resolveQuality = (value?: string): TranscriptionQuality =>
  value && value in transcriptionModels ? (value as TranscriptionQuality) : 'balanced';
export const recommendedQuality = (language: string): TranscriptionQuality =>
  ['Turkish', 'Polish', 'Portuguese'].includes(language) ? 'detailed' : 'balanced';
