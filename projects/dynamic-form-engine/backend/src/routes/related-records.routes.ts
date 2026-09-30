import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ApiResponse } from '@qdb/shared';
import type { RelatedRecordService } from '../services/RelatedRecordService.js';
import type { PerUserRateLimiter } from '../utils/PerUserRateLimiter.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/related-records/:formCode/:fieldSchemaName/:recordId
 *
 * The columns of a lookup-selected record that the form's rule conditions read
 * (DFE-RULES-002 item 2). The service, not the caller, decides which columns and records are
 * served; the limiter stops one session from enumerating records through it.
 */
export function createRelatedRecordsRouter(
  relatedRecordService: RelatedRecordService,
  rateLimiter: PerUserRateLimiter,
): Router {
  const router = Router();

  router.get('/:formCode/:fieldSchemaName/:recordId', async (req: Request, res: Response) => {
    rateLimiter.consume(req.user?.oid ?? req.ip ?? 'anonymous');
    const { formCode, fieldSchemaName, recordId } = req.params;
    const values = await relatedRecordService.readRuleAttributes({ formCode, fieldSchemaName, recordId });
    // Access record for PDPPL traceability (audit COND-2): who read which columns of which
    // record, through which form. The values themselves are never logged.
    logger.info({
      event: 'related_record_read',
      userOid: req.user?.oid,
      correlationId: req.correlationId,
      formCode,
      fieldSchemaName,
      recordId,
      columns: Object.keys(values),
    }, 'related_record_read');
    const response: ApiResponse<Record<string, unknown>> = { success: true, data: values };
    res.json(response);
  });

  return router;
}
