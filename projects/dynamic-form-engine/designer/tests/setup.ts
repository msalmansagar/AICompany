import '@testing-library/jest-dom';
import { expect } from 'vitest';
import { toHaveNoViolations } from 'vitest-axe/matchers';

/**
 * ENT-008 (DFE-ENH-001 ADR-004): Register the axe-core WCAG matcher.
 *
 * vitest-axe@0.1.0 type augmentation targets the older Vi.Assertion namespace;
 * we also provide a Vitest 2.x-compatible declaration in tests/types/vitest-axe.d.ts.
 *
 * axe-core (MPL-2.0) is dev/test-only — never bundled into the CRM web resource.
 * Bundle-exclusion proof: see vite.config.ts build.rollupOptions.external.
 */
expect.extend({ toHaveNoViolations });

// Fluent UI v9 MessageBar uses ResizeObserver internally; jsdom doesn't include it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

/**
 * axe-core uses HTMLCanvasElement.getContext() to detect ligature-based icon fonts
 * during color-contrast checks. jsdom doesn't implement canvas; this stub silences
 * the "Not implemented: HTMLCanvasElement.prototype.getContext" stderr noise without
 * affecting the accessibility rule results (color-contrast is excluded from the
 * jsdom scan because CSS is not computed in jsdom — that check runs in the E2E
 * Playwright scan against real Chromium, see tests/e2e/a11y-designer.spec.ts).
 */
// The return type is intentionally narrowed — null satisfies the axe icon-ligature
// check without triggering "not implemented" noise from jsdom.
(HTMLCanvasElement.prototype as unknown as { getContext: () => null }).getContext = (): null => null;
