import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { RULE_TEMPLATE_ATTRS, RULE_TYPE_TO_PICKLIST, PICKLIST_TO_RULE_TYPE } from '@/constants/attributeNames';
import type { DesignerRuleTemplateModel } from '@/state/models/DesignerRuleTemplateModel';
import type { ValidationRuleType } from '@/state/models/DesignerRuleModel';
import { withRetry } from './crmRetry';

export interface CreateRuleTemplateDto {
  name: string;
  ruleType: ValidationRuleType;
  errorMessage: string;
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  regexPattern?: string | null;
  customExpression?: string | null;
}

export interface UpdateRuleTemplateDto {
  name?: string;
  ruleType?: ValidationRuleType;
  errorMessage?: string;
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  regexPattern?: string | null;
  customExpression?: string | null;
}

export class RuleTemplateService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async listTemplates(): Promise<DesignerRuleTemplateModel[]> {
    const select = [
      RULE_TEMPLATE_ATTRS.ID,
      RULE_TEMPLATE_ATTRS.NAME,
      RULE_TEMPLATE_ATTRS.RULE_TYPE,
      RULE_TEMPLATE_ATTRS.ERROR_MESSAGE,
      RULE_TEMPLATE_ATTRS.MIN_LENGTH,
      RULE_TEMPLATE_ATTRS.MAX_LENGTH,
      RULE_TEMPLATE_ATTRS.MIN_VALUE,
      RULE_TEMPLATE_ATTRS.MAX_VALUE,
      RULE_TEMPLATE_ATTRS.REGEX_PATTERN,
      RULE_TEMPLATE_ATTRS.CUSTOM_EXPRESSION,
    ].join(',');

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.RULE_TEMPLATE,
        `?$select=${select}&$orderby=${RULE_TEMPLATE_ATTRS.NAME} asc`
      ),
      'listRuleTemplates'
    );

    return result.entities.map(r => this.mapRecordToModel(r));
  }

  async createTemplate(dto: CreateRuleTemplateDto): Promise<string> {
    const payload: Record<string, unknown> = {
      [RULE_TEMPLATE_ATTRS.NAME]: dto.name,
      [RULE_TEMPLATE_ATTRS.RULE_TYPE]: RULE_TYPE_TO_PICKLIST[dto.ruleType] ?? RULE_TYPE_TO_PICKLIST['required'],
      [RULE_TEMPLATE_ATTRS.ERROR_MESSAGE]: dto.errorMessage,
    };
    if (dto.minLength != null) payload[RULE_TEMPLATE_ATTRS.MIN_LENGTH] = dto.minLength;
    if (dto.maxLength != null) payload[RULE_TEMPLATE_ATTRS.MAX_LENGTH] = dto.maxLength;
    if (dto.minValue != null) payload[RULE_TEMPLATE_ATTRS.MIN_VALUE] = dto.minValue;
    if (dto.maxValue != null) payload[RULE_TEMPLATE_ATTRS.MAX_VALUE] = dto.maxValue;
    if (dto.regexPattern != null) payload[RULE_TEMPLATE_ATTRS.REGEX_PATTERN] = dto.regexPattern;
    if (dto.customExpression != null) payload[RULE_TEMPLATE_ATTRS.CUSTOM_EXPRESSION] = dto.customExpression;

    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.RULE_TEMPLATE, payload),
      'createRuleTemplate'
    );
    return result.id;
  }

  async updateTemplate(id: string, dto: UpdateRuleTemplateDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data[RULE_TEMPLATE_ATTRS.NAME] = dto.name;
    if (dto.ruleType !== undefined) data[RULE_TEMPLATE_ATTRS.RULE_TYPE] = RULE_TYPE_TO_PICKLIST[dto.ruleType] ?? RULE_TYPE_TO_PICKLIST['required'];
    if (dto.errorMessage !== undefined) data[RULE_TEMPLATE_ATTRS.ERROR_MESSAGE] = dto.errorMessage;
    if (dto.minLength !== undefined) data[RULE_TEMPLATE_ATTRS.MIN_LENGTH] = dto.minLength ?? null;
    if (dto.maxLength !== undefined) data[RULE_TEMPLATE_ATTRS.MAX_LENGTH] = dto.maxLength ?? null;
    if (dto.minValue !== undefined) data[RULE_TEMPLATE_ATTRS.MIN_VALUE] = dto.minValue ?? null;
    if (dto.maxValue !== undefined) data[RULE_TEMPLATE_ATTRS.MAX_VALUE] = dto.maxValue ?? null;
    if (dto.regexPattern !== undefined) data[RULE_TEMPLATE_ATTRS.REGEX_PATTERN] = dto.regexPattern ?? null;
    if (dto.customExpression !== undefined) data[RULE_TEMPLATE_ATTRS.CUSTOM_EXPRESSION] = dto.customExpression ?? null;

    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.RULE_TEMPLATE, id, data),
      'updateRuleTemplate'
    );
  }

  async deleteTemplate(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.RULE_TEMPLATE, id),
      'deleteRuleTemplate'
    );
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerRuleTemplateModel {
    const ruleTypeCode = Number(record[RULE_TEMPLATE_ATTRS.RULE_TYPE] ?? 0);
    return {
      id: String(record[RULE_TEMPLATE_ATTRS.ID] ?? ''),
      name: String(record[RULE_TEMPLATE_ATTRS.NAME] ?? ''),
      ruleType: (PICKLIST_TO_RULE_TYPE[ruleTypeCode] ?? 'required') as ValidationRuleType,
      errorMessage: String(record[RULE_TEMPLATE_ATTRS.ERROR_MESSAGE] ?? ''),
      minLength: record[RULE_TEMPLATE_ATTRS.MIN_LENGTH] != null ? Number(record[RULE_TEMPLATE_ATTRS.MIN_LENGTH]) : null,
      maxLength: record[RULE_TEMPLATE_ATTRS.MAX_LENGTH] != null ? Number(record[RULE_TEMPLATE_ATTRS.MAX_LENGTH]) : null,
      minValue: record[RULE_TEMPLATE_ATTRS.MIN_VALUE] != null ? Number(record[RULE_TEMPLATE_ATTRS.MIN_VALUE]) : null,
      maxValue: record[RULE_TEMPLATE_ATTRS.MAX_VALUE] != null ? Number(record[RULE_TEMPLATE_ATTRS.MAX_VALUE]) : null,
      regexPattern: record[RULE_TEMPLATE_ATTRS.REGEX_PATTERN] != null ? String(record[RULE_TEMPLATE_ATTRS.REGEX_PATTERN]) : null,
      customExpression: record[RULE_TEMPLATE_ATTRS.CUSTOM_EXPRESSION] != null ? String(record[RULE_TEMPLATE_ATTRS.CUSTOM_EXPRESSION]) : null,
    };
  }
}
