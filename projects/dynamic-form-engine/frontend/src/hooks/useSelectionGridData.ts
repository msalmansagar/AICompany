// Lazily loads Selection Grid records on tab activation using FetchXML cursor paging.
// Each page response carries a nextPageCookie (opaque base64 cursor). The hook stores
// cookies per page so forward and backward navigation both work without re-scanning.
// Search text and sort params are forwarded to the backend on every page request.
// Any change to dependsOnValue, searchText, or sort clears the cookie map and resets to page 1.

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
  totalCount: number | undefined;
  totalPages: number | undefined;
  error: string | null;
  loadPage: (page: number) => void;
  activate: () => void;
  retry: () => void;
}

export function useSelectionGridData(
  fieldId: string,
  defaultPageSize = 50,
  dependsOnValue?: string,
  searchText?: string,
  sortBy?: string,
  sortDirection?: 'asc' | 'desc',
  columnFilters?: Record<string, string>,
): SelectionGridDataState {
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [records, setRecords] = useState<GridRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(defaultPageSize);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isCapped, setIsCapped] = useState(false);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const cookieMapRef = useRef<Map<number, string>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadPage = useCallback(
    async (requestedPage: number) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

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
          searchText,
          sortBy,
          sortDirection,
          columnFilters,
        });

        if (controller.signal.aborted) return;

        if (result.nextPageCookie) {
          cookieMapRef.current.set(requestedPage, result.nextPageCookie);
        }

        setRecords(result.records);
        setPage(result.page);
        setHasNextPage(result.hasNextPage);
        setIsCapped(result.isCapped);
        setTotalCount(result.totalCount);
        setTotalPages(result.totalPages);
        setStatus('loaded');
        hasLoadedRef.current = true;
        isLoadingRef.current = false;
      } catch (fetchError) {
        if (controller.signal.aborted) {
          // A newer loadPage call has already set isLoadingRef = true — don't clobber it.
          return;
        }
        isLoadingRef.current = false;
        setStatus('error');
        setError(
          fetchError instanceof Error ? fetchError.message : 'Failed to load records',
        );
      }
    },
    [fieldId, pageSize, dependsOnValue, searchText, sortBy, sortDirection, columnFilters],
  );

  const loadPageRef = useRef(loadPage);
  useEffect(() => { loadPageRef.current = loadPage; });

  const activate = useCallback(() => {
    if (hasLoadedRef.current || isLoadingRef.current) return;
    void loadPageRef.current(1);
  }, []);

  const retry = useCallback(() => {
    hasLoadedRef.current = false;
    void loadPageRef.current(page);
  }, [page]);

  // When any filter param changes: clear the cookie cache, reset loaded flag, and
  // re-fetch page 1. Uses a combined key so a single effect handles all filter types.
  const columnFiltersKey = columnFilters ? JSON.stringify(columnFilters) : '';
  const filterKey = [dependsOnValue ?? '', searchText ?? '', sortBy ?? '', sortDirection ?? '', columnFiltersKey].join('\0');
  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (prevFilterKeyRef.current === filterKey) return;
    prevFilterKeyRef.current = filterKey;
    cookieMapRef.current.clear();
    hasLoadedRef.current = false;
    void loadPageRef.current(1);
  // loadPageRef is a ref — intentionally excluded from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  return {
    status,
    records,
    page,
    pageSize,
    hasNextPage,
    isCapped,
    totalCount,
    totalPages,
    error,
    loadPage: (p: number) => { void loadPage(p); },
    activate,
    retry,
  };
}
