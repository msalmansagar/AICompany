// ─────────────────────────────────────────────────────────────
// Shared TypeScript contracts — used by both frontend and backend
// ─────────────────────────────────────────────────────────────

import type { DesignPayload } from './design.types.js';

// ── Field type enumeration ────────────────────────────────────

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'datetime'
  | 'dropdown'
  | 'multiselect'
  | 'lookup'
  | 'checkbox'
  | 'radio'
  | 'currency'
  | 'decimal'
  | 'email'
  | 'phone'
  | 'file'
  | 'repeatingGrid'
  | 'richText'
  | 'custom'
  // DFE-ADD-002: new field types
  | 'boolean'
  | 'info-card'
  | 'interactive-grid'
  // DFE-FBE-001: read-only display field (static text or data-bound mirror of another field)
  | 'label'
  // DFE-FBE-002: multi-select lookup (choose multiple related records; reuses lookupConfig)
  | 'multiLookup';

// DFE-FBE-001: form-level summary behaviour.
// None = no summary step; SystemGenerated = engine auto-builds the review step;
// Manual = the designer builds a summary tab (isSummaryTab) from Label fields.
export type SummaryMode = 'None' | 'SystemGenerated' | 'Manual';

export type ValidationRuleType =
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'minValue'
  | 'maxValue'
  | 'regex'
  | 'email'
  | 'phone'
  | 'dateBefore'
  | 'dateAfter'
  | 'crossField'
  | 'customExpression'
  // DFE-ENH-001 FR-006 — field becomes required when structured conditions are all true
  | 'conditionalRequired';

// ── Cross-field comparison operator ──────────────────────────────
// Used by both conditionalRequired rule conditions and cross-field rule comparisons.
export type CrossFieldComparisonOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';

// ── Structured condition (for conditionalRequired rule) ───────────
// Purpose-built for validation rules; evolves independently from BusinessRule RuleCondition.
export type StructuredConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'is_empty'
  | 'is_not_empty';

export interface StructuredCondition {
  /** Schema name of the field whose value drives this condition */
  fieldRef: string;
  operator: StructuredConditionOperator;
  /** Comparison target; null is valid only for is_empty / is_not_empty */
  value: string | null;
}

export type BusinessRuleAction =
  | 'showField'
  | 'hideField'
  | 'showSection'
  | 'hideSection'
  | 'showTab'
  | 'hideTab'
  | 'makeRequired'
  | 'makeOptional'
  | 'makeReadonly'
  | 'makeEditable'
  | 'setValue'
  | 'clearValue'
  | 'calculateValue'
  | 'filterOptions'
  | 'filterLookup'
  | 'validateField'
  | 'validateForm';

export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'contains'
  | 'inList'
  | 'notInList';

export type LogicalOperator = 'AND' | 'OR';

export type UploadDestination = 'crmNotes' | 'sharePoint';

export type FormStatus = 'draft' | 'active' | 'inactive' | 'archived';

// ── Form button ───────────────────────────────────────────────

export type ButtonAction = 'submit' | 'saveDraft' | 'cancel' | 'reset';

export interface FormButton {
  id: string;
  formDefinitionId: string;
  label: string;
  action: ButtonAction;
  displayOrder: number;
  isVisible: boolean;
  isPrimary: boolean;
  confirmationRequired: boolean;
  confirmationMessage?: string;
  isActive: boolean;
}

// ── DFE-BTN-001: Tab/Section scoped buttons, navigation & submission params ──
// These types are defined IDENTICALLY in shared/src/types/form.types.ts and
// shared/src/types/form.ts (mobile). The CI parity check
// (shared/scripts/check-shared-type-sync.mjs) fails the build if their members
// drift. Do not edit one of the two files without the other.

export type ButtonPlacementScope = 'tab' | 'section';

export type ScopedButtonActionType = 'navigate' | 'finalSubmit' | 'saveDraft' | 'callApi';

export type NavigationTargetType =
  | 'tab'
  | 'section'
  | 'nextStep'
  | 'previousStep'
  | 'externalUrl'
  | 'anotherForm';

export type UnsavedDataPolicy = 'warn' | 'discard' | 'block';

