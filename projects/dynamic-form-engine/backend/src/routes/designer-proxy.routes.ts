import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { CrmDesignerProxyService } from '../services/CrmDesignerProxyService.js';
import type { ApiResponse } from '@qdb/shared';

const SAFE_ENTITY = z.string().regex(/^[a-z_]{1,100}$/, 'Invalid entity logical name');
const SAFE_RECORD_ID = z.string().uuid('Record ID must be a valid UUID');
const SAFE_ACTION = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,100}$/, 'Invalid action name');

function extractRawQuery(req: Request): string {
  const url = req.url;
  const qIndex = url.indexOf('?');
  return qIndex >= 0 ? url.slice(qIndex + 1) : '';
}

export function createDesignerProxyRouter(proxyService: CrmDesignerProxyService): Router {
  const router = Router();

  // POST /api/designer/records/_actions/:actionName — invoke an unbound Dataverse action
  // (e.g. qdb_PublishForm). Two path segments, so it never collides with POST /:entity.
  router.post('/_actions/:actionName', async (req: Request, res: Response) => {
    const actionName = SAFE_ACTION.parse(req.params.actionName);
    const data = await proxyService.executeAction(actionName, req.body as Record<string, unknown>);
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  });

  // GET /api/designer/records/:entity[?<odata options>]
  router.get('/:entity', async (req: Request, res: Response) => {
    const entityName = SAFE_ENTITY.parse(req.params.entity);
    const data = await proxyService.listRecords(entityName, extractRawQuery(req));
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  });

  // GET /api/designer/records/:entity/:id[?<odata options>]
  router.get('/:entity/:id', async (req: Request, res: Response) => {
    const entityName = SAFE_ENTITY.parse(req.params.entity);
    const id = SAFE_RECORD_ID.parse(req.params.id);
    const data = await proxyService.getRecord(entityName, id, extractRawQuery(req));
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  });

  // POST /api/designer/records/:entity
  router.post('/:entity', async (req: Request, res: Response) => {
    const entityName = SAFE_ENTITY.parse(req.params.entity);
    const result = await proxyService.createRecord(entityName, req.body as Record<string, unknown>);
    const response: ApiResponse<typeof result> = { success: true, data: result };
    res.status(201).json(response);
  });

  // PATCH /api/designer/records/:entity/:id
  router.patch('/:entity/:id', async (req: Request, res: Response) => {
    const entityName = SAFE_ENTITY.parse(req.params.entity);
    const id = SAFE_RECORD_ID.parse(req.params.id);
    await proxyService.updateRecord(entityName, id, req.body as Record<string, unknown>);
    res.status(204).send();
  });

  // DELETE /api/designer/records/:entity/:id
  router.delete('/:entity/:id', async (req: Request, res: Response) => {
    const entityName = SAFE_ENTITY.parse(req.params.entity);
    const id = SAFE_RECORD_ID.parse(req.params.id);
    await proxyService.deleteRecord(entityName, id);
    res.status(204).send();
  });

  return router;
}
