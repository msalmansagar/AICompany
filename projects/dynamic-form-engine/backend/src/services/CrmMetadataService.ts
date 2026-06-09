import { LRUCache } from 'lru-cache';
import type {
  FormDefinition,
  FormSummary,
  FormButton,
  ButtonAction,
  TabDefinition,
  SectionDefinition,
  FieldDefinition,
  ValidationRule,
  BusinessRule,
  RuleCondition,
  OptionValue,
  LookupConfig,
  SubmissionMapping,
  FormVersion,
  FieldType,
  ValidationRuleType,
  BusinessRuleAction,
  ConditionOperator,
  LogicalOperator,
  GridColumnConfig,
  GridColumnOptionValue,
  FileUploadConfig,
} from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import { logger } from '../utils/logger.js';
import { FormNotFoundError, FormInactiveError, ValidationError } from '../utils/errors.js';
import { config } from '../config/env.js';
import type { CrmAuthService } from './CrmAuthService.js';
import type { CrmInfoCardService, InfoCardScreen } from './CrmInfoCardService.js';

const SAFE_FORM_CODE_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

interface ODataCollection<T> {
  value: T[];
}

export class CrmMetadataService extends CrmBaseService {
  private readonly cacheKeysByFormCode = new Map<string, Set<string>>();

  constructor(
    authService: CrmAuthService,
    private readonly cache: LRUCache<string, FormDefinition>,
    private readonly infoCardService: CrmInfoCardService | null = null,
  ) {
    super(authService);
  }

  async getFormDefinition(formCode: string, locale?: string): Promise<FormDefinition> {
    if (!SAFE_FORM_CODE_PATTERN.test(formCode)) {
      throw new ValidationError(`Invalid form code: '${formCode}'`);
    }

    const cacheKey = locale ? `${formCode}:${locale}` : formCode;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const form = await this.fetchAndAssembleForm(formCode, locale);
    this.cache.set(cacheKey, form);

    const keys = this.cacheKeysByFormCode.get(formCode) ?? new Set();
    keys.add(cacheKey);
    this.cacheKeysByFormCode.set(formCode, keys);

    return form;
  }

