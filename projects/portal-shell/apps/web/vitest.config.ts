import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
  resolve: {
    alias: {
      '@portal/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@portal/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@portal/widget-registry': path.resolve(__dirname, '../../packages/widget-registry/src/index.ts'),
      '@portal/i18n': path.resolve(__dirname, '../../packages/i18n/index.ts'),
    },
  },
});
