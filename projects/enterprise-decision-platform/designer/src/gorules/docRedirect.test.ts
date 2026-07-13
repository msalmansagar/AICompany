import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECISION_GRAPH_GUIDE,
  DECISION_TABLE_GUIDE,
  EXPRESSION_GUIDE,
  installGoRulesDocRedirect,
  resolveGuideForDocUrl,
} from './docRedirect';

const BASE = 'https://gorules.io/docs/user-manual/decision-modeling/decisions';
const DECISION_TABLE_DOC_URL = `${BASE}/decision-tables`;
const DECISION_GRAPH_DOC_URL = BASE; // Request + Response nodes share the parent page

describe('resolveGuideForDocUrl', () => {
  it('maps the decision-table page to the decision-table guide', () => {
    expect(resolveGuideForDocUrl(DECISION_TABLE_DOC_URL)).toBe(DECISION_TABLE_GUIDE);
  });

  it('maps the Request/Response (decisions) page to the decision-graph guide', () => {
    expect(resolveGuideForDocUrl(DECISION_GRAPH_DOC_URL)).toBe(DECISION_GRAPH_GUIDE);
    expect(resolveGuideForDocUrl(`${BASE}/`)).toBe(DECISION_GRAPH_GUIDE);
  });

  it('maps the expression page to the expression guide', () => {
    expect(resolveGuideForDocUrl(`${BASE}/expression`)).toBe(EXPRESSION_GUIDE);
  });

  it('leaves other GoRules node pages unmapped', () => {
    expect(resolveGuideForDocUrl(`${BASE}/switch`)).toBeNull();
    expect(resolveGuideForDocUrl(`${BASE}/functions`)).toBeNull();
  });

  it('leaves non-GoRules urls unmapped', () => {
    expect(resolveGuideForDocUrl('/WebResources/qdb_something')).toBeNull();
  });
});

describe('installGoRulesDocRedirect', () => {
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

  it('opens the decision-table guide for the decision-table link, without navigating', () => {
    const onGuide = vi.fn();
    const dispose = installGoRulesDocRedirect(onGuide);
    window.open(DECISION_TABLE_DOC_URL, '_href');
    dispose();

    expect(onGuide).toHaveBeenCalledWith(DECISION_TABLE_GUIDE);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('opens the decision-graph guide for the Request/Response link', () => {
    const onGuide = vi.fn();
    const dispose = installGoRulesDocRedirect(onGuide);
    window.open(DECISION_GRAPH_DOC_URL, '_href');
    dispose();

    expect(onGuide).toHaveBeenCalledWith(DECISION_GRAPH_GUIDE);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('passes unrelated window.open calls through unchanged', () => {
    const onGuide = vi.fn();
    const dispose = installGoRulesDocRedirect(onGuide);
    window.open('https://example.com/report', '_blank');
    dispose();

    expect(onGuide).not.toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith('https://example.com/report', '_blank', undefined);
  });

  it('restores the original window.open when disposed', () => {
    const dispose = installGoRulesDocRedirect(vi.fn());
    dispose();

    expect(window.open).toBe(openSpy);
  });
});
