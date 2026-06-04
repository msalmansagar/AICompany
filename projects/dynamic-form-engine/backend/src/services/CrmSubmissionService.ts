import type { FormDefinition, FormFieldValues, SubmissionMapping, FieldDefinition } from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import { CrmApiError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';
import type { CrmAuditService } from './CrmAuditService.js';

export class CrmSubmissionService extends CrmBaseService {
  constructor(
    authService: CrmAuthService,
    private readonly auditService: CrmAuditService,
  ) {
    super(authService);
  }

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
      const parentPayload = this.buildPayload(parentMappings, fieldValues, fieldIdToSchemaName);
      const parentRecordId = await this.createRecord(parentEntityName, parentPayload);
      createdRecords.push({ entity: parentEntityName, id: parentRecordId });

      // Create child records grouped by entity + relationship
      const childMappings = formDefinition.submissionMappings.filter(
        (m) => m.isActive && m.isMappedToChildEntity,
      );

      const childGroups = this.groupChildMappings(childMappings);

      for (const [groupKey, mappings] of childGroups) {
        const [childEntity, relationship] = groupKey.split(':');
        const childPayload = this.buildPayload(mappings, fieldValues, fieldIdToSchemaName);

        // Link to parent via relationship
        childPayload[`${relationship}@odata.bind`] =
          `/${parentEntityName}s(${parentRecordId})`;

        const childId = await this.createRecord(childEntity, childPayload);
        createdRecords.push({ entity: childEntity, id: childId });
      }

      // Mark parent record as complete. Non-fatal â€” only works if the target entity
      // has the qdb_submission_status attribute (true for all qdb_* entities).
      await this.crmFetch(`/${parentEntityName}s(${parentRecordId})`, {
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
        `/${entityName}s(${recordId})?$select=${refAttribute}`,
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
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    for (const mapping of mappings) {
      const schemaName = fieldIdToSchemaName.get(mapping.fieldId);
      if (!schemaName) continue;

      const value = fieldValues[schemaName];
      if (value === undefined || value === null) continue;

      payload[mapping.targetAttributeLogicalName] = mapping.transformExpression
        ? this.applyTransform(value, mapping.transformExpression)
        : value;
    }

    return payload;
  }

  private applyTransform(value: unknown, expression: string): unknown {
    // Phase 1: only simple transforms supported (uppercase, lowercase, trim, toString)
    switch (expression) {
      case 'uppercase': return String(value).toUpperCase();
      case 'lowercase': return String(value).toLowerCase();
      case 'trim': return String(value).trim();
      case 'toString': return String(value);
      default: return value;
    }
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

  private async createRecord(
    entityLogicalName: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const response = await this.crmFetch<Record<string, string>>(
      `/${entityLogicalName}s`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { Prefer: 'return=representation', $select: `${entityLogicalName}id` },
      },
    );
    return response[`${entityLogicalName}id`];
  }

  private async deleteRecord(entityLogicalName: string, recordId: string): Promise<void> {
    await this.crmFetch(`/${entityLogicalName}s(${recordId})`, { method: 'DELETE' });
  }

  private async triggerWorkflow(flowId: string, recordId: string): Promise<void> {
    await this.crmFetch(`/workflows(${flowId})/Microsoft.Dynamics.CRM.ExecuteWorkflow`, {
      method: 'POST',
      body: JSON.stringify({ EntityId: recordId }),
    });
  }
}