  async listForms(filter?: { search?: string; status?: string }): Promise<FormSummary[]> {
    const conditions: string[] = ['statecode eq 0'];

    const statusCode = this.mapFormStatusToCode(filter?.status ?? 'active');
    if (statusCode !== undefined) {
      conditions.push(`qdb_status eq ${statusCode}`);
    }

    if (filter?.search) {
      const safe = filter.search.replace(/'/g, "''");
      conditions.push(`(contains(qdb_title, '${safe}') or contains(qdb_form_code, '${safe}'))`);
    }

    const response = await this.crmFetch<ODataCollection<RawFormDefinition>>(
      `/qdb_form_definitions?$filter=${conditions.join(' and ')}` +
      `&$select=qdb_form_definitionid,qdb_form_code,qdb_title,qdb_description,qdb_status,qdb_version,modifiedon` +
      `&$orderby=qdb_title asc`,
    );
    return response.value.map((raw) => this.mapFormSummary(raw));
  }

  private mapFormStatusToCode(status: string): number | undefined {
    const map: Record<string, number> = {
      draft: 100000000,
      active: 100000001,
      inactive: 100000002,
      archived: 100000003,
    };
    return map[status];
  }

  async getFormVersions(formCode: string): Promise<FormVersion[]> {
    const formDef = await this.getFormDefinition(formCode);
    const response = await this.crmFetch<ODataCollection<RawVersion>>(
      `/qdb_form_versions?$filter=_qdb_form_definition_id_value eq '${formDef.id}'&$orderby=qdb_version_number desc`,
    );
    return response.value.map((v) => this.mapVersion(v));
  }

  invalidateCache(formCode: string): void {
    const keys = this.cacheKeysByFormCode.get(formCode) ?? new Set();
    for (const key of keys) {
      this.cache.delete(key);
    }
    this.cacheKeysByFormCode.delete(formCode);
  }

  private async fetchAndAssembleForm(formCode: string, locale?: string): Promise<FormDefinition> {
    const response = await this.crmFetch<ODataCollection<RawFormDefinition>>(
      `/qdb_form_definitions?$filter=qdb_form_code eq '${formCode}' and statecode eq 0&$top=1`,
    );

    const raw = response.value[0];
    if (!raw) throw new FormNotFoundError(formCode);
    if (raw.qdb_status !== 100000001) throw new FormInactiveError(formCode);

    const formId = raw.qdb_form_definitionid;

    const [tabs, submissionMappings, buttons, infoCards] = await Promise.all([
      this.fetchTabsWithChildren(formId, locale),
      this.fetchSubmissionMappings(formId),
      this.fetchFormButtons(formId),
      this.infoCardService
        ? this.infoCardService.fetchInfoCardScreens(formId, formId)
        : Promise.resolve<InfoCardScreen[]>([]),
    ]);

    return {
      id: formId,
      formCode: raw.qdb_form_code,
      title: raw.qdb_title,
      description: raw.qdb_description,
      status: this.mapFormStatus(raw.qdb_status),
      version: raw.qdb_version ?? 1,
      allowSaveDraft: raw.qdb_allow_save_draft ?? true,
      draftExpiryDays: raw.qdb_draft_expiry_days ?? 90,
      powerAutomateFlowId: raw.qdb_power_automate_flow_id,
      confirmationMessage: raw.qdb_confirmation_message ?? 'Your form has been submitted.',
      confirmationRecordRefAttribute: raw.qdb_confirmation_record_ref_attribute,
      accessGroupId: raw.qdb_access_group_id,
      // DFE-ADD-001 extensions (backward-compatible — defaults to false / empty).
      allowInfocardSkip: raw.qdb_allow_infocard_skip ?? false,
      infocardCountsInProgress: raw.qdb_infocard_counts_in_progress ?? false,
      infocardBackLabel: raw.qdb_infocard_back_label,
      infocardContinueLabel: raw.qdb_infocard_continue_label,
      infocardStartLabel: raw.qdb_infocard_start_label,
      infocardSkipLabel: raw.qdb_infocard_skip_label,
      infoCards,
      submissionMappings,
      buttons,
      tabs,
      createdAt: raw.createdon,
      modifiedAt: raw.modifiedon,
    };
  }

  private async fetchTabsWithChildren(formId: string, locale?: string): Promise<TabDefinition[]> {
    const response = await this.crmFetch<ODataCollection<RawTab>>(
      `/qdb_form_tabs?$filter=_qdb_form_definition_id_value eq '${formId}' and statecode eq 0&$orderby=qdb_display_order asc`,
    );

    const tabs = response.value;
    if (tabs.length === 0) return [];

    const tabIds = tabs.map((t) => t.qdb_form_tabid);
    const sections = await this.fetchSectionsWithChildren(tabIds, formId, locale);

    const sectionsByTab = new Map<string, SectionDefinition[]>();
    for (const section of sections) {
      const existing = sectionsByTab.get(section.tabId) ?? [];
      existing.push(section);
      sectionsByTab.set(section.tabId, existing);
    }

    return tabs.map((tab) => ({
      id: tab.qdb_form_tabid,
      formDefinitionId: formId,
      label: tab.qdb_label,
      iconName: tab.qdb_icon_name,
      displayOrder: tab.qdb_display_order,
      isVisible: tab.qdb_is_visible ?? true,
      requiresPreviousTabComplete: tab.qdb_requires_previous_tab_complete ?? false,
      sections: sectionsByTab.get(tab.qdb_form_tabid) ?? [],
    }));
  }

  private async fetchSectionsWithChildren(tabIds: string[], formId: string, locale?: string): Promise<SectionDefinition[]> {
    const filter = tabIds.map((id) => `_qdb_form_tab_id_value eq '${id}'`).join(' or ');
    const response = await this.crmFetch<ODataCollection<RawSection>>(
      `/qdb_form_sections?$filter=(${filter}) and statecode eq 0&$orderby=qdb_display_order asc`,
    );

    const sections = response.value;
    if (sections.length === 0) return [];

    const sectionIds = sections.map((s) => s.qdb_form_sectionid);
    const fields = await this.fetchFieldsWithMetadata(sectionIds, formId, locale);

    const fieldsBySection = new Map<string, FieldDefinition[]>();
    for (const field of fields) {
      const existing = fieldsBySection.get(field.sectionId) ?? [];
      existing.push(field);
      fieldsBySection.set(field.sectionId, existing);
    }

    return sections.map((section) => ({
      id: section.qdb_form_sectionid,
      tabId: section._qdb_form_tab_id_value,
      label: section.qdb_label,
      description: section.qdb_description,
      displayOrder: section.qdb_display_order,
      columns: this.mapColumns(section.qdb_columns),
      isCollapsible: section.qdb_is_collapsible ?? false,
      isCollapsedByDefault: section.qdb_is_collapsed_by_default ?? false,
      isVisible: section.qdb_is_visible ?? true,
      fields: fieldsBySection.get(section.qdb_form_sectionid) ?? [],
    }));
  }

  private async fetchFieldsWithMetadata(sectionIds: string[], formId: string, locale?: string): Promise<FieldDefinition[]> {
    const filter = sectionIds.map((id) => `_qdb_form_section_id_value eq '${id}'`).join(' or ');
    const response = await this.crmFetch<ODataCollection<RawField>>(
      `/qdb_form_fields?$filter=(${filter}) and statecode eq 0&$orderby=qdb_display_order asc`,
    );

    const fields = response.value;
    if (fields.length === 0) return [];

    const fieldIds = fields.map((f) => f.qdb_form_fieldid);

    // Map field GUID â†’ schema name so business rule conditions can resolve to schema names
    const fieldGuidToSchema = new Map<string, string>(
      fields.map((f) => [f.qdb_form_fieldid, f.qdb_schema_name]),
    );

    const [optionsMap, validationMap, lookupMap, businessRulesMap, columnConfigMap] = await Promise.all([
      this.fetchOptions(fields),
      this.fetchValidationRules(fieldIds),
      this.fetchLookupConfigs(fieldIds, fieldGuidToSchema),
      this.fetchBusinessRules(formId, fieldIds, fieldGuidToSchema),
      this.fetchGridColumnConfigs(fieldIds),
    ]);

    const definitions = fields.map((field) => ({
      id: field.qdb_form_fieldid,
      sectionId: field._qdb_form_section_id_value,
      fieldType: this.mapFieldType(field.qdb_field_type),
      schemaName: field.qdb_schema_name,
      label: field.qdb_label,
      placeholder: field.qdb_placeholder,
      tooltip: field.qdb_tooltip,
      defaultValue: field.qdb_default_value,
      displayOrder: field.qdb_display_order,
      columnSpan: this.mapColumnSpan(field.qdb_column_span),
      isRequired: field.qdb_is_required ?? false,
      isReadonly: field.qdb_is_readonly ?? false,
      isHidden: field.qdb_is_hidden ?? false,
      isVisible: !field.qdb_is_hidden,
      options: optionsMap.get(field.qdb_form_fieldid),
      optionSourceEntity: field.qdb_option_source_entity,
      optionSourceAttribute: field.qdb_option_source_attribute,
      lookupConfig: lookupMap.get(field.qdb_form_fieldid),
      currencyCode: field.qdb_currency_code,
      decimalPlaces: field.qdb_decimal_places,
      maxRows: field.qdb_max_rows,
      componentKey: field.qdb_component_key,
      trueLabel: field.qdb_true_label,
      falseLabel: field.qdb_false_label,
      boolRenderStyle: this.mapBooleanRenderStyle(field.qdb_boolean_render_style),
      multiselectRenderStyle: this.mapMultiselectRenderStyle(field.qdb_multiselect_render_style),
      radioRenderStyle: this.mapRadioRenderStyle(field.qdb_radio_render_style),
      infoCardStyle: this.mapInfoCardStyle(field.qdb_info_card_style),
      infoCardTitle: field.qdb_info_card_title,
      infoCardBody: field.qdb_info_card_body,
      infoCardIcon: field.qdb_info_card_icon,
      fileUploadConfig: this.buildFileUploadConfig(field),
      gridConfig: field.qdb_grid_mode != null ? {
        // Canonical names (read by SelectionGridField / EntryGridField)
        gridMode: this.mapGridMode(field.qdb_grid_mode),
        targetEntity: field.qdb_grid_entity_name ?? '',
        columnConfigs: columnConfigMap.get(field.qdb_form_fieldid) ?? [],
        selectionMode: this.mapSelectionMode(field.qdb_selection_mode),
        minRows: field.qdb_grid_min_rows ?? undefined,
        maxRows: field.qdb_max_rows ?? 200,
        savedViewId: field.qdb_saved_view_id ?? undefined,
        // Alias names (used by new mapper references)
        mode: this.mapGridMode(field.qdb_grid_mode),
        entityName: field.qdb_grid_entity_name ?? undefined,
      } : undefined,
      validationRules: validationMap.get(field.qdb_form_fieldid) ?? [],
      businessRules: businessRulesMap.get(field.qdb_form_fieldid) ?? [],
    }));

    if (locale) {
      const labelMap = await this.fetchLocalizedLabels(fieldIds, locale);
      return this.applyLocalizedLabels(definitions, labelMap);
    }

    return definitions;
  }

  private async fetchGridColumnConfigs(fieldIds: string[]): Promise<Map<string, GridColumnConfig[]>> {
    const filter = fieldIds.map((id) => `_qdb_form_field_id_value eq '${id}'`).join(' or ');
    const response = await this.crmFetch<ODataCollection<RawGridColumnConfig>>(
      `/qdb_grid_column_configs?$filter=(${filter}) and qdb_is_visible eq true&$orderby=qdb_display_order asc`,
    );
    const map = new Map<string, GridColumnConfig[]>();
    for (const col of response.value) {
      const fieldId = col._qdb_form_field_id_value;
      const existing = map.get(fieldId) ?? [];
      existing.push({
        columnId: col.qdb_grid_column_configid,
        displayOrder: col.qdb_display_order,
        columnLabel: col.qdb_column_label,
        targetAttribute: col.qdb_column_attribute,
        columnFieldType: col.qdb_column_field_type ?? 'text',
        options: parseColumnOptions(col.qdb_column_options_json),
      });
      map.set(fieldId, existing);
    }
    return map;
  }

  private async fetchOptions(fields: RawField[]): Promise<Map<string, OptionValue[]>> {
    const map = new Map<string, OptionValue[]>();

    // Partition fields: those with a CRM optionset source vs. those with manual option values
    const crmSourceFields = fields.filter(
      (f) => f.qdb_option_source_entity && f.qdb_option_source_attribute,
    );
    const manualFields = fields.filter(
      (f) => !f.qdb_option_source_entity || !f.qdb_option_source_attribute,
    );

    // Fetch manual options from qdb_form_option_values
    if (manualFields.length > 0) {
      const fieldIds = manualFields.map((f) => f.qdb_form_fieldid);
      const filter = fieldIds.map((id) => `_qdb_form_field_id_value eq '${id}'`).join(' or ');
      const response = await this.crmFetch<ODataCollection<RawOption>>(
        `/qdb_form_option_values?$filter=(${filter}) and qdb_is_active eq true&$orderby=qdb_display_order asc`,
      );
      for (const opt of response.value) {
        const fieldId = opt._qdb_form_field_id_value;
        const existing = map.get(fieldId) ?? [];
        existing.push({
          value: opt.qdb_value,
          label: opt.qdb_label,
          displayOrder: opt.qdb_display_order,
          isDefault: opt.qdb_is_default ?? false,
          parentOptionValue: opt.qdb_parent_option_value,
          isActive: opt.qdb_is_active ?? true,
        });
        map.set(fieldId, existing);
      }
    }

    // Fetch options from CRM attribute OptionSet metadata for source-linked fields
    await Promise.all(
      crmSourceFields.map(async (field) => {
        const options = await this.fetchCrmOptionSetValues(
          field.qdb_option_source_entity!,
          field.qdb_option_source_attribute!,
        );
        if (options.length > 0) map.set(field.qdb_form_fieldid, options);
      }),
    );

    return map;
  }

  private async fetchCrmOptionSetValues(entity: string, attribute: string): Promise<OptionValue[]> {
    try {
      const response = await this.crmFetch<CrmPicklistAttributeResponse>(
        `/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attribute}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet`,
      );
      const options = response.OptionSet?.Options ?? [];
      return options
        .filter((o) => o.Value != null)
        .map((o, index) => ({
          value: String(o.Value),
          label: o.Label?.LocalizedLabels?.[0]?.Label ?? String(o.Value),
          displayOrder: index + 1,
          isDefault: false,
          isActive: true,
        }));
    } catch {
      logger.warn({ entity, attribute }, 'Failed to fetch CRM optionset values — returning empty list');
      return [];
    }
  }

  private async fetchValidationRules(fieldIds: string[]): Promise<Map<string, ValidationRule[]>> {
    const filter = fieldIds.map((id) => `_qdb_form_field_id_value eq '${id}'`).join(' or ');
    const response = await this.crmFetch<ODataCollection<RawValidationRule>>(
      `/qdb_form_validation_rules?$filter=(${filter}) and qdb_is_active eq true&$orderby=qdb_priority asc`,
    );

    const templateIds = [
      ...new Set(
        response.value
          .map((r) => r._qdb_rule_template_id_value)
          .filter((id): id is string => !!id),
      ),
    ];
    const templateMap = await this.fetchRuleTemplates(templateIds);

    const map = new Map<string, ValidationRule[]>();
    for (const rule of response.value) {
      const fieldId = rule._qdb_form_field_id_value;
      const template = rule._qdb_rule_template_id_value
        ? templateMap.get(rule._qdb_rule_template_id_value)
        : undefined;
      const existing = map.get(fieldId) ?? [];
      existing.push(this.mergeRuleWithTemplate(rule, template));
      map.set(fieldId, existing);
    }

    return map;
  }

  private async fetchRuleTemplates(ids: string[]): Promise<Map<string, RawRuleTemplate>> {
    if (ids.length === 0) return new Map();

    const filter = ids.map((id) => `qdb_rule_templateid eq '${id}'`).join(' or ');
    const response = await this.crmFetch<ODataCollection<RawRuleTemplate>>(
      `/qdb_rule_templates?$filter=(${filter})`,
    );

    return new Map(response.value.map((t) => [t.qdb_rule_templateid, t]));
  }

  private mergeRuleWithTemplate(
    rule: RawValidationRule,
    template?: RawRuleTemplate,
  ): ValidationRule {
    return {
      id: rule.qdb_form_validation_ruleid,
      fieldId: rule._qdb_form_field_id_value,
      ruleType: this.mapRuleType(template?.qdb_rule_type ?? rule.qdb_rule_type),
      errorMessage: rule.qdb_error_message || (template?.qdb_error_message ?? ''),
      minLength: rule.qdb_min_length ?? template?.qdb_min_length,
      maxLength: rule.qdb_max_length ?? template?.qdb_max_length,
      minValue: rule.qdb_min_value ?? template?.qdb_min_value,
      maxValue: rule.qdb_max_value ?? template?.qdb_max_value,
      regexPattern: rule.qdb_regex_pattern ?? template?.qdb_regex_pattern,
      compareToFieldId: rule._qdb_compare_to_field_id_value,
      compareToValue: rule.qdb_compare_to_value,
      customExpression: rule.qdb_custom_expression ?? template?.qdb_custom_expression,
      ruleTemplateId: rule._qdb_rule_template_id_value,
      isActive: true,
      priority: rule.qdb_priority ?? 100,
    };
  }

  private async fetchLocalizedLabels(
    fieldIds: string[],
    locale: string,
  ): Promise<Map<string, RawFieldLabel>> {
    const safeLocale = locale.replace(/'/g, "''");
    const filter = fieldIds.map((id) => `_qdb_form_field_id_value eq '${id}'`).join(' or ');
    const response = await this.crmFetch<ODataCollection<RawFieldLabel>>(
      `/qdb_fieldlabels?$filter=(${filter}) and qdb_locale eq '${safeLocale}'`,
    );
    return new Map(response.value.map((l) => [l._qdb_form_field_id_value, l]));
  }

  private applyLocalizedLabels(
    fields: FieldDefinition[],
    labelMap: Map<string, RawFieldLabel>,
  ): FieldDefinition[] {
    return fields.map((field) => {
      const override = labelMap.get(field.id);
      if (!override) return field;
      return {
        ...field,
        ...(override.qdb_label ? { label: override.qdb_label } : {}),
        ...(override.qdb_placeholder ? { placeholder: override.qdb_placeholder } : {}),
        ...(override.qdb_tooltip ? { tooltip: override.qdb_tooltip } : {}),
      };
    });
  }

  private async fetchLookupConfigs(
    fieldIds: string[],
    fieldGuidToSchema: Map<string, string>,
  ): Promise<Map<string, LookupConfig>> {
    const filter = fieldIds.map((id) => `_qdb_form_field_id_value eq '${id}'`).join(' or ');
    const response = await this.crmFetch<ODataCollection<RawLookupConfig>>(
      `/qdb_form_lookup_configs?$filter=(${filter})`,
    );

    const map = new Map<string, LookupConfig>();
    for (const lc of response.value) {
      // Resolve the dependsOn field GUID to its schema name so the frontend can key
      // into fieldValues (which is indexed by schema name, not Dataverse record GUID).
      const dependsOnFieldId = lc._qdb_depends_on_field_id_value
        ? (fieldGuidToSchema.get(lc._qdb_depends_on_field_id_value) ?? lc._qdb_depends_on_field_id_value)
        : undefined;

      map.set(lc._qdb_form_field_id_value, {
        id: lc.qdb_form_lookup_configid,
        entityLogicalName: lc.qdb_entity_logical_name,
        displayAttribute: lc.qdb_display_attribute,
        valueAttribute: lc.qdb_value_attribute ?? `${lc.qdb_entity_logical_name}id`,
        filterExpression: lc.qdb_filter_expression,
        searchMinChars: lc.qdb_search_min_chars ?? 3,
        maxResults: lc.qdb_max_results ?? 10,
        dependsOnFieldId,
        dependsOnFilterTemplate: lc.qdb_depends_on_filter_template,
      });
    }

    return map;
  }

  // Business rules are stored at form-definition level (not field level) in this schema.
  // Conditions live in qdb_conditions_json as a JSON array.
  // Trigger field is identified from the first condition's fieldId (a Dataverse record GUID).
  private async fetchBusinessRules(
    formId: string,
    fieldIds: string[],
    fieldGuidToSchema: Map<string, string>,
  ): Promise<Map<string, BusinessRule[]>> {
    const response = await this.crmFetch<ODataCollection<RawBusinessRule>>(
      `/qdb_form_business_rules?$filter=_qdb_form_definition_id_value eq '${formId}' and qdb_is_active eq true&$orderby=qdb_priority asc`,
    );

    const fieldIdSet = new Set(fieldIds);
    const map = new Map<string, BusinessRule[]>();

    for (const rule of response.value) {
      const triggerGuid = this.extractTriggerFieldGuid(rule.qdb_conditions_json);
      if (!triggerGuid || !fieldIdSet.has(triggerGuid)) continue;

      const existing = map.get(triggerGuid) ?? [];
      existing.push({
        id: rule.qdb_form_business_ruleid,
        name: rule.qdb_name,
        description: rule.qdb_description,
        conditions: this.parseConditionsJson(rule.qdb_conditions_json, fieldGuidToSchema),
        conditionsLogic: this.mapLogicalOperator(rule.qdb_conditions_logic),
        action: this.mapAction(rule.qdb_action),
        targetFieldId: rule._qdb_target_field_id_value,
        targetSectionId: rule._qdb_target_section_id_value,
        targetTabId: rule._qdb_target_tab_id_value,
        actionValue: rule.qdb_action_value,
        priority: rule.qdb_priority ?? 100,
        isActive: true,
      });
      map.set(triggerGuid, existing);
    }

    return map;
  }

  private extractTriggerFieldGuid(conditionsJson: string | undefined): string | undefined {
    if (!conditionsJson) return undefined;
    try {
      const parsed = JSON.parse(conditionsJson) as Array<{ fieldId?: string }>;
      return parsed[0]?.fieldId;
    } catch {
      return undefined;
    }
  }

  // Parses conditions from JSON, resolving field GUIDs to schema names so the
  // RuleEngine can evaluate conditions against form data keyed by schema name.
  private parseConditionsJson(
    conditionsJson: string | undefined,
    fieldGuidToSchema: Map<string, string>,
  ): RuleCondition[] {
    if (!conditionsJson) return [];
    try {
      const parsed = JSON.parse(conditionsJson) as Array<{
        fieldId: string;
        operator: string;
        value?: string;
        logicalOperator?: string;
      }>;
      return parsed.map((c) => ({
        fieldId: fieldGuidToSchema.get(c.fieldId) ?? c.fieldId,
        operator: c.operator as ConditionOperator,
        value: c.value !== undefined ? this.parseConditionValue(c.value) : undefined,
        logicalOperator: (c.logicalOperator as LogicalOperator) ?? undefined,
      }));
    } catch {
      return [];
    }
  }

  private parseConditionValue(raw: string): string | number | boolean | string[] {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const num = Number(raw);
    if (!isNaN(num) && raw.trim() !== '') return num;
    if (raw.startsWith('[')) {
      try { return JSON.parse(raw) as string[]; } catch { /* fall through */ }
    }
    return raw;
  }

  private async fetchFormButtons(formId: string): Promise<FormButton[]> {
    const response = await this.crmFetch<ODataCollection<RawFormButton>>(
      `/qdb_form_buttons?$filter=_qdb_form_definition_id_value eq '${formId}' and statecode eq 0 and qdb_is_active eq true&$orderby=qdb_display_order asc`,
    );

    return response.value.map((b) => ({
      id: b.qdb_form_buttonid,
      formDefinitionId: formId,
      label: b.qdb_label,
      action: this.mapButtonAction(b.qdb_action),
      displayOrder: b.qdb_display_order,
      isVisible: b.qdb_is_visible ?? true,
      isPrimary: b.qdb_is_primary ?? false,
      confirmationRequired: b.qdb_confirmation_required ?? false,
      confirmationMessage: b.qdb_confirmation_message,
      isActive: true,
    }));
  }

  private mapButtonAction(code: number): ButtonAction {
    const map: Record<number, ButtonAction> = {
      100000001: 'submit',
      100000002: 'saveDraft',
      100000003: 'cancel',
      100000004: 'reset',
    };
    return map[code] ?? 'submit';
  }

  private async fetchSubmissionMappings(formId: string): Promise<SubmissionMapping[]> {
    const response = await this.crmFetch<ODataCollection<RawSubmissionMapping>>(
      `/qdb_form_submission_mappings?$filter=_qdb_form_definition_id_value eq '${formId}' and qdb_is_active eq true`,
    );

    return response.value.map((m) => ({
      id: m.qdb_form_submission_mappingid,
      formDefinitionId: formId,
      fieldId: m._qdb_form_field_id_value,
      targetEntityLogicalName: m.qdb_target_entity_logical_name,
      targetAttributeLogicalName: m.qdb_target_attribute_logical_name,
      isMappedToChildEntity: m.qdb_is_child_entity ?? false,
      childEntityRelationshipName: m.qdb_child_entity_relationship_name,
      transformExpression: m.qdb_transform_expression,
      isActive: true,
    }));
  }

  // â”€â”€ Picklist code mappers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private mapFieldType(code: number): FieldType {
    const map: Record<number, FieldType> = {
      100000001: 'text',          100000002: 'textarea',   100000003: 'number',
      100000004: 'date',          100000005: 'datetime',   100000006: 'dropdown',
      100000007: 'multiselect',   100000008: 'lookup',     100000009: 'checkbox',
      100000010: 'radio',         100000011: 'currency',   100000012: 'decimal',
      100000013: 'email',         100000014: 'phone',      100000015: 'file',
      100000016: 'repeatingGrid', 100000017: 'richText',   100000018: 'custom',
      100000019: 'boolean',
      100000020: 'info-card',
      100000021: 'interactive-grid',
    };
    return map[code] ?? 'text';
  }

  private mapBooleanRenderStyle(code: number | undefined): 'toggle' | 'radio' {
    return code === 100000001 ? 'radio' : 'toggle';
  }

  private mapMultiselectRenderStyle(code: number | undefined): 'dropdown' | 'checkboxes' {
    return code === 100000001 ? 'checkboxes' : 'dropdown';
  }

  private mapRadioRenderStyle(code: number | undefined): 'list' | 'cards' {
    return code === 100000001 ? 'cards' : 'list';
  }

  private mapInfoCardStyle(code: number | undefined): 'info' | 'warning' | 'success' | 'error' {
    const map: Record<number, 'info' | 'warning' | 'success' | 'error'> = {
      100000000: 'info', 100000001: 'warning', 100000002: 'success', 100000003: 'error',
    };
    return map[code ?? 0] ?? 'info';
  }

  private mapGridMode(code: number | undefined): 'selection' | 'entry' {
    return code === 100000001 ? 'entry' : 'selection';
  }

  private buildFileUploadConfig(field: RawField): FileUploadConfig | undefined {
    if (field.qdb_field_type !== 100000015) return undefined; // file field only
    const allowedMimeTypes = this.parseAllowedMimeTypes(field.qdb_allowed_mime_types);
    return {
      id: field.qdb_form_fieldid,
      fieldId: field.qdb_form_fieldid,
      allowedMimeTypes,
      maxFileSizeBytes: (field.qdb_max_file_size_mb ?? 10) * 1024 * 1024,
      destination: 'crmNotes',
      maxFiles: field.qdb_max_files ?? 1,
    };
  }

  private parseAllowedMimeTypes(json: string | null | undefined): string[] {
    const defaults = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!json) return defaults;
    try {
      const parsed = JSON.parse(json) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : defaults;
    } catch {
      return defaults;
    }
  }

