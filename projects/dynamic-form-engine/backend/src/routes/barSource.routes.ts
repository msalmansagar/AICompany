import { Router } from 'express';
import type { Request, Response } from 'express';
import type { CrmMetadataService } from '../services/CrmMetadataService.js';
import type { BarSourceService, BarSourceValues } from '../services/BarSourceService.js';
import type { ApiResponse } from '@qdb/shared';

/**
 * DFE-BARSRC-001: the numbers behind a utilization bar, read from the record the user picked.
 *
 * The caller supplies only the form, the field and the record. The entity and the three
 * attributes come from the field's own bar config, so this cannot be used to read columns the
 * maker did not configure.
 */
export function createBarSourceRouter(
  metadataService: CrmMetadataService,
  barSourceService: BarSourceService,
): Router {
  const router = Router();

  // GET /api/bar-source/:fieldId?formCode=&recordId=
  router.get('/:fieldId', async (req: Request, res: Response) => {
    const { fieldId } = req.params;
    const { formCode, recordId } = req.query as { formCode?: string; recordId?: string };

    if (!formCode || !recordId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETER',
          message: 'formCode and recordId query params are required',
          correlationId: req.correlationId,
        },
      });
      return;
    }

    const form = await metadataService.getFormDefinition(formCode);
    const field = form.tabs
      .flatMap((tab) => [
        ...(tab.headerFields ?? []),
        ...(tab.footerFields ?? []),
        ...tab.sections.flatMap((section) => section.fields),
      ])
      .find((candidate) => candidate.id === fieldId);

    if (!field?.barSourceConfig) {
      res.status(404).json({
        success: false,
        error: {
          code: 'BAR_CONFIG_NOT_FOUND',
          message: `Field '${fieldId}' has no bar source configuration`,
          correlationId: req.correlationId,
        },
      });
      return;
    }

    const values = await barSourceService.readValues(field.barSourceConfig, recordId);
    const response: ApiResponse<BarSourceValues> = { success: true, data: values };
    res.json(response);
  });

  return router;
}
