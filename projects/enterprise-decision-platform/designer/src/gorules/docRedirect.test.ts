import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECISION_TABLE_DOCS_WEBRESOURCE,
  installDecisionTableDocRedirect,
  isDecisionTableDocUrl,
} from './docRedirect';

describe('isDecisionTableDocUrl', () => {
  it('matches the GoRules decision-tables documentation url', () => {
    expect(
      isDecisionTableDocUrl('https://gorules.io/docs/user-manual/decision-modeling/decisions/decision-tables'),
    ).toBe(true);
  });

  it('does not match other GoRules node documentation urls', () => {
    expect(isDecisionTableDocUrl('https://gorules.io/docs/user-manual/decision-modeling/decisions/switch')).toBe(false);
  });

  it('does not match unrelated urls', () => {
    expect(isDecisionTableDocUrl('/WebResources/qdb_something')).toBe(false);
  });
});

describe('installDecisionTableDocRedirect', () => {
  // The designer runs in the browser; this util is the only browser-only unit and the
  // project ships no DOM test env, so shim a minimal `window` global for these cases.
  const host = globalThis as unknown as { window?: { open: typeof window.open } };
  let openSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openSpy = vi.fn();
    host.window = { open: openSpy as unknown as typeof window.open };
  });

  afterEach(() => {
    delete host.window;
  });

  it('redirects the decision-table docs link to our web resource', () => {
    const dispose = installDecisionTableDocRedirect();
    window.open('https://gorules.io/docs/user-manual/decision-modeling/decisions/decision-tables', '_href');
    dispose();

    expect(openSpy).toHaveBeenCalledWith(DECISION_TABLE_DOCS_WEBRESOURCE, '_blank', 'noopener');
  });

  it('passes unrelated window.open calls through unchanged', () => {
    const dispose = installDecisionTableDocRedirect();
    window.open('https://example.com/report', '_blank');
    dispose();

    expect(openSpy).toHaveBeenCalledWith('https://example.com/report', '_blank', undefined);
  });

  it('restores the original window.open when disposed', () => {
    const dispose = installDecisionTableDocRedirect();
    dispose();

    expect(window.open).toBe(openSpy);
  });
});
