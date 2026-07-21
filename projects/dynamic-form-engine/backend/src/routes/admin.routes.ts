import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { CrmMetadataService } from '../services/CrmMetadataService.js';
import type { CrmDesignService } from '../services/CrmDesignService.js';
import type { ApiLookupService } from '../services/ApiLookupService.js';
import { ForbiddenError } from '../utils/errors.js';
import { config } from '../config/env.js';
import type { ApiResponse } from '@qdb/shared';

const SAFE_FORM_CODE = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/, 'Invalid form code');

interface CacheInvalidationResult {
  invalidated: string;
  caches: string[];
}

export function createAdminRouter(
  metadataService: CrmMetadataService,
  designService: CrmDesignService,
  apiLookupService: ApiLookupService | null,
): Router {
  const router = Router();

  // GET /api/admin/endpoint-registry/keys — the only registry data ever exposed:
  // the list of active endpoint keys, so the designer can offer an approved-key
  // dropdown. Returns [] when the feature is inactive (never the URLs or credentials).
  router.get('/endpoint-registry/keys', async (req: Request, res: Response) => {
    assertCrmAdminRole(req);
    const keys = apiLookupService ? await apiLookupService.activeKeys() : [];
    const response: ApiResponse<string[]> = { success: true, data: keys };
    res.json(response);
  });

  // POST /api/admin/cache/invalidate/:formCode
  // Invalidates both metadata and design cache for a specific form.
  router.post('/cache/invalidate/:formCode', (req: Request, res: Response) => {
    assertCrmAdminRole(req);
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    metadataService.invalidateCache(formCode);
    designService.invalidateCache(formCode);
    const result: CacheInvalidationResult = { invalidated: formCode, caches: ['metadata', 'design'] };
    const response: ApiResponse<CacheInvalidationResult> = { success: true, data: result };
    res.json(response);
  });

  // POST /api/admin/cache/invalidate/all
  // Clears all design cache entries (metadata cache is too large to purge wholesale;
  // individual forms should be invalidated on the metadata endpoint instead).
  router.post('/cache/invalidate/all', (req: Request, res: Response) => {
    assertCrmAdminRole(req);
    designService.invalidateAllCache();
    const result: CacheInvalidationResult = { invalidated: 'all', caches: ['design'] };
    const response: ApiResponse<CacheInvalidationResult> = { success: true, data: result };
    res.json(response);
  });

  return router;
}

function assertCrmAdminRole(req: Request): void {
  if (config.NODE_ENV === 'development') return;
  const roles = req.user?.roles;
  if (!roles?.includes('CRMAdmin')) {
    throw new ForbiddenError('CRMAdmin role required');
  }
}
