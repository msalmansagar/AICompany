import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LRUCache } from 'lru-cache';
import { CrmGridDataService } from './CrmGridDataService.js';

// ── Mocks ──────────────────────────────────────────────────────

const mockGetAccessToken = vi.fn().mockResolvedValue('mock-token');
const mockAuthService = { getAccessToken: mockGetAccessToken } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch;

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: { get: () => null },
  });
}

function errorResponse(status: number, code = '') {
  return Promise.resolve({
    ok: false, status, statusText: 'Error',
    text: () => Promise.resolve(`{"error":{"code":"${code}","message":"Error"}}`),
    headers: { get: () => null },
  });
}

function makeMetadataCache() {
  return new LRUCache<string, unknown>({ max: 100, ttl: 60_000 });
}

function makeGridField(overrides: Record<string, unknown> = {}) {
  return {
    qdb_form_fieldid: 'field-grid-001',
    qdb_grid_entity_name: 'qdb_product',
    qdb_saved_view_id: 'view-abc',
    qdb_selection_mode: 100000001,
    qdb_grid_max_rows: 100,
    ...overrides,
  };
}

function makeColumnConfig(overrides: Record<string, unknown> = {}) {
  return {
    qdb_grid_column_configid: 'col-001',
    qdb_display_order: 1,
    qdb_column_label: 'Product Name',
    qdb_column_attribute: 'qdb_name',
    qdb_column_field_type: 'text',
    ...overrides,
  };
}

const BASE_FETCH_XML = '<fetch><entity name="qdb_product"><attribute name="qdb_name"/></entity></fetch>';

// ── Tests ──────────────────────────────────────────────────────

