import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import 'express-async-errors';
import { createTranslationsRouter } from './translations.routes.js';
import { errorMiddleware } from '../middleware/error.middleware.js';
import { UnsupportedLanguageError } from '../utils/errors.js';
import type { CrmTranslationWriteService, SavedTranslation } from '../services/CrmTranslationWriteService.js';
import type { CrmLanguageConfigService } from '../services/CrmLanguageConfigService.js';
import type { LanguageConfig } from '@qdb/shared';

const SUPPORTED_LANGS: LanguageConfig[] = [
  { code: 'en', displayName: 'English', isDefault: true, isRtl: false, displayOrder: 1, lcid: 1033 },
  { code: 'ar', displayName: 'Arabic', isDefault: false, isRtl: true, displayOrder: 2, lcid: 1025 },
];

function makeLanguageConfigService(): CrmLanguageConfigService {
  return {
    getSupportedLanguages: vi.fn().mockResolvedValue(SUPPORTED_LANGS),
    isLanguageCodeSupported: vi.fn().mockImplementation(async (code: string) =>
      SUPPORTED_LANGS.some((l) => l.code === code),
    ),
    getLcidForLanguageCode: vi.fn(),
    invalidateCache: vi.fn(),
  } as unknown as CrmLanguageConfigService;
}

const SAVED_TRANSLATION: SavedTranslation = {
  translationId: 'tr-001',
  entityName: 'qdb_form_field',
  recordId: '00000000-0000-0000-0000-000000000001',
  fieldName: 'qdb_label',
  languageCode: 'ar',
  value: 'الاسم الكامل',
};

function makeTranslationWriteService(): CrmTranslationWriteService {
  return {
    upsertTranslation: vi.fn().mockResolvedValue(SAVED_TRANSLATION),
    deleteTranslation: vi.fn().mockResolvedValue(undefined),
    fetchTranslationsForRecord: vi.fn().mockResolvedValue([SAVED_TRANSLATION]),
  } as unknown as CrmTranslationWriteService;
}

function buildApp(
  writeService: CrmTranslationWriteService,
  langService: CrmLanguageConfigService,
): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user: unknown }).user = {
      oid: 'user-001', roles: ['CRMAdmin'], aud: 'dev', iss: 'dev', exp: 9_999_999_999,
    };
    next();
  });
  app.use('/api/design/translations', createTranslationsRouter(writeService, langService));
  app.use(errorMiddleware);
  return app;
}

describe('translations.routes', () => {
  let writeService: CrmTranslationWriteService;
  let langService: CrmLanguageConfigService;

  beforeEach(() => {
    writeService = makeTranslationWriteService();
    langService = makeLanguageConfigService();
  });

  describe('PUT /api/design/translations', () => {
    it('PUT_withValidBody_upserts_and_returns200', async () => {
      const app = buildApp(writeService, langService);

      const res = await request(app)
        .put('/api/design/translations')
        .send({
          entityName: 'qdb_form_field',
          recordId: '00000000-0000-0000-0000-000000000001',
          fieldName: 'qdb_label',
          languageCode: 'ar',
          value: 'الاسم الكامل',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.translationId).toBe('tr-001');
      expect(writeService.upsertTranslation).toHaveBeenCalledOnce();
    });

    it('PUT_withUnsupportedLanguage_returns400', async () => {
      vi.mocked(langService.isLanguageCodeSupported).mockResolvedValue(false);
      const app = buildApp(writeService, langService);

      const res = await request(app)
        .put('/api/design/translations')
        .send({
          entityName: 'qdb_form_field',
          recordId: '00000000-0000-0000-0000-000000000001',
          fieldName: 'qdb_label',
          languageCode: 'xx',
          value: 'test',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_LANGUAGE_CODE');
    });

    it('PUT_withInvalidBody_returns400', async () => {
      const app = buildApp(writeService, langService);

      const res = await request(app)
        .put('/api/design/translations')
        .send({ entityName: 'qdb_form_field' }); // missing required fields

      expect(res.status).toBe(400);
    });

    it('PUT_withValueExceedingMaxLength_returns400', async () => {
      const app = buildApp(writeService, langService);

      const res = await request(app)
        .put('/api/design/translations')
        .send({
          entityName: 'qdb_form_field',
          recordId: '00000000-0000-0000-0000-000000000001',
          fieldName: 'qdb_label',
          languageCode: 'ar',
          value: 'x'.repeat(4001),
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/design/translations', () => {
    it('GET_withEntityAndRecordId_returns200', async () => {
      const app = buildApp(writeService, langService);

      const res = await request(app)
        .get('/api/design/translations')
        .query({
          entityName: 'qdb_form_field',
          recordId: '00000000-0000-0000-0000-000000000001',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].translationId).toBe('tr-001');
      expect(writeService.fetchTranslationsForRecord).toHaveBeenCalledWith(
        'qdb_form_field',
        '00000000-0000-0000-0000-000000000001',
      );
    });

    it('GET_withInvalidRecordId_returns400', async () => {
      const app = buildApp(writeService, langService);

      const res = await request(app)
        .get('/api/design/translations')
        .query({ entityName: 'qdb_form_field', recordId: 'not-a-uuid' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/design/translations/:translationId', () => {
    it('DELETE_withValidId_returns204', async () => {
      const app = buildApp(writeService, langService);

      const res = await request(app)
        .delete('/api/design/translations/00000000-0000-0000-0000-000000000099');

      expect(res.status).toBe(204);
      expect(writeService.deleteTranslation).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000099',
      );
    });

    it('DELETE_withInvalidId_returns400', async () => {
      const app = buildApp(writeService, langService);

      const res = await request(app).delete('/api/design/translations/not-a-uuid');

      expect(res.status).toBe(400);
    });
  });
});