export interface NavigateActionConfig {
  type: 'navigate';
  target: NavigationTargetType;
  targetTabId?: string;        // target = 'tab'
  targetSectionId?: string;    // target = 'section'
  externalUrlKey?: string;     // target = 'externalUrl' — KEY into the allowlist, never a raw URL
  targetFormCode?: string;     // target = 'anotherForm'
  openInNewTab?: boolean;
  requiresPreviousTabsComplete?: boolean; // OQ-006 — default false
  unsavedDataPolicy?: UnsavedDataPolicy;  // external/anotherForm; default 'warn'
}

export type ExtraParamSource = 'static' | 'hiddenField' | 'runtimeContext' | 'computed';

export type RuntimeContextKey =
  | 'userId'
  | 'userDisplayName'
  | 'formId'
  | 'formCode'
  | 'formVersion'
  | 'submittedAt'
  | 'sessionId'
  | 'tenantSegment'
  | 'locale';

export interface ExtraParamSpec {
  key: string;                 // param name in the resolved envelope
  source: ExtraParamSource;
  staticValue?: string;        // source = 'static'
  fieldSchemaName?: string;    // source = 'hiddenField'
  contextKey?: RuntimeContextKey; // source = 'runtimeContext'
  expression?: string;         // source = 'computed' (DSL evaluated server-side)
}

export interface FinalSubmitActionConfig {
  type: 'finalSubmit';
  extraParams: ExtraParamSpec[];
}

export interface SaveDraftActionConfig {
  type: 'saveDraft';
}

export interface CallApiRequestFieldRef {
  paramKey: string;
  fieldSchemaName: string;
}

export interface CallApiResponseMapping {
  responsePath: string;
  targetFieldSchemaName: string;
}

export interface CallApiActionConfig {
  type: 'callApi';
  endpointKey: string;         // resolves against the server registry — never a URL
  method: 'GET' | 'POST';
  requestFieldRefs?: CallApiRequestFieldRef[];
  onSuccessMessage?: string;
  onErrorMessage?: string;
  responseFieldMappings?: CallApiResponseMapping[];
}

export type ScopedButtonAction =
  | NavigateActionConfig
  | FinalSubmitActionConfig
  | SaveDraftActionConfig
  | CallApiActionConfig;

// DFE-CBTN-001: a set of conditions combined by `logic`, evaluated against live
// field values to drive a scoped button's visibility or enablement.
export interface ButtonConditionSet {
  conditions: RuleCondition[];
  logic: LogicalOperator;
}

export interface ScopedButton {
  id: string;
  placementScope: ButtonPlacementScope;
  placementId: string;         // tabId (scope=tab) or sectionId (scope=section)
  label: string;
  displayOrder: number;
  isPrimary: boolean;
  isVisible: boolean;
  confirmationRequired: boolean;
  confirmationMessage?: string;
  action: ScopedButtonAction;  // discriminated by action.type
  isActive: boolean;
  // DFE-CBTN-001: optional conditional visibility / enablement. When present the
  // set is evaluated live against field values and overrides the static
  // isVisible / isActive flag; when absent, the static flag applies (legacy).
  visibleWhen?: ButtonConditionSet;
  enabledWhen?: ButtonConditionSet;
}

/** Resolved extra-parameter envelope produced server-side at submit time. */
export interface ResolvedExtraParams {
  [key: string]: string | number | boolean | null;
}

export interface FormSummary {
  id: string;
  formCode: string;
  title: string;
  description?: string;
  status: FormStatus;
  version: number;
  modifiedAt: string;
}

// ── Option values (dropdown / radio / multiselect) ────────────

export interface OptionValue {
  value: string;
  label: string;
  displayOrder: number;
  isDefault: boolean;
  parentOptionValue?: string; // for dependent dropdowns
  isActive: boolean;
  description?: string;  // shown below the label in radio-card mode
  iconName?: string;     // Fluent UI icon name (e.g. "PersonRegular")
  notes?: string;        // highlighted callout text rendered on the radio card
  // DFE-i18n-001: Dataverse record GUID for qdb_translation keying (FR-009)
  optionRecordId?: string;
}

// ── Lookup configuration ──────────────────────────────────────

