import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { CrmDesignService } from '../services/CrmDesignService.js';
import { ForbiddenError } from '../utils/errors.js';
import type { ApiResponse, DesignPayload, ThemeDefinition } from '@dfe/shared';

const SAFE_FORM_CODE = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/, 'Invalid form code');

// GET /api/themes
// Returns all registered themes for the design studio palette.
export function createThemesRouter(designService: CrmDesignService): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    const themes = await designService.getAllThemes();
    const response: ApiResponse<ThemeDefinition[]> = { success: true, data: themes };
    res.json(response);
  });

  return router;
}

// GET /api/form-design/:formCode?formDefinitionId=<uuid>
// Returns the full design payload for a form. The formDefinitionId is required
// because form code alone is insufficient to query the design tables.
export function createFormDesignRouter(designService: CrmDesignService): Router {
  const router = Router();

  router.get('/:formCode', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const formDefinitionId = z.string().uuid('formDefinitionId must be a valid UUID').parse(req.query.formDefinitionId);
    const payload = await designService.getDesignPayload(formCode, formDefinitionId);
    const response: ApiResponse<DesignPayload> = { success: true, data: payload };
    res.json(response);
  });

  return router;
}

// POST /api/admin/cache/design/invalidate/:formCode
// POST /api/admin/cache/design/invalidate-all
export function createDesignCacheRouter(designService: CrmDesignService): Router {
  const router = Router();

  router.post('/invalidate/:formCode', (req: Request, res: Response) => {
    assertCrmAdminRole(req);
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    designService.invalidateCache(formCode);
    res.json({ success: true, data: { invalidated: formCode } });
  });

  router.post('/invalidate-all', (req: Request, res: Response) => {
    assertCrmAdminRole(req);
    designService.invalidateAllCache();
    res.json({ success: true, data: { invalidated: 'all' } });
  });

  return router;
}

function assertCrmAdminRole(req: Request): void {
  const roles = req.user?.roles;
  if (!roles?.includes('CRMAdmin')) {
    throw new ForbiddenError('CRMAdmin role required for cache invalidation');
  }
}
