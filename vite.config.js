import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'docs', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000, target: 'es2020' },
  server: { host: '127.0.0.1', port: 5173 },
});