export interface LookupConfig {
  id: string;
  entityLogicalName: string;       // e.g. 'account', 'contact'
  displayAttribute: string;        // attribute shown in type-ahead
  valueAttribute: string;          // attribute stored on selection (usually 'id')
  filterExpression?: string;       // OData $filter appended to lookup query
  searchMinChars: number;          // minimum chars before search fires
  maxResults: number;
  dependsOnFieldId?: string;       // filter this lookup based on another field's value
  dependsOnFilterTemplate?: string; // OData filter template with {dependsOnValue} placeholder
  // DFE-APILOOKUP-001: external-API source. Absent/'entity' => the CRM-entity path above.
  // When 'api', the backend resolves apiEndpointKey against a server-side registry and
  // proxies the call — no URL or credential ever reaches the browser.
  source?: 'entity' | 'api';
  apiEndpointKey?: string;         // opaque key resolved server-side; required when source='api'
  apiValuePath?: string;           // dot-path to the value in each API response item (e.g. 'id')
  apiLabelPath?: string;           // dot-path to the label in each API response item (e.g. 'name')
  apiSearchParamName?: string;     // query param carrying the typed term (typeahead mode)
  apiSearchMode?: 'typeahead' | 'fetchAll'; // absent => 'typeahead'
  // DFE-LKPCOL-001: multiple display columns (rendered as a table with headers) + per-column
  // Arabic source. Absent => the single displayAttribute above. The first column is the value
  // stored as the selection's displayName.
  displayColumns?: LookupDisplayColumn[];
}

export interface LookupDisplayColumn {
  attribute: string;         // source attribute (English / default)
  arabicAttribute?: string;  // source attribute used when the form language is Arabic
  header?: string;           // column header shown in the dropdown
}

// ── Validation rule ───────────────────────────────────────────

export interface ValidationRule {
  id: string;
  fieldId: string;
  ruleType: ValidationRuleType;
  errorMessage: string;
  // Type-specific parameters
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  regexPattern?: string;
  compareToFieldId?: string;        // for legacy crossField (equality only)
  compareToValue?: string;          // for dateBefore / dateAfter with fixed date
  customExpression?: string;        // safe DSL expression evaluated by ExpressionEngine
  ruleTemplateId?: string;          // optional link to shared qdb_rule_template record
  isActive: boolean;
  priority: number;
  // DFE-ENH-001 FR-006 — all conditions must evaluate to true for the field to become required
  conditions?: StructuredCondition[];
  // DFE-ENH-001 FR-007 — extended cross-field: operator and target field schema name
  crossFieldOperator?: CrossFieldComparisonOperator;
  crossFieldTargetRef?: string;
}

// ── Business rule condition ───────────────────────────────────

export interface RuleCondition {
  fieldId: string;
  operator: ConditionOperator;
  value?: string | number | boolean | string[];
  logicalOperator?: LogicalOperator; // connector to the NEXT condition in the list
}

// ── Business rule ─────────────────────────────────────────────

export interface BusinessRule {
  id: string;
  name: string;
  description?: string;
  conditions: RuleCondition[];
  conditionsLogic: LogicalOperator; // how the conditions array is combined
  action: BusinessRuleAction;
  targetFieldId?: string;
  targetSectionId?: string;
  targetTabId?: string;
  actionValue?: string;             // for setValue / calculateValue / filterOptions
  priority: number;
  isActive: boolean;
}

// ── File upload configuration ─────────────────────────────────

export interface FileUploadConfig {
  id: string;
  fieldId: string;
  allowedMimeTypes: string[];       // e.g. ['application/pdf', 'image/jpeg']
  maxFileSizeBytes: number;
  destination: UploadDestination;
  sharePointLibraryUrl?: string;
  sharePointFolderPath?: string;
  maxFiles: number;
  documentType?: number;            // qdb_document_type picklist value
  /** Raw MultiSelect option values from qdb_allowed_file_extensions.
   *  Present when the field was configured via the structured multiselect;
   *  absent when only the legacy qdb_allowed_mime_types memo was used.
   *  The portal does not need to inspect these — use allowedMimeTypes instead. */
  allowedFileExtensions?: number[];
}

// ── Submission mapping ────────────────────────────────────────

