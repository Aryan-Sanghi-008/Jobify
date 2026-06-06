import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**/*.ts', 'src/content/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/content/ats/**',
        'src/popup/**',
        'src/background/**',
      ],
      reporter: ['text-summary', 'text'],
    },
  },
});