describe('CrmGridDataService', () => {
  let service: CrmGridDataService;
  let metadataCache: LRUCache<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    metadataCache = makeMetadataCache();
    service = new CrmGridDataService(mockAuthService, metadataCache);
  });

  describe('fetchGridRecords', () => {
    it('fetchGridRecords_withValidField_returnsPaginatedRecords', async () => {
      // Arrange
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: BASE_FETCH_XML, querytype: 0 }))
        .mockReturnValueOnce(okJson({
          value: [{ qdb_productid: 'prod-001', qdb_name: 'Savings Account' }],
          '@Microsoft.Dynamics.CRM.totalrecordcount': 1,
        }));

      // Act
      const result = await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001');

      // Assert
      expect(result.records).toHaveLength(1);
      expect(result.records[0].id).toBe('prod-001');
      expect(result.records[0].values).toMatchObject({ qdb_name: 'Savings Account' });
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(result.isCapped).toBe(false);
      expect(result.totalCount).toBe(1);
    });

    it('fetchGridRecords_whenTotalExceedsMaxRows_setsCappedTrue', async () => {
      // Arrange
      const fieldWithLowMax = makeGridField({ qdb_grid_max_rows: 5 });
      mockFetch
        .mockReturnValueOnce(okJson({ value: [fieldWithLowMax] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: BASE_FETCH_XML, querytype: 0 }))
        .mockReturnValueOnce(okJson({
          value: Array.from({ length: 5 }, (_, i) => ({ qdb_productid: `prod-${i}`, qdb_name: `P${i}` })),
          '@Microsoft.Dynamics.CRM.morerecords': true,
          '@Microsoft.Dynamics.CRM.totalrecordcount': 50,
        }));

      // Act
      const result = await service.fetchGridRecords('field-grid-001', 1, 5, 'corr-001');

      // Assert
      expect(result.isCapped).toBe(true);
      expect(result.totalCount).toBe(5); // capped at maxRows
    });

    it('fetchGridRecords_whenSavedViewNotFound_returnsUserFacing400', async () => {
      // Arrange — CEO condition BC-004
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(errorResponse(404));

      await expect(
        service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001'),
      ).rejects.toThrow('not found');
    });

    it('fetchGridRecords_whenViewIsUserView_rejectsWithValidationError', async () => {
      // Arrange — CEO condition BC-011
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: BASE_FETCH_XML, querytype: 1 }));

      await expect(
        service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001'),
      ).rejects.toThrow('Only System Views are permitted');
    });

    it('fetchGridRecords_onSecondCall_usesCachedFieldConfig', async () => {
      // Arrange
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: BASE_FETCH_XML, querytype: 0 }))
        .mockReturnValueOnce(okJson({ value: [] }))
        .mockReturnValueOnce(okJson({ value: [] })); // second call: records only

      await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001');
      const firstCount = mockFetch.mock.calls.length;

      await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001');
      const secondCount = mockFetch.mock.calls.length;

      // Only one additional fetch (records query) — field config is cached
      expect(secondCount - firstCount).toBe(1);
    });

    it('fetchGridRecords_restrictsValuesToConfiguredColumns', async () => {
      // Arrange — raw record has extra attributes not in column config
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: BASE_FETCH_XML, querytype: 0 }))
        .mockReturnValueOnce(okJson({
          value: [{
            qdb_productid: 'prod-001',
            qdb_name: 'Savings',
            qdb_internal_secret: 'should-be-excluded',
          }],
        }));

      const result = await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001');

      expect(result.records[0].values).toHaveProperty('qdb_name');
      expect(result.records[0].values).not.toHaveProperty('qdb_internal_secret');
    });
  });

  describe('search and sort', () => {
    function setupMocks(recordsResponse: unknown) {
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: BASE_FETCH_XML, querytype: 0 }))
        .mockReturnValueOnce(okJson(recordsResponse));
    }

    it('fetchGridRecords_withSearchText_injectsLikeConditionIntoFetchXml', async () => {
      setupMocks({ value: [] });

      await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001',
        undefined, undefined, 'savings');

      const recordsCall = mockFetch.mock.calls[3][0] as string;
      const decodedUrl = decodeURIComponent(recordsCall);
      expect(decodedUrl).toContain('operator="like"');
      expect(decodedUrl).toContain('%savings%');
    });

    it('fetchGridRecords_withSearchText_usesOrFilterAcrossTextColumns', async () => {
      // Arrange — two text columns
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [
          makeColumnConfig({ qdb_column_attribute: 'qdb_name', qdb_column_field_type: 'text' }),
          makeColumnConfig({ qdb_grid_column_configid: 'col-002', qdb_display_order: 2, qdb_column_attribute: 'qdb_email', qdb_column_field_type: 'email' }),
        ]}))
        .mockReturnValueOnce(okJson({ fetchxml: BASE_FETCH_XML, querytype: 0 }))
        .mockReturnValueOnce(okJson({ value: [] }));

      await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001',
        undefined, undefined, 'john');

      const decodedUrl = decodeURIComponent(mockFetch.mock.calls[3][0] as string);
      expect(decodedUrl).toContain('filter type="or"');
      expect(decodedUrl).toContain('attribute="qdb_name"');
      expect(decodedUrl).toContain('attribute="qdb_email"');
    });

    it('fetchGridRecords_withSortBy_injectsOrderElement', async () => {
      setupMocks({ value: [] });

      await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001',
        undefined, undefined, undefined, 'qdb_name', 'desc');

      const decodedUrl = decodeURIComponent(mockFetch.mock.calls[3][0] as string);
      expect(decodedUrl).toContain('<order attribute="qdb_name" descending="true"/>');
    });

    it('fetchGridRecords_withSortByAsc_setDescendingFalse', async () => {
      setupMocks({ value: [] });

      await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001',
        undefined, undefined, undefined, 'qdb_name', 'asc');

      const decodedUrl = decodeURIComponent(mockFetch.mock.calls[3][0] as string);
      expect(decodedUrl).toContain('descending="false"');
    });

    it('fetchGridRecords_withUnknownSortBy_ignoresSortSilently', async () => {
      setupMocks({ value: [] });

      // 'qdb_unknown' is not a configured column — must be silently dropped
      await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001',
        undefined, undefined, undefined, 'qdb_unknown', 'asc');

      const decodedUrl = decodeURIComponent(mockFetch.mock.calls[3][0] as string);
      expect(decodedUrl).not.toContain('<order');
    });

    it('fetchGridRecords_withSearchAndSort_injectsBoth', async () => {
      setupMocks({ value: [] });

      await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001',
        undefined, undefined, 'abc', 'qdb_name', 'asc');

      const decodedUrl = decodeURIComponent(mockFetch.mock.calls[3][0] as string);
      expect(decodedUrl).toContain('operator="like"');
      expect(decodedUrl).toContain('<order attribute="qdb_name"');
    });
  });

  describe('totalCount', () => {
    it('fetchGridRecords_returnsTotalCountFromDataverse', async () => {
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: BASE_FETCH_XML, querytype: 0 }))
        .mockReturnValueOnce(okJson({
          value: [{ qdb_productid: 'p1', qdb_name: 'A' }],
          '@Microsoft.Dynamics.CRM.totalrecordcount': 42,
        }));

      const result = await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001');

      expect(result.totalCount).toBe(42);
      expect(result.totalPages).toBe(1); // Math.ceil(42/50) = 1
    });

    it('fetchGridRecords_whenCountLimitExceeded_returnsTotalCountUndefined', async () => {
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: BASE_FETCH_XML, querytype: 0 }))
        .mockReturnValueOnce(okJson({
          value: [],
          '@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded': true,
        }));

      const result = await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001');

      expect(result.totalCount).toBeUndefined();
      expect(result.totalPages).toBeUndefined();
    });
  });
});