export interface SubmissionMapping {
  id: string;
  formDefinitionId: string;
  fieldId: string;
  targetEntityLogicalName: string;
  targetAttributeLogicalName: string;
  isMappedToChildEntity: boolean;
  childEntityRelationshipName?: string; // relationship used to link child to parent
  transformExpression?: string;         // optional value transform before write
  isActive: boolean;
}

// ── Field definition ──────────────────────────────────────────

// DFE-TABZONE-001: where a field is placed within its tab. 'body' (default) keeps
// the field inside a section exactly as before; 'header'/'footer' place it directly
// in the tab's header/footer zone with the section reference optional.
export type FieldPlacement = 'header' | 'footer' | 'body';

export interface FieldDefinition {
  id: string;
  // Section this field belongs to. Empty string for header/footer-placed fields
  // that target a tab directly (see placement/tabId).
  sectionId: string;
  // DFE-TABZONE-001: tab this field targets when placement is 'header'/'footer'.
  tabId?: string;
  // DFE-TABZONE-001: placement zone within the tab. Absent ⇒ 'body' (legacy).
  placement?: FieldPlacement;
  fieldType: FieldType;
  schemaName: string;              // logical name used as form field key
  label: string;
  placeholder?: string;
  tooltip?: string;
  prefix?: string;                 // static text shown before the input (e.g. "$", "https://")
  suffix?: string;                 // static text shown after the input (e.g. "kg", ".com")
  defaultValue?: unknown;
  displayOrder: number;
  columnSpan: 1 | 2 | 3 | 4;     // out of 4-column grid
  isRequired: boolean;
  isReadonly: boolean;
  isHidden: boolean;
  isVisible: boolean;              // initial state before rules fire

  // Type-specific config
  options?: OptionValue[];         // dropdown / radio / multiselect
  lookupConfig?: LookupConfig;     // lookup fields
  fileUploadConfig?: FileUploadConfig; // file fields
  childFields?: FieldDefinition[]; // repeatingGrid column definitions
  currencyCode?: string;           // currency fields
  decimalPlaces?: number;          // decimal / currency fields
  // DFE-NUMBAR: number/decimal/currency display style. 'bar' = read-only utilization gauge
  // (bar value ÷ barMaxFieldSchemaName's value). Undefined/'textbox' = plain input.
  numberDisplayStyle?: 'textbox' | 'bar';
  barMaxFieldSchemaName?: string;    // schema name of the field providing the bar's maximum (total)
  barValueFieldSchemaName?: string;  // schema name of the field providing the bar's value (fill); absent = this field's own value
  maxRows?: number;                // repeatingGrid
  componentKey?: string;           // custom field type — key used to resolve from ComponentRegistry

  // DFE-FBE-001: Label field config.
  // staticContent — text shown when the Label is static (no source binding).
  // sourceFieldSchemaName — when set, the Label mirrors this field's current value, read-only
  // and type-aware (resolved from the loaded form definition + form state).
  staticContent?: string;
  sourceFieldSchemaName?: string;

  // DFE-ADD-002: Boolean field config (qdb_true_label, qdb_false_label, qdb_bool_render_style)
  trueLabel?: string;
  falseLabel?: string;
  boolRenderStyle?: 'toggle' | 'radio';

  // Multiselect render style (dropdown = default Combobox, checkboxes = visible checkbox list)
  multiselectRenderStyle?: 'dropdown' | 'checkboxes';

  // Radio render style (list = vertical radio buttons, cards = selectable card grid)
  radioRenderStyle?: 'list' | 'cards';

  // Option source from CRM optionset — when set, options come from the CRM attribute's OptionSet
  // instead of qdb_form_option_value records. Falls back to manual options when not set.
  optionSourceEntity?: string;     // e.g. 'qdb_form_definition'
  optionSourceAttribute?: string;  // e.g. 'qdb_status'

  // DFE-ADD-002: Info-card field config
  infoCardStyle?: 'info' | 'warning' | 'success' | 'error';
  infoCardTitle?: string;
  infoCardBody?: string;
  infoCardIcon?: string;
  // DFE-INFOLIST-001: render the body (newline-split) as a list. Absent ⇒ plain
  // paragraph (legacy). Marker absent ⇒ 'plain'.
  infoCardListType?: 'bullet' | 'numbered-arabic' | 'numbered-roman';
  infoCardListMarker?: 'circle' | 'plain' | 'none';
  infoCardDownloadUrl?: string;
  infoCardDownloadLabel?: string;
  infoCardDownloadIcon?: string;

