import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/a11y-axe-smoke.test.ts', 'jsdom']],
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
