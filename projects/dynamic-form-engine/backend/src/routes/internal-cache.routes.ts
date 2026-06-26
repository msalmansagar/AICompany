import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ApiResponse } from '@qdb/shared';
import type { CrmMetadataService } from '../services/CrmMetadataService.js';
import type { CrmLanguageConfigService } from '../services/CrmLanguageConfigService.js';
import type { IRenderCacheStore } from '../services/RenderCacheStore.js';

const invalidateSchema = z.object({
  formCode: z.string().min(1).optional(),
  target: z.enum(['languages', 'renderCache']).optional(),
});

export function createInternalCacheRouter(
  metadataService: CrmMetadataService,
  languageConfigService: CrmLanguageConfigService,
  renderCacheStore: IRenderCacheStore | null = null,
): Router {
  const router = Router();

  router.post('/invalidate', async (req: Request, res: Response) => {
    const body = invalidateSchema.parse(req.body);

    if (body.target === 'languages') {
      languageConfigService.invalidateCache();
    }

    if (body.formCode) {
      metadataService.invalidateCache(body.formCode);
    }

    // Invalidate the render cache store for this form code when provided.
    // Triggered on any formCode invalidation or when target === 'renderCache'.
    if (renderCacheStore && body.formCode) {
      await renderCacheStore.invalidate(body.formCode);
    }

    const response: ApiResponse<{ invalidated: true }> = {
      success: true,
      data: { invalidated: true },
    };
    res.json(response);
  });

  return router;
}
