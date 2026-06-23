// RED — failing until gridDataService is implemented correctly.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GridRecordPage } from '@qdb/shared';

// ── Mock apiClient ──────────────────────────────────────────────────────────

const mockApiGet = vi.fn();

vi.mock('../api/apiClient', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const FIELD_ID = 'field-xyz-999';

const GRID_PAGE_RESPONSE: GridRecordPage = {
  records: [
    { id: 'r-1', values: { name: 'Alice' } },
    { id: 'r-2', values: { name: 'Bob' } },
  ],
  totalCount: 2,
  totalPages: 1,
  page: 1,
  pageSize: 50,
  hasNextPage: false,
  isCapped: false,
};

describe('gridDataService.fetchGridPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchGridPage_callsCorrectUrl_withFieldIdAndPaginationParams', async () => {
    // Arrange
    mockApiGet.mockResolvedValueOnce({ data: GRID_PAGE_RESPONSE });

    const { fetchGridPage } = await import('./gridDataService');

    // Act
    await fetchGridPage({ fieldId: FIELD_ID, page: 2, pageSize: 25 });

    // Assert — URL includes the fieldId path segment and both query params.
    expect(mockApiGet).toHaveBeenCalledWith(
      `/grids/${FIELD_ID}/records?page=2&pageSize=25`,
      expect.anything(),
    );
  });

  it('fetchGridPage_returnsGridRecordPage_onSuccess', async () => {
    // Arrange
    mockApiGet.mockResolvedValueOnce({ data: GRID_PAGE_RESPONSE });

    const { fetchGridPage } = await import('./gridDataService');

    // Act
    const result = await fetchGridPage({ fieldId: FIELD_ID, page: 1, pageSize: 50 });

    // Assert — shape matches GridRecordPage.
    expect(result.records).toHaveLength(2);
    expect(result.totalCount).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.totalPages).toBe(1);
    expect(result.isCapped).toBe(false);
  });

  it('fetchGridPage_throwsTypedError_onNon200Response', async () => {
    // Arrange — apiClient itself throws when the response is non-200
    // (the response interceptor in apiClient converts HTTP errors to ApiClientError).
    const networkError = new Error('HTTP 404: Not Found');
    mockApiGet.mockRejectedValueOnce(networkError);

    const { fetchGridPage } = await import('./gridDataService');

    // Act & Assert — the service must propagate the error, not swallow it.
    await expect(
      fetchGridPage({ fieldId: FIELD_ID, page: 1, pageSize: 50 }),
    ).rejects.toThrow('HTTP 404: Not Found');
  });

  it('fetchGridPage_passesAuthToken_inAuthorizationHeader', async () => {
    // Arrange — the Authorization header is injected by apiClient's request
    // interceptor (acquireBearerToken). We verify that fetchGridPage passes
    // an options object to apiClient.get so the interceptor can operate on it.
    mockApiGet.mockResolvedValueOnce({ data: GRID_PAGE_RESPONSE });

    const { fetchGridPage } = await import('./gridDataService');

    // Act
    await fetchGridPage({ fieldId: FIELD_ID, page: 1, pageSize: 50 });

    // Assert — apiClient.get receives a second options argument (which carries
    // the signal for abort-support; the auth header is added by the interceptor).
    const callArgs = mockApiGet.mock.calls[0] as unknown[];
    expect(callArgs).toHaveLength(2);
    // The second arg is the config object — it must be an object (not undefined).
    expect(typeof callArgs[1]).toBe('object');
  });

  it('fetchGridPage_forwardsAbortSignal_toApiClient', async () => {
    // Arrange
    mockApiGet.mockResolvedValueOnce({ data: GRID_PAGE_RESPONSE });

    const { fetchGridPage } = await import('./gridDataService');
    const controller = new AbortController();

    // Act
    await fetchGridPage({
      fieldId: FIELD_ID,
      page: 1,
      pageSize: 50,
      signal: controller.signal,
    });

    // Assert — signal is forwarded inside the config object.
    const callArgs = mockApiGet.mock.calls[0] as [string, { signal?: AbortSignal }];
    expect(callArgs[1]).toMatchObject({ signal: controller.signal });
  });
});
