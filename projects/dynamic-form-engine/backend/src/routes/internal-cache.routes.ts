import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ApiResponse } from '@qdb/shared';
import type { CrmMetadataService } from '../services/CrmMetadataService.js';
import type { CrmLanguageConfigService } from '../services/CrmLanguageConfigService.js';

const invalidateSchema = z.object({
  formCode: z.string().min(1).optional(),
  target: z.enum(['languages']).optional(),
});

export function createInternalCacheRouter(
  metadataService: CrmMetadataService,
  languageConfigService: CrmLanguageConfigService,
): Router {
  const router = Router();

  router.post('/invalidate', (req: Request, res: Response) => {
    const body = invalidateSchema.parse(req.body);

    if (body.target === 'languages') {
      languageConfigService.invalidateCache();
    }

    if (body.formCode) {
      metadataService.invalidateCache(body.formCode);
    }

    const response: ApiResponse<{ invalidated: true }> = {
      success: true,
      data: { invalidated: true },
    };
    res.json(response);
  });

  return router;
}
