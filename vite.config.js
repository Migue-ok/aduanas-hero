import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5199, strictPort: true, open: false, allowedHosts: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
