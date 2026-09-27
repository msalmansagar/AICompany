import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { fingerprintQuery, type ContinuationToken, type Page } from '@dcp/domain';
import { toError } from '../platform/errors.js';

/**
 * Server-side paging for the browser: one hook, used by every large list in the workspace.
 *
 * It is written once and reused rather than re-implemented per screen, because the awkward parts are
 * the same everywhere and getting them wrong is invisible until production. Those parts are:
 *
 *   • **Nothing is fetched that is not asked for.** Every request is bounded by `pageSize` and the
 *     next page is only ever reached through the source's own opaque continuation. There is no mode
 *     in which this loads a population and pages it in memory.
 *   • **A late answer to an old question is discarded.** Every request carries a sequence number and
 *     only the newest may commit. A slow first page arriving after the user has changed the filter
 *     would otherwise overwrite the new results with the old ones — the classic stale-response bug,
 *     and the one most likely to be blamed on "the server" months later.
 *   • **Changing the question starts over.** When the filter, sort or search changes, the continuation
 *     is discarded, the rows are cleared and the first page is requested again. Keeping the old
 *     continuation would page into a population the user is no longer looking at; the Phase 4
 *     contract refuses that outright, and this never asks it to.
 *   • **A row is never shown twice.** Rows are keyed, and an id already on screen is dropped rather
 *     than appended, whatever the source repeats.
 *   • **A short page is not the end.** Only the absence of a continuation ends a list — the same rule
 *     the platform taught us in Phase 4.
 */

export type PagedStatus =
  | 'idle'
  | 'loadingFirst'
  | 'loadingMore'
  | 'loaded'
  | 'empty'
  | 'error';

export interface PagedQueryState<T> {
  status: PagedStatus;
  items: readonly T[];
  /** More rows exist. Derived from the source's continuation, never guessed from a page's length. */
  hasMore: boolean;
  /** No continuation and at least one page seen: the list is complete. */
  endOfResults: boolean;
  error?: Error;
  /** Pages committed for the current query. Reset whenever the query changes. */
  pagesLoaded: number;
  /** Total matching rows, when the source supplies one cheaply. Never inferred. */
  totalCount?: number;
}

type Action<T> =
  | { type: 'reset' }
  | { type: 'firstPageRequested' }
  | { type: 'nextPageRequested' }
  | { type: 'pageReceived'; page: Page<T>; rowKey: (item: T) => string }
  | { type: 'failed'; error: Error };

function reducer<T>(state: PagedQueryState<T>, action: Action<T>): PagedQueryState<T> {
  switch (action.type) {
    case 'reset':
      return { status: 'idle', items: [], hasMore: false, endOfResults: false, pagesLoaded: 0 };

    case 'firstPageRequested':
      // The rows go immediately. Showing the previous query's results under a new filter, even for a
      // moment, is how a user comes to believe a filter did not work.
      return { status: 'loadingFirst', items: [], hasMore: false, endOfResults: false, pagesLoaded: 0 };

    case 'nextPageRequested': {
      // A previous failure is cleared when a new attempt starts, so a stale message cannot sit
      // underneath a list that is loading again.
      const { error: _cleared, ...rest } = state;
      return { ...rest, status: 'loadingMore' };
    }

    case 'pageReceived': {
      const merged = appendWithoutDuplicates(state.items, action.page.items, action.rowKey);
      const pagesLoaded = state.pagesLoaded + 1;
      const hasMore = action.page.hasMore;
      return {
        status: merged.length === 0 && !hasMore ? 'empty' : 'loaded',
        items: merged,
        hasMore,
        endOfResults: !hasMore,
        pagesLoaded,
        ...(action.page.totalCount !== undefined ? { totalCount: action.page.totalCount } : {}),
      };
    }

    case 'failed':
      // The rows already on screen stay. A failed third page does not erase the first two.
      return { ...state, status: 'error', error: action.error };
  }
}

/** Appends only rows whose key is not already present, preserving order. */
export function appendWithoutDuplicates<T>(
  existing: readonly T[],
  incoming: readonly T[],
  rowKey: (item: T) => string,
): readonly T[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map(rowKey));
  const added: T[] = [];
  for (const item of incoming) {
    const key = rowKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(item);
  }
  return added.length === 0 ? existing : [...existing, ...added];
}

