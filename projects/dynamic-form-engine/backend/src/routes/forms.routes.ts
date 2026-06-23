import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { CrmMetadataService } from '../services/CrmMetadataService.js';
import type { CrmDataService } from '../services/CrmDataService.js';
import type { CrmSubmissionService } from '../services/CrmSubmissionService.js';
import type { CrmDesignService } from '../services/CrmDesignService.js';
import type { CrmFormCloneService } from '../services/CrmFormCloneService.js';
import type { AccessPolicyService, AccessType } from '../services/AccessPolicyService.js';
import type { CrmInfoCardService } from '../services/CrmInfoCardService.js';
import { assertFormAccess } from '../middleware/role.middleware.js';
import type { ApiResponse, FormDefinition, FormSummary, DraftSubmission, DesignPayload } from '@qdb/shared';
import { ForbiddenError } from '../utils/errors.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const SAFE_FORM_CODE = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/, 'Invalid form code');
const SAFE_RECORD_ID = z.string().uuid('recordId must be a valid UUID');
const SAFE_SEARCH = z.string().max(100).regex(/^[^']*$/, 'Invalid search query').optional();
const VALID_STATUS = z.enum(['draft', 'active', 'inactive', 'archived']).optional();

const saveDraftSchema = z.object({
  formDefinitionId: z.string().min(1),
  formCode: z.string().min(1),
  formData: z.record(z.unknown()),
  currentTabIndex: z.number().int().min(0),
  // DFE-ADD-002: grid schema hash for Entry Grid draft invalidation (optional).
  gridSchemaHash: z.record(z.string()).optional(),
  // DFE-ADD-001: first-view flag for draft-present users (optional).
  infoCardViewed: z.boolean().optional(),
});

const infoCardViewedSchema = z.object({
  userAadObjectId: z.string().min(1, 'userAadObjectId is required'),
});

const submitSchema = z.object({
  formData: z.record(z.unknown()),
});

export function createFormsRouter(
  metadataService: CrmMetadataService,
  dataService: CrmDataService,
  submissionService: CrmSubmissionService,
  designService: CrmDesignService,
  cloneService: CrmFormCloneService,
  policyService: AccessPolicyService | null,
  infoCardService: CrmInfoCardService | null = null,
): Router {
  const router = Router();

  // GET /api/forms[?search=query&status=active|draft|inactive|archived]
  router.get('/', async (req: Request, res: Response) => {
    const search = SAFE_SEARCH.parse(req.query.search as string | undefined);
    const status = VALID_STATUS.parse(req.query.status as string | undefined);
    const forms = await metadataService.listForms({ search, status });
    const response: ApiResponse<FormSummary[]> = { success: true, data: forms };
    res.json(response);
  });

  // GET /api/forms/:formCode/metadata
  // Fetches form definition and design payload in parallel.
  // Design failures are non-fatal â€” the DEFAULT_LIGHT_THEME is used as fallback.
  router.get('/:formCode/metadata', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const locale = extractLocale(req);
    const form = await metadataService.getFormDefinition(formCode, locale);
    assertFormAccess(form, req.user!);
    await assertPolicyAccess(policyService, form.id, req.user!.roles ?? [], 'view');

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
    await assertPolicyAccess(policyService, form.id, user.roles ?? [], 'view');

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
    await assertPolicyAccess(policyService, form.id, user.roles ?? [], 'draft');

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
    await assertPolicyAccess(policyService, form.id, user.roles ?? [], 'submit');
    const result = await submissionService.submitForm(
      form,
      body.formData,
      user.oid,
      user.name ?? user.oid,
    );

    // Delete draft on successful submission â€” non-blocking; entity may not exist yet
    await dataService.getDraft(form.id, user.oid)
      .then((draft) => {
        if (draft?.id) return dataService.deleteDraft(draft.id);
      })
      .catch(() => { /* non-blocking */ });

    const response: ApiResponse<typeof result> = { success: true, data: result };
    res.status(201).json(response);
  });

  // POST /api/forms/:formCode/validate
  router.post('/:formCode/validate', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const body = submitSchema.parse(req.body);
    const form = await metadataService.getFormDefinition(formCode);
    assertFormAccess(form, req.user!);
    await assertPolicyAccess(policyService, form.id, req.user!.roles ?? [], 'view');

    // Server-side validation: check required fields and basic type checks
    const errors: Record<string, string[]> = {};
    for (const tab of form.tabs) {
      for (const section of tab.sections) {
        for (const field of section.fields) {
          const value = body.formData[field.schemaName];
          const isEmpty =
            value === null ||
            value === undefined ||
            value === '' ||
            (Array.isArray(value) && value.length === 0);

          const hasExplicitRequiredRule = field.validationRules.some(
            (r) => r.isActive && r.ruleType === 'required',
          );

          if (field.isRequired && !hasExplicitRequiredRule && isEmpty) {
            errors[field.id] = [...(errors[field.id] ?? []), `${field.label} is required`];
          }

          for (const rule of field.validationRules.filter((r) => r.isActive && r.ruleType === 'required')) {
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

  // GET /api/forms/:formCode/infocard-view-status
  // Checks whether the authenticated user has previously viewed the Info-Card screens
  // for this form. Result is cached client-side for the session duration.
  // Latency target: < 100ms (single Dataverse lookup by alternate key).
  router.get('/:formCode/infocard-view-status', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const user = req.user!;

    const form = await metadataService.getFormDefinition(formCode);
    assertFormAccess(form, user);

    const hasViewed = infoCardService
      ? await infoCardService.hasUserViewedInfoCard(user.oid, form.id, req.correlationId)
      : false;

    const response: ApiResponse<{ hasViewed: boolean }> = { success: true, data: { hasViewed } };
    res.json(response);
  });

  // POST /api/forms/:formCode/info-card-viewed
  // Fire-and-forget audit endpoint. Records the first view of Info-Card screens.
  // CEO condition BC-006: duplicate alternate key (concurrent-open race) treated as success.
  // Responds within 200ms — Dataverse write is async (non-blocking).
  router.post('/:formCode/info-card-viewed', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const body = infoCardViewedSchema.parse(req.body);

    const form = await metadataService.getFormDefinition(formCode);
    assertFormAccess(form, req.user!);

    // Respond immediately — Dataverse write is fire-and-forget.
    const response: ApiResponse<{ success: boolean }> = { success: true, data: { success: true } };
    res.json(response);

    // Non-blocking: write the view record after response is sent.
    if (infoCardService) {
      infoCardService
        .recordInfoCardView(body.userAadObjectId, form.id, req.correlationId)
        .catch((error) =>
          logger.error(
            { error, formCode, correlationId: req.correlationId, operation: 'infoCardViewed' },
            'Info card view record write failed (post-response)',
          ),
        );
    }
  });

  // POST /api/forms/:formCode/clone
  // Creates a deep copy of a form (tabs → sections → fields → options/lookups/rules).
  // The clone starts in Draft status with a timestamped code suffix.
  router.post('/:formCode/clone', async (req: Request, res: Response) => {
    const formCode = SAFE_FORM_CODE.parse(req.params.formCode);
    const user = req.user!;

    const form = await metadataService.getFormDefinition(formCode);
    assertFormAccess(form, user);
    await assertPolicyAccess(policyService, form.id, user.roles ?? [], 'view');

    const result = await cloneService.cloneForm(formCode, user.oid);
    const response: ApiResponse<{ newFormId: string; newFormCode: string }> = {
      success: true,
      data: result,
    };
    res.status(201).json(response);
  });

  return router;
}

function extractLocale(req: Request): string | undefined {
  const header = req.headers['accept-language'];
  if (!header) return undefined;
  const primary = header.split(',')[0]?.split(';')[0]?.trim();
  return primary || undefined;
}

async function assertPolicyAccess(
  policyService: AccessPolicyService | null,
  formId: string,
  userRoles: string[],
  accessType: AccessType,
): Promise<void> {
  if (policyService) {
    await policyService.assertAccess(formId, userRoles, accessType);
  }
}

// Design fetch is intentionally separated so a Dataverse design service failure
// does not prevent the form from rendering â€” the frontend can use default styles.
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
      'Design service failed â€” returning default design payload',
    );
    return designService.getDefaultPayload();
  }
}
