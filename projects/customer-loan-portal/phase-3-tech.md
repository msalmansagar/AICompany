# Technical Build Document
## Customer Loan Portal & RM Workspace
**Agents:** Backend + Frontend + CRM On-Premise + Middleware (Parallel)
**Date:** 2026-05-06
**Version:** 1.1 — Revised for Dynamics CRM on-premise; Power Automate / Dataverse / PCF removed; BMP module referenced for workflow; CrmRepository replaces DataverseRepository

---

# PART A — BACKEND (Node.js + Fastify + Prisma)

## A.1 Project Structure

```
packages/api/
  src/
    server.ts                    — Fastify server bootstrap
    app.ts                       — Plugin registration, route registration
    config/
      env.ts                     — Zod-validated environment schema
    plugins/
      auth.ts                    — JWT verification plugin (Azure AD B2C + Azure AD)
      crm.ts                     — CRM on-premise Web API client plugin
      blobStorage.ts             — Azure Blob Storage plugin
    routes/
      health.ts                  — GET /health
      facilities.ts              — GET /api/v1/facilities
      applications/
        index.ts                 — GET /api/v1/applications
        draft.ts                 — POST /api/v1/applications/draft
        update.ts                — PUT /api/v1/applications/:id
        submit.ts                — POST /api/v1/applications/:id/submit
        status.ts                — GET /api/v1/applications/:id/status
        validate.ts              — POST /api/v1/applications/:id/validate
        workflow.ts              — GET /api/v1/applications/:id/workflow
        documents.ts             — POST /api/v1/applications/:id/documents
        merge.ts                 — POST /api/v1/applications/merge
        split.ts                 — POST /api/v1/applications/:id/split
      rm/
        dashboard.ts             — GET /api/v1/rm/dashboard
      notifications/
        index.ts                 — GET /api/v1/notifications
        markRead.ts              — PUT /api/v1/notifications/:id/read
    services/
      ApplicationService.ts      — Draft CRUD, submit orchestration
      FacilityService.ts         — Fetch facilities from Dynamics CRM on-premise
      MergeService.ts            — Merge algorithm
      SplitService.ts            — Split algorithm
      DocumentService.ts         — Upload to Azure Blob, write document record to CRM
      ValidationService.ts       — Request type conflict matrix, rule checks
      WorkflowService.ts         — BMP stage queries (read current stage from CRM)
      NotificationService.ts     — Portal notifications (write to CRM portal notification entity)
      AuditService.ts            — Write audit log to CRM maq_auditlog entity
    repositories/
      DraftRepository.ts         — PostgreSQL draft operations via Prisma
      CrmRepository.ts           — Generic Dynamics CRM on-premise OData CRUD wrapper (replaces DataverseRepository)
    schemas/
      applicationSchemas.ts      — Zod schemas for all request/response types
      facilitySchemas.ts
      mergeSchemas.ts
      splitSchemas.ts
      documentSchemas.ts
    errors/
      DomainError.ts             — Typed domain error class
      ValidationError.ts
      CrmError.ts
    types/
      crm.d.ts                   — Dynamics CRM on-premise entity type definitions
      portal.d.ts                — Portal-side types
  prisma/
    schema.prisma                — PostgreSQL schema for draft state
  tests/
    unit/
      services/
      repositories/
    integration/
      routes/
```

## A.2 Prisma Schema (PostgreSQL — Draft State)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model DraftApplication {
  id                String    @id @default(uuid())
  customerId        String
  customerCif       String
  status            DraftStatus @default(DRAFT)
  referenceNumber   String?
  dataversId        String?   // Set after submission
  customerRemarks   String?
  draftData         Json      // Full draft JSON payload
  facilitiesCount   Int       @default(0)
  totalAmount       Decimal   @default(0)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  submittedAt       DateTime?

  facilities        DraftFacility[]
  documents         DraftDocument[]

  @@index([customerId])
  @@index([customerCif])
}

enum DraftStatus {
  DRAFT
  SUBMITTED
  FAILED
}

model DraftFacility {
  id              String   @id @default(uuid())
  applicationId   String
  facilityType    String
  existingRef     String?
  facilityName    String
  productType     String
  currency        String
  currentLimit    Decimal  @default(0)
  requestedAmount Decimal
  tenorMonths     Int?
  purpose         String?
  expiryDate      DateTime?
  lineSequence    Int
  requestTypes    Json     // Array of request type objects
  createdAt       DateTime @default(now())

  application     DraftApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
}

model DraftDocument {
  id              String   @id @default(uuid())
  applicationId   String
  facilityId      String?
  documentType    String
  documentName    String
  blobPath        String
  fileSizeKb      Int
  mimeType        String
  isRequired      Boolean  @default(false)
  uploadStatus    String   @default("uploaded")
  createdAt       DateTime @default(now())

  application     DraftApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
}
```

## A.3 Key Service Implementations

### A.3.1 ValidationService — Conflict Matrix

```typescript
// src/services/ValidationService.ts

import { DraftFacility } from '@prisma/client';
import { ValidationError } from '../errors/ValidationError';

type RequestType =
  | 'NewFacility'
  | 'Renewal'
  | 'LimitIncrease'
  | 'Rescheduling'
  | 'ExtensionOfDrawdown'
  | 'OwnershipChange'
  | 'FacilityAmendment';

interface ConflictPair {
  typeA: RequestType;
  typeB: RequestType;
  reason: string;
}

const CONFLICT_MATRIX: ConflictPair[] = [
  {
    typeA: 'Renewal',
    typeB: 'Rescheduling',
    reason: 'Renewal resets facility terms; Rescheduling modifies the existing payment schedule. These are mutually exclusive on the same facility.',
  },
  {
    typeA: 'Renewal',
    typeB: 'ExtensionOfDrawdown',
    reason: 'Renewal closes the current facility period; Extension of Drawdown extends the existing drawdown window.',
  },
  {
    typeA: 'LimitIncrease',
    typeB: 'OwnershipChange',
    reason: 'Ownership change may invalidate the credit assessment underpinning the limit increase request.',
  },
  {
    typeA: 'Rescheduling',
    typeB: 'ExtensionOfDrawdown',
    reason: 'Both Rescheduling and Extension of Drawdown modify the repayment timeline and cannot be processed simultaneously.',
  },
];

export class ValidationService {
  validateConflicts(facilities: DraftFacility[]): void {
    for (const facility of facilities) {
      const requestTypes = facility.requestTypes as RequestType[];
      this.checkConflictsForFacility(facility.id, requestTypes);
    }
  }

