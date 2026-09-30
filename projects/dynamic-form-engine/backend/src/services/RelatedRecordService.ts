import { collectRelatedAttributes, isLogicalName } from '@qdb/shared';
import type { BusinessRule, FieldDefinition, FormDefinition } from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import type { CrmAuthService } from './CrmAuthService.js';
import { CrmApiError, NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Where the service reads a form's published definition from. */
export interface FormDefinitionSource {
  getFormDefinition(formCode: string): Promise<FormDefinition>;
}

export interface RelatedRecordRequest {
  formCode: string;
  fieldSchemaName: string;
  recordId: string;
}

interface AllowedRead {
  entityLogicalName: string;
  attributes: string[];
  /** The lookup's own OData filter; a record outside it cannot be read either. */
  filterExpression?: string;
}

interface EntityAddressing {
  entitySetName: string;
  primaryIdAttribute: string;
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELATED_RECORD = 'Related record';

/**
 * Reads the columns of a lookup-selected record that a form's rule conditions name
 * (DFE-RULES-002 item 2).
 *
 * The portal reads CRM as a service principal, so neither the columns nor the records are the
 * caller's choice. Columns: exactly those the form's own published rules name for that lookup.
 * Records: only those the lookup itself would offer — its configured entity and its own filter.
 * A record outside that scope, or one that does not exist, is reported the same way.
 */
export class RelatedRecordService extends CrmBaseService {
  private readonly addressingByEntity = new Map<string, EntityAddressing>();

  constructor(authService: CrmAuthService, private readonly forms: FormDefinitionSource) {
    super(authService);
  }

  async readRuleAttributes(request: RelatedRecordRequest): Promise<Record<string, unknown>> {
    if (!GUID_PATTERN.test(request.recordId)) throw new ValidationError('recordId must be a GUID');

    const form = await this.forms.getFormDefinition(request.formCode);
    const allowed = resolveAllowedRead(form, request.fieldSchemaName);
    const record = await this.readScopedRecord(allowed, request);
    return Object.fromEntries(allowed.attributes.map((attribute) => [attribute, record[attribute] ?? null]));
  }

  private async readScopedRecord(allowed: AllowedRead, request: RelatedRecordRequest): Promise<Record<string, unknown>> {
    try {
      const addressing = await this.resolveAddressing(allowed.entityLogicalName);
      const idClause = `${addressing.primaryIdAttribute} eq ${request.recordId}`;
      const filter = allowed.filterExpression ? `(${idClause}) and (${allowed.filterExpression})` : idClause;
      const response = await this.crmFetch<{ value: Array<Record<string, unknown>> }>(
        `/${addressing.entitySetName}?$select=${allowed.attributes.join(',')}&$filter=${encodeURIComponent(filter)}&$top=1`,
      );
      const record = response.value[0];
      if (!record) throw new NotFoundError(RELATED_RECORD);
      return record;
    } catch (error) {
      if (!(error instanceof CrmApiError)) throw error;
      // Dataverse's error text names entity sets and columns; the caller gets none of it.
      logger.warn({ error, formCode: request.formCode, fieldSchemaName: request.fieldSchemaName }, 'related_record_read_failed');
      throw new NotFoundError(RELATED_RECORD);
    }
  }

  private async resolveAddressing(entityLogicalName: string): Promise<EntityAddressing> {
    const cached = this.addressingByEntity.get(entityLogicalName);
    if (cached) return cached;
    const metadata = await this.crmFetch<{ EntitySetName: string; PrimaryIdAttribute: string }>(
      `/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=EntitySetName,PrimaryIdAttribute`,
    );
    const addressing = { entitySetName: metadata.EntitySetName, primaryIdAttribute: metadata.PrimaryIdAttribute };
    this.addressingByEntity.set(entityLogicalName, addressing);
    return addressing;
  }
}

/** The lookup's entity, filter and the columns its rules may read, or an error when there are none. */
function resolveAllowedRead(form: FormDefinition, fieldSchemaName: string): AllowedRead {
  const fields = collectFormFields(form);
  const field = fields.find((candidate) => candidate.schemaName === fieldSchemaName);
  const lookupConfig = field?.lookupConfig;
  if (!lookupConfig?.entityLogicalName) throw new NotFoundError(`Lookup field '${fieldSchemaName}'`);
  if (!isLogicalName(lookupConfig.entityLogicalName)) throw new ValidationError('Lookup entity name is invalid');

  const rules: BusinessRule[] = fields.flatMap((candidate) => candidate.businessRules ?? []);
  const attributes = collectRelatedAttributes(rules).get(fieldSchemaName) ?? [];
  if (attributes.length === 0) throw new NotFoundError(`Related columns for '${fieldSchemaName}'`);

  return {
    entityLogicalName: lookupConfig.entityLogicalName,
    attributes,
    filterExpression: lookupConfig.filterExpression || undefined,
  };
}

function collectFormFields(form: FormDefinition): FieldDefinition[] {
  return form.tabs.flatMap((tab) => [
    ...(tab.headerFields ?? []),
    ...tab.sections.flatMap((section) => section.fields),
    ...(tab.footerFields ?? []),
  ]);
}
