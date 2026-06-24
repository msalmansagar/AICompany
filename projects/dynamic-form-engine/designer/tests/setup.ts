import '@testing-library/jest-dom';

// Fluent UI v9 MessageBar uses ResizeObserver internally; jsdom doesn't include it
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
