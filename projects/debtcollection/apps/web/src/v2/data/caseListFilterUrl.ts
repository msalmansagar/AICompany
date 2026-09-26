import type { ReportingScope } from '@dcp/domain';
import type { OrganizationScope } from '../../shell/context.js';

/**
 * A filtered case list, in the URL.
 *
 * The shared router carries `#view/recordId/tab`. A filtered list is `#cases/filter/<pairs>`: the
 * literal `filter` in the record position, and the filters as `key=value` pairs in the tab position.
 * That keeps the router untouched, and keeps every filter an officer arrived with visible in the
 * address bar — deep-linkable, refresh-safe, and never held only in component state.
 *
 * A Phase 10 `ReportingScope` — what a dashboard row was counted in — maps onto these filters one
 * dimension at a time (`caseListFiltersFromScope`), so the population a report counted and the
 * population the list shows are the same `CaseQuery`, whichever door the officer came through.
 */
export const FILTER_SEGMENT = 'filter';

export type CaseListOrigin = 'portfolio' | 'dashboard';

export interface CaseListFilters {
  bucket?: string | undefined;
  /** A strategy id, or `'none'` for cases with no resolved strategy. */
  strategy?: string | undefined;
  /** The strategy's name, carried so the chip can say it without another read. */
  strategyLabel?: string | undefined;
  /** A case status label, as the status picker shows it. */
  status?: string | undefined;
  /** An owner's user id — the population a dashboard row counted for one owner. */
  owner?: string | undefined;
  /** The owner's display name, carried for the chip; never used to filter. */
  ownerLabel?: string | undefined;
  scope?: OrganizationScope | undefined;
  /** Where the officer came from, so the list can offer the way back. */
  from?: CaseListOrigin | undefined;
}

const KEYS = ['bucket', 'strategy', 'strategyLabel', 'status', 'owner', 'ownerLabel', 'scope', 'from'] as const;

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
    ...(params.get('status') ? { status: params.get('status')! } : {}),
    ...(params.get('owner') ? { owner: params.get('owner')! } : {}),
    ...(params.get('ownerLabel') ? { ownerLabel: params.get('ownerLabel')! } : {}),
    ...(scope === 'all' || scope === 'HL' || scope === 'BFD' ? { scope } : {}),
    ...(from === 'portfolio' || from === 'dashboard' ? { from } : {}),
  };
}

/** Whether anything in the URL narrows the list. `from` and the labels alone are context, not filters. */
export function hasCaseListFilters(filters: CaseListFilters): boolean {
  return Boolean(filters.bucket || filters.strategy || filters.status || filters.owner || filters.scope);
}

/**
 * The list filters a reporting scope becomes — the one mapping from a dashboard's population to the
 * Collection Cases list. Dimensions the list cannot narrow by (activity type, state, dates) have no
 * case meaning and are not carried; a case-grain report never sends them.
 */
export function caseListFiltersFromScope(scope: ReportingScope, from?: CaseListOrigin, labels: { strategyLabel?: string; ownerLabel?: string } = {}): CaseListFilters {
  return {
    ...(scope.bucket ? { bucket: scope.bucket } : {}),
    ...(scope.strategy ? { strategy: scope.strategy } : {}),
    ...(scope.strategy && labels.strategyLabel ? { strategyLabel: labels.strategyLabel } : {}),
    ...(scope.caseStatus ? { status: scope.caseStatus } : {}),
    ...(scope.owner ? { owner: scope.owner } : {}),
    ...(scope.owner && labels.ownerLabel ? { ownerLabel: labels.ownerLabel } : {}),
    ...(scope.sourceSystem ? { scope: scope.sourceSystem } : {}),
    ...(from ? { from } : {}),
  };
}

/** The reverse: what a filtered list would be as a reporting scope, for reconciling its count with a report. */
export function scopeFromCaseListFilters(filters: CaseListFilters): ReportingScope {
  return {
    ...(filters.scope && filters.scope !== 'all' ? { sourceSystem: filters.scope } : {}),
    ...(filters.bucket ? { bucket: filters.bucket as ReportingScope['bucket'] } : {}),
    ...(filters.strategy ? { strategy: filters.strategy } : {}),
    ...(filters.status ? { caseStatus: filters.status } : {}),
    ...(filters.owner ? { owner: filters.owner } : {}),
  };
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

/** The case last previewed in the Split view, so coming back lands on it. An id, never a name. */
const CASE_SELECTION_KEY = 'dcp.v2.cases.selected';

export function rememberSelectedCase(caseId: string | undefined): void {
  try {
    if (caseId) window.sessionStorage.setItem(CASE_SELECTION_KEY, caseId);
    else window.sessionStorage.removeItem(CASE_SELECTION_KEY);
  } catch {
    // Losing the selection costs a click, nothing more.
  }
}

export function recallSelectedCase(): string | undefined {
  try {
    return window.sessionStorage.getItem(CASE_SELECTION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
