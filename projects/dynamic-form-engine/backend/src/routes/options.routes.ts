import { Router } from 'express';
import type { Request, Response } from 'express';
import type { CrmMetadataService } from '../services/CrmMetadataService.js';
import type { ApiResponse, OptionValue } from '@qdb/shared';

export function createOptionsRouter(metadataService: CrmMetadataService): Router {
  const router = Router();

  // GET /api/options/:fieldId?parentValue=
  router.get('/:fieldId', async (req: Request, res: Response) => {
    const { fieldId } = req.params;
    const { parentValue, formCode } = req.query as {
      parentValue?: string;
      formCode: string;
    };

    if (!formCode) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FORM_CODE', message: 'formCode query param required', correlationId: req.correlationId } });
      return;
    }

    const form = await metadataService.getFormDefinition(formCode);
    const allFields = form.tabs.flatMap((t) =>
      t.sections.flatMap((s) => s.fields),
    );
    const field = allFields.find((f) => f.id === fieldId);

    if (!field) {
      res.status(404).json({ success: false, error: { code: 'FIELD_NOT_FOUND', message: `Field '${fieldId}' not found`, correlationId: req.correlationId } });
      return;
    }

    let options = field.options ?? [];
    if (parentValue) {
      options = options.filter(
        (o) => !o.parentOptionValue || o.parentOptionValue === parentValue,
      );
    }

    const response: ApiResponse<OptionValue[]> = { success: true, data: options };
    res.json(response);
  });

  return router;
}