  private mapSelectionMode(code: number | undefined): 'single' | 'multi' {
    return code === 100000001 ? 'multi' : 'single';
  }

  private mapFormStatus(code: number): 'draft' | 'active' | 'inactive' | 'archived' {
    const map: Record<number, 'draft' | 'active' | 'inactive' | 'archived'> = {
      100000000: 'draft', 100000001: 'active', 100000002: 'inactive', 100000003: 'archived',
    };
    return map[code] ?? 'inactive';
  }

  private mapRuleType(code: number): ValidationRuleType {
    const map: Record<number, ValidationRuleType> = {
      100000001: 'required',          100000002: 'minLength',       100000003: 'maxLength',
      100000004: 'minValue',          100000005: 'maxValue',        100000006: 'regex',
      100000007: 'email',             100000008: 'phone',           100000009: 'dateBefore',
      100000010: 'dateAfter',         100000011: 'crossField',      100000012: 'customExpression',
    };
    return map[code] ?? 'required';
  }

  private mapAction(code: number): BusinessRuleAction {
    const map: Record<number, BusinessRuleAction> = {
      100000001: 'showField',      100000002: 'hideField',
      100000003: 'showSection',    100000004: 'hideSection',
      100000005: 'showTab',        100000006: 'hideTab',
      100000007: 'makeRequired',   100000008: 'makeOptional',
      100000009: 'makeReadonly',   100000010: 'makeEditable',
      100000011: 'setValue',       100000012: 'clearValue',
      100000013: 'calculateValue', 100000014: 'filterOptions',
      100000015: 'filterLookup',
    };
    return map[code] ?? 'showField';
  }

