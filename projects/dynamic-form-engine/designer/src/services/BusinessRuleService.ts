import type { IWebApiAdapter } from './IWebApiAdapter';
import { assertGuid } from './assertGuid';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  FORM_BUSINESS_RULE_ATTRS,
  BUSINESS_RULE_ACTION_VALUE,
  BUSINESS_RULE_ACTION_TYPE,
  CONDITIONS_LOGIC_OR,
} from '@/constants/attributeNames';
import type { DesignerBusinessRule } from '@/state/models/DesignerRuleModel';
import type {
  BusinessRuleDefinition,
  ConditionOperator,
  RuleAction,
  RuleActionType,
} from '@/types/businessRule';
import { withRetry } from './crmRetry';
import { toDataversePriority, fromDataversePriority } from './priorityCodec';

export interface CreateBusinessRuleDto {
  formId: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  definition: BusinessRuleDefinition;
  /** Resolves a field action target code to its record id; omit when unavailable. */
  fieldCodeToId?: FieldCodeToId;
}

export interface UpdateBusinessRuleDto {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
  definition?: BusinessRuleDefinition;
  fieldCodeToId?: FieldCodeToId;
}

/** Maps a field code to its Dataverse record id, so a field action can fill its lookup. */
export type FieldCodeToId = ReadonlyMap<string, string>;

/**
 * The structured columns that mirror a designer rule's action.
 *
 * The runtime reads the JSON and ignores these entirely — the reader takes the designer
 * path whenever the JSON carries trigger_field_code and an actions array. They exist so the
 * record is not misleading to everything ELSE that looks at it (CRM views, reports, an
 * admin opening the row) and so a tab target is a real lookup rather than a GUID buried in
 * a string, which goes stale silently when the tab is deleted.
 *
 * IMPORTANT — these columns hold ONE action; the designer format holds many. A rule with
 * more than one action cannot be represented here, so every column is cleared rather than
 * mirroring just the first: a partial mirror would state something the rule does not do,
 * which is worse than stating nothing. The JSON remains the source of truth either way.
 */
function buildActionMirror(
  definition: BusinessRuleDefinition,
  fieldCodeToId?: FieldCodeToId,
): Record<string, unknown> {
  const cleared: Record<string, unknown> = {
    [FORM_BUSINESS_RULE_ATTRS.ACTION]: null,
    [`${FORM_BUSINESS_RULE_ATTRS.TARGET_FIELD_ID}@odata.bind`]: null,
    [`${FORM_BUSINESS_RULE_ATTRS.TARGET_TAB_ID}@odata.bind`]: null,
    [`${FORM_BUSINESS_RULE_ATTRS.TARGET_SECTION_ID}@odata.bind`]: null,
  };

  const actions = definition.actions ?? [];
  if (actions.length !== 1) return cleared;

  const action = actions[0]!;
  const actionValue = BUSINESS_RULE_ACTION_VALUE[action.action_type];
  if (actionValue === undefined) return cleared;

  const mirror: Record<string, unknown> = { ...cleared, [FORM_BUSINESS_RULE_ATTRS.ACTION]: actionValue };

  if (action.target_tab_id) {
    mirror[`${FORM_BUSINESS_RULE_ATTRS.TARGET_TAB_ID}@odata.bind`] = `/qdb_form_tabs(${action.target_tab_id})`;
    return mirror;
  }
  if (action.target_section_id) {
    mirror[`${FORM_BUSINESS_RULE_ATTRS.TARGET_SECTION_ID}@odata.bind`] = `/qdb_form_sections(${action.target_section_id})`;
    return mirror;
  }

  // Field actions name a CODE; the column is a lookup, so it needs the record id. Without
  // the map the action still mirrors — an action with no target beats a wrong one.
  const fieldId = action.target_field_code ? fieldCodeToId?.get(action.target_field_code) : undefined;
  if (fieldId) {
    mirror[`${FORM_BUSINESS_RULE_ATTRS.TARGET_FIELD_ID}@odata.bind`] = `/qdb_form_fields(${fieldId})`;
  }
  return mirror;
}

/** Maps a field's record id to its code — the reverse of FieldCodeToId, for legacy import. */
export type FieldIdToCode = ReadonlyMap<string, string>;

/** A legacy condition row as stored in qdb_conditions_json. */
interface LegacyCondition {
  fieldId?: string;
  operator?: string;
  value?: unknown;
}

/** True when the stored JSON is the designer's own object form rather than the legacy array. */
function isDesignerDefinition(parsed: unknown): boolean {
  return !!parsed
    && typeof parsed === 'object'
    && !Array.isArray(parsed)
    && (parsed as Partial<BusinessRuleDefinition>).trigger_field_code !== undefined
    && Array.isArray((parsed as Partial<BusinessRuleDefinition>).actions);
}

/**
 * Rebuilds a designer definition from a legacy rule's structured columns.
 *
 * Loading a legacy rule used to produce a BLANK definition: normaliseDefinition saw a flat
 * array with no trigger_field_code and no actions, so it returned its defaults — an empty
 * trigger, one empty condition and a show_field aimed at nothing. The designer then showed a
 * blank rule, and saving wrote that blank over the real one. Both the conditions and the
 * action were lost, and the structured columns are now overwritten too, so nothing survived.
 *
 * Legacy conditions name a field by RECORD ID while designer conditions name it by CODE. An
 * id that cannot be resolved is left in place as the code rather than replaced by a guess:
 * lint rule L005 already reports an unknown field code, so it surfaces instead of silently
 * pointing at the wrong field.
 */
