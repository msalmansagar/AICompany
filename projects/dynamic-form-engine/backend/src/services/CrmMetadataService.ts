import { LRUCache } from 'lru-cache';
import type {
  BarSource,
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
  LookupDisplayColumn,
  SubmissionMapping,
  FormVersion,
  FieldType,
  SummaryMode,
  ValidationRuleType,
  BusinessRuleAction,
  ConditionOperator,
  LogicalOperator,
  GridColumnConfig,
  GridColumnOptionValue,
  GridColumnFilterType,
  FileUploadConfig,
  FieldPlacement,
} from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import { ButtonAssembler, SCOPED_BUTTON_ENTITY, type RawScopedButton, type IndexedButtons } from './ButtonAssembler.js';
import { logger } from '../utils/logger.js';
import { FormNotFoundError, FormInactiveError, ValidationError, CrmApiError } from '../utils/errors.js';
import { config } from '../config/env.js';
import type { CrmAuthService } from './CrmAuthService.js';
import type { CrmInfoCardService, InfoCardScreen } from './CrmInfoCardService.js';
import type { CrmTranslationQueryService } from './CrmTranslationQueryService.js';
import type { TranslationResolutionService } from './TranslationResolutionService.js';
import type { CrmLanguageConfigService } from './CrmLanguageConfigService.js';

const SAFE_FORM_CODE_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

// DFE-TABZONE-001: qdb_placement optionset values on qdb_form_field.
// Any other value (incl. absent) is treated as Body — the legacy behavior.
/** qdb_bar_source option values; unset counts as Form Field. */
const BAR_SOURCE_STATIC = 100000001;
const BAR_SOURCE_DYNAMIC = 100000002;

const PLACEMENT_HEADER = 100000000;
const PLACEMENT_FOOTER = 100000001;

/** Used when a tab requires acknowledgement but the maker left the label blank. */
const DEFAULT_TAB_CONFIRMATION_LABEL = 'I confirm the information on this tab is correct.';

// Maps the qdb_placement optionset code to a FieldPlacement. Unknown/absent codes
// safely fall back to 'body' (legacy) so malformed config never breaks a form.
export function placementFromCode(code?: number | null): FieldPlacement {
  if (code === PLACEMENT_HEADER) return 'header';
  if (code === PLACEMENT_FOOTER) return 'footer';
  return 'body';
}

interface ODataCollection<T> {
  value: T[];
}

export class CrmMetadataService extends CrmBaseService {
  private readonly cacheKeysByFormCode = new Map<string, Set<string>>();

  constructor(
    authService: CrmAuthService,
    private readonly cache: LRUCache<string, FormDefinition>,
    private readonly infoCardService: CrmInfoCardService | null = null,
    private readonly translationQueryService: CrmTranslationQueryService | null = null,
    private readonly translationResolutionService: TranslationResolutionService | null = null,
    private readonly languageConfigService: CrmLanguageConfigService | null = null,
  ) {
    super(authService);
  }