  private mapLogicalOperator(code: number | undefined): LogicalOperator {
    return code === 100000001 ? 'OR' : 'AND';
  }

  private mapColumns(code: number | undefined): 1 | 2 | 3 | 4 {
    const map: Record<number, 1 | 2 | 3 | 4> = {
      100000001: 1, 100000002: 2, 100000003: 3, 100000004: 4,
    };
    return (code !== undefined ? map[code] : undefined) ?? 2;
  }

  private mapColumnSpan(code: number | undefined): 1 | 2 | 3 | 4 {
    const map: Record<number, 1 | 2 | 3 | 4> = {
      100000001: 1, 100000002: 2, 100000003: 3, 100000004: 4,
    };
    return (code !== undefined ? map[code] : undefined) ?? 1;
  }

  private mapFormSummary(raw: RawFormDefinition): FormSummary {
    return {
      id: raw.qdb_form_definitionid,
      formCode: raw.qdb_form_code,
      title: raw.qdb_title,
      description: raw.qdb_description,
      status: this.mapFormStatus(raw.qdb_status),
      version: raw.qdb_version ?? 1,
      modifiedAt: raw.modifiedon,
    };
  }

  private mapVersion(raw: RawVersion): FormVersion {
    return {
      id: raw.qdb_form_versionid,
      formDefinitionId: raw._qdb_form_definition_id_value,
      versionNumber: raw.qdb_version_number,
      publishedAt: raw.qdb_published_at,
      publishedBy: raw.qdb_published_by,
      changeNotes: raw.qdb_change_notes,
      isCurrentVersion: raw.qdb_is_current_version ?? false,
    };
  }
}

