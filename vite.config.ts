import { defineConfig } from 'vite';

export default defineConfig({
  base: '/jaeger-demo/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1100 },
  server: { fs: { strict: true } },
});
