import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { CrmLookupService } from '../services/CrmLookupService.js';
import type { ApiResponse, LookupResult } from '@dfe/shared';

const querySchema = z.object({
  search: z.string().min(1),
  displayAttribute: z.string().min(1),
  valueAttribute: z.string().default('id'),
  filter: z.string().optional(),
  max: z.coerce.number().min(1).max(50).default(10),
});

export function createLookupsRouter(lookupService: CrmLookupService): Router {
  const router = Router();

  router.get('/:entityName', async (req: Request, res: Response) => {
    const { entityName } = req.params;
    const query = querySchema.parse(req.query);

    const results = await lookupService.searchLookup({
      entityLogicalName: entityName,
      displayAttribute: query.displayAttribute,
      valueAttribute: query.valueAttribute,
      searchTerm: query.search,
      filterExpression: query.filter,
      maxResults: query.max,
    });

    const response: ApiResponse<LookupResult[]> = { success: true, data: results };
    res.json(response);
  });

  return router;
}