  // File field — template download before upload
  fileDownloadLabel?: string;
  fileDownloadIcon?: string;
  uploadDocumentSetting?: string;
  downloadDocumentSetting?: string;

  // DFE-ADD-002: Interactive Grid config
  gridConfig?: GridFieldConfig;

  validationRules: ValidationRule[];
  businessRules: BusinessRule[];   // rules where this field is the trigger
}

// ── Section definition ────────────────────────────────────────

export interface SectionDefinition {
  id: string;
  tabId: string;
  label: string;
  description?: string;
  displayOrder: number;
  columns: 1 | 2 | 3 | 4;
  isCollapsible: boolean;
  isCollapsedByDefault: boolean;
  isVisible: boolean;
  fields: FieldDefinition[];
  // DFE-BTN-001: section-scoped buttons (additive; defaults to [] for existing forms)
  buttons?: ScopedButton[];
  // DFE-FBE-001: section header icon (same format as TabDefinition.iconName)
  iconName?: string;
}

// ── Tab definition ────────────────────────────────────────────

export interface TabDefinition {
  id: string;
  formDefinitionId: string;
  label: string;
  iconName?: string;               // Fluent UI icon name
  // DFE-FBE-001: tab description, rendered in the content area above the sections
  description?: string;
  // DFE-FBE-001: when true (and summaryMode='Manual'), this tab is the manual summary step
  isSummaryTab?: boolean;
  displayOrder: number;
  isVisible: boolean;
  requiresPreviousTabComplete: boolean;
  // When true and this tab is the active tab, the renderer hides the tab
  // navigation bar but still renders this tab's sections and fields.
  // Absent/undefined is treated as false (bar shown).
  hideTabBar?: boolean;
  sections: SectionDefinition[];
  // DFE-BTN-001: tab-scoped buttons (additive; defaults to [] for existing forms)
  buttons?: ScopedButton[];
  // DFE-TABZONE-001: fields placed directly in the tab header/footer zones
  // (additive; default [] for existing forms). Body fields stay in section.fields.
  headerFields?: FieldDefinition[];
  footerFields?: FieldDefinition[];
}

// ── Form version ──────────────────────────────────────────────

export interface FormVersion {
  id: string;
  formDefinitionId: string;
  versionNumber: number;
  publishedAt: string;             // ISO 8601
  publishedBy: string;
  changeNotes?: string;
  isCurrentVersion: boolean;
}

// ── Info-card screen types (DFE-ADD-001) ─────────────────────

export type InfoCardSectionType = 'numbered-steps' | 'icon-list' | 'download-list';

export interface InfoCardItem {
  itemId: string;
  displayOrder: number;
  itemTitle: string;
  itemDescription: string | null;
  iconReference: string | null;
  downloadUrl: string | null;
}

export interface InfoCardSection {
  sectionId: string;
  displayOrder: number;
  sectionTitle: string | null;
  sectionType: InfoCardSectionType;
  noteText: string | null;
  items: InfoCardItem[];
}

export interface InfoCardScreen {
  screenId: string;
  displayOrder: number;
  iconUrl: string | null;
  iconAltText: string | null;
  heading: string;
  subHeading: string | null;
  sections: InfoCardSection[];
}

// ── Grid types (DFE-ADD-002) ──────────────────────────────────

export type GridMode = 'selection' | 'entry';
export type GridSelectionMode = 'single' | 'multi';

// DFE-GRIDSRC-001: where a selection/display grid's rows come from, and how they render.
export type GridDataSource = 'entity' | 'json';
export type GridDisplayMode = 'columns' | 'infocard';
// Info-card arrangement: 'grid' = multi-column cards; 'row' = full-width horizontal rows.
export type GridCardLayout = 'grid' | 'row';
export type GridPagingStyle = 'prevnext' | 'numbered';
export type GridViewMode = 'both' | 'table' | 'card';

export type GridColumnFilterType = 'text' | 'optionset' | 'lookup' | 'none';

export interface GridColumnOptionValue {
  value: string;
  label: string;
}

