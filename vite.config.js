import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [iwsdkDev()],
  server: { host: '0.0.0.0', port: 5173, open: false },
  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  resolve: { dedupe: ['three', '@pmndrs/uikit'] },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: ['three'],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  // relative paths so the build works from a GitHub Pages sub-path
  base: './',
});
