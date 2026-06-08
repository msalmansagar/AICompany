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

// 3 parallel calls after form definition: tabs, submissionMappings, buttons.
// infoCardService is null in tests so no additional fetch for info-cards.
function mockFormFetchSequence() {
  return [
    okJson(mockFormResponse()),  // form definition (sequential)
    okJson({ value: [] }),        // tabs (parallel)
    okJson({ value: [] }),        // submission mappings (parallel)
    okJson({ value: [] }),        // buttons (parallel)
  ];
}

describe('CrmMetadataService', () => {
  let service: CrmMetadataService;
  let cache: LRUCache<string, never>;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = makeCache();
    // infoCardService is null — no info-card fetches in these tests.
    service = new CrmMetadataService(mockAuthService, cache as never, null);
  });

  describe('getFormDefinition', () => {
    it('getFormDefinition_whenFormExists_returnsAssembledFormDefinition', async () => {
      // Arrange — form def + 3 parallel calls (tabs, mappings, buttons)
      for (const mock of mockFormFetchSequence()) {
        mockFetch.mockReturnValueOnce(mock);
      }

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
      // Arrange — form def + 3 parallel
      for (const mock of mockFormFetchSequence()) {
        mockFetch.mockReturnValueOnce(mock);
      }

      // First call — populates cache
      await service.getFormDefinition('test-form');
      const firstCallCount = mockFetch.mock.calls.length;

      // Act — second call should use cache
      await service.getFormDefinition('test-form');

      // Assert — no new fetch calls
      expect(mockFetch.mock.calls.length).toBe(firstCallCount);
    });

    it('getFormDefinition_afterInvalidateCache_fetchesFromDataverse', async () => {
      // Arrange — two full sequences (first load + reload after cache bust)
      for (const mock of [...mockFormFetchSequence(), ...mockFormFetchSequence()]) {
        mockFetch.mockReturnValueOnce(mock);
      }

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
