import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { PublishedFormService } from './PublishedFormService.js';
import type { IRenderCacheStore } from './RenderCacheStore.js';
import { CacheMissError, ValidationError } from '../utils/errors.js';
import type { FormDefinition, LanguageConfig } from '@qdb/shared';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const FIXTURE_FORM: FormDefinition = {
  id: 'form-rc-001',
  formCode: 'rc-test',
  title: 'Render Cache Test Form',
  status: 'active',
  version: 3,
  allowSaveDraft: true,
  showSummaryStep: false,
  draftExpiryDays: 90,
  confirmationMessage: 'Submitted.',
  allowInfocardSkip: false,
  infocardCountsInProgress: false,
  infoCards: [],
  submissionMappings: [],
  buttons: [],
  tabs: [],
  createdAt: '2026-01-01T00:00:00Z',
  modifiedAt: '2026-01-15T00:00:00Z',
};

const FIXTURE_JSON = JSON.stringify(FIXTURE_FORM);
const FIXTURE_GZIPPED_B64 = Buffer.from(gzipSync(Buffer.from(FIXTURE_JSON))).toString('base64');
const FIXTURE_PLAIN_B64 = Buffer.from(FIXTURE_JSON).toString('base64');

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetAccessToken = vi.fn().mockResolvedValue('mock-token');
const mockAuthService = { getAccessToken: mockGetAccessToken } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeCacheStore(overrides: Partial<IRenderCacheStore> = {}): IRenderCacheStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeLanguageConfigService(defaultCode = 'en') {
  const languages: LanguageConfig[] = [
    { code: defaultCode, displayName: 'English', isDefault: true, isRtl: false, displayOrder: 1, lcid: 1033 },
    { code: 'ar', displayName: 'Arabic', isDefault: false, isRtl: true, displayOrder: 2, lcid: 1025 },
  ];
  return {
    getSupportedLanguages: vi.fn().mockResolvedValue(languages),
    isLanguageCodeSupported: vi.fn(),
    getLcidForLanguageCode: vi.fn(),
    invalidateCache: vi.fn(),
  } as never;
}

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    headers: { get: () => null },
  });
}

