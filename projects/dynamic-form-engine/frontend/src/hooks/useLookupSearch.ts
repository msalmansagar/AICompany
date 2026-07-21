import { useCallback, useRef, useState } from 'react';
import type { LookupResult } from '@qdb/shared';
import { lookupApi } from '../api/lookupApi';

const DEFAULT_DEBOUNCE_MS = 300;

// DFE-APILOOKUP-001 — when present, the lookup resolves options from an external API
// (via the backend proxy) instead of a CRM entity.
export interface ApiLookupSource {
  endpointKey: string;
  valuePath: string;
  labelPath: string;
  searchParamName?: string;
  searchMode?: 'typeahead' | 'fetchAll';
  formCode?: string;
}

export interface UseLookupSearchOptions {
  entityName: string;
  displayAttribute: string;
  valueAttribute?: string;
  maxResults?: number;
  filterExpression?: string;
  debounceMs?: number;
  apiSource?: ApiLookupSource;
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
  apiSource,
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
        const response = apiSource
          ? await lookupApi.searchApi({
              endpointKey: apiSource.endpointKey,
              search: query,
              valuePath: apiSource.valuePath,
              labelPath: apiSource.labelPath,
              searchParam: apiSource.searchParamName,
              searchMode: apiSource.searchMode,
              formCode: apiSource.formCode,
              max: maxResults,
            }, abortController.current.signal)
          : await lookupApi.search(entityName, {
              search: query,
              displayAttribute,
              valueAttribute,
              max: maxResults,
              filter: filterExpression,
            }, abortController.current.signal);
        const envelope = response as unknown as { data: LookupResult[]; meta?: { warning?: string } };
        // FR-026: a proxy degradation (timeout/upstream error) returns empty data +
        // a warning. Surface a generic inline message — never the upstream detail.
        if (apiSource && envelope.meta?.warning && (envelope.data?.length ?? 0) === 0) {
          setSearchError('Unable to load options');
        }
        setResults(envelope.data ?? []);
      } catch (error) {
        if ((error as { name?: string }).name === 'CanceledError') return;
        setSearchError(apiSource ? 'Unable to load options' : (error instanceof Error ? error.message : 'Search failed'));
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [entityName, displayAttribute, valueAttribute, maxResults, filterExpression, apiSource],
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
