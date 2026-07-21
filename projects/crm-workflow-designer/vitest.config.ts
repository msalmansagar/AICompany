import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Standalone test config — pure-logic unit tests run in the Node environment and
// resolve the same `@/` alias the app uses. UI/component tests can add jsdom later.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
