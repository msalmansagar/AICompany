import '@testing-library/jest-dom';
import 'vitest-axe/extend-expect';
import * as axeMatchers from 'vitest-axe/matchers';
import { expect } from 'vitest';
expect.extend(axeMatchers);

// Fluent UI v9 MessageBar uses ResizeObserver internally; jsdom doesn't include it
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
