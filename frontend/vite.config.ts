import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The repository-root .env is shared with the backend; only VITE_* variables reach the browser bundle.
export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, '..');
  const env = loadEnv(mode, rootDir, 'VITE_');
  const apiTarget = env['VITE_DEV_API_TARGET'] || 'http://localhost:4000';

  return {
    plugins: [react()],
    envDir: rootDir,
    server: {
      port: 5173,
      host: '0.0.0.0',
      // In development the API is reached through the dev server, so cookies stay same-origin.
      proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    },
    preview: { port: 4173, host: '0.0.0.0', proxy: { '/api': { target: apiTarget, changeOrigin: false } } },
    build: {
      sourcemap: false,
      /*
       * `<model-viewer>` is about 1.1 MB (300 KB gzipped) and cannot usefully be
       * split further - it carries a WebGL renderer and the WebXR plumbing. It
       * is dynamically imported by the AR viewer alone, so it is never fetched
       * until somebody opens an instrument lab. The limit is above its size so
       * the warning stays meaningful for chunks that are large by accident.
       */
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            query: ['@tanstack/react-query', 'react-hook-form', 'zod', '@hookform/resolvers'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
