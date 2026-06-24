/**
 * Promotes @jest/globals module exports to ambient globals so test files can
 * use `describe`, `it`, `expect`, `jest`, etc. without explicit imports.
 *
 * WHY: @types/jest is not installed; @jest/globals is the installed package.
 * The tsconfig "types" array references "@jest/globals" (a module) rather than
 * "@types/jest" (an ambient package), so Jest globals are not declared by
 * default. This file bridges the gap without requiring an npm install.
 *
 * The `jest` namespace alias (jest.MockedFunction, jest.SpyInstance, etc.)
 * is added so test files can use those generic helper types directly.
 */

import type * as JestGlobals from '@jest/globals';

declare global {
  const describe: typeof JestGlobals.describe;
  const fdescribe: typeof JestGlobals.describe;
  const xdescribe: typeof JestGlobals.describe;
  const it: typeof JestGlobals.it;
  const fit: typeof JestGlobals.it;
  const xit: typeof JestGlobals.it;
  const test: typeof JestGlobals.test;
  const xtest: typeof JestGlobals.test;
  const expect: typeof JestGlobals.expect;
  const beforeEach: typeof JestGlobals.beforeEach;
  const afterEach: typeof JestGlobals.afterEach;
  const beforeAll: typeof JestGlobals.beforeAll;
  const afterAll: typeof JestGlobals.afterAll;
  const jest: typeof JestGlobals.jest;

  /** Namespace alias so jest.MockedFunction<T>, jest.SpyInstance, etc. resolve. */
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type MockedFunction<T extends (...args: any[]) => any> =
      JestGlobals.jest.MockedFunction<T>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type SpyInstance<T = any, Y extends any[] = any[]> =
      JestGlobals.jest.SpyInstance<T, Y>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Mock<T = any, Y extends any[] = any[]> =
      JestGlobals.jest.Mock<T, Y>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type MockInstance<T = any, Y extends any[] = any[]> =
      JestGlobals.jest.MockInstance<T, Y>;
  }
}

export {};
