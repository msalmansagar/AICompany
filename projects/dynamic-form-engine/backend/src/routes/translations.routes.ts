import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ApiResponse } from '@qdb/shared';
import type { CrmTranslationWriteService, SavedTranslation } from '../services/CrmTranslationWriteService.js';
import type { CrmLanguageConfigService } from '../services/CrmLanguageConfigService.js';
import { UnsupportedLanguageError } from '../utils/errors.js';

const LANG_REGEX = /^[a-z]{2}(-[A-Z]{2})?$/;

const getQuerySchema = z.object({
  entityName: z.string().min(1).max(100),
  recordId: z.string().uuid(),
});

const upsertBodySchema = z.object({
  entityName: z.string().min(1).max(100),
  recordId: z.string().uuid(),
  fieldName: z.string().min(1).max(100),
  languageCode: z.string().regex(LANG_REGEX).max(10),
  value: z.string().max(4000),
});

const deleteParamSchema = z.object({
  translationId: z.string().uuid(),
});

export function createTranslationsRouter(
  translationWriteService: CrmTranslationWriteService,
  languageConfigService: CrmLanguageConfigService,
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const { entityName, recordId } = getQuerySchema.parse(req.query);
    const translations = await translationWriteService.fetchTranslationsForRecord(entityName, recordId);
    const response: ApiResponse<SavedTranslation[]> = { success: true, data: translations };
    res.json(response);
  });

  router.put('/', async (req: Request, res: Response) => {
    const body = upsertBodySchema.parse(req.body);
    await assertLanguageSupported(body.languageCode, languageConfigService);
    const saved = await translationWriteService.upsertTranslation(body);
    const response: ApiResponse<SavedTranslation> = { success: true, data: saved };
    res.json(response);
  });

  router.delete('/:translationId', async (req: Request, res: Response) => {
    const { translationId } = deleteParamSchema.parse(req.params);
    await translationWriteService.deleteTranslation(translationId);
    res.status(204).send();
  });

  return router;
}

async function assertLanguageSupported(
  code: string,
  languageConfigService: CrmLanguageConfigService,
): Promise<void> {
  const isSupported = await languageConfigService.isLanguageCodeSupported(code);
  if (!isSupported) {
    const langs = await languageConfigService.getSupportedLanguages();
    throw new UnsupportedLanguageError(code, langs.map((l) => l.code));
  }
}
