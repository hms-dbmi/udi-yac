import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

const udiToolkitRoot = resolve(__dirname, '../udi-grammar/src/components');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Match vite.config.ts so tests can import the same modules the app does.
      'udi-toolkit/react': resolve(udiToolkitRoot, 'dist/react.js'),
      'udi-toolkit': resolve(udiToolkitRoot, 'dist/index.js'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Exclude the Vue-CE-heavy UDIVis tree from coverage targets — it's
    // bridged from udi-grammar and tested there.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/components/ui/**', 'dist/**'],
    },
  },
});
