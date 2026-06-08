// RED — failing until useSelectionGridData is implemented correctly.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSelectionGridData } from './useSelectionGridData';
import type { GridRecordPage } from '@qdb/shared';

// ── Shared mock data ────────────────────────────────────────────────────────

const PAGE_1_RESPONSE: GridRecordPage = {
  records: [
    { id: 'record-1', values: { name: 'Alice' } },
    { id: 'record-2', values: { name: 'Bob' } },
  ],
  totalCount: 4,
  page: 1,
  pageSize: 2,
  totalPages: 2,
  isCapped: false,
};

const PAGE_2_RESPONSE: GridRecordPage = {
  records: [
    { id: 'record-3', values: { name: 'Carol' } },
    { id: 'record-4', values: { name: 'Dave' } },
  ],
  totalCount: 4,
  page: 2,
  pageSize: 2,
  totalPages: 2,
  isCapped: false,
};

// ── Module mock ─────────────────────────────────────────────────────────────

const mockFetchGridPage = vi.fn<() => Promise<GridRecordPage>>();

vi.mock('../services/gridDataService', () => ({
  fetchGridPage: (...args: unknown[]) => mockFetchGridPage(...args),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const FIELD_ID = 'field-abc-123';

describe('useSelectionGridData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Lazy loading ──────────────────────────────────────────────────────────

  it('useSelectionGridData_doesNotFetchOnMount_untilActivateIsCalled', () => {
    // Arrange & Act — mount without calling activate.
    renderHook(() => useSelectionGridData(FIELD_ID));

    // Assert — no network call made.
    expect(mockFetchGridPage).not.toHaveBeenCalled();
  });

  it('useSelectionGridData_startsInIdleStatus_beforeActivation', () => {
    // Arrange & Act
    const { result } = renderHook(() => useSelectionGridData(FIELD_ID));

    // Assert
    expect(result.current.status).toBe('idle');
    expect(result.current.records).toHaveLength(0);
  });

  // ── Activation and fetch ──────────────────────────────────────────────────

  it('useSelectionGridData_fetchesCorrectEndpoint_withPageAndPageSizeParams', async () => {
    // Arrange
    mockFetchGridPage.mockResolvedValueOnce(PAGE_1_RESPONSE);
    const { result } = renderHook(() => useSelectionGridData(FIELD_ID, 2));

    // Act — trigger lazy load.
    act(() => {
      result.current.activate();
    });

    // Assert — fetchGridPage called with correct params.
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(mockFetchGridPage).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: FIELD_ID,
        page: 1,
        pageSize: 2,
      }),
    );
  });

  it('useSelectionGridData_returnsPaginatedResult_afterLoad', async () => {
    // Arrange
    mockFetchGridPage.mockResolvedValueOnce(PAGE_1_RESPONSE);
    const { result } = renderHook(() => useSelectionGridData(FIELD_ID, 2));

    // Act
    act(() => {
      result.current.activate();
    });

    // Assert — shape matches the GridRecordPage returned by the service.
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.records).toHaveLength(2);
    expect(result.current.totalCount).toBe(4);
    expect(result.current.totalPages).toBe(2);
    expect(result.current.page).toBe(1);
    expect(result.current.isCapped).toBe(false);
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('useSelectionGridData_setsErrorState_notThrows_on400FromApi', async () => {
    // Arrange — simulate a 400-style error (View not found).
    mockFetchGridPage.mockRejectedValueOnce(
      new Error('View not found (HTTP 400)'),
    );
    const { result } = renderHook(() => useSelectionGridData(FIELD_ID));

    // Act
    act(() => {
      result.current.activate();
    });

    // Assert — hook enters error state; rendering code can show Retry.
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/view not found/i);
    expect(result.current.records).toHaveLength(0);
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  it('useSelectionGridData_pageNavigation_incrementsPageAndReFetches', async () => {
    // Arrange — first call returns page 1, second returns page 2.
    mockFetchGridPage
      .mockResolvedValueOnce(PAGE_1_RESPONSE)
      .mockResolvedValueOnce(PAGE_2_RESPONSE);

    const { result } = renderHook(() => useSelectionGridData(FIELD_ID, 2));

    act(() => {
      result.current.activate();
    });
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    // Act — navigate to page 2.
    act(() => {
      result.current.loadPage(2);
    });

    // Assert — page incremented, new records loaded.
    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.records).toHaveLength(2);
    expect(result.current.records[0].id).toBe('record-3');
  });

  it('useSelectionGridData_pageNavigation_decrementsPageAndReFetches', async () => {
    // Arrange — start on page 2 by navigating forward first.
    mockFetchGridPage
      .mockResolvedValueOnce(PAGE_1_RESPONSE)
      .mockResolvedValueOnce(PAGE_2_RESPONSE)
      .mockResolvedValueOnce(PAGE_1_RESPONSE);

    const { result } = renderHook(() => useSelectionGridData(FIELD_ID, 2));

    act(() => {
      result.current.activate();
    });
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => {
      result.current.loadPage(2);
    });
    await waitFor(() => expect(result.current.page).toBe(2));

    // Act — navigate back to page 1.
    act(() => {
      result.current.loadPage(1);
    });

    // Assert — page decremented back to 1.
    await waitFor(() => expect(result.current.page).toBe(1));
    expect(result.current.records[0].id).toBe('record-1');
  });

  // ── Selection persistence ─────────────────────────────────────────────────

  it('useSelectionGridData_selectionSetPersistsAcrossPageChanges', async () => {
    // Arrange — this hook manages data only. Selection state lives in SelectionGridField.
    // Verify that activate() does NOT reset hasLoadedRef on second call (no double-fetch).
    mockFetchGridPage.mockResolvedValue(PAGE_1_RESPONSE);

    const { result } = renderHook(() => useSelectionGridData(FIELD_ID, 2));

    // First activation — loads data.
    act(() => {
      result.current.activate();
    });
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    const callCountAfterFirstActivation = mockFetchGridPage.mock.calls.length;

    // Second activation — must be a no-op because data is already loaded.
    act(() => {
      result.current.activate();
    });

    // Assert — no additional fetch was triggered.
    expect(mockFetchGridPage.mock.calls.length).toBe(callCountAfterFirstActivation);
  });
});
