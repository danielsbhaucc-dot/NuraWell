import path from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: {
    '@platform/ui': path.resolve(__dirname, '../../packages/@platform/ui/src/index.ts'),
    '@platform/ai-engine': path.resolve(__dirname, '../../packages/@platform/ai-engine/src/index.ts'),
    '@platform/auth': path.resolve(__dirname, '../../packages/@platform/auth/src/index.ts'),
    '@': path.resolve(__dirname, '.'),
  } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
