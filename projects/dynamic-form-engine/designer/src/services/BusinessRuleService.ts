import type { IWebApiAdapter } from './IWebApiAdapter';
import { assertGuid } from './assertGuid';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_BUSINESS_RULE_ATTRS } from '@/constants/attributeNames';
import type { DesignerBusinessRule } from '@/state/models/DesignerRuleModel';
import type { BusinessRuleDefinition } from '@/types/businessRule';
import { withRetry } from './crmRetry';
import { toDataversePriority, fromDataversePriority } from './priorityCodec';

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
          // Lookup fields require @odata.bind notation on create — plain GUIDs cause OData 400
          [`${FORM_BUSINESS_RULE_ATTRS.FORM_ID}@odata.bind`]: `/qdb_form_definitions(${dto.formId})`,
          [FORM_BUSINESS_RULE_ATTRS.NAME]: dto.name,
          [FORM_BUSINESS_RULE_ATTRS.IS_ACTIVE]: dto.isActive,
          [FORM_BUSINESS_RULE_ATTRS.SORT_ORDER]: toDataversePriority(dto.sortOrder),
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
    if (dto.sortOrder !== undefined) data[FORM_BUSINESS_RULE_ATTRS.SORT_ORDER] = toDataversePriority(dto.sortOrder);
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
    assertGuid(formId, 'formId');
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
    const rawDefinition = record[FORM_BUSINESS_RULE_ATTRS.RULE_DEFINITION];
    let definition: BusinessRuleDefinition;
    try {
      const parsed = rawDefinition != null ? JSON.parse(String(rawDefinition)) : null;
      definition = this.normaliseDefinition(parsed);
    } catch {
      definition = this.normaliseDefinition(null);
    }
    return {
      id: String(record[FORM_BUSINESS_RULE_ATTRS.ID] ?? ''),
      formId: String(record[FORM_BUSINESS_RULE_ATTRS.FORM_ID_VALUE] ?? ''),
      name: String(record[FORM_BUSINESS_RULE_ATTRS.NAME] ?? ''),
      isActive: Boolean(record[FORM_BUSINESS_RULE_ATTRS.IS_ACTIVE]),
      sortOrder: fromDataversePriority(Number(record[FORM_BUSINESS_RULE_ATTRS.SORT_ORDER] ?? 1)),
      definition,
    };
  }

  private normaliseDefinition(raw: unknown): BusinessRuleDefinition {
    const r = raw as Partial<BusinessRuleDefinition> | null | undefined;
    return {
      version: r?.version ?? '1.0',
      trigger_field_code: r?.trigger_field_code ?? '',
      trigger_event: r?.trigger_event ?? 'on_change',
      condition_group: r?.condition_group ?? {
        logical_operator: 'AND',
        conditions: [{ field_code: '', operator: 'equals', value: '' }],
      },
      actions: Array.isArray(r?.actions) && r.actions.length > 0
        ? r.actions
        : [{ action_type: 'show_field', target_field_code: '' }],
    };
  }
}
