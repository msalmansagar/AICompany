/**
 * Browser APIs jsdom does not implement, stubbed so Puck's editor dependencies
 * can be imported.
 *
 * Only Puck's side needs these — the runtime renderer under test imports
 * nothing beyond React, which is the point ADR-CMS-004 rests on. They exist so
 * the comparison can run at all, and are never exercised by static rendering.
 */
class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] { return []; }
}

globalThis.ResizeObserver ??= NoopObserver as never;
globalThis.IntersectionObserver ??= NoopObserver as never;
globalThis.MutationObserver ??= NoopObserver as never;

globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as never;
