import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDecisionTableDocRedirect, isDecisionTableDocUrl } from './docRedirect';

const DECISION_TABLE_DOC_URL =
  'https://gorules.io/docs/user-manual/decision-modeling/decisions/decision-tables';

describe('isDecisionTableDocUrl', () => {
  it('matches the GoRules decision-tables documentation url', () => {
    expect(isDecisionTableDocUrl(DECISION_TABLE_DOC_URL)).toBe(true);
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

  it('invokes the guide callback for the decision-table docs link, without navigating', () => {
    const onDocs = vi.fn();
    const dispose = installDecisionTableDocRedirect(onDocs);
    window.open(DECISION_TABLE_DOC_URL, '_href');
    dispose();

    expect(onDocs).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('passes unrelated window.open calls through unchanged', () => {
    const onDocs = vi.fn();
    const dispose = installDecisionTableDocRedirect(onDocs);
    window.open('https://example.com/report', '_blank');
    dispose();

    expect(onDocs).not.toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith('https://example.com/report', '_blank', undefined);
  });

  it('restores the original window.open when disposed', () => {
    const dispose = installDecisionTableDocRedirect(vi.fn());
    dispose();

    expect(window.open).toBe(openSpy);
  });
});