  private checkConflictsForFacility(facilityId: string, requestTypes: RequestType[]): void {
    for (const conflict of CONFLICT_MATRIX) {
      const hasTypeA = requestTypes.includes(conflict.typeA);
      const hasTypeB = requestTypes.includes(conflict.typeB);
      if (hasTypeA && hasTypeB) {
        throw new ValidationError(
          `Facility ${facilityId} has conflicting request types: ${conflict.typeA} and ${conflict.typeB}. ${conflict.reason}`,
          'CONFLICTING_REQUEST_TYPES',
          { facilityId, typeA: conflict.typeA, typeB: conflict.typeB },
        );
      }
    }
  }

  validateNoDuplicateRequests(facilities: DraftFacility[]): void {
    const seen = new Set<string>();
    for (const facility of facilities) {
      const requestTypes = facility.requestTypes as RequestType[];
      for (const requestType of requestTypes) {
        const key = `${facility.existingRef ?? facility.id}:${requestType}`;
        if (seen.has(key)) {
          throw new ValidationError(
            `Duplicate request type "${requestType}" found for facility "${facility.facilityName}".`,
            'DUPLICATE_REQUEST_TYPE',
            { facilityId: facility.id, requestType },
          );
        }
        seen.add(key);
      }
    }
  }

  validateMinimumFacilities(facilitiesCount: number): void {
    if (facilitiesCount === 0) {
      throw new ValidationError(
        'Application must contain at least one facility or new facility request.',
        'NO_FACILITIES',
      );
    }
  }
}
```

### A.3.2 MergeService

```typescript
// src/services/MergeService.ts

import { CrmRepository } from '../repositories/CrmRepository';
import { AuditService } from './AuditService';
import { ValidationError } from '../errors/ValidationError';
import { DomainError } from '../errors/DomainError';
import { logger } from '../plugins/logger';

interface MergeRequest {
  masterApplicationId: string;
  sourceApplicationIds: string[];
  performedByUserId: string;
  performedByName: string;
  correlationId: string;
}

const ELIGIBLE_MERGE_STATUSES = ['submitted', 'rm_review'];

export class MergeService {
  constructor(
    private readonly crmRepo: CrmRepository,
    private readonly auditService: AuditService,
  ) {}

  async mergeApplications(request: MergeRequest): Promise<void> {
    const { masterApplicationId, sourceApplicationIds, performedByUserId, correlationId } = request;

    logger.info({ correlationId, masterApplicationId, sourceCount: sourceApplicationIds.length }, 'merge.started');

    const masterApp = await this.crmRepo.getApplication(masterApplicationId);
    if (!masterApp) {
      throw new DomainError('MASTER_APP_NOT_FOUND', `Application ${masterApplicationId} not found`);
    }

    const sourceApps = await Promise.all(
      sourceApplicationIds.map((id) => this.crmRepo.getApplication(id)),
    );

    this.validateMergeEligibility(masterApp, sourceApps);
    await this.validateNoDuplicateFacilityRequests(masterApplicationId, sourceApps);

    for (const sourceApp of sourceApps) {
      if (!sourceApp) continue;
      await this.moveRecordsToMaster(sourceApp.maq_loanapplicationid, masterApplicationId);
      await this.markSourceAsMerged(sourceApp.maq_loanapplicationid, masterApplicationId);
      await this.createMergeHistoryRecord(masterApplicationId, sourceApp.maq_loanapplicationid, request);
      await this.auditService.logEvent({
        entityName: 'maq_loanapplication',
        recordId: sourceApp.maq_loanapplicationid,
        actionType: 'MergeCompleted',
        actorUserId: performedByUserId,
        actorName: request.performedByName,
        actorSource: 'CRM',
        newValue: { mergedInto: masterApplicationId },
        correlationId,
        description: `Application merged into master application ${masterApp.maq_referencenumber}`,
      });
    }

    await this.crmRepo.recalculateApplicationTotals(masterApplicationId);
    await this.crmRepo.resetApplicationWorkflowStage(masterApplicationId, 'rm_review');

    logger.info({ correlationId, masterApplicationId }, 'merge.completed');
  }

  private validateMergeEligibility(masterApp: CrmApplication, sourceApps: (CrmApplication | null)[]): void {
    const masterId = masterApp.maq_loanapplicationid;
    const masterCustomerId = masterApp._maq_customerid_value;

    for (const sourceApp of sourceApps) {
      if (!sourceApp) {
        throw new DomainError('SOURCE_APP_NOT_FOUND', 'One or more source applications not found');
      }
      if (sourceApp.maq_loanapplicationid === masterId) {
        throw new ValidationError('Source application cannot be the same as the master application', 'SELF_MERGE');
      }
      if (sourceApp._maq_customerid_value !== masterCustomerId) {
        throw new ValidationError(
          `Application ${sourceApp.maq_referencenumber} belongs to a different customer`,
          'CROSS_CUSTOMER_MERGE',
        );
      }
      if (!ELIGIBLE_MERGE_STATUSES.includes(sourceApp.maq_status)) {
        throw new ValidationError(
          `Application ${sourceApp.maq_referencenumber} is in status "${sourceApp.maq_status}" and cannot be merged`,
          'INELIGIBLE_STATUS_FOR_MERGE',
          { applicationId: sourceApp.maq_loanapplicationid, status: sourceApp.maq_status },
        );
      }
    }
  }

  private async validateNoDuplicateFacilityRequests(
    masterApplicationId: string,
    sourceApps: (CrmApplication | null)[],
  ): Promise<void> {
    const masterFacilityKeys = await this.crmRepo.getFacilityRequestKeys(masterApplicationId);
    const seen = new Set(masterFacilityKeys);

    for (const sourceApp of sourceApps) {
      if (!sourceApp) continue;
      const sourceKeys = await this.crmRepo.getFacilityRequestKeys(sourceApp.maq_loanapplicationid);
      for (const key of sourceKeys) {
        if (seen.has(key)) {
          throw new ValidationError(
            `Duplicate facility + request type combination detected across applications being merged: ${key}`,
            'DUPLICATE_FACILITY_REQUEST_IN_MERGE',
            { duplicateKey: key },
          );
        }
        seen.add(key);
      }
    }
  }

  private async moveRecordsToMaster(sourceAppId: string, masterAppId: string): Promise<void> {
    await this.crmRepo.reassignFacilitiesToApplication(sourceAppId, masterAppId);
    await this.crmRepo.reassignRequestTypesToApplication(sourceAppId, masterAppId);
    await this.crmRepo.reassignDocumentsToApplication(sourceAppId, masterAppId);
  }

