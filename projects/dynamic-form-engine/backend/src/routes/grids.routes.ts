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
  dependsOnValue: z.string().max(200).optional(),
  pagingCookie: z.string().max(4000).optional(),
  // Server-side text search — applied as OR LIKE across text-type columns.
  searchText: z.string().max(200).optional(),
  // Server-side sort — attribute must be a configured column; validated in the service.
  sortBy: z.string().max(100).regex(/^[a-z_][a-z0-9_]*$/, 'sortBy must be a lowercase attribute name').optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export function createGridsRouter(gridDataService: CrmGridDataService): Router {
  const router = Router();

  // GET /api/grids/:fieldId/records
  //   ?page=1&pageSize=50
  //   [&dependsOnValue=...][&pagingCookie=...]
  //   [&searchText=...][&sortBy=attribute&sortDirection=asc|desc]
  //
  // All filtering and entity resolution are performed server-side.
  // Callers never supply entity names, view names, or raw filter expressions.
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
      query.searchText,
      query.sortBy,
      query.sortDirection,
    );

    const response: ApiResponse<GridRecordPage> = { success: true, data: page };
    res.json(response);
  });

  return router;
}
