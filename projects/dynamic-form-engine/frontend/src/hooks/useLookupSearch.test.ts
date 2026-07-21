import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLookupSearch } from './useLookupSearch';
import * as lookupApiModule from '../api/lookupApi';

vi.mock('../api/lookupApi');

const mockLookupApiSearch = vi.spyOn(lookupApiModule.lookupApi, 'search');
const mockLookupApiSearchApi = vi.spyOn(lookupApiModule.lookupApi, 'searchApi');

const DEFAULT_OPTIONS = { entityName: 'account', displayAttribute: 'name' };
const API_SOURCE = { endpointKey: 'hr', valuePath: 'id', labelPath: 'name' };

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

  // DFE-APILOOKUP-001

  it('usesApiProxy_andNotEntityRoute_whenApiSourceSet', async () => {
    mockLookupApiSearchApi.mockResolvedValueOnce({
      data: [{ id: '1', displayName: 'Alice', entityLogicalName: 'hr' }],
    } as never);

    const { result } = renderHook(() =>
      useLookupSearch({ ...DEFAULT_OPTIONS, apiSource: API_SOURCE, debounceMs: 300 }),
    );

    act(() => {
      result.current.search('ali');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockLookupApiSearchApi).toHaveBeenCalledWith(
      expect.objectContaining({ endpointKey: 'hr', search: 'ali', valuePath: 'id', labelPath: 'name' }),
      expect.any(AbortSignal),
    );
    expect(mockLookupApiSearch).not.toHaveBeenCalled();
  });

  it('setsInlineError_whenApiProxyWarnsWithEmptyData', async () => {
    mockLookupApiSearchApi.mockResolvedValueOnce({ data: [], meta: { warning: 'timeout' } } as never);

    const { result } = renderHook(() =>
      useLookupSearch({ ...DEFAULT_OPTIONS, apiSource: API_SOURCE, debounceMs: 300 }),
    );

    act(() => {
      result.current.search('ali');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.searchError).toBe('Unable to load options');
    expect(result.current.results).toEqual([]);
  });
});
