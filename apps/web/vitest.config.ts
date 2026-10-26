import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@saas/billing': path.resolve(__dirname, '../../packages/billing/src/index.ts'),
      '@platform/iam': path.resolve(__dirname, '../../packages/@platform/iam/src/index.ts'),
      '@platform/qc': path.resolve(__dirname, '../../packages/@platform/qc/src/index.ts'),
      '@platform/access': path.resolve(__dirname, '../../packages/@platform/access/src/index.ts'),
      '@platform/ui': path.resolve(__dirname, '../../packages/@platform/ui/src/index.ts'),
      '@platform/ai-engine': path.resolve(__dirname, '../../packages/@platform/ai-engine/src/index.ts'),
      '@platform/auth': path.resolve(__dirname, '../../packages/@platform/auth/src/index.ts'),
      'server-only': path.resolve(__dirname, 'tests/mocks/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
