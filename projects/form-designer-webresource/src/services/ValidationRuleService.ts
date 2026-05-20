import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_VALIDATION_RULE_ATTRS } from '@/constants/attributeNames';
import type { DesignerValidationRule, ValidationRuleType } from '@/state/models/DesignerRuleModel';
import { withRetry } from './crmRetry';

export interface CreateValidationRuleDto {
  fieldId: string;
  ruleType: ValidationRuleType;
  ruleValue: string | null;
  errorMessage: string;
  sortOrder: number;
}

export interface UpdateValidationRuleDto {
  ruleType?: ValidationRuleType;
  ruleValue?: string | null;
  errorMessage?: string;
  sortOrder?: number;
}

export class ValidationRuleService {
  constructor(private readonly webApi: typeof Xrm.WebApi) {}

  async createRule(dto: CreateValidationRuleDto): Promise<string> {
    const result = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.FORM_VALIDATION_RULE, {
          [`${FORM_VALIDATION_RULE_ATTRS.FIELD_ID}@odata.bind`]: `/qdb_form_fields(${dto.fieldId})`,
          [FORM_VALIDATION_RULE_ATTRS.RULE_TYPE]: dto.ruleType,
          [FORM_VALIDATION_RULE_ATTRS.ERROR_MESSAGE]: dto.errorMessage,
          [FORM_VALIDATION_RULE_ATTRS.SORT_ORDER]: dto.sortOrder,
          ...buildRuleValuePayload(dto.ruleType, dto.ruleValue),
        }),
      'createValidationRule'
    );
    return result.id;
  }

  async updateRule(id: string, dto: UpdateValidationRuleDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.ruleType !== undefined) data[FORM_VALIDATION_RULE_ATTRS.RULE_TYPE] = dto.ruleType;
    if (dto.errorMessage !== undefined) data[FORM_VALIDATION_RULE_ATTRS.ERROR_MESSAGE] = dto.errorMessage;
    if (dto.sortOrder !== undefined) data[FORM_VALIDATION_RULE_ATTRS.SORT_ORDER] = dto.sortOrder;
    if (dto.ruleType !== undefined && dto.ruleValue !== undefined) {
      Object.assign(data, buildRuleValuePayload(dto.ruleType, dto.ruleValue));
    }

    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_VALIDATION_RULE, id, data),
      'updateValidationRule'
    );
  }

  async deleteRule(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_VALIDATION_RULE, id),
      'deleteValidationRule'
    );
  }

  async listRulesForField(fieldId: string): Promise<DesignerValidationRule[]> {
    const select = [
      FORM_VALIDATION_RULE_ATTRS.ID,
      FORM_VALIDATION_RULE_ATTRS.FIELD_ID_VALUE,
      FORM_VALIDATION_RULE_ATTRS.RULE_TYPE,
      FORM_VALIDATION_RULE_ATTRS.ERROR_MESSAGE,
      FORM_VALIDATION_RULE_ATTRS.SORT_ORDER,
      FORM_VALIDATION_RULE_ATTRS.MIN_LENGTH,
      FORM_VALIDATION_RULE_ATTRS.MAX_LENGTH,
      FORM_VALIDATION_RULE_ATTRS.MIN_VALUE,
      FORM_VALIDATION_RULE_ATTRS.MAX_VALUE,
      FORM_VALIDATION_RULE_ATTRS.REGEX_PATTERN,
    ].join(',');

    const filter = `${FORM_VALIDATION_RULE_ATTRS.FIELD_ID_VALUE} eq ${fieldId}`;
    const orderBy = `${FORM_VALIDATION_RULE_ATTRS.SORT_ORDER} asc`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_VALIDATION_RULE,
          `?$select=${select}&$filter=${filter}&$orderby=${orderBy}`
        ),
      'listRulesForField'
    );

    return result.entities.map(record => this.mapRecordToModel(record));
  }

  // Sync rules: delete removed, create new (tmp_ IDs), update existing (real IDs).
  async syncRules(fieldId: string, currentRules: DesignerValidationRule[]): Promise<void> {
    if (currentRules.length === 0) {
      const existing = await this.listRulesForField(fieldId);
      await Promise.all(existing.map(r => this.deleteRule(r.id)));
      return;
    }

    const existing = await this.listRulesForField(fieldId);
    const currentRealIds = new Set(currentRules.filter(r => !r.id.startsWith('tmp_')).map(r => r.id));

    await Promise.all(
      existing.filter(r => !currentRealIds.has(r.id)).map(r => this.deleteRule(r.id))
    );

    for (const rule of currentRules) {
      if (rule.id.startsWith('tmp_')) {
        await this.createRule({ fieldId, ruleType: rule.ruleType, ruleValue: rule.ruleValue, errorMessage: rule.errorMessage, sortOrder: rule.sortOrder });
      } else {
        await this.updateRule(rule.id, { ruleType: rule.ruleType, ruleValue: rule.ruleValue, errorMessage: rule.errorMessage, sortOrder: rule.sortOrder });
      }
    }
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerValidationRule {
    const ruleType = String(record[FORM_VALIDATION_RULE_ATTRS.RULE_TYPE] ?? '') as ValidationRuleType;
    return {
      id: String(record[FORM_VALIDATION_RULE_ATTRS.ID] ?? ''),
      fieldId: String(record[FORM_VALIDATION_RULE_ATTRS.FIELD_ID_VALUE] ?? ''),
      ruleType,
      ruleValue: extractRuleValue(record, ruleType),
      errorMessage: String(record[FORM_VALIDATION_RULE_ATTRS.ERROR_MESSAGE] ?? ''),
      sortOrder: Number(record[FORM_VALIDATION_RULE_ATTRS.SORT_ORDER] ?? 0),
    };
  }
}