export interface GridColumnConfig {
  columnId: string;
  displayOrder: number;
  columnLabel: string;
  targetAttribute: string;
  columnFieldType: string;
  filterType?: GridColumnFilterType;
  // Only populated when filterType === 'lookup'; used by backend to generate link-entity join.
  lookupTargetEntity?: string;
  lookupDisplayAttribute?: string;
  // The target-entity attribute used as the stored record ID. Absent ⇒ the
  // entity's primary key ({entity}id) — see CrmLookupService.
  lookupValueAttribute?: string;
  // Options for dropdown-type columns within a grid.
  options?: GridColumnOptionValue[];
}

export interface GridFieldConfig {
  gridMode: GridMode;
  targetEntity: string;
  savedViewId?: string;            // Mode A: Dataverse saved view GUID
  selectionMode?: GridSelectionMode; // Mode A
  relationshipAttribute?: string;  // Mode B: parent lookup attribute
  minRows?: number;                // Mode B
  maxRows: number;
  pageSize?: number;               // records per page for entity selection grids (runtime default 50)
  pagingStyle?: GridPagingStyle;   // pager UI: 'prevnext' (default) or 'numbered' page buttons
  columnConfigs: GridColumnConfig[];
  columnConfigHash?: string;       // SHA-256 truncated to 16 hex chars
  // DFE-GRIDSRC-001: data source + display configuration (selection/display grids).
  dataSource?: GridDataSource;     // default 'entity' (Dataverse). 'json' = static jsonData.
  jsonData?: string;               // static JSON array (string) when dataSource === 'json'
  displayMode?: GridDisplayMode;   // default 'columns' (table). 'infocard' = rich card per row.
  viewMode?: GridViewMode;         // which views are offered: 'both' (toggle), 'table' only, or 'card' only
  cardLayout?: GridCardLayout;     // info-card arrangement: 'grid' (default) or 'row' (list)
  selectable?: boolean;            // default true for selection; false = read-only display
  cardIconName?: string;           // optional Fluent icon shown on each info card
  // DFE-ADD-002: flat mapper aliases used by CrmMetadataService
  mode?: GridMode;
  entityName?: string;
  // Grid filtering
  filterExpression?: string;           // static OData $filter appended to every query
  dependsOnFieldId?: string;           // schema name of the field whose value drives the dynamic filter
  dependsOnFilterTemplate?: string;    // OData filter template — {dependsOnValue} is substituted at runtime
}

export interface GridRecord {
  id: string;
  values: Record<string, unknown>;
}

