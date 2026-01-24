import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@pull/types': path.resolve(__dirname, './packages/types/src'),
      '@pull/core': path.resolve(__dirname, './packages/core/src'),
      '@pull/db': path.resolve(__dirname, './packages/db'),
    },
  },
});
