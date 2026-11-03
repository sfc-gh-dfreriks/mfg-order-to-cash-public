import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Base is "/" for the local app.
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // One three.js instance: 3d-force-graph ships its own copy, and three's type checks fail across copies.
    dedupe: ['three'],
  },
  server: {
    port: 5190,
    proxy: {
      '/api': {
        target: 'http://localhost:3015',
        changeOrigin: true,
      },
    },
  },
});
