import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranslationWriteService, TranslationWriteServiceError } from '@/services/TranslationWriteService';

const SAVED = {
  translationId: 'tr-001',
  entityName: 'qdb_form_field',
  recordId: '00000000-0000-0000-0000-000000000001',
  fieldName: 'qdb_label',
  languageCode: 'ar',
  value: 'الاسم الكامل',
};

function mockFetchResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue({ success: true, data }),
    text: vi.fn().mockResolvedValue(''),
  } as unknown as Response;
}

function mock204Response(): Response {
  return { ok: true, status: 204, json: vi.fn(), text: vi.fn() } as unknown as Response;
}

describe('TranslationWriteService', () => {
  let service: TranslationWriteService;

  beforeEach(() => {
    service = new TranslationWriteService(null);
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('import', { meta: { env: { VITE_API_BASE_URL: '' } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchTranslationsForRecord_returnsArray_onSuccess', async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse([SAVED]));

    const result = await service.fetchTranslationsForRecord('qdb_form_field', 'rec-001');

    expect(result).toHaveLength(1);
    expect(result[0].translationId).toBe('tr-001');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('entityName=qdb_form_field'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('upsertTranslation_callsPUT_andReturnsRecord', async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(SAVED));

    const result = await service.upsertTranslation({
      entityName: 'qdb_form_field',
      recordId: '00000000-0000-0000-0000-000000000001',
      fieldName: 'qdb_label',
      languageCode: 'ar',
      value: 'الاسم الكامل',
    });

    expect(result.translationId).toBe('tr-001');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('deleteTranslation_callsDELETE_andReturns', async () => {
    vi.mocked(fetch).mockResolvedValue(mock204Response());

    await expect(service.deleteTranslation('tr-001')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tr-001'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('fetchTranslationsForRecord_throwsError_onHttpFailure', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, text: vi.fn().mockResolvedValue('Server Error') } as unknown as Response);

    await expect(service.fetchTranslationsForRecord('qdb_form_field', 'rec')).rejects.toBeInstanceOf(
      TranslationWriteServiceError,
    );
  });
});
