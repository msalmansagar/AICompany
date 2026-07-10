/**
 * ENT-008 (DFE-ENH-001) — WCAG 2.1 AA E2E accessibility gate
 *
 * Layer 1 harness: @axe-core/playwright scans the live Vite dev server build
 * of the designer and asserts zero WCAG 2.1 AA violations.
 *
 * This test is a CI hard gate — a PR introducing new violations is blocked.
 *
 * Prerequisites: `npm run dev` must be running on the configured baseURL
 * (default: http://localhost:5173). In CI, set PLAYWRIGHT_BASE_URL to the
 * preview-build URL.
 *
 * Manual checks beyond automated scope: see
 * projects/dfe-designer-enhancements/a11y-manual-checklist.md
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa'] as const;

test.describe('Designer — WCAG 2.1 AA E2E scan (ENT-008)', () => {
  test('designer-form-list_hasNoWcag2aaViolations', async ({ page }) => {
    await page.goto('/');

    // Wait for the primary content area to be visible before scanning.
    // The designer renders a Spinner while CRM context initialises; in the
    // dev-server (REST mode) the form list should render within 5s.
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_AA_TAGS])
      .analyze();

    // Attach the full violation report as a test annotation so the F4
    // scan inventory can be read directly from the Playwright HTML report.
    if (results.violations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-violations',
        description: JSON.stringify(
          results.violations.map(v => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            nodes: v.nodes.length,
          })),
          null,
          2
        ),
      });
    }

    expect(
      results.violations,
      `Found ${String(results.violations.length)} WCAG 2.1 AA violation(s) on the form-list page. ` +
      'See F4 scan inventory in phase-4-tech-F.md for remediation plan.'
    ).toHaveLength(0);
  });

  test('designer-canvas_hasNoWcag2aaViolations', async ({ page }) => {
    // Navigate directly to the designer canvas via hash or query param.
    // The designer's single-page routing is store-driven; this test
    // approximates the canvas route by opening the root URL and waiting.
    // Full canvas navigation requires a loaded form; this wiring is
    // completed in the F5 workstream when a seed form is available in CI.
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_AA_TAGS])
      .exclude('[data-axe-ignore]') // Honour explicit opt-out markers set by component authors
      .analyze();

    expect(
      results.violations,
      `Found ${String(results.violations.length)} WCAG 2.1 AA violation(s) on the designer canvas page. ` +
      'See F4 scan inventory in phase-4-tech-F.md for remediation plan.'
    ).toHaveLength(0);
  });
});
