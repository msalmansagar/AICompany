import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECISION_TABLE_DOCS_WEBRESOURCE_NAME,
  DECISION_TABLE_DOCS_WEBRESOURCE_PATH,
  installDecisionTableDocRedirect,
  isDecisionTableDocUrl,
} from './docRedirect';

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
  type NavigateSpy = ReturnType<typeof vi.fn>;
  const host = globalThis as unknown as {
    window?: { open: typeof window.open; Xrm?: { Navigation: { navigateTo: NavigateSpy } } };
  };
  let openSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openSpy = vi.fn();
    host.window = { open: openSpy as unknown as typeof window.open };
  });

  afterEach(() => {
    delete host.window;
  });

  it('opens the guide as a right-docked side pane via Xrm when Xrm is present', () => {
    const navigateTo = vi.fn(() => Promise.resolve());
    host.window!.Xrm = { Navigation: { navigateTo } };

    const dispose = installDecisionTableDocRedirect();
    window.open(DECISION_TABLE_DOC_URL, '_href');
    dispose();

    expect(navigateTo).toHaveBeenCalledWith(
      { pageType: 'webresource', webresourceName: DECISION_TABLE_DOCS_WEBRESOURCE_NAME },
      expect.objectContaining({ target: 2, position: 2 }),
    );
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('falls back to the web-resource path when Xrm is not in scope (local dev)', () => {
    const dispose = installDecisionTableDocRedirect();
    window.open(DECISION_TABLE_DOC_URL, '_href');
    dispose();

    expect(openSpy).toHaveBeenCalledWith(DECISION_TABLE_DOCS_WEBRESOURCE_PATH, '_blank', 'noopener');
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
