import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { CrmMetadataService } from '../services/CrmMetadataService.js';
import type { CrmDataService } from '../services/CrmDataService.js';
import type { CrmSubmissionService } from '../services/CrmSubmissionService.js';
import type { CrmDesignService } from '../services/CrmDesignService.js';
import { assertFormAccess } from '../middleware/role.middleware.js';
import type { ApiResponse, FormDefinition, FormSummary, DraftSubmission, DesignPayload } from '@dfe/shared';
import { ForbiddenError } from '../utils/errors.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const SAFE_FORM_CODE = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/, 'Invalid form code');
const SAFE_RECORD_ID = z.string().uuid('recordId must be a valid UUID');

const saveDraftSchema = z.object({
  formDefinitionId: z.string().min(1),
  formCode: z.string().min(1),
  formData: z.record(z.unknown()),
  currentTabIndex: z.number().int().min(0),
});

const submitSchema = z.object({
  formData: z.record(z.unknown()),
});

export function createFormsRouter(
  metadataService: CrmMetadataService,
  dataService: CrmDataService,
  submissionService: CrmSubmissionService,
  designService: CrmDesignService,
): Router {
  const router = Router();

  // GET /api/forms
  router.get('/', async (_req: Request, res: Response) => {
    const forms = await metadataService.listForms();
    const response: ApiResponse<FormSummary[]> = { success: true, data: forms };
    res.json(response);
  });

  // GET /api/forms/:formCode/metadata
  // Fetches form definition and design payload in parallel.
  // Design failures are non-fatal — the DEFAULT_LIGHT_THEME is used as fallback.
  router.get('/:formCode/metadata', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const form = await metadataService.getFormDefinition(formCode);
    assertFormAccess(form, req.user!);

    const design = await fetchDesignWithFallback(designService, formCode, form.id, req.correlationId);
    const response: ApiResponse<FormDefinition & { design: DesignPayload }> = {
      success: true,
      data: { ...form, design },
    };
    res.json(response);
  });

  // GET /api/forms/:formCode/data/:recordId
  router.get('/:formCode/data/:recordId', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const recordId = SAFE_RECORD_ID.parse(req.params.recordId);
    const user = req.user!;

    const form = await metadataService.getFormDefinition(formCode);
    assertFormAccess(form, user);

    const parentMapping = form.submissionMappings.find((m) => !m.isMappedToChildEntity);
    const entityName = parentMapping?.targetEntityLogicalName ?? formCode;
    const record = await dataService.getRecord(entityName, recordId);

    // IDOR ownership check: the submission record must belong to the requesting user.
    // qdb_user_id is the standard user-tracking attribute written by CrmSubmissionService.
    const recordOwnerId = record['qdb_user_id'] as string | undefined;
    if (recordOwnerId && recordOwnerId !== user.oid) {
      throw new ForbiddenError('You do not have access to this record');
    }

    const response: ApiResponse<Record<string, unknown>> = { success: true, data: record };
    res.json(response);
  });

  // POST /api/forms/:formCode/draft
  router.post('/:formCode/draft', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const body = saveDraftSchema.parse(req.body);
    const user = req.user!;
    const form = await metadataService.getFormDefinition(formCode);
    assertFormAccess(form, user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + form.draftExpiryDays);

    const draft: DraftSubmission = {
      id: undefined,
      formDefinitionId: body.formDefinitionId,
      formCode,
      userId: user.oid,
      userDisplayName: user.name ?? user.preferred_username ?? user.oid,
      formData: body.formData,
      currentTabIndex: body.currentTabIndex,
      savedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // Check for existing draft to update
    const existing = await dataService.getDraft(body.formDefinitionId, user.oid);
    if (existing) draft.id = existing.id;

    const saved = await dataService.saveDraft(draft);
    const response: ApiResponse<DraftSubmission> = { success: true, data: saved };
    res.status(draft.id ? 200 : 201).json(response);
  });

  // POST /api/forms/:formCode/submit
  router.post('/:formCode/submit', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const body = submitSchema.parse(req.body);
    const user = req.user!;

    const form = await metadataService.getFormDefinition(formCode);
    assertFormAccess(form, user);
    const result = await submissionService.submitForm(
      form,
      body.formData,
      user.oid,
      user.name ?? user.oid,
    );

    // Delete draft on successful submission
    const draft = await dataService.getDraft(form.id, user.oid);
    if (draft?.id) {
      await dataService.deleteDraft(draft.id).catch(() => {
        /* non-blocking */
      });
    }

    const response: ApiResponse<typeof result> = { success: true, data: result };
    res.status(201).json(response);
  });

  // POST /api/forms/:formCode/validate
  router.post('/:formCode/validate', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const body = submitSchema.parse(req.body);
    const form = await metadataService.getFormDefinition(formCode);
    assertFormAccess(form, req.user!);

    // Server-side validation: check required fields and basic type checks
    const errors: Record<string, string[]> = {};
    for (const tab of form.tabs) {
      for (const section of tab.sections) {
        for (const field of section.fields) {
          for (const rule of field.validationRules.filter((r) => r.isActive && r.ruleType === 'required')) {
            const value = body.formData[field.schemaName];
            const isEmpty = value === null || value === undefined || value === '';
            if (isEmpty) {
              errors[field.id] = [...(errors[field.id] ?? []), rule.errorMessage];
            }
          }
        }
      }
    }

    const hasErrors = Object.keys(errors).length > 0;
    const response: ApiResponse<{ valid: boolean; errors: Record<string, string[]> }> = {
      success: true,
      data: { valid: !hasErrors, errors },
    };

    res.json(response);
  });

  // GET /api/forms/:formCode/versions
  router.get('/:formCode/versions', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const versions = await metadataService.getFormVersions(formCode);
    const response: ApiResponse<typeof versions> = { success: true, data: versions };
    res.json(response);
  });

  return router;
}

// Design fetch is intentionally separated so a Dataverse design service failure
// does not prevent the form from rendering — the frontend can use default styles.
async function fetchDesignWithFallback(
  designService: CrmDesignService,
  formCode: string,
  formDefinitionId: string,
  correlationId: string,
): Promise<DesignPayload> {
  try {
    return await designService.getDesignPayload(formCode, formDefinitionId);
  } catch (error) {
    logger.warn(
      { formCode, correlationId, error },
      'Design service failed — returning default design payload',
    );
    return designService.getDefaultPayload();
  }
}
