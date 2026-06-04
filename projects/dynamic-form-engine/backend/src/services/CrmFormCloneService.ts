import { v4 as uuidv4 } from 'uuid';
import { CrmBaseService } from './CrmBaseService.js';
import { FormNotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';

interface CloneResult {
  newFormId: string;
  newFormCode: string;
}

interface RawFormSummary {
  qdb_form_definitionid: string;
  qdb_form_code: string;
  qdb_title: string;
  qdb_description?: string;
  qdb_entity_logical_name?: string;
  _qdb_theme_id_value?: string;
  qdb_allow_save_draft?: boolean;
  qdb_draft_expiry_days?: number;
  qdb_confirmation_message?: string;
}

interface RawTab {
  qdb_form_tabid: string;
  qdb_label: string;
  qdb_display_order: number;
  qdb_icon_name?: string;
  qdb_is_visible?: boolean;
  qdb_requires_previous_tab_complete?: boolean;
}

interface RawSection {
  qdb_form_sectionid: string;
  _qdb_form_tab_id_value: string;
  qdb_label: string;
  qdb_description?: string;
  qdb_columns?: number;
  qdb_display_order: number;
  qdb_is_collapsible?: boolean;
  qdb_is_collapsed_by_default?: boolean;
  qdb_is_visible?: boolean;
}

interface RawField {
  qdb_form_fieldid: string;
  _qdb_form_section_id_value: string;
  qdb_label: string;
  qdb_schema_name: string;
  qdb_field_type: string;
  qdb_placeholder?: string;
  qdb_help_text?: string;
  qdb_is_required?: boolean;
  qdb_is_read_only?: boolean;
  qdb_is_hidden?: boolean;
  qdb_default_value?: string;
  qdb_display_order: number;
  qdb_column_span?: number;
  qdb_decimal_places?: number;
  qdb_currency_code?: string;
  qdb_max_rows?: number;
}

interface RawOptionValue {
  qdb_form_option_valueid: string;
  _qdb_form_field_id_value: string;
  qdb_label: string;
  qdb_value: string;
  qdb_display_order: number;
  qdb_is_default?: boolean;
}

interface RawValidationRule {
  qdb_validation_ruleid: string;
  _qdb_form_field_id_value: string;
  qdb_rule_type: string;
  qdb_rule_value?: string;
  qdb_error_message: string;
  qdb_is_active?: boolean;
  qdb_display_order: number;
}

interface RawLookupConfig {
  qdb_lookup_configid: string;
  _qdb_form_field_id_value: string;
  qdb_target_entity: string;
  qdb_display_field: string;
  qdb_value_field: string;
  qdb_filter_query?: string;
  qdb_search_min_chars?: number;
  qdb_max_results?: number;
}

interface ODataCollection<T> {
  value: T[];
}

const OPTION_FIELD_TYPES = new Set(['dropdown', 'multi_select', 'multiselect', 'radio']);
const LOOKUP_FIELD_TYPES = new Set(['lookup', 'child_entity_grid']);

export class CrmFormCloneService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  async cloneForm(sourceFormCode: string, requestedByUserId: string): Promise<CloneResult> {
    const sourceForm = await this.fetchFormByCode(sourceFormCode);

    const newFormCode = `${sourceForm.qdb_form_code}_copy_${Date.now()}`;
    const newFormId = await this.createFormDefinition(sourceForm, newFormCode, requestedByUserId);

    logger.info({ sourceFormCode, newFormCode, newFormId }, 'Cloning form — created definition');

    const tabs = await this.fetchTabs(sourceForm.qdb_form_definitionid);
    await this.cloneTabs(tabs, newFormId, sourceForm.qdb_form_definitionid);

    logger.info({ sourceFormCode, newFormCode, tabCount: tabs.length }, 'Form clone complete');
    return { newFormId, newFormCode };
  }

  private async fetchFormByCode(formCode: string): Promise<RawFormSummary> {
    const response = await this.crmFetch<ODataCollection<RawFormSummary>>(
      `/qdb_form_definitions?$filter=qdb_form_code eq '${formCode}' and statecode eq 0&$top=1`,
    );
    const form = response.value[0];
    if (!form) throw new FormNotFoundError(formCode);
    return form;
  }

  private async createFormDefinition(
    source: RawFormSummary,
    newCode: string,
    ownerId: string,
  ): Promise<string> {
    const body = {
      qdb_form_code: newCode,
      qdb_title: `${source.qdb_title} (Copy)`,
      qdb_description: source.qdb_description,
      qdb_entity_logical_name: source.qdb_entity_logical_name,
      qdb_allow_save_draft: source.qdb_allow_save_draft,
      qdb_draft_expiry_days: source.qdb_draft_expiry_days,
      qdb_confirmation_message: source.qdb_confirmation_message,
      qdb_status: 100000000, // Draft — clones start in draft
      qdb_cloned_by: ownerId,
      ...(source._qdb_theme_id_value
        ? { 'qdb_theme_id@odata.bind': `/qdb_themes(${source._qdb_theme_id_value})` }
        : {}),
    };

    const response = await this.crmFetch<Response>(
      '/qdb_form_definitions',
      { method: 'POST', body: JSON.stringify(body) },
    );

    const newId = (response as unknown as Record<string, string>)['qdb_form_definitionid']
      ?? uuidv4();
    return newId;
  }

  private async fetchTabs(formId: string): Promise<RawTab[]> {
    const response = await this.crmFetch<ODataCollection<RawTab>>(
      `/qdb_form_tabs?$filter=_qdb_form_definition_id_value eq '${formId}' and statecode eq 0&$orderby=qdb_display_order asc`,
    );
    return response.value;
  }

  private async cloneTabs(tabs: RawTab[], newFormId: string, sourceFormId: string): Promise<void> {
    for (const tab of tabs) {
      const newTabId = await this.createTab(tab, newFormId);
      const sections = await this.fetchSections(tab.qdb_form_tabid);
      await this.cloneSections(sections, newTabId, sourceFormId);
    }
  }

  private async createTab(source: RawTab, newFormId: string): Promise<string> {
    const body = {
      qdb_label: source.qdb_label,
      qdb_display_order: source.qdb_display_order,
      qdb_icon_name: source.qdb_icon_name,
      qdb_is_visible: source.qdb_is_visible ?? true,
      qdb_requires_previous_tab_complete: source.qdb_requires_previous_tab_complete ?? false,
      'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${newFormId})`,
    };
    const response = await this.crmFetch<Record<string, string>>(
      '/qdb_form_tabs',
      { method: 'POST', body: JSON.stringify(body) },
    );
    return response['qdb_form_tabid'] ?? uuidv4();
  }

  private async fetchSections(tabId: string): Promise<RawSection[]> {
    const response = await this.crmFetch<ODataCollection<RawSection>>(
      `/qdb_form_sections?$filter=_qdb_form_tab_id_value eq '${tabId}' and statecode eq 0&$orderby=qdb_display_order asc`,
    );
    return response.value;
  }

  private async cloneSections(
    sections: RawSection[],
    newTabId: string,
    sourceFormId: string,
  ): Promise<void> {
    for (const section of sections) {
      const newSectionId = await this.createSection(section, newTabId);
      const fields = await this.fetchFields(section.qdb_form_sectionid);
      await this.cloneFields(fields, newSectionId);
    }
  }

  private async createSection(source: RawSection, newTabId: string): Promise<string> {
    const body = {
      qdb_label: source.qdb_label,
      qdb_description: source.qdb_description,
      qdb_columns: source.qdb_columns ?? 1,
      qdb_display_order: source.qdb_display_order,
      qdb_is_collapsible: source.qdb_is_collapsible ?? false,
      qdb_is_collapsed_by_default: source.qdb_is_collapsed_by_default ?? false,
      qdb_is_visible: source.qdb_is_visible ?? true,
      'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${newTabId})`,
    };
    const response = await this.crmFetch<Record<string, string>>(
      '/qdb_form_sections',
      { method: 'POST', body: JSON.stringify(body) },
    );
    return response['qdb_form_sectionid'] ?? uuidv4();
  }

  private async fetchFields(sectionId: string): Promise<RawField[]> {
    const response = await this.crmFetch<ODataCollection<RawField>>(
      `/qdb_form_fields?$filter=_qdb_form_section_id_value eq '${sectionId}' and statecode eq 0&$orderby=qdb_display_order asc`,
    );
    return response.value;
  }

  private async cloneFields(fields: RawField[], newSectionId: string): Promise<void> {
    await Promise.all(
      fields.map((field) => this.cloneField(field, newSectionId)),
    );
  }

  private async cloneField(source: RawField, newSectionId: string): Promise<void> {
    const body = {
      qdb_label: source.qdb_label,
      qdb_schema_name: source.qdb_schema_name,
      qdb_field_type: source.qdb_field_type,
      qdb_placeholder: source.qdb_placeholder,
      qdb_help_text: source.qdb_help_text,
      qdb_is_required: source.qdb_is_required ?? false,
      qdb_is_read_only: source.qdb_is_read_only ?? false,
      qdb_is_hidden: source.qdb_is_hidden ?? false,
      qdb_default_value: source.qdb_default_value,
      qdb_display_order: source.qdb_display_order,
      qdb_column_span: source.qdb_column_span ?? 1,
      qdb_decimal_places: source.qdb_decimal_places,
      qdb_currency_code: source.qdb_currency_code,
      qdb_max_rows: source.qdb_max_rows,
      'qdb_form_section_id@odata.bind': `/qdb_form_sections(${newSectionId})`,
    };
    const response = await this.crmFetch<Record<string, string>>(
      '/qdb_form_fields',
      { method: 'POST', body: JSON.stringify(body) },
    );
    const newFieldId = response['qdb_form_fieldid'] ?? uuidv4();

    await Promise.all([
      OPTION_FIELD_TYPES.has(source.qdb_field_type)
        ? this.cloneOptions(source.qdb_form_fieldid, newFieldId)
        : Promise.resolve(),
      LOOKUP_FIELD_TYPES.has(source.qdb_field_type)
        ? this.cloneLookupConfig(source.qdb_form_fieldid, newFieldId)
        : Promise.resolve(),
      this.cloneValidationRules(source.qdb_form_fieldid, newFieldId),
    ]);
  }

  private async cloneOptions(sourceFieldId: string, newFieldId: string): Promise<void> {
    const response = await this.crmFetch<ODataCollection<RawOptionValue>>(
      `/qdb_form_option_values?$filter=_qdb_form_field_id_value eq '${sourceFieldId}' and statecode eq 0&$orderby=qdb_display_order asc`,
    );
    await Promise.all(
      response.value.map((opt) =>
        this.crmFetch<void>('/qdb_form_option_values', {
          method: 'POST',
          body: JSON.stringify({
            qdb_label: opt.qdb_label,
            qdb_value: opt.qdb_value,
            qdb_display_order: opt.qdb_display_order,
            qdb_is_default: opt.qdb_is_default ?? false,
            'qdb_form_field_id@odata.bind': `/qdb_form_fields(${newFieldId})`,
          }),
        }),
      ),
    );
  }

  private async cloneLookupConfig(sourceFieldId: string, newFieldId: string): Promise<void> {
    const response = await this.crmFetch<ODataCollection<RawLookupConfig>>(
      `/qdb_lookup_configs?$filter=_qdb_form_field_id_value eq '${sourceFieldId}'&$top=1`,
    );
    const config = response.value[0];
    if (!config) return;

    await this.crmFetch<void>('/qdb_lookup_configs', {
      method: 'POST',
      body: JSON.stringify({
        qdb_target_entity: config.qdb_target_entity,
        qdb_display_field: config.qdb_display_field,
        qdb_value_field: config.qdb_value_field,
        qdb_filter_query: config.qdb_filter_query,
        qdb_search_min_chars: config.qdb_search_min_chars,
        qdb_max_results: config.qdb_max_results,
        'qdb_form_field_id@odata.bind': `/qdb_form_fields(${newFieldId})`,
      }),
    });
  }

  private async cloneValidationRules(sourceFieldId: string, newFieldId: string): Promise<void> {
    const response = await this.crmFetch<ODataCollection<RawValidationRule>>(
      `/qdb_validation_rules?$filter=_qdb_form_field_id_value eq '${sourceFieldId}' and statecode eq 0&$orderby=qdb_display_order asc`,
    );
    await Promise.all(
      response.value.map((rule) =>
        this.crmFetch<void>('/qdb_validation_rules', {
          method: 'POST',
          body: JSON.stringify({
            qdb_rule_type: rule.qdb_rule_type,
            qdb_rule_value: rule.qdb_rule_value,
            qdb_error_message: rule.qdb_error_message,
            qdb_is_active: rule.qdb_is_active ?? true,
            qdb_display_order: rule.qdb_display_order,
            'qdb_form_field_id@odata.bind': `/qdb_form_fields(${newFieldId})`,
          }),
        }),
      ),
    );
  }
}
