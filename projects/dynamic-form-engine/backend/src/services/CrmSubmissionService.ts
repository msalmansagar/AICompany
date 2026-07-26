import type { FormDefinition, FormFieldValues, SubmissionMapping, FieldDefinition } from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import { CrmApiError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';
import type { CrmAuditService } from './CrmAuditService.js';
import { LookupBindingResolver, toBindingEntry } from './LookupBindingResolver.js';
import { EntitySetNameResolver } from './EntitySetNameResolver.js';
import { indexFieldsById, isLookupSelection, joinLookupRecordIds, readLookupRecordId, readMappingBindingOverride, resolveLookupBindings, type LookupBindingMap } from './submissionLookupBindings.js';

/** A record created during a submission, kept so a failure can roll the whole set back. */
interface CreatedRecord {
  entity: string;
  id: string;
}

/**
 * Upper bound on child records one grid may create. A submission is sequential, so a
 * runaway row count would hold the request open for minutes; failing fast is kinder than
 * a half-written parent.
 */
const MAX_GRID_CHILD_ROWS = 250;

interface UploadAttributeConfig {
  attributeName: string;
  attributeValue: string;
  type: string;
}

interface UploadDocumentSetting {
  entityName: string;
  attributeConfig: UploadAttributeConfig[];
}

interface UploadedFileRef {
  fileId: string;
}

interface DownloadDocumentSetting {
  downloadSetting: {
    attributeConfig: Array<{ attributeName: string; attributeValue: string; type: string }>;
  };
}

export class CrmSubmissionService extends CrmBaseService {
  constructor(
    authService: CrmAuthService,
    private readonly auditService: CrmAuditService,
  ) {
    super(authService);
    this.lookupBindingResolver = new LookupBindingResolver((path) => this.crmFetch(path));
    this.entitySetNames = new EntitySetNameResolver((path) => this.crmFetch(path));
  }

  private readonly lookupBindingResolver: LookupBindingResolver;
  private readonly entitySetNames: EntitySetNameResolver;

  async submitForm(
    formDefinition: FormDefinition,
    fieldValues: FormFieldValues,
    userId: string,
    userDisplayName: string,
  ): Promise<{ parentRecordId: string; parentEntityLogicalName: string; referenceNumber: string }> {
    const createdRecords: Array<{ entity: string; id: string }> = [];

    try {
      const parentMappings = formDefinition.submissionMappings.filter(
        (m) => m.isActive && !m.isMappedToChildEntity,
      );

      const parentEntityName = parentMappings[0]?.targetEntityLogicalName;
      if (!parentEntityName) {
        throw new CrmApiError('No parent entity mapping configured for this form');
      }

      const fieldIdToSchemaName = this.buildFieldIdToSchemaNameMap(formDefinition);
      // A lookup target needs a navigation binding rather than a plain value; resolve the
      // bindings once for the whole submission, parent and children together.
      const lookupBindings = await resolveLookupBindings(
        formDefinition.submissionMappings.filter((m) => m.isActive),
        indexFieldsById(formDefinition),
        this.lookupBindingResolver,
      );
      const parentPayload = this.buildPayload(
        parentMappings, fieldValues, fieldIdToSchemaName, lookupBindings,
      );
      const parentRecordId = await this.createRecord(parentEntityName, parentPayload);
      createdRecords.push({ entity: parentEntityName, id: parentRecordId });

      // Create EDMS records for any file fields that carry an uploadDocumentSetting.
      await this.processFileUploadSettings(
        formDefinition, fieldValues, parentRecordId, parentEntityName, createdRecords,
      );

      const childMappings = formDefinition.submissionMappings.filter(
        (m) => m.isActive && m.isMappedToChildEntity,
      );

      // Link to parent via relationship — the set name comes from metadata, never from
      // appending "s" (opportunity -> opportunities, and 290 custom tables in this org).
      const parentReference =
        `/${await this.entitySetNames.resolve(parentEntityName)}(${parentRecordId})`;

      // A mapping naming a grid column writes one child PER ROW; everything else keeps the
      // original behaviour of one child per (entity + relationship) group.
      const gridMappings = childMappings.filter((m) => m.gridColumnAttribute);
      const scalarMappings = childMappings.filter((m) => !m.gridColumnAttribute);

      for (const [groupKey, mappings] of this.groupChildMappings(scalarMappings)) {
        const [childEntity, relationship] = groupKey.split(':');
        const childPayload = this.buildPayload(mappings, fieldValues, fieldIdToSchemaName, lookupBindings);
        childPayload[`${relationship}@odata.bind`] = parentReference;

        const childId = await this.createRecord(childEntity, childPayload);
        createdRecords.push({ entity: childEntity, id: childId });
      }

      const gridChildren = await this.createGridChildRecords({
        mappings: gridMappings,
        fieldValues,
        fieldIdToSchemaName,
        lookupBindings,
        parentReference,
      });
      createdRecords.push(...gridChildren);

      // Mark parent record as complete. Non-fatal â€” only works if the target entity
      // has the qdb_submission_status attribute (true for all qdb_* entities).
      await this.crmFetch(`/${await this.entitySetNames.resolve(parentEntityName)}(${parentRecordId})`, {
        method: 'PATCH',
        body: JSON.stringify({ qdb_submission_status: 'submitted' }),
      }).catch((error) =>
        logger.warn({ error, parentRecordId, parentEntityName }, 'Could not set qdb_submission_status â€” skipping'),
      );

      // Fire-and-forget: trigger Power Automate if configured
      if (formDefinition.powerAutomateFlowId) {
        this.triggerWorkflow(formDefinition.powerAutomateFlowId, parentRecordId).catch(
          (error) => logger.warn({ error }, 'Power Automate trigger failed (non-blocking)'),
        );
      }

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
    } catch (error) {
      // Atomic rollback: delete all created records in reverse order
      for (const record of createdRecords.reverse()) {
        await this.deleteRecord(record.entity, record.id).catch((deleteError) =>
          logger.error({ deleteError, record }, 'Rollback record deletion failed'),
        );
      }

      await this.auditService.writeAuditEntry({
        eventType: 'formSubmissionFailed',
        formDefinitionId: formDefinition.id,
        formDefinitionName: formDefinition.title,
        userId,
        userDisplayName,
        timestampUtc: new Date().toISOString(),
        changedData: { error: String(error) },
      });

      throw error;
    }
  }

  private async resolveReferenceNumber(
    refAttribute: string | undefined,
    entityName: string,
    recordId: string,
  ): Promise<string> {
    if (!refAttribute) return recordId.substring(0, 8).toUpperCase();

    try {
      const record = await this.crmFetch<Record<string, unknown>>(
        `/${await this.entitySetNames.resolve(entityName)}(${recordId})?$select=${refAttribute}`,
      );
      const value = record[refAttribute];
      if (typeof value === 'string' && value.trim()) return value;
    } catch (error) {
      logger.warn({ error, recordId }, 'Could not fetch reference number attribute â€” using record ID prefix');
    }

    return recordId.substring(0, 8).toUpperCase();
  }

  private buildFieldIdToSchemaNameMap(formDefinition: FormDefinition): Map<string, string> {
    const map = new Map<string, string>();
    for (const tab of formDefinition.tabs) {
      for (const section of tab.sections) {
        for (const field of section.fields) {
          map.set(field.id, field.schemaName);
          this.indexChildFields(field.childFields ?? [], map);
        }
      }
    }
    return map;
  }

  private indexChildFields(fields: FieldDefinition[], map: Map<string, string>): void {
    for (const field of fields) {
      map.set(field.id, field.schemaName);
    }
  }

  private buildPayload(
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

      const normalized = this.normalizeFieldValue(value);
      // An empty selection (cleared multi-lookup / multiselect) maps to nothing on create —
      // never write a raw [] to a Dataverse attribute.
      if (Array.isArray(normalized) && normalized.length === 0) continue;

      const transformed = mapping.transformExpression
        ? this.applyTransform(normalized, mapping.transformExpression)
        : normalized;

      // A lookup target must be written as a navigation binding; assigning the raw GUID
      // to the column returns "CRM do not support direct update of Entity Reference
      // properties". The id is read from the value itself, not the transformed one — a
      // selection arrives as { id, displayName } and text transforms do not apply to it.
      // Mappings with no resolved binding keep the plain assignment.
      const binding = lookupBindings.get(mapping.targetAttributeLogicalName);
      const recordId = binding ? readLookupRecordId(normalized) : null;
      if (binding && recordId) {
        const [key, reference] = toBindingEntry(binding, recordId);
        payload[key] = reference;
        continue;
      }

      payload[mapping.targetAttributeLogicalName] = transformed;
    }

    return payload;
  }

  private normalizeFieldValue(value: unknown): unknown {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === 'object' &&
      value[0] !== null &&
      'fileId' in (value[0] as object)
    ) {
      return (value as Array<{ fileId: string }>).map((ref) => ref.fileId);
    }
    // DFE-FBE-002: multi-select lookup → delimited list of record ids written to the mapped
    // (text) attribute. Shared with the batch and in-CRM engines so all three agree; ids are
    // validated there (fail-fast — never write an unvalidated string to Dataverse). An empty
    // selection returns null here and is dropped in buildPayload.
    const joinedIds = joinLookupRecordIds(value);
    if (joinedIds !== null) return joinedIds;

    return value;
  }

  private applyTransform(value: unknown, expression: string): unknown {
    switch (expression) {
      case 'uppercase': return String(value).toUpperCase();
      case 'lowercase': return String(value).toLowerCase();
      case 'trim': return String(value).trim();
      case 'toString': return String(value);
      // Serialize arrays or objects (e.g. entry-grid rows) to a JSON string
      case 'toJson': return typeof value === 'string' ? value : JSON.stringify(value);
      default: return value;
    }
  }

  /**
   * Creates one child record per entry-grid row.
   *
   * A grid holds an array of rows; each mapping in a group names the grid column that feeds
   * one attribute on the child. Records are created in row order and appended to the
   * caller's rollback list, so a failure part-way through unwinds the whole submission.
   */
  private async createGridChildRecords(context: {
    mappings: SubmissionMapping[];
    fieldValues: FormFieldValues;
    fieldIdToSchemaName: Map<string, string>;
    lookupBindings: LookupBindingMap;
    parentReference: string;
  }): Promise<CreatedRecord[]> {
    const created: CreatedRecord[] = [];
    if (context.mappings.length === 0) return created;

    for (const [groupKey, mappings] of this.groupGridChildMappings(context.mappings)) {
      const [gridFieldId, childEntity, relationship] = groupKey.split(':');

      const gridSchemaName = context.fieldIdToSchemaName.get(gridFieldId);
      const rows = gridSchemaName ? context.fieldValues[gridSchemaName] : undefined;
      if (!Array.isArray(rows) || rows.length === 0) continue;

      if (rows.length > MAX_GRID_CHILD_ROWS) {
        throw new ValidationError(
          `Grid '${gridSchemaName}' has ${rows.length} rows, exceeding the limit of ${MAX_GRID_CHILD_ROWS}.`,
        );
      }

      for (const row of rows) {
        const payload = this.buildGridRowPayload(mappings, row, context.lookupBindings);
        // A row that maps to nothing would create an empty child record — skip it rather
        // than litter the child table with blanks.
        if (Object.keys(payload).length === 0) continue;

        payload[`${relationship}@odata.bind`] = context.parentReference;
        const childId = await this.createRecord(childEntity, payload);
        created.push({ entity: childEntity, id: childId });
      }

      logger.info(
        { gridSchemaName, childEntity, rowCount: rows.length },
        'Grid rows written as child records',
      );
    }

    return created;
  }

  /** One child record per row, so grouping keeps the grid field as well as the target. */
  private groupGridChildMappings(
    mappings: SubmissionMapping[],
  ): Map<string, SubmissionMapping[]> {
    const groups = new Map<string, SubmissionMapping[]>();

    for (const mapping of mappings) {
      const key = `${mapping.fieldId}:${mapping.targetEntityLogicalName}:${mapping.childEntityRelationshipName ?? ''}`;
      const existing = groups.get(key) ?? [];
      existing.push(mapping);
      groups.set(key, existing);
    }

    return groups;
  }

  /** The payload for one grid row: each mapping reads its own column out of the row. */
  private buildGridRowPayload(
    mappings: SubmissionMapping[],
    row: unknown,
    lookupBindings: LookupBindingMap,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (typeof row !== 'object' || row === null) return payload;

    const cells = row as Record<string, unknown>;

    for (const mapping of mappings) {
      const value = cells[mapping.gridColumnAttribute!];
      if (value === undefined || value === null || value === '') continue;

      const transformed = mapping.transformExpression
        ? this.applyTransform(value, mapping.transformExpression)
        : value;

      // A grid column pointing at another table still has to be written as a binding. The
      // grid column is not a form field, so resolveLookupBindings never saw it — the
      // binding comes from the mapping's own override columns.
      const binding = lookupBindings.get(mapping.targetAttributeLogicalName)
        ?? readMappingBindingOverride(mapping);
      const recordId = binding ? readLookupRecordId(value) : null;

      if (binding && recordId) {
        const [key, reference] = toBindingEntry(binding, recordId);
        payload[key] = reference;
        continue;
      }

      if (isLookupSelection(value)) {
        throw new ValidationError(
          `Grid column '${mapping.gridColumnAttribute}' writes to lookup `
          + `'${mapping.targetAttributeLogicalName}' but no binding is configured. Set `
          + 'Target Navigation Property and Target Entity Set Name on the mapping.',
        );
      }

      payload[mapping.targetAttributeLogicalName] = transformed;
    }

    return payload;
  }

  private groupChildMappings(
    mappings: SubmissionMapping[],
  ): Map<string, SubmissionMapping[]> {
    const groups = new Map<string, SubmissionMapping[]>();

    for (const mapping of mappings) {
      const key = `${mapping.targetEntityLogicalName}:${mapping.childEntityRelationshipName ?? ''}`;
      const existing = groups.get(key) ?? [];
      existing.push(mapping);
      groups.set(key, existing);
    }

    return groups;
  }

  // ── Upload document setting ───────────────────────────────────────────────────

  private async processFileUploadSettings(
    formDefinition: FormDefinition,
    fieldValues: FormFieldValues,
    parentRecordId: string,
    parentEntityLogicalName: string,
    createdRecords: Array<{ entity: string; id: string }>,
  ): Promise<void> {
    const allFields = this.collectAllFields(formDefinition);

    for (const field of allFields) {
      if (!field.uploadDocumentSetting) continue;

      const rawValue = fieldValues[field.schemaName];
      if (!rawValue || !Array.isArray(rawValue) || rawValue.length === 0) continue;

      const fileRefs = rawValue as UploadedFileRef[];
      if (!fileRefs[0]?.fileId) continue;

      const setting = this.parseUploadSetting(field.uploadDocumentSetting, field.schemaName);

      for (const fileRef of fileRefs) {
        const payload = this.buildEdmsPayload(setting.attributeConfig, {
          submissionId: parentRecordId,
          parentEntityLogicalName,
          annotationId: fileRef.fileId,
        });

        // If downloadDocumentSetting is present and no template GUID was already
        // supplied in uploadDocumentSetting, resolve the GUID by name and inject it.
        if (field.downloadDocumentSetting && !payload['qdb_templateguid@odata.bind']) {
          const guid = await this.resolveTemplateGuid(field.downloadDocumentSetting, field.schemaName);
          if (guid) {
            payload['qdb_templateguid@odata.bind'] = `/documenttemplates(${guid})`;
          }
        }

        const edmsId = await this.createRecord(setting.entityName, payload);
        createdRecords.push({ entity: setting.entityName, id: edmsId });

        logger.info(
          { edmsId, entityName: setting.entityName, fieldSchema: field.schemaName, annotationId: fileRef.fileId },
          'EDMS record created for uploaded file',
        );
      }
    }
  }

  private collectAllFields(formDefinition: FormDefinition): FieldDefinition[] {
    const fields: FieldDefinition[] = [];
    for (const tab of formDefinition.tabs) {
      for (const section of tab.sections) {
        for (const field of section.fields) {
          fields.push(field);
          if (field.childFields) fields.push(...field.childFields);
        }
      }
    }
    return fields;
  }

  private parseUploadSetting(json: string, fieldSchema: string): UploadDocumentSetting {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new ValidationError(
        `uploadDocumentSetting on field '${fieldSchema}' contains invalid JSON`,
      );
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).entityName !== 'string' ||
      !Array.isArray((parsed as Record<string, unknown>).attributeConfig)
    ) {
      throw new ValidationError(
        `uploadDocumentSetting on field '${fieldSchema}' must have shape { entityName: string, attributeConfig: [...] }`,
      );
    }

    return parsed as UploadDocumentSetting;
  }

  private parseDownloadSetting(json: string, fieldSchema: string): DownloadDocumentSetting {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new ValidationError(
        `downloadDocumentSetting on field '${fieldSchema}' contains invalid JSON`,
      );
    }

    const root = parsed as Record<string, unknown>;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof root.downloadSetting !== 'object' ||
      !Array.isArray((root.downloadSetting as Record<string, unknown>).attributeConfig)
    ) {
      throw new ValidationError(
        `downloadDocumentSetting on field '${fieldSchema}' must have shape { downloadSetting: { attributeConfig: [...] } }`,
      );
    }

    return parsed as DownloadDocumentSetting;
  }

  // Resolves a document template GUID by name. Non-fatal: logs a warning and returns
  // null when the template is not found so the EDMS record is still created.
  private async resolveTemplateGuid(downloadSettingJson: string, fieldSchema: string): Promise<string | null> {
    let setting: DownloadDocumentSetting;
    try {
      setting = this.parseDownloadSetting(downloadSettingJson, fieldSchema);
    } catch (error) {
      logger.warn({ error, fieldSchema }, 'Could not parse downloadDocumentSetting — skipping template GUID resolution');
      return null;
    }

    const entry = setting.downloadSetting.attributeConfig.find(
      (c) => c.attributeName === 'documentName',
    );
    if (!entry?.attributeValue) return null;

    const escapedName = entry.attributeValue.replace(/'/g, "''");
    try {
      const result = await this.crmFetch<{ value: Array<{ documenttemplateid: string }> }>(
        `/documenttemplates?$filter=name eq '${escapedName}'&$select=documenttemplateid&$top=1`,
      );
      const guid = result.value[0]?.documenttemplateid ?? null;
      if (guid) {
        logger.info({ templateGuid: guid, documentName: entry.attributeValue, fieldSchema }, 'Resolved document template GUID from downloadDocumentSetting');
      } else {
        logger.warn({ documentName: entry.attributeValue, fieldSchema }, 'Document template not found — qdb_templateguid will not be set on EDMS record');
      }
      return guid;
    } catch (error) {
      logger.warn({ error, documentName: entry.attributeValue, fieldSchema }, 'Template GUID resolution failed — skipping');
      return null;
    }
  }

  private buildEdmsPayload(
    configs: UploadAttributeConfig[],
    vars: { submissionId: string; parentEntityLogicalName: string; annotationId: string },
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    for (const config of configs) {
      const value = config.attributeValue
        .replace('{submissionId}', vars.submissionId)
        .replace('{parentEntityName}', vars.parentEntityLogicalName)
        .replace('{annotationId}', vars.annotationId);

      payload[config.attributeName] = value;
    }

    return payload;
  }

  // ── CRM record operations ─────────────────────────────────────────────────────

  private async createRecord(
    entityLogicalName: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const entitySet = await this.entitySetNames.resolve(entityLogicalName);
    const response = await this.crmFetch<Record<string, string>>(
      `/${entitySet}`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { Prefer: 'return=representation', $select: `${entityLogicalName}id` },
      },
    );
    return response[`${entityLogicalName}id`];
  }

  private async deleteRecord(entityLogicalName: string, recordId: string): Promise<void> {
    const entitySet = await this.entitySetNames.resolve(entityLogicalName);
    await this.crmFetch(`/${entitySet}(${recordId})`, { method: 'DELETE' });
  }

  private async triggerWorkflow(flowId: string, recordId: string): Promise<void> {
    await this.crmFetch(`/workflows(${flowId})/Microsoft.Dynamics.CRM.ExecuteWorkflow`, {
      method: 'POST',
      body: JSON.stringify({ EntityId: recordId }),
    });
  }
}
