import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild handles the JSX; @vitejs/plugin-react exists for Fast Refresh,
  // which tests do not use.
  esbuild: { jsx: 'automatic' },
  test: {
    // Puck's <Render> pulls in components that touch browser globals at module
    // scope, so a DOM must exist even though rendering itself is server-side.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['runtime/**/*.test.{ts,tsx}'],
  },
});