export interface GridRecordPage {
  records: GridRecord[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;      // true when more records exist beyond this page
  nextPageCookie?: string;   // opaque base64 cursor — pass back as pagingCookie for page+1
  isCapped: boolean;
  totalCount?: number;       // total matching records capped at maxRows; absent when Dataverse count limit exceeded
  totalPages?: number;       // Math.ceil(totalCount / pageSize); absent when totalCount is unavailable
}

// ── Grid schema hash validation result (DFE-ADD-002) ─────────

export interface GridSchemaHashResult {
  gridFieldId: string;
  invalidated: boolean;
  reason: string;
}

// ── Form definition (root) ────────────────────────────────────

// DFE-SUBMITCONFIRM-001: manual acknowledgement gate shown on the final step.
export interface SubmitConfirmationConfig {
  checkboxLabel: string;           // label shown next to the acknowledgement checkbox
  dialogMessage?: string;          // body text of the confirmation dialog
}

export interface FormDefinition {
  id: string;
  formCode: string;                // URL-safe identifier, e.g. 'loan-application'
  title: string;
  description?: string;
  status: FormStatus;
  version: number;
  allowSaveDraft: boolean;
  draftExpiryDays: number;
  powerAutomateFlowId?: string;    // triggered on successful submit
  confirmationMessage: string;
  confirmationRecordRefAttribute?: string; // CRM attribute to show as ref number
  accessGroupId?: string;          // Azure AD group ID for form-level access
  // DFE-ADD-001: Info-card screens (empty array when no screens configured).
  allowInfocardSkip: boolean;
  infocardCountsInProgress: boolean;
  infocardBackLabel?: string;
  infocardContinueLabel?: string;
  infocardStartLabel?: string;
  infocardSkipLabel?: string;
  infoCards: InfoCardScreen[];
  // DFE-ADD-003: show a read-only summary of all answers on the last step before submit.
  // Legacy — retained read-only for back-compat; superseded by summaryMode (DFE-FBE-001).
  showSummaryStep: boolean;
  // DFE-FBE-001: None | SystemGenerated | Manual. When undefined, generators derive it from
  // the legacy showSummaryStep flag (true → SystemGenerated, else None) — see ADR-FBE-003.
  summaryMode?: SummaryMode;
  // DFE-FBE-002: show a form-completion progress bar above the tab strip (default off).
  showProgressBar?: boolean;
  submissionMappings: SubmissionMapping[];
  // DFE-SUBMITCONFIRM-001: when set, the final step shows an acknowledgement checkbox;
  // ticking it opens a confirmation dialog and enables Submit. Absent ⇒ no gate (legacy).
  submitConfirmation?: SubmitConfirmationConfig;
  buttons: FormButton[];
  tabs: TabDefinition[];
  // DFE-DESIGN: optional design payload embedded by the backend on the form definition response.
  design?: DesignPayload;
  createdAt: string;
  modifiedAt: string;
}

// ── Draft submission ──────────────────────────────────────────

export interface DraftSubmission {
  id?: string;                     // Dataverse record ID (undefined on first save)
  formDefinitionId: string;
  formCode: string;
  userId: string;
  userDisplayName: string;
  formData: Record<string, unknown>;
  currentTabIndex: number;
  savedAt: string;
  expiresAt: string;
  // DFE-ADD-002: grid schema hashes for Entry Grid invalidation on resume.
  gridSchemaHash?: Record<string, string> | null;
  // DFE-ADD-001: first-view flag for draft-present users.
  infoCardViewed?: boolean;
}

// ── Submission log ────────────────────────────────────────────

export interface SubmissionLog {
  id: string;
  formDefinitionId: string;
  formCode: string;
  userId: string;
  userDisplayName: string;
  submittedAt: string;
  parentRecordId?: string;
  parentEntityLogicalName?: string;
  status: 'success' | 'failed' | 'partial';
  errorDetails?: string;
}

// ── Audit log entry ───────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  eventType:
    | 'userAuthenticated'
    | 'formOpened'
    | 'draftSaved'
    | 'draftResumed'
    | 'draftDiscarded'
    | 'formSubmitted'
    | 'formSubmissionFailed'
    | 'documentUploaded'
    | 'adminConfigChanged'
    // DFE-ADD-001 events
    | 'info_card_screen_viewed';
  formDefinitionId?: string;
  formDefinitionName?: string;
  userId: string;
  userDisplayName: string;
  timestampUtc: string;
  recordId?: string;
  changedData?: Record<string, unknown>;
}

// ── API response envelope ─────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>; // field-level validation errors
  correlationId: string;
}

export interface ResponseMeta {
  total?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  // DFE-APILOOKUP-001: non-fatal degradation signal (e.g. 'timeout', 'upstream_error').
  warning?: string;
}

// ── Lookup search result ──────────────────────────────────────

export interface LookupResult {
  id: string;
  displayName: string;
  entityLogicalName: string;
  additionalAttributes?: Record<string, unknown>;
}

// ── Form field value map (runtime state) ─────────────────────

export type FormFieldValues = Record<string, unknown>;

// ── Rule engine evaluation context ───────────────────────────

export interface RuleEvaluationContext {
  fieldValues: FormFieldValues;
  formDefinitionId: string;
}

export interface RuleEvaluationResult {
  fieldVisibility: Record<string, boolean>;
  sectionVisibility: Record<string, boolean>;
  tabVisibility: Record<string, boolean>;
  fieldRequired: Record<string, boolean>;
  fieldReadonly: Record<string, boolean>;
  fieldValues: Record<string, unknown>; // fields that had values set/cleared/calculated
  filteredOptions: Record<string, OptionValue[]>;
  // DFE-CBTN-001: per-button conditional state, keyed by button id. A button id
  // is present only when that button declares the corresponding condition set;
  // absent ⇒ the button's static isVisible / isActive flag applies (legacy).
  buttonVisibility: Record<string, boolean>;
  buttonEnabledState: Record<string, boolean>;
}
