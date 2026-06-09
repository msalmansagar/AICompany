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

  // Synchronous flags — readable without a re-render cycle.
  // These avoid the stale-closure problem where async state changes haven't
  // propagated yet when guards in callbacks are evaluated.
  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  // cookieMap: maps page N → cookie that fetches page N+1.
  const cookieMapRef = useRef<Map<number, string>>(new Map());
  // AbortController for in-flight requests.
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadPage = useCallback(
    async (requestedPage: number) => {
      // Cancel any in-flight request.
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Mark loading synchronously so guards elsewhere see it immediately.
      isLoadingRef.current = true;
      setStatus('loading');
      setError(null);

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

        if (result.nextPageCookie) {
          cookieMapRef.current.set(requestedPage, result.nextPageCookie);
        }

        setRecords(result.records);
        setPage(result.page);
        setHasNextPage(result.hasNextPage);
        setIsCapped(result.isCapped);
        setStatus('loaded');
        hasLoadedRef.current = true;
        isLoadingRef.current = false;
      } catch (fetchError) {
        if (controller.signal.aborted) {
          // The abort itself doesn't mean failure — another call took over.
          isLoadingRef.current = false;
          return;
        }
        isLoadingRef.current = false;
        setStatus('error');
        setError(
          fetchError instanceof Error ? fetchError.message : 'Failed to load records',
        );
      }
    },
    [fieldId, pageSize, dependsOnValue],
  );

  // Keep a ref to the latest loadPage so activate() is always stable.
  const loadPageRef = useRef(loadPage);
  useEffect(() => { loadPageRef.current = loadPage; });

  // activate: called when the containing tab becomes active.
  // Stable reference — does not change on re-renders, preventing the
  // double-load race when dependsOnValue triggers a re-create of loadPage.
  const activate = useCallback(() => {
    if (hasLoadedRef.current || isLoadingRef.current) return;
    void loadPageRef.current(1);
  }, []); // intentionally no deps — uses refs exclusively

  const retry = useCallback(() => {
    hasLoadedRef.current = false;
    void loadPageRef.current(page);
  }, [page]);

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
