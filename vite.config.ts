import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { youtubeIngestPlugin } from './src/server/youtube-plugin';
import { turboExportPlugin } from './src/server/export-plugin';
import { youtubePublishPlugin } from './src/server/youtube-publish-plugin';

export default defineConfig({
  plugins: [react(), youtubeIngestPlugin(), turboExportPlugin(), youtubePublishPlugin()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@huggingface/transformers'] },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) {
              return 'vendor-ui';
            }
            if (id.includes('react') || id.includes('zustand')) {
              return 'vendor-react';
            }
            if (id.includes('@mediapipe')) {
              return 'vendor-vision';
            }
            if (id.includes('@ffmpeg')) {
              return 'vendor-ffmpeg';
            }
            if (id.includes('@huggingface') || id.includes('onnxruntime')) {
              return 'vendor-ai';
            }
          }
        },
      },
    },
  },
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