// â”€â”€ Raw Dataverse response types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PK names follow Dataverse convention: {entityLogicalName}id  (no underscore before id)
// Lookup expanded values follow OData convention: _{attributeName}_value

interface RawFormDefinition {
  qdb_form_definitionid: string;
  qdb_form_code: string;
  qdb_title: string;
  qdb_description?: string;
  qdb_status: number;
  qdb_version?: number;
  qdb_allow_save_draft?: boolean;
  qdb_draft_expiry_days?: number;
  qdb_power_automate_flow_id?: string;
  qdb_confirmation_message?: string;
  qdb_confirmation_record_ref_attribute?: string;
  qdb_access_group_id?: string;
  // DFE-ADD-001 additions
  qdb_allow_infocard_skip?: boolean;
  qdb_infocard_counts_in_progress?: boolean;
  qdb_infocard_back_label?: string;
  qdb_infocard_continue_label?: string;
  qdb_infocard_start_label?: string;
  qdb_infocard_skip_label?: string;
  createdon: string;
  modifiedon: string;
}

interface RawTab {
  qdb_form_tabid: string;
  qdb_label: string;
  qdb_icon_name?: string;
  qdb_display_order: number;
  qdb_is_visible?: boolean;
  qdb_requires_previous_tab_complete?: boolean;
}