function buildRuleValuePayload(ruleType: ValidationRuleType, ruleValue: string | null): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (ruleValue == null) return payload;
  switch (ruleType) {
    case 'min_length': payload[FORM_VALIDATION_RULE_ATTRS.MIN_LENGTH] = Number(ruleValue); break;
    case 'max_length': payload[FORM_VALIDATION_RULE_ATTRS.MAX_LENGTH] = Number(ruleValue); break;
    case 'min_value':  payload[FORM_VALIDATION_RULE_ATTRS.MIN_VALUE]  = Number(ruleValue); break;
    case 'max_value':  payload[FORM_VALIDATION_RULE_ATTRS.MAX_VALUE]  = Number(ruleValue); break;
    case 'regex':      payload[FORM_VALIDATION_RULE_ATTRS.REGEX_PATTERN] = ruleValue; break;
  }
  return payload;
}

function extractRuleValue(record: Record<string, unknown>, ruleType: ValidationRuleType): string | null {
  switch (ruleType) {
    case 'min_length': return record[FORM_VALIDATION_RULE_ATTRS.MIN_LENGTH] != null ? String(record[FORM_VALIDATION_RULE_ATTRS.MIN_LENGTH]) : null;
    case 'max_length': return record[FORM_VALIDATION_RULE_ATTRS.MAX_LENGTH] != null ? String(record[FORM_VALIDATION_RULE_ATTRS.MAX_LENGTH]) : null;
    case 'min_value':  return record[FORM_VALIDATION_RULE_ATTRS.MIN_VALUE]  != null ? String(record[FORM_VALIDATION_RULE_ATTRS.MIN_VALUE])  : null;
    case 'max_value':  return record[FORM_VALIDATION_RULE_ATTRS.MAX_VALUE]  != null ? String(record[FORM_VALIDATION_RULE_ATTRS.MAX_VALUE]  ) : null;
    case 'regex':      return record[FORM_VALIDATION_RULE_ATTRS.REGEX_PATTERN] != null ? String(record[FORM_VALIDATION_RULE_ATTRS.REGEX_PATTERN]) : null;
    default:           return null;
  }
}
