import { useCallback, useRef, useState } from 'react';
import type { LookupResult } from '@dfe/shared';
import { lookupApi } from '../api/lookupApi';

const DEFAULT_DEBOUNCE_MS = 300;

export interface UseLookupSearchOptions {
  entityName: string;
  displayAttribute: string;
  valueAttribute?: string;
  maxResults?: number;
  filterExpression?: string;
  debounceMs?: number;
}

export interface UseLookupSearchResult {
  results: LookupResult[];
  isSearching: boolean;
  searchError: string | null;
  search: (query: string) => void;
  loadInitial: () => void;
  clearResults: () => void;
}

export function useLookupSearch({
  entityName,
  displayAttribute,
  valueAttribute,
  maxResults = 10,
  filterExpression,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseLookupSearchOptions): UseLookupSearchResult {
  const [results, setResults] = useState<LookupResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const fetchResults = useCallback(
    async (query?: string): Promise<void> => {
      abortController.current?.abort();
      abortController.current = new AbortController();

      setIsSearching(true);
      setSearchError(null);

      try {
        const response = await lookupApi.search(entityName, {
          search: query,
          displayAttribute,
          valueAttribute,
          max: maxResults,
          filter: filterExpression,
        }, abortController.current.signal);
        const data = (response as unknown as { data: LookupResult[] }).data;
        setResults(data ?? []);
      } catch (error) {
        if ((error as { name?: string }).name === 'CanceledError') return;
        setSearchError(error instanceof Error ? error.message : 'Search failed');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [entityName, displayAttribute, valueAttribute, maxResults, filterExpression],
  );

  const search = useCallback(
    (query: string) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      if (!query.trim()) {
        setResults([]);
        return;
      }

      debounceTimer.current = setTimeout(() => void fetchResults(query), debounceMs);
    },
    [fetchResults, debounceMs],
  );

  const loadInitial = useCallback(() => {
    void fetchResults(undefined);
  }, [fetchResults]);

  const clearResults = useCallback(() => {
    setResults([]);
    setSearchError(null);
  }, []);

  return { results, isSearching, searchError, search, loadInitial, clearResults };
}
