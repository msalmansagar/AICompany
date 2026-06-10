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

  // ── buildFileUploadConfig / resolveAllowedMimeTypes ───────────────────────
  // Exercised through getFormDefinition so the full fetch chain is covered.
  // Each test creates its own service + cache to avoid cross-test cache hits.

  describe('buildFileUploadConfig — allowedFileExtensions resolution', () => {
    /**
     * Registers mock responses for the full nested fetch sequence that occurs
     * when there is exactly one tab → one section → one file field.
     *
     * Actual call order (sequential then parallel):
     *   1  form definition
     *   2  [parallel] tabs / submission mappings / buttons
     *      (infoCardService is null — no 4th parallel call)
     *   3  sections (sequential, after tabs resolves)
     *   4  fields   (sequential, after sections resolves)
     *   5  [parallel] options / validation rules / lookup configs /
     *                 business rules / grid column configs
     */
    function seedMocks(fieldOverrides: Record<string, unknown>): void {
      const tabResponse     = { value: [{ qdb_form_tabid: 'tab-001', qdb_label: 'Tab', qdb_display_order: 1 }] };
      const sectionResponse = { value: [{ qdb_form_sectionid: 'sec-001', _qdb_form_tab_id_value: 'tab-001', qdb_label: 'Section', qdb_display_order: 1 }] };
      const fieldResponse   = {
        value: [
          {
            qdb_form_fieldid:             'fld-001',
            _qdb_form_section_id_value:   'sec-001',
            qdb_field_type:               100000015, // file
            qdb_schema_name:              'upload_field',
            qdb_label:                    'Upload',
            qdb_display_order:            1,
            ...fieldOverrides,
          },
        ],
      };

      [
        mockFormResponse(),      // [1] form definition
        tabResponse,             // [2a] tabs (parallel)
        { value: [] },           // [2b] submission mappings (parallel)
        { value: [] },           // [2c] buttons (parallel)
        sectionResponse,         // [3] sections
        fieldResponse,           // [4] fields
        { value: [] },           // [5a] options — manual (parallel)
        { value: [] },           // [5b] validation rules (parallel)
        { value: [] },           // [5c] lookup configs (parallel)
        { value: [] },           // [5d] business rules (parallel)
        { value: [] },           // [5e] grid column configs (parallel)
      ].forEach((data) => mockFetch.mockReturnValueOnce(okJson(data)));
    }

    /** Returns a fresh isolated service so each test starts with an empty cache. */
    function makeService() {
      return new CrmMetadataService(mockAuthService, makeCache() as never, null);
    }

    it(
      'buildFileUploadConfig_whenExtensionCodesPresent_mapsToMimeTypes',
      async () => {
        // Arrange — PDF (100000000) + PNG (100000002)
        seedMocks({ qdb_allowed_file_extensions: [100000000, 100000002] });

        // Act
        const form = await makeService().getFormDefinition('test-form');
        const uploadField = form.tabs[0].sections[0].fields[0];

        // Assert
        expect(uploadField.fileUploadConfig).toBeDefined();
        expect(uploadField.fileUploadConfig?.allowedMimeTypes).toEqual([
          'application/pdf',
          'image/png',
        ]);
        expect(uploadField.fileUploadConfig?.allowedFileExtensions).toEqual([100000000, 100000002]);
      },
    );

    it(
      'buildFileUploadConfig_whenNoExtensionCodes_fallsBackToMimeJson',
      async () => {
        // Arrange — legacy JSON memo, no multiselect codes
        seedMocks({ qdb_allowed_mime_types: '["image/gif","text/plain"]' });

        // Act
        const form = await makeService().getFormDefinition('test-form');
        const uploadField = form.tabs[0].sections[0].fields[0];

        // Assert
        expect(uploadField.fileUploadConfig?.allowedMimeTypes).toEqual([
          'image/gif',
          'text/plain',
        ]);
        expect(uploadField.fileUploadConfig?.allowedFileExtensions).toBeUndefined();
      },
    );

    it(
      'buildFileUploadConfig_whenBothExtensionCodesAndMimeJson_prefersExtensionCodes',
      async () => {
        // Extension codes take priority over memo fallback
        seedMocks({ qdb_allowed_file_extensions: [100000014], qdb_allowed_mime_types: '["image/gif"]' });

        // Act
        const form = await makeService().getFormDefinition('test-form');
        const uploadField = form.tabs[0].sections[0].fields[0];

        // Assert — only MP3 MIME type, not image/gif
        expect(uploadField.fileUploadConfig?.allowedMimeTypes).toEqual(['audio/mpeg']);
      },
    );

    it(
      'buildFileUploadConfig_whenEmptyExtensionCodesArray_fallsBackToMimeJson',
      async () => {
        // An empty array means "no selection made" — fall back to memo
        seedMocks({ qdb_allowed_file_extensions: [], qdb_allowed_mime_types: '["application/zip"]' });

        // Act
        const form = await makeService().getFormDefinition('test-form');
        const uploadField = form.tabs[0].sections[0].fields[0];

        // Assert
        expect(uploadField.fileUploadConfig?.allowedMimeTypes).toEqual(['application/zip']);
      },
    );

    it(
      'buildFileUploadConfig_whenNoExtensionCodesAndNoMimeJson_returnsDefaults',
      async () => {
        // Neither multiselect nor memo — defaults apply
        seedMocks({});

        // Act
        const form = await makeService().getFormDefinition('test-form');
        const uploadField = form.tabs[0].sections[0].fields[0];

        // Assert — default list from parseAllowedMimeTypes
        expect(uploadField.fileUploadConfig?.allowedMimeTypes).toContain('application/pdf');
        expect(uploadField.fileUploadConfig?.allowedMimeTypes).toContain('image/jpeg');
      },
    );
  });
});
