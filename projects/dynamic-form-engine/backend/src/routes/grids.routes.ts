import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { CrmGridDataService } from '../services/CrmGridDataService.js';
import type { ApiResponse } from '@qdb/shared';
import type { GridRecordPage } from '../services/CrmGridDataService.js';

const SAFE_FIELD_ID = z.string().uuid('fieldId must be a valid UUID');

const gridQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  // Optional: value from the field that drives the dynamic filter
  dependsOnValue: z.string().max(200).optional(),
  // Optional: opaque cursor from previous page response (base64-encoded paging cookie)
  pagingCookie: z.string().max(4000).optional(),
});

export function createGridsRouter(gridDataService: CrmGridDataService): Router {
  const router = Router();

  // GET /api/grids/:fieldId/records?page=1&pageSize=50[&dependsOnValue=...][&pagingCookie=...]
  //
  // Fetches paginated records for a Selection Grid field using FetchXML cursor paging.
  // Filters and entity resolution are performed server-side — callers never supply
  // entity names, view names, or filter expressions directly (security requirement).
  router.get('/:fieldId/records', async (req: Request, res: Response) => {
    const fieldId = SAFE_FIELD_ID.parse(req.params.fieldId);
    const query = gridQuerySchema.parse(req.query);
    const correlationId = req.correlationId;

    const page = await gridDataService.fetchGridRecords(
      fieldId,
      query.page,
      query.pageSize,
      correlationId,
      query.dependsOnValue,
      query.pagingCookie,
    );

    const response: ApiResponse<GridRecordPage> = { success: true, data: page };
    res.json(response);
  });

  return router;
}
