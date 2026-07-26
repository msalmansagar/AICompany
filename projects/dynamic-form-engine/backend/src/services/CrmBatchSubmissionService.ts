import type { FormDefinition, FormFieldValues, SubmissionMapping } from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import { CrmApiError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';
import type { CrmAuditService } from './CrmAuditService.js';
import { LookupBindingResolver, toBindingEntry } from './LookupBindingResolver.js';
import { indexFieldsById, resolveLookupBindings, type LookupBindingMap } from './submissionLookupBindings.js';
import {
  BatchChangesetBuilder,
  parseBatchResponse,
  type BatchChangesetResult,
} from './BatchChangesetBuilder.js';

// ── Types ──────────────────────────────────────────────────────

export interface GridRow {
  [columnAttribute: string]: unknown;
}

export interface GridFieldSubmission {
  fieldKey: string;
  targetEntity: string;
  relationshipAttribute: string;
  rows: GridRow[];
}

export interface BatchSubmissionOptions {
  gridFields?: GridFieldSubmission[];
  correlationId: string;
}

export interface BatchSubmissionResult {
  parentRecordId: string;
  parentEntityLogicalName: string;
  referenceNumber: string;
}

export interface GridRowError {
  gridFieldKey: string;
  rowIndex: number;
  message: string;
}

const DEFAULT_MAX_BATCH_OPERATIONS = 500;

export class CrmBatchSubmissionService extends CrmBaseService {
  private readonly maxBatchOperations: number;
  private readonly lookupBindingResolver: LookupBindingResolver;

  constructor(
    authService: CrmAuthService,
    private readonly auditService: CrmAuditService,
  ) {
    super(authService);
    this.maxBatchOperations = resolveMaxBatchOperations();
    this.lookupBindingResolver = new LookupBindingResolver((path) => this.crmFetch(path));
  }

  async submitFormWithBatch(
    formDefinition: FormDefinition,
    fieldValues: FormFieldValues,
    userId: string,
    userDisplayName: string,
    options: BatchSubmissionOptions,
  ): Promise<BatchSubmissionResult> {
    const { correlationId, gridFields = [] } = options;

    const parentMappings = formDefinition.submissionMappings.filter(
      (m) => m.isActive && !m.isMappedToChildEntity,
    );
    const parentEntityName = parentMappings[0]?.targetEntityLogicalName;

    if (!parentEntityName) {
      throw new CrmApiError('No parent entity mapping configured for this form');
    }

    const fieldIdToSchemaName = buildFieldIdToSchemaNameMap(formDefinition);
    // A lookup target needs a navigation binding rather than a plain value; resolve the
    // bindings once for the whole submission, parent and children together.
    const lookupBindings = await resolveLookupBindings(
      formDefinition.submissionMappings.filter((m) => m.isActive),
      indexFieldsById(formDefinition),
      this.lookupBindingResolver,
    );
    const parentPayload = buildPayload(
      parentMappings, fieldValues, fieldIdToSchemaName, lookupBindings,
    );

    const childMappings = formDefinition.submissionMappings.filter(
      (m) => m.isActive && m.isMappedToChildEntity,
    );

    const totalOperationCount = computeTotalOperations(
      childMappings,
      gridFields,
    );

    // Batch size guard — CEO condition ADD-002-C3 / ADR-ADD-002.
    if (totalOperationCount >= this.maxBatchOperations) {
      throw new ValidationError(
        `Submission exceeds maximum operation count (${this.maxBatchOperations}). ` +
        `Please reduce the number of grid rows and resubmit.`,
      );
    }

    const builder = new BatchChangesetBuilder();
    builder.addParentRecord(`${parentEntityName}s`, parentPayload);

    appendStandardChildOperations(
      builder,
      childMappings,
      fieldValues,
      fieldIdToSchemaName,
      parentEntityName,
      lookupBindings,
    );

    appendGridRowOperations(builder, gridFields, parentEntityName);

    const batchBody = builder.buildMultipartBody(this.baseUrl);
    const contentIdToSource = builder.buildContentIdToSourceMap();

    logger.info(
      {
        correlationId,
        formCode: formDefinition.formCode,
        parentEntity: parentEntityName,
        childCount: childMappings.length,
        batchSize: builder.operationCount,
        operation: 'batchSubmit',
      },
      'entry_grid_batch_submit',
    );

    const rawResponse = await this.executeBatch(batchBody, builder.batchContentType, correlationId);
    const result = parseBatchResponse(rawResponse, contentIdToSource);

    if (!result.success) {
      await this.handleBatchFailure(result, formDefinition, userId, userDisplayName, correlationId);
    }

    const parentRecordId = result.parentRecordId ?? '';

    await this.auditService.writeAuditEntry({
      eventType: 'formSubmitted',
      formDefinitionId: formDefinition.id,
      formDefinitionName: formDefinition.title,
      userId,
      userDisplayName,
      timestampUtc: new Date().toISOString(),
      recordId: parentRecordId,
    });

    const referenceNumber = await this.resolveReferenceNumber(
      formDefinition.confirmationRecordRefAttribute,
      parentEntityName,
      parentRecordId,
    );

    return { parentRecordId, parentEntityLogicalName: parentEntityName, referenceNumber };
  }

  private async executeBatch(
    body: string,
    contentType: string,
    correlationId: string,
  ): Promise<string> {
    const token = await this.authService.getAccessToken();
    const url = `${this.baseUrl}/$batch`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.error(
        { correlationId, status: response.status, body: errorBody, operation: 'executeBatch' },
        'entry_grid_batch_failure — HTTP error on batch endpoint',
      );
      throw new CrmApiError(
        `Batch request failed: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    return response.text();
  }

  private async handleBatchFailure(
    result: BatchChangesetResult,
    formDefinition: FormDefinition,
    userId: string,
    userDisplayName: string,
    correlationId: string,
  ): Promise<never> {
    const source = result.failingSource;

    logger.error(
      {
        correlationId,
        formCode: formDefinition.formCode,
        failingContentId: result.failingContentId,
        sourceType: source?.sourceType,
        rowIndex: source?.sourceType === 'grid-row' ? source.rowIndex : undefined,
        error: result.errorMessage,
        operation: 'batchSubmit',
      },
      'entry_grid_batch_failure',
    );

    await this.auditService.writeAuditEntry({
      eventType: 'formSubmissionFailed',
      formDefinitionId: formDefinition.id,
      formDefinitionName: formDefinition.title,
      userId,
      userDisplayName,
      timestampUtc: new Date().toISOString(),
      changedData: {
        failingContentId: result.failingContentId,
        sourceType: source?.sourceType,
        error: result.errorMessage,
      },
    });

    const userMessage = buildUserFacingErrorMessage(source, result.errorMessage);
    throw new CrmApiError(userMessage, 422);
  }

  private async resolveReferenceNumber(
    refAttribute: string | undefined,
    entityName: string,
    recordId: string,
  ): Promise<string> {
    if (!refAttribute || !recordId) {
      return recordId.substring(0, 8).toUpperCase();
    }

    try {
      const record = await this.crmFetch<Record<string, unknown>>(
        `/${entityName}s(${recordId})?$select=${refAttribute}`,
      );
      const value = record[refAttribute];
      if (typeof value === 'string' && value.trim()) return value;
    } catch (error) {
      logger.warn({ error, recordId }, 'Could not fetch reference number attribute — using record ID prefix');
    }

    return recordId.substring(0, 8).toUpperCase();
  }
}

// ── Private helpers ────────────────────────────────────────────

function buildFieldIdToSchemaNameMap(formDefinition: FormDefinition): Map<string, string> {
  const map = new Map<string, string>();
  for (const tab of formDefinition.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        map.set(field.id, field.schemaName);
      }
    }
  }
  return map;
}

function buildPayload(
  mappings: SubmissionMapping[],
  fieldValues: FormFieldValues,
  fieldIdToSchemaName: Map<string, string>,
  lookupBindings: LookupBindingMap = new Map(),
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const mapping of mappings) {
    const schemaName = fieldIdToSchemaName.get(mapping.fieldId);
    if (!schemaName) continue;
    const value = fieldValues[schemaName];
    if (value === undefined || value === null) continue;

    // A lookup target must be written as a navigation binding; assigning the raw GUID to
    // the column returns "CRM do not support direct update of Entity Reference properties".
    const binding = lookupBindings.get(mapping.targetAttributeLogicalName);
    if (binding && typeof value === 'string' && value) {
      const [key, reference] = toBindingEntry(binding, value);
      payload[key] = reference;
      continue;
    }

    payload[mapping.targetAttributeLogicalName] = value;
  }
  return payload;
}

function computeTotalOperations(
  childMappings: SubmissionMapping[],
  gridFields: GridFieldSubmission[],
): number {
  // +1 for parent, +childGroups, +all grid rows
  const uniqueChildGroups = new Set(
    childMappings.map((m) => `${m.targetEntityLogicalName}:${m.childEntityRelationshipName ?? ''}`),
  ).size;
  const gridRowTotal = gridFields.reduce((sum, gf) => sum + gf.rows.length, 0);
  return 1 + uniqueChildGroups + gridRowTotal;
}

function appendStandardChildOperations(
  builder: BatchChangesetBuilder,
  childMappings: SubmissionMapping[],
  fieldValues: FormFieldValues,
  fieldIdToSchemaName: Map<string, string>,
  parentEntityName: string,
  lookupBindings: LookupBindingMap,
): void {
  const groups = groupChildMappings(childMappings);

  for (const [groupKey, mappings] of groups) {
    const [childEntity, relationship] = groupKey.split(':');
    const childPayload = buildPayload(mappings, fieldValues, fieldIdToSchemaName, lookupBindings);
    // Content-ID reference $1 binds to the parent record created in operation 1.
    childPayload[`${relationship}@odata.bind`] = `$1`;
    const schemaName = fieldIdToSchemaName.get(mappings[0].fieldId) ?? groupKey;
    builder.addStandardChildRecord(`${childEntity}s`, childPayload, schemaName);
  }
}

function appendGridRowOperations(
  builder: BatchChangesetBuilder,
  gridFields: GridFieldSubmission[],
  parentEntityName: string,
): void {
  for (const gridField of gridFields) {
    for (let rowIndex = 0; rowIndex < gridField.rows.length; rowIndex++) {
      const rowPayload = { ...gridField.rows[rowIndex] };
      // Bind grid row to parent using Content-ID reference $1.
      rowPayload[`${gridField.relationshipAttribute}@odata.bind`] = `$1`;
      builder.addGridRowRecord(
        `${gridField.targetEntity}s`,
        rowPayload,
        gridField.fieldKey,
        rowIndex,
      );
    }
  }
}

function groupChildMappings(mappings: SubmissionMapping[]): Map<string, SubmissionMapping[]> {
  const groups = new Map<string, SubmissionMapping[]>();
  for (const mapping of mappings) {
    const key = `${mapping.targetEntityLogicalName}:${mapping.childEntityRelationshipName ?? ''}`;
    const existing = groups.get(key) ?? [];
    existing.push(mapping);
    groups.set(key, existing);
  }
  return groups;
}

function buildUserFacingErrorMessage(
  source: BatchChangesetResult['failingSource'],
  errorMessage?: string,
): string {
  if (!source) {
    return 'Your submission could not be saved. Please try again or contact support.';
  }

  switch (source.sourceType) {
    case 'parent':
      return 'Your submission could not be saved. Please check your data and try again.';
    case 'standard-child':
      return `Your submission could not be saved. An error occurred saving data for '${source.fieldKey}'. Please try again.`;
    case 'grid-row':
      return (
        `Row ${source.rowIndex + 1} in the grid '${source.fieldKey}' could not be saved. ` +
        `Please review that row and resubmit.`
      );
  }
}

function resolveMaxBatchOperations(): number {
  const envValue = process.env.MAX_BATCH_OPERATIONS;
  if (!envValue) return DEFAULT_MAX_BATCH_OPERATIONS;
  const parsed = parseInt(envValue, 10);
  return isNaN(parsed) || parsed <= 0 ? DEFAULT_MAX_BATCH_OPERATIONS : parsed;
}