function makeActiveCacheRecord(overrides: Record<string, unknown> = {}) {
  return {
    qdb_form_render_cacheid: 'rc-001',
    qdb_form_code: 'rc-test',
    qdb_language_code: 'en',
    qdb_published_version: 3,
    qdb_runtime_json: FIXTURE_GZIPPED_B64,
    qdb_is_compressed: true,
    qdb_status: 2,
    qdb_is_active: true,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PublishedFormService', () => {
  let cacheStore: IRenderCacheStore;
  let service: PublishedFormService;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheStore = makeCacheStore();
    service = new PublishedFormService(mockAuthService, cacheStore, makeLanguageConfigService());
  });

  describe('getPublishedJson', () => {
    it('getPublishedJson_cacheMiss_queriesDataverseAndReturnsParsedFormDefinition', async () => {
      // Arrange — store returns null (miss), Dataverse returns one active gzipped record
      mockFetch.mockReturnValueOnce(okJson({ value: [makeActiveCacheRecord()] }));

      // Act
      const result = await service.getPublishedJson('rc-test', 'en');

      // Assert
      expect(result.formCode).toBe('rc-test');
      expect(result.version).toBe(3);
      expect(cacheStore.get).toHaveBeenCalledWith('rc-test:latest:en');
      expect(cacheStore.set).toHaveBeenCalled();
    });

    it('getPublishedJson_cacheHit_returnsFromCacheStoreWithoutFetch', async () => {
      // Arrange — store returns a pre-cached serialized form
      const hitStore = makeCacheStore({
        get: vi.fn().mockResolvedValue(FIXTURE_JSON),
      });
      const hitService = new PublishedFormService(mockAuthService, hitStore, null);

      // Act
      const result = await hitService.getPublishedJson('rc-test', 'en');

      // Assert
      expect(result.formCode).toBe('rc-test');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('getPublishedJson_requestedLangAbsent_fallsBackToDefaultLanguageRecord', async () => {
      // Arrange — only 'en' record in Dataverse; requested 'ar' not present
      mockFetch.mockReturnValueOnce(okJson({
        value: [makeActiveCacheRecord({ qdb_language_code: 'en' })],
      }));

      // Act — request Arabic, expect English fallback
      const result = await service.getPublishedJson('rc-test', 'ar');

      // Assert — still returns the form (using the 'en' record as fallback)
      expect(result.formCode).toBe('rc-test');
    });

    it('getPublishedJson_noActiveRecords_throwsCacheMissError', async () => {
      // Arrange — empty value array
      mockFetch.mockReturnValueOnce(okJson({ value: [] }));

      // Act & Assert
      await expect(service.getPublishedJson('rc-test', 'en')).rejects.toThrow(CacheMissError);
    });

    it('getPublishedJson_emptyRuntimeJson_throwsCacheMissError', async () => {
      // Arrange — record with empty qdb_runtime_json
      mockFetch.mockReturnValueOnce(okJson({
        value: [makeActiveCacheRecord({ qdb_runtime_json: '' })],
      }));

      // Act & Assert
      await expect(service.getPublishedJson('rc-test', 'en')).rejects.toThrow(CacheMissError);
    });

    it('getPublishedJson_notCompressed_skipsGunzipAndDecodesBase64DirectlyToJson', async () => {
      // Arrange — qdb_is_compressed=false, plain base64 payload
      mockFetch.mockReturnValueOnce(okJson({
        value: [makeActiveCacheRecord({
          qdb_runtime_json: FIXTURE_PLAIN_B64,
          qdb_is_compressed: false,
        })],
      }));

      // Act
      const result = await service.getPublishedJson('rc-test', 'en');

      // Assert
      expect(result.title).toBe('Render Cache Test Form');
    });

    it('getPublishedJson_exactLangMatch_returnsMatchingRecord', async () => {
      // Arrange — both en and ar records present
      const arForm: FormDefinition = { ...FIXTURE_FORM, title: 'نموذج اختبار' };
      const arJson = JSON.stringify(arForm);
      const arGzippedB64 = Buffer.from(gzipSync(Buffer.from(arJson))).toString('base64');

      mockFetch.mockReturnValueOnce(okJson({
        value: [
          makeActiveCacheRecord({ qdb_language_code: 'en' }),
          makeActiveCacheRecord({ qdb_language_code: 'ar', qdb_runtime_json: arGzippedB64 }),
        ],
      }));

      // Act
      const result = await service.getPublishedJson('rc-test', 'ar');

      // Assert — Arabic record selected
      expect(result.title).toBe('نموذج اختبار');
    });

    it('getPublishedJson_invalidFormCode_throwsValidationError', async () => {
      await expect(service.getPublishedJson('invalid form code!', 'en')).rejects.toThrow(ValidationError);
    });

    it('getPublishedJson_invalidLangCode_throwsValidationError', async () => {
      await expect(service.getPublishedJson('rc-test', 'INVALID')).rejects.toThrow(ValidationError);
    });
  });

  describe('decodeRuntimeJson — gzip + base64 round-trip', () => {
    it('decodeRuntimeJson_gzipRoundTrip_decodesCorrectly', async () => {
      // Arrange — produce a real compressed record and decode through the service
      mockFetch.mockReturnValueOnce(okJson({
        value: [makeActiveCacheRecord({
          qdb_runtime_json: FIXTURE_GZIPPED_B64,
          qdb_is_compressed: true,
        })],
      }));

      // Act
      const result = await service.getPublishedJson('rc-test', 'en');

      // Assert — decoded object matches original fixture exactly
      expect(result).toEqual(FIXTURE_FORM);
    });

    it('decodeRuntimeJson_plainBase64RoundTrip_decodesCorrectly', async () => {
      // Arrange — uncompressed record
      mockFetch.mockReturnValueOnce(okJson({
        value: [makeActiveCacheRecord({
          qdb_runtime_json: FIXTURE_PLAIN_B64,
          qdb_is_compressed: false,
        })],
      }));

      // Act
      const result = await service.getPublishedJson('rc-test', 'en');

      // Assert
      expect(result).toEqual(FIXTURE_FORM);
    });
  });
});