  async getFormDefinition(formCode: string, lang = 'en'): Promise<FormDefinition> {
    if (!SAFE_FORM_CODE_PATTERN.test(formCode)) {
      throw new ValidationError(`Invalid form code: '${formCode}'`);
    }

    // AG-002: cache key is formCode:languageCode — no-lang callers default to "en"
    const cacheKey = `${formCode}:${lang}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const form = await this.fetchAndAssembleForm(formCode, lang);
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

  private async fetchAndAssembleForm(formCode: string, lang = 'en'): Promise<FormDefinition> {
    const response = await this.crmFetch<ODataCollection<RawFormDefinition>>(
      `/qdb_form_definitions?$filter=qdb_form_code eq '${formCode}' and statecode eq 0&$top=1`,
    );

    const raw = response.value[0];
    if (!raw) throw new FormNotFoundError(formCode);
    if (raw.qdb_status !== 100000001) throw new FormInactiveError(formCode);

    const formId = raw.qdb_form_definitionid;

    const [tabs, submissionMappings, buttons, infoCards] = await Promise.all([
      this.fetchTabsWithChildren(formId, lang),
      this.fetchSubmissionMappings(formId),
      this.fetchFormButtons(formId),
      this.infoCardService
        ? this.infoCardService.fetchInfoCardScreens(formId, formId)
        : Promise.resolve<InfoCardScreen[]>([]),
    ]);

    const summaryMode = this.mapSummaryMode(raw.qdb_summary_mode);
    const englishForm: FormDefinition = {
      id: formId,
      formCode: raw.qdb_form_code,
      title: raw.qdb_title,
      description: raw.qdb_description,
      status: this.mapFormStatus(raw.qdb_status),
      version: raw.qdb_version ?? 1,
      allowSaveDraft: raw.qdb_allow_save_draft ?? true,
      showSummaryStep: raw.qdb_show_summary_step ?? false,
      // DFE-FBE-001: emitted only when set; consumers derive from showSummaryStep otherwise.
      ...(summaryMode ? { summaryMode } : {}),
      // DFE-FBE-002: progress bar (emitted only when on).
      ...(raw.qdb_show_progress_bar ? { showProgressBar: true } : {}),
      draftExpiryDays: raw.qdb_draft_expiry_days ?? 90,
      powerAutomateFlowId: raw.qdb_power_automate_flow_id,
      confirmationMessage: raw.qdb_confirmation_message ?? 'Your form has been submitted.',
      // DFE-SUBMITCONFIRM-001: emit the acknowledgement gate only when a label is configured.
      ...(raw.qdb_submit_confirmation_label
        ? {
            submitConfirmation: {
              checkboxLabel: raw.qdb_submit_confirmation_label,
              ...(raw.qdb_submit_confirmation_message
                ? { dialogMessage: raw.qdb_submit_confirmation_message }
                : {}),
            },
          }
        : {}),
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

    return lang !== 'en'
      ? this.applyTranslations(englishForm, lang, formCode)
      : englishForm;
  }

  private async applyTranslations(
    form: FormDefinition,
    lang: string,
    formCode: string,
  ): Promise<FormDefinition> {
    if (!this.translationQueryService || !this.translationResolutionService) {
      return form;
    }

    const recordIds = this.collectRecordIds(form);
    const translationMap = await this.translationQueryService.fetchTranslationMap(
      recordIds,
      lang,
      formCode,
    );

    return this.translationResolutionService.resolveTranslations(form, translationMap);
  }

  private collectRecordIds(form: FormDefinition): Set<string> {
    const ids = new Set<string>();
    ids.add(form.id);

    for (const btn of form.buttons) ids.add(btn.id);
    for (const screen of form.infoCards) {
      ids.add(screen.screenId);
      for (const sec of screen.sections) {
        ids.add(sec.sectionId);
        for (const item of sec.items) ids.add(item.itemId);
      }
    }

    for (const tab of form.tabs) {
      ids.add(tab.id);
      for (const btn of tab.buttons ?? []) ids.add(btn.id);
      for (const section of tab.sections) {
        ids.add(section.id);
        for (const btn of section.buttons ?? []) ids.add(btn.id);
        for (const field of section.fields) {
          ids.add(field.id);
          for (const rule of field.validationRules) ids.add(rule.id);
          for (const opt of field.options ?? []) {
            if (opt.optionRecordId) ids.add(opt.optionRecordId);
          }
          const cols = field.gridConfig?.columnConfigs ?? [];
          for (const col of cols) ids.add(col.columnId);
        }
      }
    }

    return ids;
  }

  private async fetchTabsWithChildren(formId: string, lang: string): Promise<TabDefinition[]> {
    const response = await this.crmFetch<ODataCollection<RawTab>>(
      `/qdb_form_tabs?$filter=_qdb_form_definition_id_value eq '${formId}' and statecode eq 0&$orderby=qdb_display_order asc`,
    );

    const tabs = response.value;
    if (tabs.length === 0) return [];

    const tabIds = tabs.map((t) => t.qdb_form_tabid);
    const sections = await this.fetchSectionsWithChildren(tabIds, formId, lang);
    // DFE-TABZONE-001: header/footer fields placed directly on tabs.
    const tabZoneFields = await this.fetchTabZoneFields(tabIds, formId, lang);

    // DFE-BTN-001: fetch tab/section scoped buttons and embed them. Degrades to no
    // buttons if the entity is not provisioned, so existing forms are unchanged.
    const buttonIndex = await this.fetchScopedButtons(formId);
    for (const section of sections) {
      const sectionButtons = buttonIndex.bySectionId.get(section.id);
      if (sectionButtons && sectionButtons.length > 0) section.buttons = sectionButtons;
    }

    const sectionsByTab = new Map<string, SectionDefinition[]>();
    for (const section of sections) {
      const existing = sectionsByTab.get(section.tabId) ?? [];
      existing.push(section);
      sectionsByTab.set(section.tabId, existing);
    }

    return tabs.map((tab) => {
      const tabButtons = buttonIndex.byTabId.get(tab.qdb_form_tabid) ?? [];
      const headerFields = tabZoneFields.header.get(tab.qdb_form_tabid) ?? [];
      const footerFields = tabZoneFields.footer.get(tab.qdb_form_tabid) ?? [];
      return {
        id: tab.qdb_form_tabid,
        formDefinitionId: formId,
        label: tab.qdb_label,
        iconName: tab.qdb_icon_name,
        // DFE-FBE-001: tab description + manual-summary flag (flag omitted unless true).
        description: tab.qdb_description,
        ...(tab.qdb_is_summary_tab ? { isSummaryTab: true } : {}),
        displayOrder: tab.qdb_display_order,
        isVisible: tab.qdb_is_visible ?? true,
        requiresPreviousTabComplete: tab.qdb_requires_previous_tab_complete ?? false,
        hideTabBar: tab.qdb_hide_tab_bar ?? false,
        sections: sectionsByTab.get(tab.qdb_form_tabid) ?? [],
        ...(tabButtons.length > 0 ? { buttons: tabButtons } : {}),
        // DFE-TABZONE-001: header/footer zone fields (omitted when none).
        ...(headerFields.length > 0 ? { headerFields } : {}),
        ...(footerFields.length > 0 ? { footerFields } : {}),
        // DFE-SUBMITCONFIRM-002: the boolean is what enables the gate — unlike the
        // form-level one, where a non-empty label is the switch — so a maker can turn the
        // tab gate on and accept the default wording.
        ...(tab.qdb_require_submit_confirmation
          ? {
            submitConfirmation: {
              checkboxLabel: tab.qdb_submit_confirmation_label || DEFAULT_TAB_CONFIRMATION_LABEL,
              ...(tab.qdb_submit_confirmation_message
                ? { dialogMessage: tab.qdb_submit_confirmation_message }
                : {}),
            },
          }
          : {}),
      };
    });
  }

  // DFE-BTN-001: reads all scoped buttons for a form and indexes them by placement.
  // Resilient: a missing entity (schema deploy is gated) yields empty indexes.
  private async fetchScopedButtons(formId: string): Promise<IndexedButtons> {
    try {
      const response = await this.crmFetch<ODataCollection<RawScopedButton>>(
        `/${SCOPED_BUTTON_ENTITY}s?$filter=_qdb_form_definition_id_value eq '${formId}' and statecode eq 0&$orderby=qdb_display_order asc`,
      );
      return ButtonAssembler.assemble(response.value);
    } catch (error) {
      // A buttons sub-query failure must never break the whole form render, so we
      // degrade to no buttons either way — but distinguish the cases in logs so a
      // real failure is surfaced (ERROR/alertable), not hidden as routine.
      // A 404 is expected while the entity is unprovisioned (schema deploy is gated).
      const status = error instanceof CrmApiError ? error.crmStatusCode : undefined;
      if (status === 404) {
        logger.info({ formId }, 'Scoped-button entity not present — rendering form without buttons');
      } else {
        logger.error({ error, formId }, 'Failed to fetch scoped buttons — rendering form without them');
      }
      return { byTabId: new Map(), bySectionId: new Map() };
    }
  }

  private async fetchSectionsWithChildren(tabIds: string[], formId: string, lang: string): Promise<SectionDefinition[]> {
    const filter = tabIds.map((id) => `_qdb_form_tab_id_value eq '${id}'`).join(' or ');
    const response = await this.crmFetch<ODataCollection<RawSection>>(
      `/qdb_form_sections?$filter=(${filter}) and statecode eq 0&$orderby=qdb_display_order asc`,
    );

    const sections = response.value;
    if (sections.length === 0) return [];

    const sectionIds = sections.map((s) => s.qdb_form_sectionid);
    const fields = await this.fetchFieldsWithMetadata(sectionIds, formId, lang);

    const fieldsBySection = new Map<string, FieldDefinition[]>();
    for (const field of fields) {
      // DFE-TABZONE-001: a field placed in a tab header/footer zone is rendered
      // there, not in its section body — even if it still carries a section id.
      if (field.placement === 'header' || field.placement === 'footer') continue;
      const existing = fieldsBySection.get(field.sectionId) ?? [];
      existing.push(field);
      fieldsBySection.set(field.sectionId, existing);
    }

    return sections.map((section) => ({
      id: section.qdb_form_sectionid,
      tabId: section._qdb_form_tab_id_value,
      label: section.qdb_label,
      description: section.qdb_description,
      iconName: section.qdb_icon_name,   // DFE-FBE-001: section header icon
      displayOrder: section.qdb_display_order,
      columns: this.mapColumns(section.qdb_columns),
      isCollapsible: section.qdb_is_collapsible ?? false,
      isCollapsedByDefault: section.qdb_is_collapsed_by_default ?? false,
      isVisible: section.qdb_is_visible ?? true,
      fields: fieldsBySection.get(section.qdb_form_sectionid) ?? [],
    }));
  }

  private async fetchFieldsWithMetadata(sectionIds: string[], formId: string, lang: string): Promise<FieldDefinition[]> {
    const filter = sectionIds.map((id) => `_qdb_form_section_id_value eq '${id}'`).join(' or ');
    const response = await this.crmFetch<ODataCollection<RawField>>(
      `/qdb_form_fields?$filter=(${filter}) and statecode eq 0&$orderby=qdb_display_order asc`,
    );

    return this.enrichFields(response.value, formId, lang);
  }

  // DFE-TABZONE-001: shared enrichment used by both section-scoped and tab-zone
  // (header/footer) field fetches — turns raw field rows into FieldDefinitions.
  private async enrichFields(fields: RawField[], formId: string, lang: string): Promise<FieldDefinition[]> {
    if (fields.length === 0) return [];

    const fieldIds = fields.map((f) => f.qdb_form_fieldid);

    // Map field GUID â†’ schema name so business rule conditions can resolve to schema names
    const fieldGuidToSchema = new Map<string, string>(
      fields.map((f) => [f.qdb_form_fieldid, f.qdb_schema_name]),
    );

    const requestedLcid = lang !== 'en' && this.languageConfigService
      ? await this.languageConfigService.getLcidForLanguageCode(lang)
      : undefined;

    const [optionsMap, validationMap, lookupMap, businessRulesMap, columnConfigMap] = await Promise.all([
      this.fetchOptions(fields, requestedLcid),
      this.fetchValidationRules(fieldIds),
      this.fetchLookupConfigs(fieldIds, fieldGuidToSchema),
      this.fetchBusinessRules(formId, fieldIds, fieldGuidToSchema),
      this.fetchGridColumnConfigs(fieldIds),
    ]);

    const definitions = fields.map((field) => ({
      id: field.qdb_form_fieldid,
      sectionId: field._qdb_form_section_id_value ?? '',
      ...this.placementProps(field),
      fieldType: this.mapFieldType(field.qdb_field_type),
      schemaName: field.qdb_schema_name,
      label: field.qdb_label,
      placeholder: field.qdb_placeholder,
      tooltip: field.qdb_tooltip,
      defaultValue: field.qdb_default_value,
      // DFE-FBE-001: Label field — static content + optional data-bound source.
      staticContent: field.qdb_static_content,
      sourceFieldSchemaName: field.qdb_source_field_schema_name,
      // Unset counts as enabled — fields predating these columns keep both actions.
      showDocumentView: field.qdb_show_document_view ?? true,
      showDocumentDownload: field.qdb_show_document_download ?? true,
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
      // DFE-NUMBAR
      ...(field.qdb_number_display_style === 100000002 ? { numberDisplayStyle: 'bar' as const } : {}),
      ...(field.qdb_bar_max_field_schema ? { barMaxFieldSchemaName: field.qdb_bar_max_field_schema } : {}),
      ...(field.qdb_bar_value_field_schema ? { barValueFieldSchemaName: field.qdb_bar_value_field_schema } : {}),
      // DFE-BARSRC-001: bounds source. Only the keys the chosen mode needs are emitted, so a
      // value left behind from a mode the maker switched away from is never misread.
      ...this.barSourceProps(field),
      maxRows: field.qdb_max_rows,
      componentKey: field.qdb_component_key,
      // DFE-NUMBAR: bar (100000002) vs textbox default (omitted).
      ...(field.qdb_number_display_style === 100000002 ? { numberDisplayStyle: 'bar' as const } : {}),
      ...(field.qdb_bar_max_field_schema ? { barMaxFieldSchemaName: field.qdb_bar_max_field_schema } : {}),
      trueLabel: field.qdb_true_label,
      falseLabel: field.qdb_false_label,
      boolRenderStyle: this.mapBooleanRenderStyle(field.qdb_boolean_render_style),
      multiselectRenderStyle: this.mapMultiselectRenderStyle(field.qdb_multiselect_render_style),
      radioRenderStyle: this.mapRadioRenderStyle(field.qdb_radio_render_style),
      infoCardStyle: this.mapInfoCardStyle(field.qdb_info_card_style),
      infoCardTitle: field.qdb_info_card_title,
      infoCardBody: field.qdb_info_card_body,
      infoCardIcon: field.qdb_info_card_icon,
      infoCardListType: this.mapInfoCardListType(field.qdb_info_card_list_type),
      infoCardListMarker: this.mapInfoCardListMarker(field.qdb_info_card_list_marker),
      infoCardDownloadUrl: field.qdb_info_card_download_url,
      infoCardDownloadLabel: field.qdb_info_card_download_label,
      infoCardDownloadIcon: field.qdb_info_card_download_icon,
      fileDownloadLabel: field.qdb_file_download_label,
      fileDownloadIcon: field.qdb_file_download_icon,
      uploadDocumentSetting: field.qdb_upload_document_setting,
      downloadDocumentSetting: field.qdb_download_document_setting,
      prefix: field.qdb_prefix,
      suffix: field.qdb_suffix,
      fileUploadConfig: this.buildFileUploadConfig(field),
      gridConfig: field.qdb_grid_mode != null ? {
        // Canonical names (read by SelectionGridField / EntryGridField)
        gridMode: this.mapGridMode(field.qdb_grid_mode),
        targetEntity: field.qdb_grid_entity_name ?? '',
        columnConfigs: columnConfigMap.get(field.qdb_form_fieldid) ?? [],
        selectionMode: this.mapSelectionMode(field.qdb_selection_mode),
        minRows: field.qdb_grid_min_rows ?? undefined,
        maxRows: field.qdb_max_rows ?? 200,
        pageSize: field.qdb_grid_page_size ?? undefined,
        pagingStyle: field.qdb_grid_paging_style === 'numbered' ? ('numbered' as const) : undefined,
        // Grid Config column first, legacy Lookup Config column as fallback.
        savedViewId: field.qdb_grid_saved_view_id ?? field.qdb_saved_view_id ?? undefined,
        // Alias names (used by new mapper references)
        mode: this.mapGridMode(field.qdb_grid_mode),
        entityName: field.qdb_grid_entity_name ?? undefined,
        filterExpression: field.qdb_grid_filter_expression ?? undefined,
        dependsOnFieldId: field.qdb_grid_depends_on_field_schema ?? undefined,
        dependsOnFilterTemplate: field.qdb_grid_depends_on_filter_template ?? undefined,
        // DFE-GRIDSRC-001: data source + display config (passthrough strings/bool).
        dataSource: field.qdb_grid_data_source === 'json' ? ('json' as const) : undefined,
        jsonData: field.qdb_grid_json_data ?? undefined,
        displayMode: field.qdb_grid_display_mode === 'infocard' ? ('infocard' as const) : undefined,
        viewMode: (field.qdb_grid_view_mode === 'table' || field.qdb_grid_view_mode === 'card')
          ? (field.qdb_grid_view_mode as 'table' | 'card')
          : undefined,
        cardLayout: field.qdb_grid_card_layout === 'row' ? ('row' as const) : undefined,
        selectable: field.qdb_grid_selectable ?? undefined,
        cardIconName: field.qdb_grid_card_icon ?? undefined,
      } : undefined,
      validationRules: validationMap.get(field.qdb_form_fieldid) ?? [],
      businessRules: businessRulesMap.get(field.qdb_form_fieldid) ?? [],
    }));

    return definitions;
  }

  // Emits placement/tabId only for header/footer fields, so body fields (legacy
  // and default) keep their existing payload shape untouched.
  private placementProps(field: RawField): { placement?: FieldPlacement; tabId?: string } {
    const placement = placementFromCode(field.qdb_placement);
    return {
      ...(placement !== 'body' ? { placement } : {}),
      ...(field._qdb_form_tab_id_value ? { tabId: field._qdb_form_tab_id_value } : {}),
    };
  }

  // DFE-TABZONE-001: fetches fields placed directly in a tab's header/footer zone
  // (placement Header/Footer, targeting the tab). Resilient: if the placement/tab
  // columns are not yet provisioned, degrades to no tab-zone fields so existing
  // forms render unchanged.
  private async fetchTabZoneFields(
    tabIds: string[],
    formId: string,
    lang: string,
  ): Promise<{ header: Map<string, FieldDefinition[]>; footer: Map<string, FieldDefinition[]> }> {
    const header = new Map<string, FieldDefinition[]>();
    const footer = new Map<string, FieldDefinition[]>();
    try {
      const tabFilter = tabIds.map((id) => `_qdb_form_tab_id_value eq '${id}'`).join(' or ');
      const placementFilter = `(qdb_placement eq ${PLACEMENT_HEADER} or qdb_placement eq ${PLACEMENT_FOOTER})`;
      const response = await this.crmFetch<ODataCollection<RawField>>(
        `/qdb_form_fields?$filter=(${tabFilter}) and ${placementFilter} and statecode eq 0&$orderby=qdb_display_order asc`,
      );
      const enriched = await this.enrichFields(response.value, formId, lang);
      for (const field of enriched) {
        if (!field.tabId) continue;
        const zone = field.placement === 'footer' ? footer : header;
        const existing = zone.get(field.tabId) ?? [];
        existing.push(field);
        zone.set(field.tabId, existing);
      }
    } catch (error) {
      const status = error instanceof CrmApiError ? error.crmStatusCode : undefined;
      if (status === 404 || status === 400) {
        logger.info({ formId }, 'Tab-zone placement not provisioned — rendering without header/footer fields');
      } else {
        logger.error({ error, formId }, 'Failed to fetch tab-zone fields — rendering without them');
      }
    }
    return { header, footer };
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
      const meta = parseColumnMeta(col.qdb_column_options_json);
      const columnFieldType = col.qdb_column_field_type ?? 'text';
      existing.push({
        columnId: col.qdb_grid_column_configid,
        displayOrder: col.qdb_display_order,
        columnLabel: col.qdb_column_label,
        targetAttribute: col.qdb_column_attribute,
        columnFieldType,
        options: meta.options,
        filterType: meta.filterType ?? deriveColumnFilterType(columnFieldType),
        lookupTargetEntity: meta.lookupTargetEntity,
        lookupDisplayAttribute: meta.lookupDisplayAttribute,
        lookupValueAttribute: meta.lookupValueAttribute,
      });
      map.set(fieldId, existing);
    }
    return map;
  }

  private async fetchOptions(fields: RawField[], requestedLcid?: number): Promise<Map<string, OptionValue[]>> {
    const map = new Map<string, OptionValue[]>();

    const crmSourceFields = fields.filter(
      (f) => f.qdb_option_source_entity && f.qdb_option_source_attribute,
    );
    const manualFields = fields.filter(
      (f) => !f.qdb_option_source_entity || !f.qdb_option_source_attribute,
    );

    if (manualFields.length > 0) {
      const fieldIds = manualFields.map((f) => f.qdb_form_fieldid);
      const filter = fieldIds.map((id) => `_qdb_form_field_id_value eq '${id}'`).join(' or ');
      const response = await this.crmFetch<ODataCollection<RawOption>>(
        `/qdb_form_option_values?$filter=(${filter}) and qdb_is_active eq true` +
        `&$orderby=qdb_display_order asc` +
        `&$select=qdb_form_option_valueid,_qdb_form_field_id_value,qdb_value,qdb_label,qdb_display_order,qdb_is_default,qdb_parent_option_value,qdb_is_active,qdb_description,qdb_icon_name,qdb_notes`,
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
          description: opt.qdb_description ?? undefined,
          iconName: opt.qdb_icon_name ?? undefined,
          notes: opt.qdb_notes ?? undefined,
          // DFE-i18n-001: expose the Dataverse record GUID so TranslationResolutionService
          // can key into qdb_translation for FR-009 manual option translations.
          optionRecordId: opt.qdb_form_option_valueid,
        });
        map.set(fieldId, existing);
      }
    }

    await Promise.all(
      crmSourceFields.map(async (field) => {
        const options = await this.fetchCrmOptionSetValues(
          field.qdb_option_source_entity!,
          field.qdb_option_source_attribute!,
          requestedLcid,
        );
        if (options.length > 0) map.set(field.qdb_form_fieldid, options);
      }),
    );

    return map;
  }

  // FR-010: resolves OptionSet labels using LCID for the requested language.
  // C-003 fallback: if Arabic Language Pack (LCID 1025) is absent from the Dataverse
  // environment, localizedLabels for LCID 1025 will be missing. The fallback chain
  // (requestedLcid → EN 1033 → String(value)) handles this transparently.
  // QDB must confirm Arabic Language Pack installation per CEO condition C-003 before
  // expecting native Arabic OptionSet labels to appear. Until confirmed, CRM-sourced
  // option values will show English labels even when lang=ar is requested.
  private async fetchCrmOptionSetValues(
    entity: string,
    attribute: string,
    requestedLcid?: number,
  ): Promise<OptionValue[]> {
    try {
      const response = await this.crmFetch<CrmPicklistAttributeResponse>(
        `/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attribute}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet`,
      );
      const options = response.OptionSet?.Options ?? [];
      return options
        .filter((o) => o.Value != null)
        .map((o, index) => ({
          value: String(o.Value),
          label: resolveOptionSetLabel(o, requestedLcid),
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
        // DFE-APILOOKUP-001 — absent source stays undefined so entity lookups are unchanged.
        source: this.mapLookupSource(lc.qdb_lookup_source),
        apiEndpointKey: lc.qdb_lookup_api_endpoint_key,
        apiValuePath: lc.qdb_lookup_api_value_path,
        apiLabelPath: lc.qdb_lookup_api_label_path,
        apiSearchParamName: lc.qdb_lookup_api_search_param,
        apiSearchMode: this.mapLookupSearchMode(lc.qdb_lookup_api_search_mode),
        // DFE-LKPCOL-001 — multi-column + Arabic-source display.
        displayColumns: this.parseDisplayColumns(lc.qdb_display_columns_json),
      });
    }

    return map;
  }

  /**
   * DFE-BARSRC-001: the bar's bounds source, as the minimal set of keys for that mode.
   *
   * Unset reads as 'formField', so the bars that predate this column keep their behaviour
   * with no migration. Emitting only the keys the mode needs means a value left behind from
   * a mode the maker switched away from can never be misread downstream.
   */
  private barSourceProps(field: RawField): Record<string, unknown> {
    const source = this.mapBarSource(field.qdb_bar_source);

    if (source === 'static') {
      return {
        barSource: source,
        barMin: field.qdb_bar_min_value ?? 0,
        ...(field.qdb_bar_max_value != null ? { barMax: field.qdb_bar_max_value } : {}),
      };
    }

    if (source === 'dynamic') {
      return {
        barSource: source,
        ...(field.qdb_bar_source_entity ? { barSourceEntity: field.qdb_bar_source_entity } : {}),
        ...(field.qdb_bar_min_attribute ? { barMinAttribute: field.qdb_bar_min_attribute } : {}),
      };
    }

    // formField: barMaxFieldSchemaName / barValueFieldSchemaName already carry it, and
    // omitting the key keeps pre-existing forms byte-identical.
    return {};
  }

  private mapBarSource(code: number | undefined): BarSource {
    if (code === BAR_SOURCE_STATIC) return 'static';
    if (code === BAR_SOURCE_DYNAMIC) return 'dynamic';
    return 'formField';
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
    // Reverse index so designer-authored rules (which reference fields by schema code)
    // can be keyed by the trigger/target field GUID the runtime expects.
    const schemaToGuid = new Map<string, string>();
    for (const [guid, schema] of fieldGuidToSchema) schemaToGuid.set(schema, guid);

    const map = new Map<string, BusinessRule[]>();

    for (const rule of response.value) {
      // The designer serialises the whole rule (BusinessRuleDefinition) into
      // qdb_conditions_json using schema codes + nested actions; legacy/seed rows use a
      // flat conditions array plus the qdb_action / qdb_target_field structured columns.
      const parsed = this.convertDesignerRule(rule, schemaToGuid) ?? this.convertLegacyRule(rule, fieldGuidToSchema);
      if (!parsed.triggerGuid || !fieldIdSet.has(parsed.triggerGuid) || parsed.rules.length === 0) continue;

      const existing = map.get(parsed.triggerGuid) ?? [];
      existing.push(...parsed.rules);
      map.set(parsed.triggerGuid, existing);
    }

    return map;
  }

  // Converts a designer-authored rule (BusinessRuleDefinition JSON in qdb_conditions_json)
  // into one runtime BusinessRule per action. Returns null when the JSON is not the designer
  // format, so the caller falls back to the legacy structured-column path.
  private convertDesignerRule(
    rule: RawBusinessRule,
    schemaToGuid: Map<string, string>,
  ): { triggerGuid: string | undefined; rules: BusinessRule[] } | null {
    let def: RawDesignerRuleDefinition;
    try {
      def = JSON.parse(rule.qdb_conditions_json ?? '') as RawDesignerRuleDefinition;
    } catch {
      return null;
    }
    if (!def || typeof def !== 'object' || Array.isArray(def) || typeof def.trigger_field_code !== 'string' || !Array.isArray(def.actions)) {
      return null;
    }

    const conditions: RuleCondition[] = [];
    for (const c of def.condition_group?.conditions ?? []) {
      const operator = DESIGNER_OPERATOR_MAP[c.operator];
      if (!operator) continue; // drop conditions with no runtime-equivalent operator
      conditions.push({
        fieldId: c.field_code, // schema code — the runtime keys form data by schema name
        operator,
        value: c.value != null ? this.parseConditionValue(c.value) : undefined,
      });
    }
    const conditionsLogic: LogicalOperator = def.condition_group?.logical_operator === 'OR' ? 'OR' : 'AND';

    const rules: BusinessRule[] = [];
    for (const action of def.actions) {
      const mappedAction = DESIGNER_ACTION_MAP[action.action_type];
      if (!mappedAction) continue; // e.g. show_message has no runtime equivalent
      rules.push({
        id: rule.qdb_form_business_ruleid,
        name: rule.qdb_name,
        description: rule.qdb_description,
        conditions,
        conditionsLogic,
        action: mappedAction,
        targetFieldId: schemaToGuid.get(action.target_field_code) ?? action.target_field_code,
        targetSectionId: undefined,
        targetTabId: undefined,
        actionValue: action.value,
        priority: rule.qdb_priority ?? 100,
        isActive: true,
      });
    }
    return { triggerGuid: schemaToGuid.get(def.trigger_field_code), rules };
  }

  // Legacy/seed rule: flat conditions array + structured qdb_action / qdb_target columns.
  private convertLegacyRule(
    rule: RawBusinessRule,
    fieldGuidToSchema: Map<string, string>,
  ): { triggerGuid: string | undefined; rules: BusinessRule[] } {
    return {
      triggerGuid: this.extractTriggerFieldGuid(rule.qdb_conditions_json),
      rules: [{
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
      }],
    };
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
      // Blank is the normal case — the engine resolves these from metadata.
      targetNavigationProperty: m.qdb_target_navigation_property || undefined,
      targetEntitySetName: m.qdb_target_entity_set_name || undefined,
      isMappedToChildEntity: m.qdb_is_child_entity ?? false,
      childEntityRelationshipName: m.qdb_child_entity_relationship_name,
      transformExpression: m.qdb_transform_expression,
      // DFE-GRIDCHILD-001: set = this mapping reads a grid column, one child record per row.
      gridColumnAttribute: m.qdb_grid_column_attribute || undefined,
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
      100000016: 'repeatingGrid', 100000017: 'richText',    100000018: 'custom',
      100000019: 'boolean',
      100000020: 'info-card',
      100000021: 'interactive-grid',
      100000022: 'label',
      100000023: 'multiLookup',
    };
    return map[code] ?? 'text';
  }

  // DFE-FBE-001: qdb_summary_mode option-set → SummaryMode. Undefined when unset so the
  // response omits it (consumers derive from showSummaryStep) — mirrors the C# generator.
  private mapSummaryMode(code: number | undefined): SummaryMode | undefined {
    const map: Record<number, SummaryMode> = {
      100000001: 'None', 100000002: 'SystemGenerated', 100000003: 'Manual',
    };
    return code !== undefined && code !== null ? map[code] : undefined;
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

  // DFE: unset → undefined (omitted from the response); runtime defaults to 'info' visually.
  private mapInfoCardStyle(code: number | undefined): 'info' | 'warning' | 'success' | 'error' | undefined {
    const map: Record<number, 'info' | 'warning' | 'success' | 'error'> = {
      100000000: 'info', 100000001: 'warning', 100000002: 'success', 100000003: 'error',
    };
    return code === undefined || code === null ? undefined : (map[code] ?? undefined);
  }

  // DFE-INFOLIST-001: validate the info-card list style strings.
  private mapInfoCardListType(v: string | undefined): 'bullet' | 'numbered-arabic' | 'numbered-roman' | undefined {
    return v === 'bullet' || v === 'numbered-arabic' || v === 'numbered-roman' ? v : undefined;
  }

  private mapInfoCardListMarker(v: string | undefined): 'circle' | 'plain' | 'none' | undefined {
    return v === 'circle' || v === 'plain' || v === 'none' ? v : undefined;
  }

  // DFE-APILOOKUP-001 — absent/unknown source is left undefined so the frontend and
  // C# path both treat it as the default 'entity' behaviour (no migration needed).
  private mapLookupSource(v: string | undefined): 'entity' | 'api' | undefined {
    return v === 'entity' || v === 'api' ? v : undefined;
  }

  private mapLookupSearchMode(v: string | undefined): 'typeahead' | 'fetchAll' | undefined {
    return v === 'typeahead' || v === 'fetchAll' ? v : undefined;
  }

  // DFE-LKPCOL-001 — parse the display-columns JSON, keeping only well-formed entries.
  private parseDisplayColumns(json: string | undefined): LookupDisplayColumn[] | undefined {
    if (!json) return undefined;
    try {
      const parsed = JSON.parse(json) as unknown;
      if (!Array.isArray(parsed)) return undefined;
      const columns = parsed
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
        .filter((c) => typeof c.attribute === 'string' && c.attribute.length > 0)
        .map((c) => ({
          attribute: c.attribute as string,
          arabicAttribute: typeof c.arabicAttribute === 'string' && c.arabicAttribute ? c.arabicAttribute : undefined,
          header: typeof c.header === 'string' && c.header ? c.header : undefined,
        }));
      return columns.length > 0 ? columns : undefined;
    } catch {
      return undefined;
    }
  }

  private mapGridMode(code: number | undefined): 'selection' | 'entry' {
    return code === 100000001 ? 'entry' : 'selection';
  }

  // Maps each qdb_allowed_file_extensions option value to its MIME type(s).
  // Values are the Dataverse MultiSelect integer codes defined during provisioning.
  private static readonly FILE_EXTENSION_MIME_MAP: Record<number, string[]> = {
    100000000: ['application/pdf'],
    100000001: ['image/jpeg'],
    100000002: ['image/png'],
    100000003: ['image/gif'],
    100000004: ['image/webp'],
    100000005: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    100000006: ['application/msword'],
    100000007: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    100000008: ['application/vnd.ms-excel'],
    100000009: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    100000010: ['text/plain'],
    100000011: ['text/csv'],
    100000012: ['application/zip'],
    100000013: ['video/mp4'],
    100000014: ['audio/mpeg'],
  };

  private buildFileUploadConfig(field: RawField): FileUploadConfig | undefined {
    if (field.qdb_field_type !== 100000015) return undefined; // file field only

    const extensionCodes = this.parseExtensionCodes(field.qdb_allowed_file_extensions);
    const allowedMimeTypes = this.resolveAllowedMimeTypes(
      field.qdb_allowed_file_extensions,
      field.qdb_allowed_mime_types,
    );

    return {
      id: field.qdb_form_fieldid,
      fieldId: field.qdb_form_fieldid,
      allowedMimeTypes,
      maxFileSizeBytes: (field.qdb_max_file_size_mb ?? 10) * 1024 * 1024,
      destination: 'crmNotes',
      maxFiles: field.qdb_max_files ?? 1,
      ...(field.qdb_document_type !== undefined && { documentType: field.qdb_document_type }),
      ...(extensionCodes.length > 0 && { allowedFileExtensions: extensionCodes }),
    };
  }

  // Parses the Dataverse comma-separated MultiSelect string into a number array.
  private parseExtensionCodes(raw: string | undefined): number[] {
    if (!raw) return [];
    return raw.split(',').map(Number).filter((n) => !isNaN(n));
  }

  // Resolves the final MIME type array.
  // Priority: structured MultiSelect values → legacy JSON memo → hardcoded defaults.
  private resolveAllowedMimeTypes(
    extensionRaw: string | undefined,
    mimeJson: string | undefined,
  ): string[] {
    const codes = this.parseExtensionCodes(extensionRaw);
    if (codes.length > 0) {
      return codes.flatMap(
        (code) => CrmMetadataService.FILE_EXTENSION_MIME_MAP[code] ?? [],
      );
    }
    return this.parseAllowedMimeTypes(mimeJson);
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
  // DFE-ADD-003 summary step
  qdb_show_summary_step?: boolean;
  // DFE-FBE-001 summary mode option-set
  qdb_summary_mode?: number;
  // DFE-FBE-002 progress bar
  qdb_show_progress_bar?: boolean;
  // DFE-SUBMITCONFIRM-001 acknowledgement gate (label present ⇒ gate active)
  qdb_submit_confirmation_label?: string;
  qdb_submit_confirmation_message?: string;
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
  qdb_hide_tab_bar?: boolean;
  // DFE-FBE-001
  qdb_description?: string;
  qdb_is_summary_tab?: boolean;
  // DFE-SUBMITCONFIRM-002
  qdb_require_submit_confirmation?: boolean;
  qdb_submit_confirmation_label?: string;
  qdb_submit_confirmation_message?: string;
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
  qdb_icon_name?: string;   // DFE-FBE-001
}

interface RawField {
  qdb_form_fieldid: string;
  _qdb_form_section_id_value: string;
  // DFE-TABZONE-001: tab targeted by header/footer fields + placement optionset.
  _qdb_form_tab_id_value?: string;
  qdb_placement?: number;
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
  qdb_number_display_style?: number;
  qdb_bar_max_field_schema?: string;
  qdb_bar_value_field_schema?: string;
  // DFE-BARSRC-001
  qdb_bar_source?: number;
  qdb_bar_min_value?: number;
  qdb_bar_max_value?: number;
  qdb_bar_source_entity?: string;
  qdb_bar_min_attribute?: string;
  qdb_max_rows?: number;
  qdb_grid_page_size?: number;
  qdb_grid_paging_style?: string;
  qdb_component_key?: string;
  // DFE-FBE-001 Label field
  qdb_static_content?: string;
  qdb_source_field_schema_name?: string;
  qdb_show_document_view?: boolean;
  qdb_show_document_download?: boolean;
  // DFE-ADD-002 boolean field
  qdb_true_label?: string;
  qdb_false_label?: string;
  qdb_boolean_render_style?: number;
  // DFE-ADD-002 info-card field
  qdb_info_card_style?: number;
  qdb_info_card_title?: string;
  qdb_info_card_body?: string;
  qdb_info_card_icon?: string;
  qdb_info_card_list_type?: string;
  qdb_info_card_list_marker?: string;
  qdb_info_card_download_url?: string;
  qdb_info_card_download_label?: string;
  qdb_info_card_download_icon?: string;
  // File field — template download before upload
  qdb_file_download_label?: string;
  qdb_file_download_icon?: string;
  qdb_upload_document_setting?: string;
  qdb_download_document_setting?: string;
  // Prefix / suffix decorators
  qdb_prefix?: string;
  qdb_suffix?: string;
  // DFE-ADD-002 interactive-grid field. The saved view lives in the form's Grid Config
  // section (qdb_grid_saved_view_id); qdb_saved_view_id is the legacy Lookup Config twin.
  qdb_grid_saved_view_id?: string;
  qdb_saved_view_id?: string;
  qdb_grid_entity_name?: string;
  qdb_selection_mode?: number;
  qdb_grid_mode?: number;
  qdb_grid_min_rows?: number;
  // File upload config
  qdb_allowed_mime_types?: string;
  qdb_allowed_file_extensions?: string; // Dataverse MultiSelect returns comma-separated string
  qdb_max_file_size_mb?: number;
  qdb_max_files?: number;
  qdb_document_type?: number;
  // Multiselect render style
  qdb_multiselect_render_style?: number;
  // Radio render style
  qdb_radio_render_style?: number;
  // Option source from CRM optionset
  qdb_option_source_entity?: string;
  qdb_option_source_attribute?: string;
  // Grid filtering
  qdb_grid_filter_expression?: string;
  qdb_grid_depends_on_field_schema?: string;
  qdb_grid_depends_on_filter_template?: string;
  // DFE-GRIDSRC-001: grid data source + display config
  qdb_grid_data_source?: string;
  qdb_grid_json_data?: string;
  qdb_grid_display_mode?: string;
  qdb_grid_view_mode?: string;
  qdb_grid_card_layout?: string;
  qdb_grid_selectable?: boolean;
  qdb_grid_card_icon?: string;
}

interface RawOption {
  qdb_form_option_valueid: string;
  _qdb_form_field_id_value: string;
  qdb_value: string;
  qdb_label: string;
  qdb_display_order: number;
  qdb_is_default?: boolean;
  qdb_parent_option_value?: string;
  qdb_is_active?: boolean;
  qdb_description?: string;
  qdb_icon_name?: string;
  qdb_notes?: string;
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
  // DFE-APILOOKUP-001
  qdb_lookup_source?: string;
  qdb_lookup_api_endpoint_key?: string;
  qdb_lookup_api_value_path?: string;
  qdb_lookup_api_label_path?: string;
  qdb_lookup_api_search_param?: string;
  qdb_lookup_api_search_mode?: string;
  qdb_display_columns_json?: string;
}


interface RawSubmissionMapping {
  qdb_form_submission_mappingid: string;
  _qdb_form_field_id_value: string;
  qdb_target_entity_logical_name: string;
  qdb_target_attribute_logical_name: string;
  qdb_target_navigation_property?: string;
  qdb_target_entity_set_name?: string;
  qdb_is_child_entity?: boolean;
  qdb_child_entity_relationship_name?: string;
  qdb_transform_expression?: string;
  qdb_grid_column_attribute?: string;
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

// The designer serialises rules as this shape into qdb_conditions_json (schema codes,
// nested actions) — distinct from the flat legacy conditions array + structured columns.
interface RawDesignerRuleDefinition {
  version?: string;
  trigger_field_code: string;
  condition_group?: {
    logical_operator?: 'AND' | 'OR';
    conditions?: Array<{ field_code: string; operator: string; value?: string | null }>;
  };
  actions: Array<{ action_type: string; target_field_code: string; value?: string }>;
}

// Designer snake_case operators/actions → runtime camelCase vocab. Unmapped entries
// (e.g. not_contains, show_message) are dropped rather than passed through invalid.
const DESIGNER_OPERATOR_MAP: Record<string, ConditionOperator> = {
  equals: 'equals',
  not_equals: 'notEquals',
  contains: 'contains',
  is_empty: 'isEmpty',
  is_not_empty: 'isNotEmpty',
  greater_than: 'greaterThan',
  less_than: 'lessThan',
};

const DESIGNER_ACTION_MAP: Record<string, BusinessRuleAction> = {
  show_field: 'showField',
  hide_field: 'hideField',
  set_required: 'makeRequired',
  clear_required: 'makeOptional',
  set_value: 'setValue',
};

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

function deriveColumnFilterType(fieldType: string): GridColumnFilterType {
  if (['text', 'email', 'phone', 'textarea'].includes(fieldType)) return 'text';
  if (['dropdown', 'status', 'picklist'].includes(fieldType)) return 'optionset';
  if (fieldType === 'lookup') return 'lookup';
  return 'none';
}

interface ParsedColumnMeta {
  options?: GridColumnOptionValue[];
  filterType?: GridColumnFilterType;
  lookupTargetEntity?: string;
  lookupDisplayAttribute?: string;
  lookupValueAttribute?: string;
}

function parseColumnMeta(json: string | null | undefined): ParsedColumnMeta {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return { options: parsed as GridColumnOptionValue[] };
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const VALID_FILTER_TYPES = new Set(['text', 'optionset', 'lookup', 'none']);
      return {
        options: Array.isArray(obj['options']) ? (obj['options'] as GridColumnOptionValue[]) : undefined,
        filterType: VALID_FILTER_TYPES.has(obj['filterType'] as string)
          ? (obj['filterType'] as GridColumnFilterType)
          : undefined,
        lookupTargetEntity: typeof obj['lookupTargetEntity'] === 'string' ? obj['lookupTargetEntity'] : undefined,
        lookupDisplayAttribute: typeof obj['lookupDisplayAttribute'] === 'string' ? obj['lookupDisplayAttribute'] : undefined,
        lookupValueAttribute: typeof obj['lookupValueAttribute'] === 'string' ? obj['lookupValueAttribute'] : undefined,
      };
    }
    return {};
  } catch {
    return {};
  }
}


interface CrmPicklistOption {
  Value: number;
  Label?: {
    LocalizedLabels?: Array<{ Label: string; LanguageCode: number }>;
  };
}

interface CrmPicklistAttributeResponse {
  OptionSet?: {
    Options?: CrmPicklistOption[];
  };
}

// FR-010: resolve OptionSet label by LCID — falls back to EN (1033) then to String(Value).
// C-003: if the Arabic Language Pack is not installed, LCID 1025 labels will be absent;
//        the fallback to EN applies silently. Document installation status per C-003.
function resolveOptionSetLabel(option: CrmPicklistOption, requestedLcid?: number): string {
  const labels = option.Label?.LocalizedLabels;
  if (!labels) return String(option.Value);
  if (requestedLcid) {
    const match = labels.find((l) => l.LanguageCode === requestedLcid);
    if (match) return match.Label;
  }
  const english = labels.find((l) => l.LanguageCode === 1033);
  return english?.Label ?? String(option.Value);
}
