import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ApiResponse, LanguageConfig } from '@qdb/shared';
import type { CrmLanguageConfigService } from '../services/CrmLanguageConfigService.js';

export function createLanguagesRouter(
  languageConfigService: CrmLanguageConfigService,
): Router {
  const router = Router();

  // Public — no auth required (toggle must render before authentication in some portal flows).
  router.get('/', async (_req: Request, res: Response) => {
    const languages = await languageConfigService.getSupportedLanguages();
    const response: ApiResponse<LanguageConfig[]> = { success: true, data: languages };
    res.json(response);
  });

  return router;
}
