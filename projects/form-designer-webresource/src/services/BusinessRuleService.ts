import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_BUSINESS_RULE_ATTRS } from '@/constants/attributeNames';
import type { DesignerBusinessRule } from '@/state/models/DesignerRuleModel';
import type { BusinessRuleDefinition } from '@/types/businessRule';
import { withRetry } from './crmRetry';

export interface CreateBusinessRuleDto {
  formId: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  definition: BusinessRuleDefinition;
}

export interface UpdateBusinessRuleDto {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
  definition?: BusinessRuleDefinition;
}

export class BusinessRuleService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createRule(dto: CreateBusinessRuleDto): Promise<string> {
    const result = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.FORM_BUSINESS_RULE, {
          [FORM_BUSINESS_RULE_ATTRS.FORM_ID]: dto.formId,
          [FORM_BUSINESS_RULE_ATTRS.NAME]: dto.name,
          [FORM_BUSINESS_RULE_ATTRS.IS_ACTIVE]: dto.isActive,
          [FORM_BUSINESS_RULE_ATTRS.SORT_ORDER]: dto.sortOrder,
          [FORM_BUSINESS_RULE_ATTRS.RULE_DEFINITION]: JSON.stringify(dto.definition),
        }),
      'createBusinessRule'
    );
    return result.id;
  }

  async updateRule(id: string, dto: UpdateBusinessRuleDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data[FORM_BUSINESS_RULE_ATTRS.NAME] = dto.name;
    if (dto.isActive !== undefined) data[FORM_BUSINESS_RULE_ATTRS.IS_ACTIVE] = dto.isActive;
    if (dto.sortOrder !== undefined) data[FORM_BUSINESS_RULE_ATTRS.SORT_ORDER] = dto.sortOrder;
    if (dto.definition !== undefined) {
      data[FORM_BUSINESS_RULE_ATTRS.RULE_DEFINITION] = JSON.stringify(dto.definition);
    }

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_BUSINESS_RULE, id, data),
      'updateBusinessRule'
    );
  }

  async deleteRule(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_BUSINESS_RULE, id),
      'deleteBusinessRule'
    );
  }

  async listRulesForForm(formId: string): Promise<DesignerBusinessRule[]> {
    const select = [
      FORM_BUSINESS_RULE_ATTRS.ID,
      FORM_BUSINESS_RULE_ATTRS.FORM_ID_VALUE,
      FORM_BUSINESS_RULE_ATTRS.NAME,
      FORM_BUSINESS_RULE_ATTRS.RULE_DEFINITION,
      FORM_BUSINESS_RULE_ATTRS.IS_ACTIVE,
      FORM_BUSINESS_RULE_ATTRS.SORT_ORDER,
    ].join(',');

    const filter = `${FORM_BUSINESS_RULE_ATTRS.FORM_ID_VALUE} eq ${formId}`;
    const orderBy = `${FORM_BUSINESS_RULE_ATTRS.SORT_ORDER} asc`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_BUSINESS_RULE,
          `?$select=${select}&$filter=${filter}&$orderby=${orderBy}`
        ),
      'listRulesForForm'
    );

    return result.entities.map(record => this.mapRecordToModel(record));
  }

  async syncRules(formId: string, currentRules: DesignerBusinessRule[]): Promise<void> {
    const existing = await this.listRulesForForm(formId);
    const currentRealIds = new Set(currentRules.filter(r => !r.id.startsWith('tmp_')).map(r => r.id));

    await Promise.all(
      existing.filter(r => !currentRealIds.has(r.id)).map(r => this.deleteRule(r.id))
    );

    for (const rule of currentRules) {
      if (rule.id.startsWith('tmp_')) {
        await this.createRule({ formId, name: rule.name, isActive: rule.isActive, sortOrder: rule.sortOrder, definition: rule.definition });
      } else {
        await this.updateRule(rule.id, { name: rule.name, isActive: rule.isActive, sortOrder: rule.sortOrder, definition: rule.definition });
      }
    }
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerBusinessRule {
    const rawDefinition = String(record[FORM_BUSINESS_RULE_ATTRS.RULE_DEFINITION] ?? '{}');
    return {
      id: String(record[FORM_BUSINESS_RULE_ATTRS.ID] ?? ''),
      formId: String(record[FORM_BUSINESS_RULE_ATTRS.FORM_ID_VALUE] ?? ''),
      name: String(record[FORM_BUSINESS_RULE_ATTRS.NAME] ?? ''),
      isActive: Boolean(record[FORM_BUSINESS_RULE_ATTRS.IS_ACTIVE]),
      sortOrder: Number(record[FORM_BUSINESS_RULE_ATTRS.SORT_ORDER] ?? 0),
      definition: JSON.parse(rawDefinition) as BusinessRuleDefinition,
    };
  }
}