function importLegacyRule(
  record: Record<string, unknown>,
  rawConditions: unknown,
  fieldIdToCode?: FieldIdToCode,
): BusinessRuleDefinition {
  const legacyConditions: LegacyCondition[] = Array.isArray(rawConditions) ? rawConditions : [];

  const conditions = legacyConditions.map(condition => {
    const rawFieldId = condition.fieldId ?? '';
    return {
      field_code: fieldIdToCode?.get(rawFieldId) ?? rawFieldId,
      operator: (condition.operator ?? 'equals') as ConditionOperator,
      value: condition.value != null ? String(condition.value) : '',
    };
  });

  const actionCode = record[FORM_BUSINESS_RULE_ATTRS.ACTION];
  const actionType = actionCode != null
    ? BUSINESS_RULE_ACTION_TYPE[Number(actionCode)]
    : undefined;

  const targetFieldId = record[FORM_BUSINESS_RULE_ATTRS.TARGET_FIELD_ID_VALUE];
  const targetTabId = record[FORM_BUSINESS_RULE_ATTRS.TARGET_TAB_ID_VALUE];
  const targetSectionId = record[FORM_BUSINESS_RULE_ATTRS.TARGET_SECTION_ID_VALUE];
  const actionValue = record[FORM_BUSINESS_RULE_ATTRS.ACTION_VALUE];

  const action: RuleAction = { action_type: (actionType ?? 'show_field') as RuleActionType };
  if (targetTabId) action.target_tab_id = String(targetTabId);
  else if (targetSectionId) action.target_section_id = String(targetSectionId);
  else if (targetFieldId) {
    action.target_field_code = fieldIdToCode?.get(String(targetFieldId)) ?? String(targetFieldId);
  }
  if (actionValue != null) action.value = String(actionValue);

  return {
    version: '1.0',
    // The plugin attaches a rule to the field that TRIGGERS it, not the one it acts on.
    trigger_field_code: conditions[0]?.field_code ?? '',
    trigger_event: 'on_change',
    condition_group: {
      logical_operator:
        Number(record[FORM_BUSINESS_RULE_ATTRS.CONDITIONS_LOGIC]) === CONDITIONS_LOGIC_OR
          ? 'OR'
          : 'AND',
      conditions: conditions.length > 0
        ? conditions
        : [{ field_code: '', operator: 'equals' as ConditionOperator, value: '' }],
    },
    actions: [action],
  };
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
          ...buildActionMirror(dto.definition, dto.fieldCodeToId),
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
      // The mirror is derived from the definition, so it is rewritten whenever the
      // definition is — otherwise the columns would describe the rule's previous action.
      Object.assign(data, buildActionMirror(dto.definition, dto.fieldCodeToId));
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

  async listRulesForForm(formId: string, fieldIdToCode?: FieldIdToCode): Promise<DesignerBusinessRule[]> {
    assertGuid(formId, 'formId');
    const select = [
      FORM_BUSINESS_RULE_ATTRS.ID,
      FORM_BUSINESS_RULE_ATTRS.FORM_ID_VALUE,
      FORM_BUSINESS_RULE_ATTRS.NAME,
      FORM_BUSINESS_RULE_ATTRS.RULE_DEFINITION,
      FORM_BUSINESS_RULE_ATTRS.IS_ACTIVE,
      FORM_BUSINESS_RULE_ATTRS.SORT_ORDER,
      FORM_BUSINESS_RULE_ATTRS.ACTION,
      FORM_BUSINESS_RULE_ATTRS.ACTION_VALUE,
      FORM_BUSINESS_RULE_ATTRS.CONDITIONS_LOGIC,
      FORM_BUSINESS_RULE_ATTRS.TARGET_FIELD_ID_VALUE,
      FORM_BUSINESS_RULE_ATTRS.TARGET_TAB_ID_VALUE,
      FORM_BUSINESS_RULE_ATTRS.TARGET_SECTION_ID_VALUE,
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

    return result.entities.map(record => this.mapRecordToModel(record, fieldIdToCode));
  }

  async syncRules(
    formId: string,
    currentRules: DesignerBusinessRule[],
    fieldCodeToId?: FieldCodeToId,
  ): Promise<void> {
    const existing = await this.listRulesForForm(formId);
    const currentRealIds = new Set(currentRules.filter(r => !r.id.startsWith('tmp_')).map(r => r.id));

    await Promise.all(
      existing.filter(r => !currentRealIds.has(r.id)).map(r => this.deleteRule(r.id))
    );

    for (const rule of currentRules) {
      if (rule.id.startsWith('tmp_')) {
        await this.createRule({ formId, name: rule.name, isActive: rule.isActive, sortOrder: rule.sortOrder, definition: rule.definition, fieldCodeToId });
      } else {
        await this.updateRule(rule.id, { name: rule.name, isActive: rule.isActive, sortOrder: rule.sortOrder, definition: rule.definition, fieldCodeToId });
      }
    }
  }

  private mapRecordToModel(record: Record<string, unknown>, fieldIdToCode?: FieldIdToCode): DesignerBusinessRule {
    const rawDefinition = record[FORM_BUSINESS_RULE_ATTRS.RULE_DEFINITION];
    let definition: BusinessRuleDefinition;
    try {
      const parsed: unknown = rawDefinition != null ? JSON.parse(String(rawDefinition)) : null;
      // A legacy rule stores a flat conditions array and keeps its action in the structured
      // columns. Normalising that returns a BLANK rule, which the designer then saves over
      // the real one — so it is rebuilt from those columns instead.
      definition = isDesignerDefinition(parsed)
        ? this.normaliseDefinition(parsed)
        : importLegacyRule(record, parsed, fieldIdToCode);
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
