import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLookupSearch } from './useLookupSearch';
import * as lookupApiModule from '../api/lookupApi';

vi.mock('../api/lookupApi');

const mockLookupApiSearch = vi.spyOn(lookupApiModule.lookupApi, 'search');

const DEFAULT_OPTIONS = { entityName: 'account', displayAttribute: 'name' };

describe('useLookupSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initialState_hasEmptyResultsAndNotSearching', () => {
    const { result } = renderHook(() => useLookupSearch(DEFAULT_OPTIONS));

    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.searchError).toBeNull();
  });

  it('search_doesNotFireApi_whenQueryIsEmpty', async () => {
    const { result } = renderHook(() => useLookupSearch(DEFAULT_OPTIONS));

    act(() => {
      result.current.search('');
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(mockLookupApiSearch).not.toHaveBeenCalled();
  });

  it('search_firesApi_afterDebounceDelay', async () => {
    mockLookupApiSearch.mockResolvedValueOnce({
      data: [{ id: '1', displayName: 'Acme Corp', entityLogicalName: 'account' }],
    } as never);

    const { result } = renderHook(() =>
      useLookupSearch({ ...DEFAULT_OPTIONS, debounceMs: 300 }),
    );

    act(() => {
      result.current.search('acme');
    });

    expect(mockLookupApiSearch).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockLookupApiSearch).toHaveBeenCalledWith('account', expect.objectContaining({ search: 'acme' }), expect.any(AbortSignal));
  });

  it('clearResults_emptiesResultsArray', () => {
    const { result } = renderHook(() => useLookupSearch(DEFAULT_OPTIONS));

    act(() => {
      result.current.clearResults();
    });

    expect(result.current.results).toEqual([]);
  });
});
