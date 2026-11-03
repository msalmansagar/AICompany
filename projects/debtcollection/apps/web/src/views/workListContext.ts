import { useCallback, useRef, useState } from 'react';
import { describeBucket, type OperationalBucket, type WorkItem } from '@dcp/domain';
import type { ActivityRow } from '../data/caseQueries.js';
import type { CaseRow } from '../data/collectionQueries.js';
import type { LoadedRows } from '../data/DataGrid.js';
import { MAX_ITEMS, takeRestoredState, type FollowUpWindowName, type WorkContext, type WorkItemRef } from '../data/workContext.js';

/**
 * How each ordered list hands itself to the case it opens (WP5): My Day follow-ups, Work Queues and
 * Collection Cases (which is also where a search lands). Shared by V1 and V2, so both carry the same
 * context and the case behaves the same whichever list opened it.
 *
 * Only rows the list already loaded travel, in the list's own order, up to `MAX_ITEMS`; the item
 * opened is found by its own id, so the position is the row the officer chose, not a guess.
 */

/** Keeps the rows a grid last reported, for the moment a row is opened. Never causes a render. */
export function useLoadedRows<T>(): { current: () => LoadedRows<T>; onRows: (rows: LoadedRows<T>) => void } {
  const rows = useRef<LoadedRows<T>>({ items: [], hasMore: false });
  const onRows = useCallback((next: LoadedRows<T>) => { rows.current = next; }, []);
  const current = useCallback(() => rows.current, []);
  return { current, onRows };
}

export const FOLLOW_UPS_ORIGIN = 'myday-followups';
export const QUEUE_ORIGIN = 'queues';
export const CASES_ORIGIN = 'cases';

/** Back from a case opened from My Day puts the follow-up window back as it was; otherwise Overdue. */
export function restoredWindow(): FollowUpWindowName {
  const restored = takeRestoredState(FOLLOW_UPS_ORIGIN)?.['window'];
  return restored === 'upcoming' || restored === 'all' ? restored : 'overdue';
}

/** A list's saved choices (search, sort, bucket), taken once when the list mounts after Back. */
export function useRestoredListState(originKey: string): Readonly<Record<string, string>> {
  const [state] = useState(() => takeRestoredState(originKey) ?? {});
  return state;
}

const WINDOW_LABELS: Readonly<Record<FollowUpWindowName, string>> = {
  overdue: 'Overdue follow-ups', upcoming: 'Upcoming follow-ups', all: 'All follow-ups',
};

export function followUpContext(rows: LoadedRows<ActivityRow>, opened: ActivityRow, window: FollowUpWindowName): WorkContext {
  const items = rows.items.filter(row => row.caseId).slice(0, MAX_ITEMS).map(row => ({
    caseId: row.caseId!, activityId: row.id, label: `${row.caseNumber ?? 'Case'} · ${row.subject}`,
  }));
  return contextOf({
    items, openedKey: opened.id, keyOf: item => item.activityId,
    originLabel: WINDOW_LABELS[window], returnHash: '#myday', originKey: FOLLOW_UPS_ORIGIN,
    eligibility: { kind: 'followUps', window }, rows, listState: { window },
  });
}

export function queueContext(rows: LoadedRows<WorkItem>, opened: WorkItem, scope: { bucket: OperationalBucket; currentUserId?: string; returnHash: string; search: string }): WorkContext {
  const items = rows.items.slice(0, MAX_ITEMS).map(item => ({ caseId: item.caseId, activityId: item.id, label: `${item.caseNumber ?? 'Case'} · ${item.title}` }));
  return contextOf({
    items, openedKey: opened.id, keyOf: item => item.activityId,
    originLabel: `Work Queue · ${describeBucket(scope.bucket)}`, returnHash: scope.returnHash, originKey: QUEUE_ORIGIN,
    eligibility: { kind: 'queue', bucket: scope.bucket, ...(scope.currentUserId ? { currentUserId: scope.currentUserId } : {}) },
    rows, listState: { bucket: scope.bucket, search: scope.search },
  });
}

/** The Cases list; with a search term it reads as the search the officer ran. */
export function casesContext(rows: LoadedRows<CaseRow>, opened: CaseRow, scope: { search: string; returnHash: string; listState: Readonly<Record<string, string>> }): WorkContext {
  const items = rows.items.slice(0, MAX_ITEMS).map(row => ({ caseId: row.id, label: `${row.caseNumber} · ${row.customerName ?? row.customerBusinessId}` }));
  return contextOf({
    items, openedKey: opened.id, keyOf: item => item.caseId,
    originLabel: scope.search ? `Search “${scope.search}”` : 'Collection Cases', returnHash: scope.returnHash, originKey: CASES_ORIGIN,
    eligibility: { kind: 'cases' }, rows, listState: scope.listState,
  });
}

function contextOf(parts: {
  items: readonly WorkItemRef[]; openedKey: string; keyOf: (item: WorkItemRef) => string | undefined;
  rows: LoadedRows<unknown>; listState: Readonly<Record<string, string>>;
} & Pick<WorkContext, 'originLabel' | 'returnHash' | 'originKey' | 'eligibility'>): WorkContext {
  const { items, openedKey, keyOf, rows, ...rest } = parts;
  const index = items.findIndex(item => keyOf(item) === openedKey);
  // The opened row is always one the list loaded; if it ever is not (beyond MAX_ITEMS), the case
  // gets no Previous/Next rather than a position that names a different item.
  if (index < 0) return { ...rest, items: [], index: 0, hasMore: rows.hasMore };
  return { ...rest, items, index, hasMore: rows.hasMore, ...(rows.totalCount !== undefined ? { totalCount: rows.totalCount } : {}) };
}