interface RawSection {
  qdb_form_sectionid: string;
  _qdb_form_tab_id_value: string;
  qdb_label: string;
  qdb_description?: string;
  qdb_display_order: number;
  qdb_columns?: number;
  qdb_is_collapsible?: boolean;
  qdb_is_collapsed_by_default?: boolean;
  qdb_is_visible?: boolean;
}

interface RawField {
  qdb_form_fieldid: string;
  _qdb_form_section_id_value: string;
  qdb_field_type: number;
  qdb_schema_name: string;
  qdb_label: string;
  qdb_placeholder?: string;
  qdb_tooltip?: string;
  qdb_default_value?: string;
  qdb_display_order: number;
  qdb_column_span?: number;
  qdb_is_required?: boolean;
  qdb_is_readonly?: boolean;
  qdb_is_hidden?: boolean;
  qdb_currency_code?: string;
  qdb_decimal_places?: number;
  qdb_max_rows?: number;
  qdb_component_key?: string;
  // DFE-ADD-002 boolean field
  qdb_true_label?: string;
  qdb_false_label?: string;
  qdb_boolean_render_style?: number;
  // DFE-ADD-002 info-card field
  qdb_info_card_style?: number;
  qdb_info_card_title?: string;
  qdb_info_card_body?: string;
  qdb_info_card_icon?: string;
  // DFE-ADD-002 interactive-grid field
  qdb_saved_view_id?: string;
  qdb_grid_entity_name?: string;
  qdb_selection_mode?: number;
  qdb_grid_mode?: number;
  qdb_grid_min_rows?: number;
  // File upload config
  qdb_allowed_mime_types?: string;
  qdb_max_file_size_mb?: number;
  qdb_max_files?: number;
  // Multiselect render style
  qdb_multiselect_render_style?: number;
  // Radio render style
  qdb_radio_render_style?: number;
  // Option source from CRM optionset
  qdb_option_source_entity?: string;
  qdb_option_source_attribute?: string;
}

