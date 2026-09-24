import type { OrganizationScope } from '../../shell/context.js';

/**
 * A filtered case list, in the URL.
 *
 * The shared router carries `#view/recordId/tab`. A filtered list is `#cases/filter/<pairs>`: the
 * literal `filter` in the record position, and the filters as `key=value` pairs in the tab position.
 * That keeps the router untouched, and keeps every filter an officer arrived with visible in the
 * address bar — deep-linkable, refresh-safe, and never held only in component state.
 */
export const FILTER_SEGMENT = 'filter';

export interface CaseListFilters {
  bucket?: string | undefined;
  /** A strategy id, or `'none'` for cases with no resolved strategy. */
  strategy?: string | undefined;
  /** The strategy's name, carried so the chip can say it without another read. */
  strategyLabel?: string | undefined;
  scope?: OrganizationScope | undefined;
  /** Where the officer came from, so the list can offer the way back. */
  from?: 'portfolio' | undefined;
}

const KEYS = ['bucket', 'strategy', 'strategyLabel', 'scope', 'from'] as const;

export function encodeCaseListFilters(filters: CaseListFilters): string {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function decodeCaseListFilters(encoded: string | undefined): CaseListFilters {
  if (!encoded) return {};
  const params = new URLSearchParams(encoded);
  const scope = params.get('scope');
  const from = params.get('from');
  return {
    ...(params.get('bucket') ? { bucket: params.get('bucket')! } : {}),
    ...(params.get('strategy') ? { strategy: params.get('strategy')! } : {}),
    ...(params.get('strategyLabel') ? { strategyLabel: params.get('strategyLabel')! } : {}),
    ...(scope === 'all' || scope === 'HL' || scope === 'BFD' ? { scope } : {}),
    ...(from === 'portfolio' ? { from } : {}),
  };
}

/** Whether anything in the URL narrows the list. `from` alone is context, not a filter. */
export function hasCaseListFilters(filters: CaseListFilters): boolean {
  return Boolean(filters.bucket || filters.strategy || filters.scope);
}

/**
 * The filtered list a case was opened from.
 *
 * A case's own URL has no room for the list's filters, so "← Cases" would otherwise land on the
 * unfiltered list and the officer would lose the cell they drilled into. The list records its
 * filters when a row opens; the case reads them back. Session-scoped, so a new tab starts clean.
 */
const CASE_LIST_RETURN_KEY = 'dcp.v2.cases.return';

export function rememberCaseListReturn(encodedFilters: string | undefined): void {
  try {
    if (encodedFilters) window.sessionStorage.setItem(CASE_LIST_RETURN_KEY, encodedFilters);
    else window.sessionStorage.removeItem(CASE_LIST_RETURN_KEY);
  } catch {
    // A profile that blocks storage loses the way back, not the case.
  }
}

export function recallCaseListReturn(): string | undefined {
  try {
    return window.sessionStorage.getItem(CASE_LIST_RETURN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
