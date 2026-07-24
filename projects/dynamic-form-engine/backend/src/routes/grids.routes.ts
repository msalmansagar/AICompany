import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { CrmGridDataService } from '../services/CrmGridDataService.js';
import type { ApiResponse } from '@qdb/shared';
import type { GridRecordPage } from '../services/CrmGridDataService.js';

const SAFE_FIELD_ID = z.string().uuid('fieldId must be a valid UUID');

// A query param carrying a JSON object of string→string entries (e.g. columnFilters,
// dependsOnValues). Rejects non-object JSON and over-large maps.
const jsonStringMapSchema = (name: string, maxEntries: number) =>
  z
    .string()
    .max(2000)
    .optional()
    .transform((val, ctx): Record<string, string> | undefined => {
      if (!val) return undefined;
      let parsed: unknown;
      try {
        parsed = JSON.parse(val);
      } catch {
        ctx.addIssue({ code: 'custom', message: `${name} must be valid JSON` });
        return z.NEVER;
      }
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        ctx.addIssue({ code: 'custom', message: `${name} must be a JSON object` });
        return z.NEVER;
      }
      const entries = Object.entries(parsed as Record<string, unknown>);
      if (entries.length > maxEntries) {
        ctx.addIssue({ code: 'custom', message: `${name} exceeds ${maxEntries} entries` });
        return z.NEVER;
      }
      const result: Record<string, string> = {};
      for (const [k, v] of entries) {
        if (typeof v !== 'string') {
          ctx.addIssue({ code: 'custom', message: `${name}['${k}'] must be a string` });
          return z.NEVER;
        }
        result[k] = v;
      }
      return result;
    });

const columnFiltersSchema = jsonStringMapSchema('columnFilters', 20);
const dependsOnValuesSchema = jsonStringMapSchema('dependsOnValues', 20);

const gridQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  dependsOnValue: z.string().max(200).optional(),
  // Multi-field depends-on: JSON map of {placeholder → value}. Single-field forms may
  // still send dependsOnValue; both are merged before resolving the filter template.
  dependsOnValues: dependsOnValuesSchema,
  pagingCookie: z.string().max(4000).optional(),
  // Server-side text search — OR LIKE across text-type columns (global fallback).
  searchText: z.string().max(200).optional(),
  // Server-side sort — attribute must be a configured column; validated in the service.
  sortBy: z.string().max(100).regex(/^[a-z_][a-z0-9_]*$/, 'sortBy must be a lowercase attribute name').optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  // Per-column filters — JSON object keyed by targetAttribute; validated and sanitised in the service.
  columnFilters: columnFiltersSchema,
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

    // Merge the single-field param (back-compat) into the multi-field map;
    // pass undefined when neither was supplied so no depends-on filter is applied.
    const mergedDependsOn = {
      ...(query.dependsOnValues ?? {}),
      ...(query.dependsOnValue !== undefined ? { dependsOnValue: query.dependsOnValue } : {}),
    };
    const dependsOnValues = Object.keys(mergedDependsOn).length > 0 ? mergedDependsOn : undefined;

    const page = await gridDataService.fetchGridRecords(
      fieldId,
      query.page,
      query.pageSize,
      correlationId,
      dependsOnValues,
      query.pagingCookie,
      query.searchText,
      query.sortBy,
      query.sortDirection,
      query.columnFilters,
    );

    const response: ApiResponse<GridRecordPage> = { success: true, data: page };
    res.json(response);
  });

  return router;
}