interface RawOption {
  _qdb_form_field_id_value: string;
  qdb_value: string;
  qdb_label: string;
  qdb_display_order: number;
  qdb_is_default?: boolean;
  qdb_parent_option_value?: string;
  qdb_is_active?: boolean;
}

interface RawValidationRule {
  qdb_form_validation_ruleid: string;
  _qdb_form_field_id_value: string;
  qdb_rule_type: number;
  qdb_error_message: string;
  qdb_min_length?: number;
  qdb_max_length?: number;
  qdb_min_value?: number;
  qdb_max_value?: number;
  qdb_regex_pattern?: string;
  _qdb_compare_to_field_id_value?: string;
  qdb_compare_to_value?: string;
  qdb_custom_expression?: string;
  _qdb_rule_template_id_value?: string;
  qdb_priority?: number;
}

interface RawLookupConfig {
  qdb_form_lookup_configid: string;
  _qdb_form_field_id_value: string;
  qdb_entity_logical_name: string;
  qdb_display_attribute: string;
  qdb_value_attribute?: string;
  qdb_filter_expression?: string;
  qdb_search_min_chars?: number;
  qdb_max_results?: number;
  _qdb_depends_on_field_id_value?: string;
  qdb_depends_on_filter_template?: string;
}

interface RawSubmissionMapping {
  qdb_form_submission_mappingid: string;
  _qdb_form_field_id_value: string;
  qdb_target_entity_logical_name: string;
  qdb_target_attribute_logical_name: string;
  qdb_is_child_entity?: boolean;
  qdb_child_entity_relationship_name?: string;
  qdb_transform_expression?: string;
}

