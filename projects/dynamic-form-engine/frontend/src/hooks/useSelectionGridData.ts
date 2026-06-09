// Lazily loads Selection Grid records on tab activation using FetchXML cursor paging.
// Each page response carries a nextPageCookie (opaque base64 cursor). The hook stores
// cookies per page so forward and backward navigation both work without re-scanning.
// ADR-ADD-003: lazy loading on tab activation.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GridRecord, GridRecordPage } from '@qdb/shared';
import { fetchGridPage } from '../services/gridDataService';

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface SelectionGridDataState {
  status: LoadStatus;
  records: GridRecord[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  isCapped: boolean;
  error: string | null;
  loadPage: (page: number) => void;
  activate: () => void;
  retry: () => void;
}

export function useSelectionGridData(
  fieldId: string,
  defaultPageSize = 50,
  dependsOnValue?: string,
): SelectionGridDataState {
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [records, setRecords] = useState<GridRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(defaultPageSize);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isCapped, setIsCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // cookieMap: maps page number N → the cookie that fetches page N+1.
  // Populated as pages are visited so backward navigation re-uses cached cursors.
  const cookieMapRef = useRef<Map<number, string>>(new Map());

  // Tracks whether any load has completed — prevents re-fetching on tab re-activation.
  const hasLoadedRef = useRef(false);
  // AbortController for in-flight requests (ADR-ADD-003: cancel stale requests).
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadPage = useCallback(
    async (requestedPage: number) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus('loading');
      setError(null);

      // Retrieve the paging cookie for this page: page 1 needs no cookie,
      // page N needs the cookie stored from the page N-1 response.
      const pagingCookie = requestedPage > 1
        ? cookieMapRef.current.get(requestedPage - 1)
        : undefined;

      try {
        const result: GridRecordPage = await fetchGridPage({
          fieldId,
          page: requestedPage,
          pageSize,
          signal: controller.signal,
          dependsOnValue,
          pagingCookie,
        });

        if (controller.signal.aborted) return;

        // Store the cookie so the next page can be fetched efficiently.
        if (result.nextPageCookie) {
          cookieMapRef.current.set(requestedPage, result.nextPageCookie);
        }

        setRecords(result.records);
        setPage(result.page);
        setHasNextPage(result.hasNextPage);
        setIsCapped(result.isCapped);
        setStatus('loaded');
        hasLoadedRef.current = true;
      } catch (fetchError) {
        if (controller.signal.aborted) return;

        setStatus('error');
        setError(
          fetchError instanceof Error ? fetchError.message : 'Failed to load records',
        );
      }
    },
    [fieldId, pageSize, dependsOnValue],
  );

  // Called when the tab containing this grid becomes active.
  const activate = useCallback(() => {
    if (hasLoadedRef.current || status === 'loading') return;
    void loadPage(1);
  }, [loadPage, status]);

  const retry = useCallback(() => {
    hasLoadedRef.current = false;
    void loadPage(page);
  }, [loadPage, page]);

  // When the depended-on field value changes: clear cookie cache, reset, re-fetch page 1.
  const prevDependsOnRef = useRef(dependsOnValue);
  useEffect(() => {
    if (prevDependsOnRef.current === dependsOnValue) return;
    prevDependsOnRef.current = dependsOnValue;
    cookieMapRef.current.clear();
    hasLoadedRef.current = false;
    void loadPage(1);
  }, [dependsOnValue, loadPage]);

  return {
    status,
    records,
    page,
    pageSize,
    hasNextPage,
    isCapped,
    error,
    loadPage: (p: number) => { void loadPage(p); },
    activate,
    retry,
  };
}