/** What the caller supplies. `query` is anything the source narrows by; it is fingerprinted, not inspected. */
export interface PagedQueryOptions<T, Q extends object> {
  /** Requests one bounded page. The only way rows enter this hook. */
  fetchPage: (request: Q & { pageSize: number; continuation?: ContinuationToken }) => Promise<Page<T>>;
  /** Filter, sort, search and any source-specific narrowing. A change here restarts paging. */
  query: Q;
  pageSize: number;
  /** Stable business identity of a row. **Never an array index.** */
  rowKey: (item: T) => string;
  /** Skip fetching entirely — used when a view has no context yet, such as no case selected. */
  enabled?: boolean;
}

export interface PagedQueryResult<T> extends PagedQueryState<T> {
  /** Ask for the next page. Safe to call repeatedly: overlapping calls are ignored. */
  loadMore: () => void;
  /** Retry after a failure, from wherever the list got to. */
  retry: () => void;
  /** Start again from the first page, keeping the same query. */
  refresh: () => void;
  /** True while any request is in flight. */
  isFetching: boolean;
}

const INITIAL: PagedQueryState<never> = {
  status: 'idle', items: [], hasMore: false, endOfResults: false, pagesLoaded: 0,
};

export function usePagedQuery<T, Q extends object>(
  options: PagedQueryOptions<T, Q>,
): PagedQueryResult<T> {
  const { fetchPage, query, pageSize, rowKey, enabled = true } = options;

  const [state, dispatch] = useReducer(
    reducer as React.Reducer<PagedQueryState<T>, Action<T>>,
    INITIAL as unknown as PagedQueryState<T>,
  );

  /** Identity of the question being asked. A new fingerprint is a new list. */
  const fingerprint = useMemo(() => fingerprintQuery(query), [query]);

  /** Only a response whose sequence matches may commit. Everything older is a stale answer. */
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const continuation = useRef<ContinuationToken | undefined>(undefined);
  const latestQuery = useRef(query);
  latestQuery.current = query;

  const request = useCallback(async (kind: 'first' | 'next') => {
    if (!enabled) return;
    // Overlapping-request protection. A user scrolling hard fires the threshold repeatedly; without
    // this each firing would start another identical page request.
    if (inFlight.current) return;

    const mySequence = ++sequence.current;
    inFlight.current = true;
    dispatch(kind === 'first' ? { type: 'firstPageRequested' } : { type: 'nextPageRequested' });

    try {
      const page = await fetchPage({
        ...latestQuery.current,
        pageSize,
        ...(kind === 'next' && continuation.current ? { continuation: continuation.current } : {}),
      });
      // Stale-response suppression. Between the request and this line the query may have changed, in
      // which case this answer belongs to a question nobody is asking any more.
      if (mySequence !== sequence.current) return;
      continuation.current = page.continuation;
      dispatch({ type: 'pageReceived', page, rowKey });
    } catch (error) {
      if (mySequence !== sequence.current) return;
      dispatch({ type: 'failed', error: toError(error) });
    } finally {
      if (mySequence === sequence.current) inFlight.current = false;
    }
  }, [enabled, fetchPage, pageSize, rowKey]);

  // A changed question invalidates everything: the continuation, the rows and any answer in flight.
  useEffect(() => {
    sequence.current++;          // orphans any in-flight response
    inFlight.current = false;
    continuation.current = undefined;
    dispatch({ type: 'reset' });
    if (enabled) void request('first');
    // `fingerprint` is the dependency on purpose: an object identity change that does not change the
    // question must not restart the list, and a changed question always must.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, enabled]);

  const loadMore = useCallback(() => {
    if (!state.hasMore || inFlight.current) return;
    void request('next');
  }, [request, state.hasMore]);

  const retry = useCallback(() => {
    inFlight.current = false;
    void request(continuation.current ? 'next' : 'first');
  }, [request]);

  const refresh = useCallback(() => {
    sequence.current++;
    inFlight.current = false;
    continuation.current = undefined;
    void request('first');
  }, [request]);

  return {
    ...state,
    loadMore,
    retry,
    refresh,
    isFetching: state.status === 'loadingFirst' || state.status === 'loadingMore',
  };
}