  private async markSourceAsMerged(sourceAppId: string, masterAppId: string): Promise<void> {
    await this.crmRepo.updateApplication(sourceAppId, {
      maq_status: 'merged',
      maq_mergesplittype: 'merged_into',
      maq_parentapplicationid: masterAppId,
    });
  }

  private async createMergeHistoryRecord(
    masterAppId: string,
    sourceAppId: string,
    request: MergeRequest,
  ): Promise<void> {
    await this.crmRepo.createMergeHistory({
      maq_masterapplicationid: masterAppId,
      maq_sourceapplicationid: sourceAppId,
      maq_mergedby: request.performedByUserId,
      maq_mergedon: new Date().toISOString(),
    });
  }
}
```

### A.3.3 SplitService

```typescript
// src/services/SplitService.ts

import { CrmRepository } from '../repositories/CrmRepository';
import { AuditService } from './AuditService';
import { ValidationError } from '../errors/ValidationError';
import { DomainError } from '../errors/DomainError';
import { logger } from '../plugins/logger';

interface SplitRequest {
  parentApplicationId: string;
  selectedFacilityIds: string[];
  selectedRequestTypeIds: string[];
  splitReason: string;
  performedByUserId: string;
  performedByName: string;
  correlationId: string;
}

const NON_SPLITTABLE_STATUSES = ['approved', 'disbursement', 'completed', 'rejected', 'cancelled', 'merged'];

export class SplitService {
  constructor(
    private readonly crmRepo: CrmRepository,
    private readonly auditService: AuditService,
  ) {}

  async splitApplication(request: SplitRequest): Promise<string> {
    const { parentApplicationId, selectedFacilityIds, correlationId } = request;

    logger.info({ correlationId, parentApplicationId, selectedCount: selectedFacilityIds.length }, 'split.started');

    const parentApp = await this.crmRepo.getApplication(parentApplicationId);
    if (!parentApp) {
      throw new DomainError('PARENT_APP_NOT_FOUND', `Application ${parentApplicationId} not found`);
    }

    await this.validateSplitEligibility(parentApp, request);

    const childRefNumber = await this.generateChildReferenceNumber(parentApplicationId, parentApp.maq_referencenumber);
    const childAppId = await this.createChildApplication(parentApp, childRefNumber);

    await this.moveSelectedRecordsToChild(request, childAppId);
    await this.markParentAsBranched(parentApplicationId);
    await this.crmRepo.recalculateApplicationTotals(parentApplicationId);
    await this.crmRepo.recalculateApplicationTotals(childAppId);
    await this.createSplitHistoryRecord(parentApplicationId, childAppId, request);

    await this.auditService.logEvent({
      entityName: 'maq_loanapplication',
      recordId: parentApplicationId,
      actionType: 'SplitCompleted',
      actorUserId: request.performedByUserId,
      actorName: request.performedByName,
      actorSource: 'CRM',
      newValue: { childApplicationId: childAppId, childReferenceNumber: childRefNumber },
      correlationId,
      description: `Application split. Child application created: ${childRefNumber}`,
    });

    logger.info({ correlationId, parentApplicationId, childAppId, childRefNumber }, 'split.completed');
    return childAppId;
  }

  private async validateSplitEligibility(parentApp: CrmApplication, request: SplitRequest): Promise<void> {
    if (NON_SPLITTABLE_STATUSES.includes(parentApp.maq_status)) {
      throw new ValidationError(
        `Application in status "${parentApp.maq_status}" cannot be split`,
        'INELIGIBLE_STATUS_FOR_SPLIT',
      );
    }

    const hasSplitPrivilege = await this.crmRepo.userHasPrivilege(
      request.performedByUserId,
      'maq_CanMergeSplit',
    );
    if (!hasSplitPrivilege) {
      throw new ValidationError('User does not have permission to split applications', 'INSUFFICIENT_PRIVILEGE');
    }

    const totalFacilities = await this.crmRepo.countFacilities(request.parentApplicationId);
    if (totalFacilities - request.selectedFacilityIds.length < 1) {
      throw new ValidationError(
        'At least one facility must remain in the original application after split',
        'INSUFFICIENT_REMAINING_FACILITIES',
      );
    }
  }

  private async generateChildReferenceNumber(parentAppId: string, parentRefNumber: string): Promise<string> {
    const branchCount = await this.crmRepo.countExistingSplits(parentAppId);
    return `${parentRefNumber}-B${branchCount + 1}`;
  }

  private async createChildApplication(
    parentApp: CrmApplication,
    childRefNumber: string,
  ): Promise<string> {
    return this.crmRepo.createApplication({
      maq_referencenumber: childRefNumber,
      maq_customerid: parentApp._maq_customerid_value,
      maq_status: 'submitted',
      maq_parentapplicationid: parentApp.maq_loanapplicationid,
      maq_mergesplittype: 'split_from',
      maq_assignedrmid: parentApp._maq_assignedrmid_value,
    });
  }

  private async moveSelectedRecordsToChild(request: SplitRequest, childAppId: string): Promise<void> {
    await this.crmRepo.reassignSpecificFacilitiesToApplication(
      request.selectedFacilityIds,
      childAppId,
    );
    await this.crmRepo.reassignSpecificRequestTypesToApplication(
      request.selectedRequestTypeIds,
      childAppId,
    );
    await this.crmRepo.reassignDocumentsForFacilitiesToApplication(
      request.selectedFacilityIds,
      childAppId,
    );
  }

  private async markParentAsBranched(parentAppId: string): Promise<void> {
    await this.crmRepo.updateApplication(parentAppId, {
      maq_mergesplittype: 'branched',
    });
  }

  private async createSplitHistoryRecord(
    parentAppId: string,
    childAppId: string,
    request: SplitRequest,
  ): Promise<void> {
    await this.crmRepo.createSplitHistory({
      maq_parentapplicationid: parentAppId,
      maq_childapplicationid: childAppId,
      maq_splitby: request.performedByUserId,
      maq_spliton: new Date().toISOString(),
      maq_facilitiesmoved: JSON.stringify(request.selectedFacilityIds),
      maq_requesttypesmoved: JSON.stringify(request.selectedRequestTypeIds),
      maq_splitreason: request.splitReason,
    });
  }
}
```

### A.3.4 Zod Schemas

```typescript
// src/schemas/applicationSchemas.ts
import { z } from 'zod';

export const RequestTypeSchema = z.enum([
  'NewFacility',
  'Renewal',
  'LimitIncrease',
  'Rescheduling',
  'ExtensionOfDrawdown',
  'OwnershipChange',
  'FacilityAmendment',
]);

