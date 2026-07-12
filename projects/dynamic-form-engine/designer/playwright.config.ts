/**
 * Playwright configuration for the DFE Form Designer.
 *
 * ENT-008 (DFE-ENH-001): This config wires @axe-core/playwright into the E2E
 * suite for WCAG 2.1 AA gate checks. Zero AA violations is a hard CI gate —
 * a PR introducing new violations must not be merged.
 *
 * Target: the Vite dev server (npm run dev → http://localhost:5173) in local
 * runs, and the built static artifact in CI.
 *
 * For CRM-embedded runs the designer is served by Dataverse; the baseURL must
 * be updated to the org URL and authentication headers added via storageState.
 * That wiring is deferred to the F5 workstream.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    /**
     * Base URL for local dev server (npm run dev).
     * Override via PLAYWRIGHT_BASE_URL env var in CI if building static artifact.
     */
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
