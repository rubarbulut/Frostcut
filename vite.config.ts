import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { youtubeIngestPlugin } from './src/server/youtube-plugin';

export default defineConfig({
  plugins: [react(), youtubeIngestPlugin()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@huggingface/transformers'] },
  server: {
    watch: { ignored: ['**/tests/.speech-browser/**', '**/test-results/**', '**/docs/qa/**', '**/performance-results/**'] },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
