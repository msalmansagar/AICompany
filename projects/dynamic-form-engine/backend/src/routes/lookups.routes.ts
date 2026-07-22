import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { CrmLookupService } from '../services/CrmLookupService.js';
import type { ApiLookupService } from '../services/ApiLookupService.js';
import { ForbiddenError } from '../utils/errors.js';
import type { ApiResponse, LookupResult, LookupDisplayColumn } from '@qdb/shared';

// DFE-LKPCOL-001 — the frontend passes the display columns as a JSON string; keep only
// well-formed entries with a source attribute.
function parseColumns(json: string | undefined): LookupDisplayColumn[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const columns = parsed
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object' && typeof (c as { attribute?: unknown }).attribute === 'string')
      .map((c) => ({
        attribute: c.attribute as string,
        arabicAttribute: typeof c.arabicAttribute === 'string' ? c.arabicAttribute : undefined,
        header: typeof c.header === 'string' ? c.header : undefined,
      }));
    return columns.length > 0 ? columns : undefined;
  } catch {
    return undefined;
  }
}

// search is optional — omit to return initial records, provide to filter
const querySchema = z.object({
  search: z.string().optional(),
  displayAttribute: z.string().min(1),
  valueAttribute: z.string().optional(),
  filter: z.string().optional(),
  max: z.coerce.number().min(1).max(50).default(10),
  // DFE-LKPCOL-001 — JSON array of { attribute, arabicAttribute?, header? } + form language.
  columns: z.string().optional(),
  lang: z.string().optional(),
});

// DFE-APILOOKUP-001: external-API proxy query. endpointKey resolves server-side;
// the mapping paths are non-sensitive and already present in the browser's form JSON.
const apiQuerySchema = z.object({
  endpointKey: z.string().min(1),
  search: z.string().optional(),
  formCode: z.string().optional(),
  valuePath: z.string().min(1),
  labelPath: z.string().min(1),
  searchParam: z.string().optional(),
  searchMode: z.enum(['typeahead', 'fetchAll']).optional(),
  max: z.coerce.number().min(1).max(50).optional(),
});

export function createLookupsRouter(
  lookupService: CrmLookupService,
  apiLookupService: ApiLookupService | null,
): Router {
  const router = Router();

  // GET /api/lookups/api-lookup — MUST precede the '/:entityName' route so it is
  // not captured as an entity name. Inert (403) when the feature is not active.
  router.get('/api-lookup', async (req: Request, res: Response) => {
    if (!apiLookupService) {
      throw new ForbiddenError('External API lookups are not enabled in this environment');
    }
    const query = apiQuerySchema.parse(req.query);
    const outcome = await apiLookupService.search({
      endpointKey: query.endpointKey,
      search: query.search,
      formCode: query.formCode,
      correlationId: req.correlationId,
      valuePath: query.valuePath,
      labelPath: query.labelPath,
      searchParamName: query.searchParam,
      searchMode: query.searchMode,
      maxResults: query.max,
    });

    const response: ApiResponse<LookupResult[]> = {
      success: true,
      data: outcome.results,
      ...(outcome.warning ? { meta: { warning: outcome.warning } } : {}),
    };
    res.json(response);
  });

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
      displayColumns: parseColumns(query.columns),
      lang: query.lang,
    });

    const response: ApiResponse<LookupResult[]> = { success: true, data: results };
    res.json(response);
  });

  return router;
}
