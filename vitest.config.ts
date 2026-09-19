import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    environmentMatchGlobs: [['test/verify.test.ts', 'node']],
  },
});
