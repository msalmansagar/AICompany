import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSelectionGridData } from './useSelectionGridData';
import type { GridRecordPage } from '@qdb/shared';

// ── Shared mock data ──────────────────────────────────────────────────────────

const PAGE_1_RESPONSE: GridRecordPage = {
  records: [
    { id: 'record-1', values: { name: 'Alice' } },
    { id: 'record-2', values: { name: 'Bob' } },
  ],
  totalCount: 4,
  totalPages: 2,
  page: 1,
  pageSize: 2,
  hasNextPage: true,
  isCapped: false,
};

const PAGE_2_RESPONSE: GridRecordPage = {
  records: [
    { id: 'record-3', values: { name: 'Carol' } },
    { id: 'record-4', values: { name: 'Dave' } },
  ],
  totalCount: 4,
  totalPages: 2,
  page: 2,
  pageSize: 2,
  hasNextPage: false,
  isCapped: false,
};

// ── Module mock ───────────────────────────────────────────────────────────────

const mockFetchGridPage = vi.fn();

vi.mock('../services/gridDataService', () => ({
  fetchGridPage: (...args: unknown[]) => mockFetchGridPage(...args),
}));

const FIELD_ID = 'field-abc-123';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSelectionGridData', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  // ── Lazy loading ──────────────────────────────────────────────────────────

  it('useSelectionGridData_doesNotFetchOnMount_untilActivateIsCalled', () => {
    renderHook(() => useSelectionGridData(FIELD_ID));
    expect(mockFetchGridPage).not.toHaveBeenCalled();
  });

  it('useSelectionGridData_startsInIdleStatus_beforeActivation', () => {
    const { result } = renderHook(() => useSelectionGridData(FIELD_ID));
    expect(result.current.status).toBe('idle');
    expect(result.current.records).toHaveLength(0);
  });

  // ── Activation and fetch ──────────────────────────────────────────────────

  it('useSelectionGridData_fetchesCorrectEndpoint_withPageAndPageSizeParams', async () => {
    mockFetchGridPage.mockResolvedValueOnce(PAGE_1_RESPONSE);
    const { result } = renderHook(() => useSelectionGridData(FIELD_ID, 2));

    act(() => { result.current.activate(); });

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(mockFetchGridPage).toHaveBeenCalledWith(
      expect.objectContaining({ fieldId: FIELD_ID, page: 1, pageSize: 2 }),
    );
  });

  it('useSelectionGridData_returnsPaginatedResult_afterLoad', async () => {
    mockFetchGridPage.mockResolvedValueOnce(PAGE_1_RESPONSE);
    const { result } = renderHook(() => useSelectionGridData(FIELD_ID, 2));

    act(() => { result.current.activate(); });

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.records).toHaveLength(2);
    expect(result.current.totalCount).toBe(4);
    expect(result.current.totalPages).toBe(2);
    expect(result.current.page).toBe(1);
    expect(result.current.isCapped).toBe(false);
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('useSelectionGridData_setsErrorState_notThrows_on400FromApi', async () => {
    mockFetchGridPage.mockRejectedValueOnce(new Error('View not found (HTTP 400)'));
    const { result } = renderHook(() => useSelectionGridData(FIELD_ID));

    act(() => { result.current.activate(); });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/view not found/i);
    expect(result.current.records).toHaveLength(0);
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  it('useSelectionGridData_pageNavigation_incrementsPageAndReFetches', async () => {
    mockFetchGridPage
      .mockResolvedValueOnce(PAGE_1_RESPONSE)
      .mockResolvedValueOnce(PAGE_2_RESPONSE);

    const { result } = renderHook(() => useSelectionGridData(FIELD_ID, 2));
    act(() => { result.current.activate(); });
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => { result.current.loadPage(2); });

    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.records).toHaveLength(2);
    expect(result.current.records[0].id).toBe('record-3');
  });

  it('useSelectionGridData_pageNavigation_decrementsPageAndReFetches', async () => {
    mockFetchGridPage
      .mockResolvedValueOnce(PAGE_1_RESPONSE)
      .mockResolvedValueOnce(PAGE_2_RESPONSE)
      .mockResolvedValueOnce(PAGE_1_RESPONSE);

    const { result } = renderHook(() => useSelectionGridData(FIELD_ID, 2));
    act(() => { result.current.activate(); });
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => { result.current.loadPage(2); });
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => { result.current.loadPage(1); });
    await waitFor(() => expect(result.current.page).toBe(1));
    expect(result.current.records[0].id).toBe('record-1');
  });

  // ── Activate idempotency ──────────────────────────────────────────────────

  it('useSelectionGridData_secondActivateCall_isNoOp', async () => {
    mockFetchGridPage.mockResolvedValue(PAGE_1_RESPONSE);
    const { result } = renderHook(() => useSelectionGridData(FIELD_ID, 2));

    act(() => { result.current.activate(); });
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    const callsAfterFirst = mockFetchGridPage.mock.calls.length;

    act(() => { result.current.activate(); });
    expect(mockFetchGridPage.mock.calls.length).toBe(callsAfterFirst);
  });

  // ── Search and sort filter key reset ─────────────────────────────────────

  it('useSelectionGridData_searchTextChange_resetsToPage1AndReFetches', async () => {
    mockFetchGridPage
      .mockResolvedValueOnce(PAGE_1_RESPONSE)
      .mockResolvedValueOnce(PAGE_1_RESPONSE);

    const { result, rerender } = renderHook(
      ({ search }: { search: string }) => useSelectionGridData(FIELD_ID, 2, undefined, search),
      { initialProps: { search: '' } },
    );

    act(() => { result.current.activate(); });
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    const callsAfterInit = mockFetchGridPage.mock.calls.length;

    rerender({ search: 'alice' });
    await waitFor(() => expect(mockFetchGridPage.mock.calls.length).toBeGreaterThan(callsAfterInit));

    const lastCall = mockFetchGridPage.mock.calls[mockFetchGridPage.mock.calls.length - 1][0];
    expect(lastCall).toMatchObject({ page: 1, searchText: 'alice' });
  });

  it('useSelectionGridData_sortChange_resetsToPage1AndReFetches', async () => {
    mockFetchGridPage
      .mockResolvedValueOnce(PAGE_1_RESPONSE)
      .mockResolvedValueOnce(PAGE_1_RESPONSE);

    const { result, rerender } = renderHook(
      ({ sortBy, sortDir }: { sortBy: string | undefined; sortDir: 'asc' | 'desc' | undefined }) =>
        useSelectionGridData(FIELD_ID, 2, undefined, undefined, sortBy, sortDir),
      { initialProps: { sortBy: undefined as string | undefined, sortDir: undefined as 'asc' | 'desc' | undefined } },
    );

    act(() => { result.current.activate(); });
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    const callsAfterInit = mockFetchGridPage.mock.calls.length;

    rerender({ sortBy: 'name', sortDir: 'desc' });
    await waitFor(() => expect(mockFetchGridPage.mock.calls.length).toBeGreaterThan(callsAfterInit));

    const lastCall = mockFetchGridPage.mock.calls[mockFetchGridPage.mock.calls.length - 1][0];
    expect(lastCall).toMatchObject({ page: 1, sortBy: 'name', sortDirection: 'desc' });
  });
});
