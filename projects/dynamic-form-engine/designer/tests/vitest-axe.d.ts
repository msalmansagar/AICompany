/**
 * Type augmentation for vitest-axe.
 *
 * vitest-axe/extend-expect targets the Vi namespace (Vitest v1), but this
 * project uses Vitest v2 which exposes Assertion through @vitest/expect.
 * This file bridges the gap so `expect(axeResults).toHaveNoViolations()` is
 * type-safe without a cast.
 */
import type { AxeMatchers } from 'vitest-axe/matchers';

declare module '@vitest/expect' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
