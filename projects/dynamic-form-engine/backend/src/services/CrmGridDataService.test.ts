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
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: { get: () => null },
  });
}

function errorResponse(status: number, code = '') {
  return Promise.resolve({
    ok: false,
    status,
    statusText: 'Error',
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
    qdb_grid_target_entity: 'qdb_product',
    qdb_grid_saved_view_id: 'view-abc',
    qdb_grid_selection_mode: 100000001,
    qdb_grid_max_rows: 100,
    ...overrides,
  };
}

function makeColumnConfig(overrides: Record<string, unknown> = {}) {
  return {
    qdb_grid_column_configid: 'col-001',
    qdb_display_order: 1,
    qdb_column_label: 'Product Name',
    qdb_target_attribute: 'qdb_name',
    qdb_column_field_type: 'text',
    ...overrides,
  };
}

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
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))   // field config
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] })) // column configs
        .mockReturnValueOnce(okJson({                                   // saved view
          fetchxml: '<fetch><entity name="qdb_product"/></fetch>',
          querytype: 0,
        }))
        .mockReturnValueOnce(okJson({                                   // records query
          value: [{ qdb_productid: 'prod-001', qdb_name: 'Savings Account' }],
          '@odata.count': 1,
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
    });

    it('fetchGridRecords_whenTotalExceedsMaxRows_setsCappedTrue', async () => {
      // Arrange
      const fieldWithLowMax = makeGridField({ qdb_grid_max_rows: 5 });
      mockFetch
        .mockReturnValueOnce(okJson({ value: [fieldWithLowMax] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: '<fetch/>', querytype: 0 }))
        .mockReturnValueOnce(okJson({
          value: Array.from({ length: 5 }, (_, i) => ({ qdb_productid: `prod-${i}`, qdb_name: `P${i}` })),
          '@odata.count': 50, // Dataverse says 50 but maxRows is 5
        }));

      // Act
      const result = await service.fetchGridRecords('field-grid-001', 1, 5, 'corr-001');

      // Assert
      expect(result.isCapped).toBe(true);
      expect(result.totalCount).toBe(5);
    });

    it('fetchGridRecords_whenSavedViewNotFound_returnsUserFacing400', async () => {
      // Arrange — CEO condition BC-004: 404 on view must return 400 not 502
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(errorResponse(404));

      // Act & Assert
      await expect(
        service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001'),
      ).rejects.toThrow('not found');
    });

    it('fetchGridRecords_whenViewIsUserView_rejectsWithValidationError', async () => {
      // Arrange — CEO condition BC-011: user views (querytype !== 0) are forbidden
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: '<fetch/>', querytype: 1 })); // 1 = user view

      // Act & Assert
      await expect(
        service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001'),
      ).rejects.toThrow('Only System Views are permitted');
    });

    it('fetchGridRecords_onSecondCall_usesCachedFieldConfig', async () => {
      // Arrange
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: '<fetch/>', querytype: 0 }))
        .mockReturnValueOnce(okJson({ value: [], '@odata.count': 0 }))
        // Second call: only the records query should fire (field config is cached)
        .mockReturnValueOnce(okJson({ value: [], '@odata.count': 0 }));

      await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001');
      const firstCount = mockFetch.mock.calls.length;

      await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001');
      const secondCount = mockFetch.mock.calls.length;

      // Only one additional fetch (the records query) — field config is cached.
      expect(secondCount - firstCount).toBe(1);
    });

    it('fetchGridRecords_restrictsValuesToConfiguredColumns', async () => {
      // Arrange — raw record has extra attributes not in column config
      mockFetch
        .mockReturnValueOnce(okJson({ value: [makeGridField()] }))
        .mockReturnValueOnce(okJson({ value: [makeColumnConfig()] }))
        .mockReturnValueOnce(okJson({ fetchxml: '<fetch/>', querytype: 0 }))
        .mockReturnValueOnce(okJson({
          value: [{
            qdb_productid: 'prod-001',
            qdb_name: 'Savings',
            qdb_internal_secret: 'should-be-excluded',
          }],
          '@odata.count': 1,
        }));

      // Act
      const result = await service.fetchGridRecords('field-grid-001', 1, 50, 'corr-001');

      // Assert — only qdb_name is in columnConfigs; internal_secret must be excluded
      expect(result.records[0].values).toHaveProperty('qdb_name');
      expect(result.records[0].values).not.toHaveProperty('qdb_internal_secret');
    });
  });
});