interface RawVersion {
  qdb_form_versionid: string;
  _qdb_form_definition_id_value: string;
  qdb_version_number: number;
  qdb_published_at: string;
  qdb_published_by: string;
  qdb_change_notes?: string;
  qdb_is_current_version?: boolean;
}

interface RawFormButton {
  qdb_form_buttonid: string;
  qdb_label: string;
  qdb_action: number;
  qdb_display_order: number;
  qdb_is_visible?: boolean;
  qdb_is_primary?: boolean;
  qdb_confirmation_required?: boolean;
  qdb_confirmation_message?: string;
}

interface RawRuleTemplate {
  qdb_rule_templateid: string;
  qdb_rule_type: number;
  qdb_error_message: string;
  qdb_min_length?: number;
  qdb_max_length?: number;
  qdb_min_value?: number;
  qdb_max_value?: number;
  qdb_regex_pattern?: string;
  qdb_custom_expression?: string;
}

interface RawBusinessRule {
  qdb_form_business_ruleid: string;
  qdb_name: string;
  qdb_description?: string;
  qdb_conditions_json?: string;
  qdb_conditions_logic?: number;
  qdb_action: number;
  _qdb_form_definition_id_value?: string;
  _qdb_target_field_id_value?: string;
  _qdb_target_section_id_value?: string;
  _qdb_target_tab_id_value?: string;
  qdb_action_value?: string;
  qdb_priority?: number;
  qdb_is_active?: boolean;
}

interface RawFieldLabel {
  qdb_fieldlabelid: string;
  _qdb_form_field_id_value: string;
  qdb_locale: string;
  qdb_label?: string;
  qdb_placeholder?: string;
  qdb_tooltip?: string;
}

interface RawGridColumnConfig {
  qdb_grid_column_configid: string;
  _qdb_form_field_id_value: string;
  qdb_column_attribute: string;
  qdb_column_label: string;
  qdb_column_field_type?: string;
  qdb_display_order: number;
  qdb_is_visible?: boolean;
  qdb_is_editable?: boolean;
  qdb_column_options_json?: string;
}

function parseColumnOptions(json: string | null | undefined): GridColumnOptionValue[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed as GridColumnOptionValue[];
  } catch {
    return undefined;
  }
}


interface CrmPicklistAttributeResponse {
  OptionSet?: {
    Options?: Array<{
      Value: number;
      Label?: {
        LocalizedLabels?: Array<{ Label: string; LanguageCode: number }>;
      };
    }>;
  };
}
