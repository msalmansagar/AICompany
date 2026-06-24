import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { LRUCache } from 'lru-cache';
import 'express-async-errors';
import { createFormsRouter } from './forms.routes.js';
import { createLanguagesRouter } from './languages.routes.js';
import { createInternalCacheRouter } from './internal-cache.routes.js';
import { errorMiddleware } from '../middleware/error.middleware.js';
import type { CrmMetadataService } from '../services/CrmMetadataService.js';
import type { CrmLanguageConfigService } from '../services/CrmLanguageConfigService.js';
import type { LanguageConfig, FormDefinition } from '@qdb/shared';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const SUPPORTED_LANGS: LanguageConfig[] = [
  { code: 'en', displayName: 'English', isDefault: true, isRtl: false, displayOrder: 1, lcid: 1033 },
  { code: 'ar', displayName: 'Arabic', displayNameNative: 'العربية', isDefault: false, isRtl: true, displayOrder: 2, lcid: 1025 },
];

function makeLanguageConfigService(supported = SUPPORTED_LANGS): CrmLanguageConfigService {
  return {
    getSupportedLanguages: vi.fn().mockResolvedValue(supported),
    isLanguageCodeSupported: vi.fn().mockImplementation(async (code: string) =>
      supported.some((l) => l.code === code),
    ),
    getLcidForLanguageCode: vi.fn().mockImplementation(async (code: string) =>
      supported.find((l) => l.code === code)?.lcid,
    ),
    invalidateCache: vi.fn(),
  } as unknown as CrmLanguageConfigService;
}

function makeEnglishFormDefinition(): FormDefinition {
  return {
    id: 'form-001',
    formCode: 'test-form',
    title: 'Test Form EN',
    description: 'A test form',
    status: 'active',
    version: 1,
    allowSaveDraft: true,
    showSummaryStep: false,
    draftExpiryDays: 90,
    confirmationMessage: 'Thank you for submitting.',
    allowInfocardSkip: false,
    infocardCountsInProgress: false,
    infoCards: [],
    submissionMappings: [],
    buttons: [],
    tabs: [],
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
  };
}

function makeArabicFormDefinition(): FormDefinition {
  return { ...makeEnglishFormDefinition(), title: 'نموذج الاختبار' };
}

const MOCK_DESIGN_PAYLOAD = { themeId: 'default', formStyle: {} } as never;
const mockDesignService = {
  getDesignPayload: vi.fn().mockResolvedValue(MOCK_DESIGN_PAYLOAD),
  getDefaultPayload: vi.fn().mockReturnValue(MOCK_DESIGN_PAYLOAD),
} as never;

function buildApp(
  metadataService: Partial<CrmMetadataService>,
  languageConfigService?: CrmLanguageConfigService,
) {
  const app = express();
  app.use(express.json());

  // simulate auth middleware setting req.user
  app.use((req, _res, next) => {
    (req as express.Request & { user: unknown }).user = {
      oid: 'user-001', roles: [], aud: 'dev', iss: 'dev', exp: 9_999_999_999,
    };
    next();
  });

  if (languageConfigService) {
    app.use('/api/languages', createLanguagesRouter(languageConfigService));
    app.use('/api/internal/cache', createInternalCacheRouter(
      metadataService as CrmMetadataService,
      languageConfigService,
    ));
  }

  const formsRouter = createFormsRouter(
    metadataService as CrmMetadataService,
    {} as never, {} as never, mockDesignService, {} as never, null,
    null, languageConfigService ?? null,
  );
  app.use('/api/forms', formsRouter);
  app.use(errorMiddleware);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMetadataService(
  formFn: (code: string, lang?: string) => Promise<FormDefinition>,
): Partial<CrmMetadataService> {
  return {
    getFormDefinition: vi.fn(formFn),
    invalidateCache: vi.fn(),
    listForms: vi.fn().mockResolvedValue([]),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('forms.routes — i18n extension', () => {
  let langService: CrmLanguageConfigService;

  beforeEach(() => {
    langService = makeLanguageConfigService();
  });

  it('GET_metadata_noLangParam_returnsEnglishFormDefinition', async () => {
    const metadataService = makeMetadataService(async () => makeEnglishFormDefinition());
    const app = buildApp(metadataService, langService);

    const res = await request(app).get('/api/forms/test-form/metadata');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Test Form EN');
    expect(metadataService.getFormDefinition).toHaveBeenCalledWith('test-form', 'en');
  });

  it('GET_metadata_langEn_returnsEnglishFormDefinition', async () => {
    const metadataService = makeMetadataService(async () => makeEnglishFormDefinition());
    const app = buildApp(metadataService, langService);

    const res = await request(app).get('/api/forms/test-form/metadata?lang=en');
    expect(res.status).toBe(200);
    expect(metadataService.getFormDefinition).toHaveBeenCalledWith('test-form', 'en');
  });

  it('GET_metadata_langAr_returnsFormWithTranslationsApplied', async () => {
    const metadataService = makeMetadataService(async (_code, lang) =>
      lang === 'ar' ? makeArabicFormDefinition() : makeEnglishFormDefinition(),
    );
    const app = buildApp(metadataService, langService);

    const res = await request(app).get('/api/forms/test-form/metadata?lang=ar');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('نموذج الاختبار');
    expect(metadataService.getFormDefinition).toHaveBeenCalledWith('test-form', 'ar');
  });

  it('GET_metadata_unsupportedLang_returns400WithStructuredError', async () => {
    const metadataService = makeMetadataService(async () => makeEnglishFormDefinition());
    const app = buildApp(metadataService, langService);

    const res = await request(app).get('/api/forms/test-form/metadata?lang=xx');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_LANGUAGE_CODE');
  });

  it('GET_metadata_unsupportedLang_structuredErrorHasSupportedCodes', async () => {
    const metadataService = makeMetadataService(async () => makeEnglishFormDefinition());
    const app = buildApp(metadataService, langService);

    const res = await request(app).get('/api/forms/test-form/metadata?lang=fr');
    expect(res.status).toBe(400);
    expect(res.body.error.supportedCodes).toEqual(expect.arrayContaining(['en', 'ar']));
  });

  it('GET_languages_returnsSupportedLanguageList', async () => {
    const app = buildApp({}, langService);

    const res = await request(app).get('/api/languages');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].code).toBe('en');
    expect(res.body.data[1].code).toBe('ar');
    expect(res.body.data[1].isRtl).toBe(true);
  });

  it('GET_languages_noAuthRequired', async () => {
    // Languages route is registered before auth middleware — responds without user token
    const app = buildApp({}, langService);

    const res = await request(app).get('/api/languages');
    expect(res.status).toBe(200);
  });

  it('POST_internalCacheInvalidate_invalidatesFormCache', async () => {
    const metadataService = makeMetadataService(async () => makeEnglishFormDefinition());
    const app = buildApp(metadataService, langService);

    const res = await request(app)
      .post('/api/internal/cache/invalidate')
      .send({ formCode: 'test-form' });

    expect(res.status).toBe(200);
    expect(res.body.data.invalidated).toBe(true);
    expect(metadataService.invalidateCache).toHaveBeenCalledWith('test-form');
  });
});
