/**
 * Type declarations for vitest-axe integration (DFE-ENH-001 ENT-008).
 *
 * vitest-axe@0.1.0 ships a root-level matchers.d.ts that uses `export type *`
 * which incorrectly marks toHaveNoViolations as type-only, preventing its use
 * in expect.extend(). This file overrides that module declaration to correctly
 * expose toHaveNoViolations as a value.
 *
 * The Vitest 2.x `declare module 'vitest'` augmentation makes toHaveNoViolations()
 * available on expect(…) in all test files without extra imports.
 */

import type AxeCore from 'axe-core';

// ── Override vitest-axe@0.1.0 incorrect 'export type *' in matchers.d.ts ────
declare module 'vitest-axe/matchers' {
  interface AxeMatchers {
    /** Assert that the axe-core scan results contain zero WCAG violations. */
    toHaveNoViolations(): void;
  }

  interface NoViolationsMatcherResult {
    actual: AxeCore.Result[];
    message(): string;
    pass: boolean;
  }

  /** Vitest custom matcher — pass to expect.extend({ toHaveNoViolations }). */
  function toHaveNoViolations(
    results: AxeCore.AxeResults
  ): NoViolationsMatcherResult;

  export { AxeMatchers, NoViolationsMatcherResult, toHaveNoViolations };
}

// ── Vitest 2.x matcher registration (replaces deprecated namespace Vi) ────────
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<R = any> {
    /** Assert that the axe-core scan results contain zero WCAG 2.1 AA violations. */
    toHaveNoViolations(): R;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
