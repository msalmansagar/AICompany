import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_VALIDATION_RULE_ATTRS } from '@/constants/attributeNames';
import type { DesignerValidationRule, ValidationRuleType } from '@/state/models/DesignerRuleModel';
import { withRetry } from './crmRetry';
import { RULE_TYPE_TO_PICKLIST, PICKLIST_TO_RULE_TYPE } from '@/constants/attributeNames';

export interface CreateValidationRuleDto {
  fieldId: string;
  ruleType: ValidationRuleType;
  ruleValue: string | null;
  errorMessage: string;
  sortOrder: number;
  customExpression?: string | null;
  ruleTemplateId?: string | null;
}

export interface UpdateValidationRuleDto {
  ruleType?: ValidationRuleType;
  ruleValue?: string | null;
  errorMessage?: string;
  sortOrder?: number;
  customExpression?: string | null;
  ruleTemplateId?: string | null;
}

export class ValidationRuleService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createRule(dto: CreateValidationRuleDto): Promise<string> {
    const ruleTypeCode = RULE_TYPE_TO_PICKLIST[dto.ruleType] ?? RULE_TYPE_TO_PICKLIST['required'];
    const payload: Record<string, unknown> = {
      [`${FORM_VALIDATION_RULE_ATTRS.FIELD_ID}@odata.bind`]: `/qdb_form_fields(${dto.fieldId})`,
      [FORM_VALIDATION_RULE_ATTRS.RULE_TYPE]: ruleTypeCode,
      [FORM_VALIDATION_RULE_ATTRS.ERROR_MESSAGE]: dto.errorMessage,
      [FORM_VALIDATION_RULE_ATTRS.SORT_ORDER]: dto.sortOrder,
      ...buildRuleValuePayload(dto.ruleType, dto.ruleValue),
    };
    if (dto.customExpression != null) payload[FORM_VALIDATION_RULE_ATTRS.CUSTOM_EXPRESSION] = dto.customExpression;
    if (dto.ruleTemplateId != null) payload[`${FORM_VALIDATION_RULE_ATTRS.RULE_TEMPLATE_ID}@odata.bind`] = `/qdb_rule_templates(${dto.ruleTemplateId})`;

    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.FORM_VALIDATION_RULE, payload),
      'createValidationRule'
    );
    return result.id;
  }

  async updateRule(id: string, dto: UpdateValidationRuleDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.ruleType !== undefined) data[FORM_VALIDATION_RULE_ATTRS.RULE_TYPE] = RULE_TYPE_TO_PICKLIST[dto.ruleType] ?? RULE_TYPE_TO_PICKLIST['required'];
    if (dto.errorMessage !== undefined) data[FORM_VALIDATION_RULE_ATTRS.ERROR_MESSAGE] = dto.errorMessage;
    if (dto.sortOrder !== undefined) data[FORM_VALIDATION_RULE_ATTRS.SORT_ORDER] = dto.sortOrder;
    if (dto.ruleType !== undefined && dto.ruleValue !== undefined) {
      Object.assign(data, buildRuleValuePayload(dto.ruleType, dto.ruleValue));
    }
    if (dto.customExpression !== undefined) data[FORM_VALIDATION_RULE_ATTRS.CUSTOM_EXPRESSION] = dto.customExpression ?? null;
    if (dto.ruleTemplateId !== undefined) {
      if (dto.ruleTemplateId != null) {
        data[`${FORM_VALIDATION_RULE_ATTRS.RULE_TEMPLATE_ID}@odata.bind`] = `/qdb_rule_templates(${dto.ruleTemplateId})`;
      } else {
        data[`${FORM_VALIDATION_RULE_ATTRS.RULE_TEMPLATE_ID}@odata.bind`] = null;
      }
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
      FORM_VALIDATION_RULE_ATTRS.CUSTOM_EXPRESSION,
      FORM_VALIDATION_RULE_ATTRS.RULE_TEMPLATE_ID_VALUE,
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
        await this.createRule({ fieldId, ruleType: rule.ruleType, ruleValue: rule.ruleValue, errorMessage: rule.errorMessage, sortOrder: rule.sortOrder, customExpression: rule.customExpression, ruleTemplateId: rule.ruleTemplateId });
      } else {
        await this.updateRule(rule.id, { ruleType: rule.ruleType, ruleValue: rule.ruleValue, errorMessage: rule.errorMessage, sortOrder: rule.sortOrder, customExpression: rule.customExpression, ruleTemplateId: rule.ruleTemplateId });
      }
    }
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerValidationRule {
    const ruleTypeCode = Number(record[FORM_VALIDATION_RULE_ATTRS.RULE_TYPE] ?? 0);
    const ruleType = (PICKLIST_TO_RULE_TYPE[ruleTypeCode] ?? 'required') as ValidationRuleType;
    return {
      id: String(record[FORM_VALIDATION_RULE_ATTRS.ID] ?? ''),
      fieldId: String(record[FORM_VALIDATION_RULE_ATTRS.FIELD_ID_VALUE] ?? ''),
      ruleType,
      ruleValue: extractRuleValue(record, ruleType),
      errorMessage: String(record[FORM_VALIDATION_RULE_ATTRS.ERROR_MESSAGE] ?? ''),
      sortOrder: Number(record[FORM_VALIDATION_RULE_ATTRS.SORT_ORDER] ?? 0),
      customExpression: record[FORM_VALIDATION_RULE_ATTRS.CUSTOM_EXPRESSION] != null
        ? String(record[FORM_VALIDATION_RULE_ATTRS.CUSTOM_EXPRESSION])
        : null,
      ruleTemplateId: record[FORM_VALIDATION_RULE_ATTRS.RULE_TEMPLATE_ID_VALUE] != null
        ? String(record[FORM_VALIDATION_RULE_ATTRS.RULE_TEMPLATE_ID_VALUE])
        : null,
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
    // custom_expression is handled separately via the dto.customExpression field
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