export const CreateDraftSchema = z.object({
  customerRemarks: z.string().max(2000).optional(),
});

export const FacilityLineSchema = z.object({
  facilityType: z.enum(['Existing', 'New']),
  existingRef: z.string().max(100).optional(),
  facilityName: z.string().min(1).max(100),
  productType: z.string().min(1),
  currency: z.string().length(3),
  currentLimit: z.number().min(0).optional(),
  requestedAmount: z.number().positive(),
  tenorMonths: z.number().int().positive().optional(),
  purpose: z.string().max(2000).optional(),
  expiryDate: z.string().datetime().optional(),
  lineSequence: z.number().int().min(1),
  requestTypes: z.array(RequestTypeSchema).min(1),
  customerRemarks: z.string().max(2000).optional(),
});

export const UpdateApplicationSchema = z.object({
  customerRemarks: z.string().max(2000).optional(),
  facilities: z.array(FacilityLineSchema).min(1).max(50),
});

export const MergeApplicationsSchema = z.object({
  masterApplicationId: z.string().uuid(),
  sourceApplicationIds: z.array(z.string().uuid()).min(1).max(9),
  mergeNotes: z.string().max(2000).optional(),
});

export const SplitApplicationSchema = z.object({
  selectedFacilityIds: z.array(z.string().uuid()).min(1),
  selectedRequestTypeIds: z.array(z.string().uuid()).min(1),
  splitReason: z.string().min(10).max(2000),
});
```

### A.3.5 API Route — Submit Application

```typescript
// src/routes/applications/submit.ts
import type { FastifyPluginAsync } from 'fastify';
import { ApplicationService } from '../../services/ApplicationService';
import { ValidationService } from '../../services/ValidationService';
import { AuditService } from '../../services/AuditService';

const submitRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>(
    '/api/v1/applications/:id/submit',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { customerCif, userId } = request.user;

      const applicationService = new ApplicationService(fastify.prisma, fastify.crm, fastify.auditService);
      const validationService = new ValidationService();

      const draft = await applicationService.getDraftForCustomer(id, customerCif);

      validationService.validateMinimumFacilities(draft.facilitiesCount);
      validationService.validateConflicts(draft.facilities);
      validationService.validateNoDuplicateRequests(draft.facilities);

      const dataverseId = await applicationService.submitToDataverse(draft, userId);

      return reply.code(200).send({
        success: true,
        data: {
          applicationId: id,
          dataverseId,
          referenceNumber: draft.referenceNumber,
          submittedAt: new Date().toISOString(),
        },
      });
    },
  );
};

export default submitRoute;
```

---

# PART B — FRONTEND (Next.js Customer Portal)

## B.1 Application Wizard — Multi-Step Orchestrator

```typescript
// components/application/ApplicationWizard.tsx
'use client';

import { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { applicationSchema } from '@/lib/validation/applicationSchema';
import { StepFacilitySelection } from './StepFacilitySelection';
import { StepRequestTypes } from './StepRequestTypes';
import { StepDocumentUpload } from './StepDocumentUpload';
import { StepReviewSubmit } from './StepReviewSubmit';
import { WizardProgress } from './WizardProgress';
import type { ApplicationDraft } from '@/types/application';

const WIZARD_STEPS = [
  { id: 1, label: 'Select Facilities', component: StepFacilitySelection },
  { id: 2, label: 'Request Types', component: StepRequestTypes },
  { id: 3, label: 'Documents', component: StepDocumentUpload },
  { id: 4, label: 'Review & Submit', component: StepReviewSubmit },
];

interface ApplicationWizardProps {
  draftId: string;
  initialData?: Partial<ApplicationDraft>;
}

export function ApplicationWizard({ draftId, initialData }: ApplicationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const methods = useForm<ApplicationDraft>({
    resolver: yupResolver(applicationSchema),
    defaultValues: initialData,
    mode: 'onBlur',
  });

  const { handleSubmit, trigger } = methods;

  const advanceToNextStep = async () => {
    const isStepValid = await trigger(getFieldsForStep(currentStep));
    if (!isStepValid) return;
    await saveDraft();
    setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length));
  };

  const returnToPreviousStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const saveDraft = async () => {
    setIsSaving(true);
    try {
      const data = methods.getValues();
      await fetch(`/api/v1/applications/${draftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const CurrentStepComponent = WIZARD_STEPS[currentStep - 1].component;

  return (
    <FormProvider {...methods}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <WizardProgress steps={WIZARD_STEPS} currentStep={currentStep} />
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <CurrentStepComponent />
        </div>
        <div className="mt-6 flex justify-between">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={returnToPreviousStep}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button
              type="button"
              onClick={saveDraft}
              disabled={isSaving}
              className="px-6 py-2 border border-blue-600 rounded-lg text-blue-600 hover:bg-blue-50"
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>
            {currentStep < WIZARD_STEPS.length ? (
              <button
                type="button"
                onClick={advanceToNextStep}
                className="px-6 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700"
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                onClick={handleSubmit(onSubmit)}
                className="px-6 py-2 bg-green-600 rounded-lg text-white hover:bg-green-700"
              >
                Submit Application
              </button>
            )}
          </div>
        </div>
      </div>
    </FormProvider>
  );
}

function getFieldsForStep(step: number): (keyof ApplicationDraft)[] {
  const fieldMap: Record<number, (keyof ApplicationDraft)[]> = {
    1: ['facilities'],
    2: ['facilities'],
    3: ['documents'],
    4: [],
  };
  return fieldMap[step] ?? [];
}

async function onSubmit(data: ApplicationDraft) {
  // handled by StepReviewSubmit
}
```

## B.2 Document Upload Component

```typescript
// components/shared/DocumentUploadZone.tsx
'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { CloudUpload, X, CheckCircle } from 'lucide-react';

interface UploadedFile {
  id: string;
  name: string;
  sizeKb: number;
  status: 'uploading' | 'uploaded' | 'error';
}

interface DocumentUploadZoneProps {
  label: string;
  isRequired: boolean;
  uploadedFiles: UploadedFile[];
  applicationId: string;
  facilityId?: string;
  onUploadComplete: (file: UploadedFile) => void;
  onRemove: (fileId: string) => void;
}

const ACCEPTED_MIME_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export function DocumentUploadZone({
  label,
  isRequired,
  uploadedFiles,
  applicationId,
  facilityId,
  onUploadComplete,
  onRemove,
}: DocumentUploadZoneProps) {
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        if (facilityId) formData.append('facilityId', facilityId);

        const response = await fetch(`/api/v1/applications/${applicationId}/documents`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const { data } = await response.json();
          onUploadComplete({ id: data.documentId, name: file.name, sizeKb: Math.ceil(file.size / 1024), status: 'uploaded' });
        }
      }
    },
    [applicationId, facilityId, onUploadComplete],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME_TYPES,
    maxSize: MAX_FILE_SIZE_BYTES,
    multiple: true,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {isRequired && <span className="text-xs text-red-500 font-medium">Required</span>}
      </div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        <CloudUpload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-600">
          {isDragActive ? 'Drop files here' : 'Drag and drop files here, or click to browse'}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, DOCX, XLSX, JPG, PNG — max 25 MB per file</p>
      </div>
      {uploadedFiles.length > 0 && (
        <ul className="space-y-2">
          {uploadedFiles.map((file) => (
            <li key={file.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-gray-700">{file.name}</span>
                <span className="text-xs text-gray-400">({file.sizeKb} KB)</span>
              </div>
              <button type="button" onClick={() => onRemove(file.id)} className="text-gray-400 hover:text-red-500">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

## B.3 Status Timeline Component

```typescript
// components/dashboard/StatusTimeline.tsx
'use client';

import { CheckCircle, Clock, Circle } from 'lucide-react';
import type { WorkflowStage } from '@/types/application';

interface TimelineEvent {
  stage: string;
  label: string;
  date?: string;
  actor?: string;
  status: 'completed' | 'current' | 'pending';
  note?: string;
}

interface StatusTimelineProps {
  events: TimelineEvent[];
}

export function StatusTimeline({ events }: StatusTimelineProps) {
  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {events.map((event, index) => (
          <li key={event.stage}>
            <div className="relative pb-8">
              {index < events.length - 1 && (
                <span
                  className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200"
                  aria-hidden="true"
                />
              )}
              <div className="relative flex space-x-3">
                <div>
                  {event.status === 'completed' && (
                    <span className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center ring-8 ring-white">
                      <CheckCircle className="h-5 w-5 text-white" />
                    </span>
                  )}
                  {event.status === 'current' && (
                    <span className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white">
                      <Clock className="h-5 w-5 text-white" />
                    </span>
                  )}
                  {event.status === 'pending' && (
                    <span className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center ring-8 ring-white">
                      <Circle className="h-5 w-5 text-gray-400" />
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                  <div>
                    <p className={`text-sm font-medium ${event.status === 'pending' ? 'text-gray-400' : 'text-gray-900'}`}>
                      {event.label}
                    </p>
                    {event.note && <p className="text-xs text-gray-500 mt-0.5">{event.note}</p>}
                  </div>
                  {event.date && (
                    <div className="whitespace-nowrap text-right text-sm text-gray-500">
                      <time dateTime={event.date}>{new Date(event.date).toLocaleDateString()}</time>
                      {event.actor && <p className="text-xs text-gray-400">{event.actor}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

# PART C — DYNAMICS CRM ON-PREMISE (Custom Entities + JS Web Resources)

## C.1 CRM Solution Structure

```
Solution: MaqsadLoanOrigination (maq_)
Publisher prefix: maq_
Deployment: Dynamics CRM On-Premise

Custom Entities (12):
  maq_loanapplication          — Loan application header
  maq_applicationfacility      — Facilities in the application
  maq_applicationrequesttype   — Structured request types per facility (multiselect)
  maq_applicationproduct       — Products per facility
  maq_facilityamendment        — Amendment details
  maq_applicationdocument      — Documents uploaded via portal
  maq_applicationmergehistory  — Append-only merge audit
  maq_applicationsplithistory  — Append-only split audit
  maq_approvaldecision         — DOA approval decision per stage
  maq_auditlog                 — Append-only system event log
  maq_portalnotification       — Notifications for customer portal
  maq_documentchecklist        — Config: required docs per request type

CRM Security Roles:
  maq_RelationshipManager
  maq_FFDOfficer
  maq_TechnicalOfficer
  maq_EPDOfficer
  maq_CreditAnalyst
  maq_CreditManager
  maq_CreditDirector
  maq_BFDDirector
  maq_VicePresident
  maq_CEO
  maq_ICCMember
  maq_LoanAdmin
  maq_PortalServiceAccount

JavaScript Web Resources:
  maq_/js/maq_application.js         — Main loan application form logic
  maq_/js/maq_facilitygrid.js        — Facility subgrid event handlers
  maq_/js/maq_ribbonrules.js         — Ribbon button enable/disable rules
  maq_/html/maq_mergewizard.html     — Merge wizard dialog (full React bundle)
  maq_/html/maq_splitwizard.html     — Split wizard dialog (full React bundle)
  maq_/html/maq_customerexposure.html — Customer 360 panel
  maq_/html/maq_timeline.html        — Application audit timeline

Workflow Automation:
  ALL workflow automation handled by the bank's internal BMP module.
  No Power Automate flows. No Dataverse BPF.
  BMP module listens to CRM plugin events (Post-Create, Post-Update on
  maq_loanapplication.maq_status) and executes configured workflow steps.
```

## C.2 BMP Module Integration — Stage Transitions

The BMP module is configured (not coded) to handle all workflow transitions. The following describes the BMP configuration — no code is written for this; the internal team configures it via the BMP admin UI.

```
BMP Workflow: LoanApplicationWorkflow
Entity: maq_loanapplication
Trigger field: maq_status

Stage: Submitted
  On Enter:
    → Assign RM task: "Initial Review — [maq_referencenumber]"
    → Send portal notification: "Your application has been received"
    → Send email to customer (bank email relay)

Stage: RM Review
  On Enter:
    → Create RM activity in CRM
  Exit action (Submit to Credit):
    → Move to Credit Review stage
    → Create Credit Analyst task

Stage: RM Merge/Split Review
  On Enter:
    → Lock application (set maq_islocked = true)
  On Exit (merge/split complete):
    → Unlock application
    → Return to RM Review

Stage: Credit Review
  On Enter:
    → Create Credit Analyst task
  DOA optional stages (configured in BMP DOA table):
    → If DOA requires FFD: create FFD task (skippable)
    → If DOA requires Technical: create Technical task (skippable)
    → If DOA requires EPD: create EPD task (skippable)
  Exit (Credit recommends):
    → Move to Credit Manager stage

Stage: Credit Manager Approval
  On Enter:
    → Create Credit Manager task
  Exit (Credit Manager approves):
    → Evaluate DOA rules (amount + request type)
    → If Directors+VP+CEO path: create approval tasks for each
    → If ICC path: create ICC task

Stage: Completed / Rejected / Cancelled
  On Enter:
    → Send portal notification to customer
    → Send email to RM and customer
    → Write audit log entry
```

## C.3 JavaScript Web Resource — Merge Wizard (maq_mergewizard.html)

The Merge Wizard is a CRM dialog opened via a ribbon button. It is a self-contained HTML page with a bundled React app, using the Xrm object model to call the CRM Web API for data and posting the merge action to the backend API.

```javascript
// maq_/js/maq_ribbonrules.js
// Controls ribbon button visibility/enable state

function isMergeEligible(primaryControl) {
  const status = primaryControl.getAttribute('maq_status').getValue();
  const eligibleStatuses = ['submitted', 'rm_review'];
  return eligibleStatuses.includes(status);
}

function isSplitEligible(primaryControl) {
  const status = primaryControl.getAttribute('maq_status').getValue();
  const ineligibleStatuses = ['approved', 'completed', 'rejected', 'cancelled', 'merged'];
  return !ineligibleStatuses.includes(status);
}

function openMergeWizard(primaryControl) {
  const applicationId = primaryControl.data.entity.getId();
  const customerId = primaryControl.getAttribute('maq_customerid').getValue()[0].id;

  Xrm.Navigation.openWebResource('maq_/html/maq_mergewizard.html', {
    openInNewWindow: false,
    width: 900,
    height: 650,
  }, `applicationId=${applicationId}&customerId=${customerId}`);
}

function openSplitWizard(primaryControl) {
  const applicationId = primaryControl.data.entity.getId();

  Xrm.Navigation.openWebResource('maq_/html/maq_splitwizard.html', {
    openInNewWindow: false,
    width: 800,
    height: 600,
  }, `applicationId=${applicationId}`);
}
```

```javascript
// maq_/js/maq_application.js
// Main form onLoad and field change handlers

function onFormLoad(executionContext) {
  const formContext = executionContext.getFormContext();
  setRequestTypeFieldVisibility(formContext);
  lockAuditFields(formContext);
}

function setRequestTypeFieldVisibility(formContext) {
  const facilityType = formContext.getAttribute('maq_facilitytype');
  if (!facilityType) return;
  // Show/hide request type multiselect based on facility type
  const isNewFacility = facilityType.getValue() === 100000001;
  formContext.getControl('maq_requesttypes').setVisible(!isNewFacility);
}

function lockAuditFields(formContext) {
  // Audit log subgrid is always read-only — enforced here as defence in depth
  const auditGrid = formContext.getControl('subgrid_auditlog');
  if (auditGrid) auditGrid.setDisabled(true);
}
```

## C.4 BMP Module — No Power Automate Flows

**All items previously documented as Power Automate flows (PA-001 through PA-010) are replaced by BMP module configuration.**

The BMP module is an existing internal system. The engagement team's responsibility is:
1. Document the required workflow stages and transition actions (see C.2 above).
2. Provide this specification to the internal BMP configuration team.
3. The BMP team configures the module via their admin UI — no code is written by this engagement for workflow automation.
4. Integration test each stage transition to confirm BMP fires the correct tasks and notifications.

---

# PART D — MIDDLEWARE / INTEGRATION LAYER

## D.1 CRM On-Premise Web API Client

```typescript
// src/repositories/CrmRepository.ts
// Dynamics CRM on-premise OData Web API client.
// CRM on-prem exposes the same OData v4 endpoint as Dataverse but at:
//   https://<crm-server>/<org-name>/api/data/v9.1/
// Authentication uses a service account with OAuth on-prem (ADFS) or
// Windows Auth via the bank's internal identity infrastructure.
import { DomainError } from '../errors/DomainError';
import { logger } from '../plugins/logger';
import type { CrmApplication, CrmApplicationCreate } from '../types/crm';

interface CrmClientConfig {
  baseUrl: string;       // e.g. https://crm.bank.internal/OrgName/api/data/v9.1
  accessToken: string;   // service account bearer token (ADFS OAuth on-prem)
}

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CrmRepository {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: CrmClientConfig) {
    this.baseUrl = config.baseUrl;
    this.headers = {
      Authorization: `Bearer ${config.accessToken}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'odata.include-annotations="*"',
    };
  }

  // C-001: validate all externally-sourced IDs before embedding in OData URLs.
  private assertValidGuid(value: string, fieldName: string): void {
    if (!GUID_REGEX.test(value)) {
      throw new DomainError('INVALID_GUID', `${fieldName} must be a valid GUID`);
    }
  }

  // C-002: all CRM write responses must be checked — silent failure is not acceptable.
  private async assertWriteOk(response: Response, operation: string, context: Record<string, unknown>): Promise<void> {
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.error({ operation, status: response.status, errorBody, ...context }, 'crm.write.failed');
      throw new DomainError('CRM_WRITE_FAILED', `CRM ${operation} failed with status ${response.status}`);
    }
  }

  async getApplication(applicationId: string): Promise<CrmApplication | null> {
    this.assertValidGuid(applicationId, 'applicationId');
    const url = `${this.baseUrl}/maq_loanapplications(${applicationId})?$expand=maq_applicationfacility_loanapplication,maq_applicationrequesttype_loanapplication`;

    const response = await fetch(url, { headers: this.headers });

    if (response.status === 404) return null;
    if (!response.ok) {
      const error = await response.json();
      logger.error({ applicationId, error }, 'crm.getApplication.failed');
      throw new DomainError('CRM_READ_FAILED', `Failed to fetch application ${applicationId}`, error);
    }
    return response.json();
  }

  async createApplication(data: CrmApplicationCreate): Promise<string> {
    const url = `${this.baseUrl}/maq_loanapplications`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers, Prefer: 'return=representation' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error({ data, error }, 'crm.createApplication.failed');
      throw new DomainError('CRM_CREATE_FAILED', 'Failed to create application in Dynamics CRM', error);
    }

    const created = await response.json();
    return created.maq_loanapplicationid;
  }

  async updateApplication(applicationId: string, data: Partial<CrmApplicationCreate>): Promise<void> {
    this.assertValidGuid(applicationId, 'applicationId');
    const url = `${this.baseUrl}/maq_loanapplications(${applicationId})`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error({ applicationId, data, error }, 'crm.updateApplication.failed');
      throw new DomainError('CRM_UPDATE_FAILED', `Failed to update application ${applicationId}`, error);
    }
  }

  async getFacilityRequestKeys(applicationId: string): Promise<string[]> {
    this.assertValidGuid(applicationId, 'applicationId');
    const url = `${this.baseUrl}/maq_applicationrequesttypes?$filter=_maq_applicationid_value eq '${applicationId}'&$select=maq_requesttype,_maq_applicationfacilityid_value`;

    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) throw new DomainError('CRM_READ_FAILED', 'Failed to fetch request types from CRM');

    const { value } = await response.json();
    return value.map(
      (rt: { maq_requesttype: string; _maq_applicationfacilityid_value: string }) =>
        `${rt._maq_applicationfacilityid_value}:${rt.maq_requesttype}`,
    );
  }

  async reassignFacilitiesToApplication(fromAppId: string, toAppId: string): Promise<void> {
    this.assertValidGuid(fromAppId, 'fromAppId');
    this.assertValidGuid(toAppId, 'toAppId');
    const facilitiesUrl = `${this.baseUrl}/maq_applicationfacilitys?$filter=_maq_applicationid_value eq '${fromAppId}'&$select=maq_applicationfacilityid`;
    const facilitiesResp = await fetch(facilitiesUrl, { headers: this.headers });
    if (!facilitiesResp.ok) {
      throw new DomainError('CRM_READ_FAILED', `Failed to fetch facilities for application ${fromAppId}`);
    }
    const { value: facilities } = await facilitiesResp.json();

    await Promise.all(
      facilities.map((f: { maq_applicationfacilityid: string }) =>
        this.updateFacility(f.maq_applicationfacilityid, {
          'maq_applicationid@odata.bind': `/maq_loanapplications(${toAppId})`,
        }),
      ),
    );
  }

  async reassignRequestTypesToApplication(fromAppId: string, toAppId: string): Promise<void> {
    this.assertValidGuid(fromAppId, 'fromAppId');
    this.assertValidGuid(toAppId, 'toAppId');
    const url = `${this.baseUrl}/maq_applicationrequesttypes?$filter=_maq_applicationid_value eq '${fromAppId}'&$select=maq_applicationrequesttypeid`;
    const resp = await fetch(url, { headers: this.headers });
    if (!resp.ok) {
      throw new DomainError('CRM_READ_FAILED', `Failed to fetch request types for application ${fromAppId}`);
    }
    const { value: requestTypes } = await resp.json();

    await Promise.all(
      requestTypes.map((rt: { maq_applicationrequesttypeid: string }) =>
        this.updateRequestType(rt.maq_applicationrequesttypeid, {
          'maq_applicationid@odata.bind': `/maq_loanapplications(${toAppId})`,
        }),
      ),
    );
  }

  async reassignDocumentsToApplication(fromAppId: string, toAppId: string): Promise<void> {
    this.assertValidGuid(fromAppId, 'fromAppId');
    this.assertValidGuid(toAppId, 'toAppId');
    const url = `${this.baseUrl}/maq_applicationdocuments?$filter=_maq_applicationid_value eq '${fromAppId}'&$select=maq_applicationdocumentid`;
    const resp = await fetch(url, { headers: this.headers });
    if (!resp.ok) {
      throw new DomainError('CRM_READ_FAILED', `Failed to fetch documents for application ${fromAppId}`);
    }
    const { value: documents } = await resp.json();

    await Promise.all(
      documents.map((doc: { maq_applicationdocumentid: string }) =>
        this.updateDocument(doc.maq_applicationdocumentid, {
          'maq_applicationid@odata.bind': `/maq_loanapplications(${toAppId})`,
        }),
      ),
    );
  }

  async reassignSpecificFacilitiesToApplication(facilityIds: string[], toAppId: string): Promise<void> {
    this.assertValidGuid(toAppId, 'toAppId');
    facilityIds.forEach((id) => this.assertValidGuid(id, 'facilityId'));
    await Promise.all(
      facilityIds.map((id) =>
        this.updateFacility(id, {
          'maq_applicationid@odata.bind': `/maq_loanapplications(${toAppId})`,
        }),
      ),
    );
  }

  async reassignSpecificRequestTypesToApplication(requestTypeIds: string[], toAppId: string): Promise<void> {
    this.assertValidGuid(toAppId, 'toAppId');
    requestTypeIds.forEach((id) => this.assertValidGuid(id, 'requestTypeId'));
    await Promise.all(
      requestTypeIds.map((id) =>
        this.updateRequestType(id, {
          'maq_applicationid@odata.bind': `/maq_loanapplications(${toAppId})`,
        }),
      ),
    );
  }

  async reassignDocumentsForFacilitiesToApplication(facilityIds: string[], toAppId: string): Promise<void> {
    this.assertValidGuid(toAppId, 'toAppId');
    facilityIds.forEach((id) => this.assertValidGuid(id, 'facilityId'));
    const filter = facilityIds.map((id) => `_maq_applicationfacilityid_value eq '${id}'`).join(' or ');
    const url = `${this.baseUrl}/maq_applicationdocuments?$filter=${encodeURIComponent(filter)}&$select=maq_applicationdocumentid`;
    const resp = await fetch(url, { headers: this.headers });
    if (!resp.ok) {
      throw new DomainError('CRM_READ_FAILED', 'Failed to fetch documents for facilities');
    }
    const { value: documents } = await resp.json();

    await Promise.all(
      documents.map((doc: { maq_applicationdocumentid: string }) =>
        this.updateDocument(doc.maq_applicationdocumentid, {
          'maq_applicationid@odata.bind': `/maq_loanapplications(${toAppId})`,
        }),
      ),
    );
  }

  async recalculateApplicationTotals(applicationId: string): Promise<void> {
    this.assertValidGuid(applicationId, 'applicationId');
    // Calls a CRM on-prem custom action registered as a plugin action.
    // The plugin recalculates maq_totalfacilities and maq_totalamount on the application.
    const url = `${this.baseUrl}/maq_loanapplications(${applicationId})/Microsoft.Dynamics.CRM.maq_RecalculateTotals`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({}),
    });
    await this.assertWriteOk(response, 'RecalculateTotals', { applicationId });
  }

  async resetApplicationWorkflowStage(applicationId: string, targetStage: string): Promise<void> {
    await this.updateApplication(applicationId, { maq_workflowstage: targetStage });
    // BMP module listens to maq_workflowstage field changes and advances the workflow accordingly.
  }

  async countFacilities(applicationId: string): Promise<number> {
    this.assertValidGuid(applicationId, 'applicationId');
    const url = `${this.baseUrl}/maq_applicationfacilitys?$filter=_maq_applicationid_value eq '${applicationId}'&$count=true&$top=0`;
    const resp = await fetch(url, { headers: this.headers });
    if (!resp.ok) throw new DomainError('CRM_READ_FAILED', `Failed to count facilities for ${applicationId}`);
    const data = await resp.json();
    return data['@odata.count'] ?? 0;
  }

  async countExistingSplits(applicationId: string): Promise<number> {
    this.assertValidGuid(applicationId, 'applicationId');
    const url = `${this.baseUrl}/maq_applicationsplithistories?$filter=_maq_parentapplicationid_value eq '${applicationId}'&$count=true&$top=0`;
    const resp = await fetch(url, { headers: this.headers });
    if (!resp.ok) throw new DomainError('CRM_READ_FAILED', `Failed to count splits for ${applicationId}`);
    const data = await resp.json();
    return data['@odata.count'] ?? 0;
  }

  async userHasPrivilege(userId: string, privilegeName: string): Promise<boolean> {
    this.assertValidGuid(userId, 'userId');
    const url = `${this.baseUrl}/systemusers(${userId})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges`;
    const resp = await fetch(url, { headers: this.headers });
    if (!resp.ok) {
      // Distinguish infrastructure failure from privilege denial — do not swallow silently.
      logger.error({ userId, privilegeName, status: resp.status }, 'crm.userHasPrivilege.failed');
      throw new DomainError('CRM_PRIVILEGE_CHECK_FAILED', 'Unable to verify user privilege — CRM unavailable');
    }
    const { RolePrivileges } = await resp.json();
    return RolePrivileges.some((p: { PrivilegeName: string }) => p.PrivilegeName === privilegeName);
  }

  async createMergeHistory(data: Record<string, unknown>): Promise<void> {
    const url = `${this.baseUrl}/maq_applicationmergehistories`;
    const response = await fetch(url, { method: 'POST', headers: this.headers, body: JSON.stringify(data) });
    await this.assertWriteOk(response, 'createMergeHistory', { entity: 'maq_applicationmergehistories' });
  }

  async createSplitHistory(data: Record<string, unknown>): Promise<void> {
    const url = `${this.baseUrl}/maq_applicationsplithistories`;
    const response = await fetch(url, { method: 'POST', headers: this.headers, body: JSON.stringify(data) });
    await this.assertWriteOk(response, 'createSplitHistory', { entity: 'maq_applicationsplithistories' });
  }

  private async updateFacility(facilityId: string, data: Record<string, unknown>): Promise<void> {
    const url = `${this.baseUrl}/maq_applicationfacilitys(${facilityId})`;
    const response = await fetch(url, { method: 'PATCH', headers: this.headers, body: JSON.stringify(data) });
    await this.assertWriteOk(response, 'updateFacility', { facilityId });
  }

  private async updateRequestType(requestTypeId: string, data: Record<string, unknown>): Promise<void> {
    const url = `${this.baseUrl}/maq_applicationrequesttypes(${requestTypeId})`;
    const response = await fetch(url, { method: 'PATCH', headers: this.headers, body: JSON.stringify(data) });
    await this.assertWriteOk(response, 'updateRequestType', { requestTypeId });
  }

  private async updateDocument(documentId: string, data: Record<string, unknown>): Promise<void> {
    const url = `${this.baseUrl}/maq_applicationdocuments(${documentId})`;
    const response = await fetch(url, { method: 'PATCH', headers: this.headers, body: JSON.stringify(data) });
    await this.assertWriteOk(response, 'updateDocument', { documentId });
  }
}
```

## D.2 Full API Specification (OpenAPI 3.0 — Key Endpoints)

### POST /api/v1/applications/merge

**Request:**
```json
{
  "masterApplicationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "sourceApplicationIds": [
    "7b3d1234-0000-4562-b3fc-2c963f66ab12",
    "9c4e5678-1111-4562-b3fc-2c963f66ac34"
  ],
  "mergeNotes": "Customer requested consolidation of Q1 renewal requests"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "masterApplicationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "masterReferenceNumber": "APP-20260506-0042",
    "mergedCount": 2,
    "mergedApplicationIds": ["7b3d1234...", "9c4e5678..."],
    "newFacilityCount": 5,
    "mergedAt": "2026-05-06T10:30:00Z"
  }
}
```

**Error (422):**
```json
{
  "success": false,
  "code": "DUPLICATE_FACILITY_REQUEST_IN_MERGE",
  "message": "Duplicate facility + request type combination detected across applications being merged: FAC-001:Renewal",
  "details": { "duplicateKey": "FAC-001:Renewal" }
}
```

### POST /api/v1/applications/:id/split

**Request:**
```json
{
  "selectedFacilityIds": [
    "aaa11111-5717-4562-b3fc-2c963f66afa6",
    "bbb22222-5717-4562-b3fc-2c963f66afa6"
  ],
  "selectedRequestTypeIds": [
    "ccc33333-5717-4562-b3fc-2c963f66afa6"
  ],
  "splitReason": "Facilities A and B require separate credit assessment due to different collateral structures"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "parentApplicationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "childApplicationId": "ddd44444-5717-4562-b3fc-2c963f66afa6",
    "childReferenceNumber": "APP-20260506-0042-B1",
    "facilitiesMovedCount": 2,
    "createdAt": "2026-05-06T10:35:00Z"
  }
}
```

### GET /api/v1/applications/:id/status

**Response (200):**
```json
{
  "success": true,
  "data": {
    "applicationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "referenceNumber": "APP-20260506-0042",
    "currentStage": "Credit Review",
    "status": "credit_review",
    "submittedAt": "2026-05-06T09:00:00Z",
    "assignedRM": "Ahmed Khan",
    "timeline": [
      {
        "stage": "submitted",
        "label": "Application Submitted",
        "date": "2026-05-06T09:00:00Z",
        "status": "completed"
      },
      {
        "stage": "rm_review",
        "label": "RM Review",
        "date": "2026-05-06T09:30:00Z",
        "status": "completed",
        "note": "All documents reviewed and verified"
      },
      {
        "stage": "credit_review",
        "label": "Credit Review",
        "date": "2026-05-06T10:00:00Z",
        "status": "current"
      },
      {
        "stage": "approval",
        "label": "Approval",
        "status": "pending"
      },
      {
        "stage": "cad_review",
        "label": "CAD Review",
        "status": "pending"
      }
    ],
    "pendingAction": null,
    "isMerged": false,
    "isBranched": false
  }
}
```

---

*Technical Build Document v1.1 — Revised for Dynamics CRM on-premise. Ready for Code Review.*
