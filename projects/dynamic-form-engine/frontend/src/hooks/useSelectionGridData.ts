// Lazily loads Selection Grid records on tab activation.
// Data is cached in component state — no re-fetch on revisit within the same session.
// ADR-ADD-003: lazy loading on tab activation.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GridRecord, GridRecordPage } from '@qdb/shared';
import { fetchGridPage } from '../services/gridDataService';

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface SelectionGridDataState {
  status: LoadStatus;
  records: GridRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(defaultPageSize);
  const [totalPages, setTotalPages] = useState(0);
  const [isCapped, setIsCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracks whether any load has completed — prevents re-fetching on tab re-activation.
  const hasLoadedRef = useRef(false);
  // AbortController for in-flight requests (ADR-ADD-003: cancel stale requests).
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadPage = useCallback(
    async (requestedPage: number) => {
      // Cancel any in-flight request before starting a new one.
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus('loading');
      setError(null);

      try {
        const result: GridRecordPage = await fetchGridPage({
          fieldId,
          page: requestedPage,
          pageSize,
          signal: controller.signal,
          dependsOnValue,
        });

        if (controller.signal.aborted) return;

        setRecords(result.records);
        setTotalCount(result.totalCount);
        setPage(result.page);
        setTotalPages(result.totalPages);
        setIsCapped(result.isCapped);
        setStatus('loaded');
        hasLoadedRef.current = true;
      } catch (fetchError) {
        if (controller.signal.aborted) return;

        setStatus('error');
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Failed to load records',
        );
      }
    },
    [fieldId, pageSize, dependsOnValue],
  );

  // Called when the tab containing this grid becomes active.
  // If data has already loaded in this session, does nothing.
  const activate = useCallback(() => {
    if (hasLoadedRef.current || status === 'loading') return;
    void loadPage(1);
  }, [loadPage, status]);

  const retry = useCallback(() => {
    hasLoadedRef.current = false;
    void loadPage(page);
  }, [loadPage, page]);

  // When the depended-on field value changes, reset and re-fetch from page 1.
  const prevDependsOnRef = useRef(dependsOnValue);
  useEffect(() => {
    if (prevDependsOnRef.current === dependsOnValue) return;
    prevDependsOnRef.current = dependsOnValue;
    hasLoadedRef.current = false;
    void loadPage(1);
  }, [dependsOnValue, loadPage]);

  return {
    status,
    records,
    totalCount,
    page,
    pageSize,
    totalPages,
    isCapped,
    error,
    loadPage: (p: number) => { void loadPage(p); },
    activate,
    retry,
  };
}
