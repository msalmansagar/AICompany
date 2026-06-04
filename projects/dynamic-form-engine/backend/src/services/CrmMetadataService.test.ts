import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LRUCache } from 'lru-cache';
import { CrmMetadataService } from './CrmMetadataService.js';

const mockGetAccessToken = vi.fn().mockResolvedValue('mock-token');
const mockAuthService = { getAccessToken: mockGetAccessToken } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeCache() {
  return new LRUCache<string, never>({ max: 10, ttl: 60_000 });
}

function mockFormResponse(status = 100000001) {
  return {
    value: [
      {
        qdb_form_definition_id: 'fd-001',
        qdb_form_code: 'test-form',
        qdb_title: 'Test Form',
        qdb_status: status,
        qdb_version: 1,
        qdb_allow_save_draft: true,
        qdb_draft_expiry_days: 90,
        qdb_confirmation_message: 'Submitted.',
        createdon: '2026-05-08T00:00:00Z',
        modifiedon: '2026-05-08T00:00:00Z',
      },
    ],
  };
}

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    headers: { get: () => null },
  });
}

describe('CrmMetadataService', () => {
  let service: CrmMetadataService;
  let cache: LRUCache<string, never>;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = makeCache();
    service = new CrmMetadataService(mockAuthService, cache as never);
  });

  describe('getFormDefinition', () => {
    it('getFormDefinition_whenFormExists_returnsAssembledFormDefinition', async () => {
      // Arrange — mock all 6 Dataverse calls in fetch sequence
      mockFetch
        .mockReturnValueOnce(okJson(mockFormResponse()))      // form definition
        .mockReturnValueOnce(okJson({ value: [] }))           // tabs
        .mockReturnValueOnce(okJson({ value: [] }));          // submission mappings

      // Act
      const result = await service.getFormDefinition('test-form');

      // Assert
      expect(result.formCode).toBe('test-form');
      expect(result.title).toBe('Test Form');
      expect(result.tabs).toEqual([]);
    });

    it('getFormDefinition_whenFormNotFound_throwsFormNotFoundError', async () => {
      // Arrange
      mockFetch.mockReturnValueOnce(okJson({ value: [] }));

      // Act & Assert
      await expect(service.getFormDefinition('nonexistent')).rejects.toThrow(
        "Form 'nonexistent' not found",
      );
    });

    it('getFormDefinition_whenFormInactive_throwsFormInactiveError', async () => {
      // Arrange — status 100000002 = Inactive
      mockFetch.mockReturnValueOnce(okJson(mockFormResponse(100000002)));

      // Act & Assert
      await expect(service.getFormDefinition('test-form')).rejects.toThrow(
        "Form 'test-form' is not active",
      );
    });

    it('getFormDefinition_onSecondCall_returnsFromCacheWithoutFetch', async () => {
      // Arrange
      mockFetch
        .mockReturnValueOnce(okJson(mockFormResponse()))
        .mockReturnValueOnce(okJson({ value: [] }))
        .mockReturnValueOnce(okJson({ value: [] }));

      // First call — populates cache
      await service.getFormDefinition('test-form');
      const firstCallCount = mockFetch.mock.calls.length;

      // Act — second call
      await service.getFormDefinition('test-form');

      // Assert — no new fetch calls
      expect(mockFetch.mock.calls.length).toBe(firstCallCount);
    });

    it('getFormDefinition_afterInvalidateCache_fetchesFromDataverse', async () => {
      // Arrange
      mockFetch
        .mockReturnValueOnce(okJson(mockFormResponse()))
        .mockReturnValueOnce(okJson({ value: [] }))
        .mockReturnValueOnce(okJson({ value: [] }))
        .mockReturnValueOnce(okJson(mockFormResponse()))
        .mockReturnValueOnce(okJson({ value: [] }))
        .mockReturnValueOnce(okJson({ value: [] }));

      await service.getFormDefinition('test-form');
      const afterFirstCall = mockFetch.mock.calls.length;

      // Act
      service.invalidateCache('test-form');
      await service.getFormDefinition('test-form');

      // Assert — fetched again after invalidation
      expect(mockFetch.mock.calls.length).toBeGreaterThan(afterFirstCall);
    });
  });
});
