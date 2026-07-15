export type FieldType =
  | 'text' | 'textarea' | 'number' | 'currency' | 'decimal'
  | 'date' | 'datetime' | 'dropdown' | 'multiselect' | 'lookup'
  | 'checkbox' | 'radio' | 'email' | 'phone' | 'file'
  | 'richtext' | 'grid' | 'boolean' | 'info-card' | 'interactive-grid'
  | 'custom'
  // DFE-FBE-001: read-only display field (static text or data-bound mirror of another field)
  | 'label'
  // DFE-FBE-002: multi-select lookup
  | 'multiLookup';

// DFE-FBE-001: form-level summary behaviour (None | SystemGenerated | Manual).
export type SummaryMode = 'None' | 'SystemGenerated' | 'Manual';

export interface ValidationRule {
  ruleId: string;
  ruleType: string;
  params?: Record<string, unknown>;
  errorMessage: string;
}

export interface OptionValue {
  value: string;
  label: string;
  displayOrder: number;
  description?: string;
  iconName?: string;
  notes?: string;
}

export type BooleanRenderStyle = 'toggle' | 'radio';
export type MultiselectRenderStyle = 'dropdown' | 'checkboxes';
export type RadioRenderStyle = 'list' | 'cards';
export type GridSelectionMode = 'single' | 'multi';
export type GridMode = 'selection' | 'entry';
export type InfoCardSectionType = 'numbered-steps' | 'icon-list' | 'download-list';

export type GridColumnFilterType = 'text' | 'optionset' | 'lookup' | 'none';

export interface GridColumnOptionValue {
  value: string;
  label: string;
}

export interface GridColumnConfig {
  columnId: string;
  targetAttribute: string;
  columnLabel: string;
  displayOrder: number;
  columnFieldType: string;
  filterType?: GridColumnFilterType;
  lookupTargetEntity?: string;
  lookupDisplayAttribute?: string;
  options?: GridColumnOptionValue[];
}

export interface GridFieldConfig {
  mode: GridMode;
  selectionMode?: GridSelectionMode;
  // Backend pre-filters to visible columns only; absent if no column configs are defined.
  columnConfigs?: GridColumnConfig[];
  maxRows?: number;
  savedViewId?: string;
  entityName?: string;
  minRows?: number;
  filterExpression?: string;
  dependsOnFieldId?: string;
  dependsOnFilterTemplate?: string;
}

export interface GridRecord {
  id: string;
  values: Record<string, unknown>;
}

export interface GridRecordPage {
  records: GridRecord[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  nextPageCookie?: string;
  isCapped: boolean;
}

export type UploadDestination = 'crmNotes' | 'sharePoint';

export interface FileUploadConfig {
  id: string;
  fieldId: string;
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
  destination: UploadDestination;
  sharePointLibraryUrl?: string;
  sharePointFolderPath?: string;
  maxFiles: number;
}

export interface InfoCardItem {
  itemId: string;
  displayOrder: number;
  itemTitle: string;
  itemDescription?: string;
  iconReference?: string;
  downloadUrl?: string;
}

export interface InfoCardSection {
  sectionId: string;
  displayOrder: number;
  sectionTitle: string;
  sectionType: InfoCardSectionType;
  noteText?: string;
  items: InfoCardItem[];
}

export interface InfoCardScreen {
  screenId: string;
  displayOrder: number;
  iconUrl?: string;
  iconAltText?: string;
  heading: string;
  subHeading?: string;
  sections: InfoCardSection[];
}

// DFE-TABZONE-001: placement zone within a tab. 'body' (default) keeps the field
// inside a section; 'header'/'footer' place it directly in the tab zone.
export type FieldPlacement = 'header' | 'footer' | 'body';

export interface FieldDefinition {
  fieldId: string;
  fieldKey: string;
  fieldType: FieldType;
  displayLabel: string;
  // DFE-TABZONE-001: tab targeted when placement is 'header'/'footer'.
  tabId?: string;
  // DFE-TABZONE-001: placement zone within the tab. Absent ⇒ 'body' (legacy).
  placement?: FieldPlacement;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  tooltip?: string;
  displayOrder: number;
  isRequiredDefault: boolean;
  isReadonlyDefault: boolean;
  isVisibleDefault: boolean;
  validationRules: ValidationRule[];
  optionValues: OptionValue[];
  lookupEntity?: string;
  maxFileSize?: number;
  allowedMimeTypes?: string[];
  allowCamera?: boolean;
  decimalPlaces?: number;
  currencySymbol?: string;
  childFields?: FieldDefinition[];
  boolRenderStyle?: BooleanRenderStyle;
  multiselectRenderStyle?: MultiselectRenderStyle;
  radioRenderStyle?: RadioRenderStyle;
  trueLabel?: string;
  falseLabel?: string;
  // DFE-ADD-002: info-card field config
  infoCardStyle?: 'info' | 'warning' | 'success' | 'error';
  infoCardTitle?: string;
  infoCardBody?: string;
  infoCardIcon?: string;
  infoCardDownloadUrl?: string;
  infoCardDownloadLabel?: string;
  infoCardDownloadIcon?: string;
  // File field — template download before upload
  fileDownloadLabel?: string;
  fileDownloadIcon?: string;
  uploadDocumentSetting?: string;
  downloadDocumentSetting?: string;
  gridConfig?: GridFieldConfig;
  // DFE-FBE-001: Label field — static content, or a data-bound mirror of another field's
  // value (sourceFieldSchemaName references that field's key/schema name).
  staticContent?: string;
  sourceFieldSchemaName?: string;
}

export interface SectionDefinition {
  sectionId: string;
  displayLabel: string;
  displayOrder: number;
  isCollapsible: boolean;
  isCollapsedByDefault?: boolean;
  fields: FieldDefinition[];
  // DFE-BTN-001: section-scoped buttons (additive; defaults to [] for existing forms)
  buttons?: ScopedButton[];
  // DFE-FBE-001: section header icon
  iconName?: string;
}

export interface TabDefinition {
  tabId: string;
  displayLabel: string;
  displayOrder: number;
  // DFE-FBE-001: tab description (rendered above sections) + manual-summary designation
  description?: string;
  isSummaryTab?: boolean;
  // When true and this tab is active, the renderer hides the tab navigation bar
  // but still renders the tab's sections and fields at full width.
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

export type ButtonAction = 'submit' | 'saveDraft' | 'cancel' | 'reset';

export interface FormButton {
  buttonId: string;
  label: string;
  action: ButtonAction;
  displayOrder: number;
  isVisible: boolean;
  isPrimary: boolean;
  confirmationRequired: boolean;
  confirmationMessage?: string;
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
}

/** Resolved extra-parameter envelope produced server-side at submit time. */
export interface ResolvedExtraParams {
  [key: string]: string | number | boolean | null;
}

export interface BusinessRule {
  ruleId: string;
  conditions: unknown;
  actions: unknown[];
}

export interface SubmissionMapping {
  mappingId: string;
  targetEntity: string;
  fieldMappings: Record<string, string>;
}

// DFE-SUBMITCONFIRM-001: manual acknowledgement gate shown on the final step.
export interface SubmitConfirmationConfig {
  checkboxLabel: string;
  dialogMessage?: string;
}

export interface FormDefinition {
  formId: string;
  formCode: string;
  displayName: string;
  description: string;
  version: number;
  allowSaveDraft: boolean;
  showSummaryStep?: boolean;
  // DFE-FBE-001: None | SystemGenerated | Manual (undefined → derive from showSummaryStep).
  summaryMode?: SummaryMode;
  // DFE-FBE-002: form-completion progress bar (default off).
  showProgressBar?: boolean;
  confirmationMessage: string;
  tabs: TabDefinition[];
  buttons: FormButton[];
  businessRules: BusinessRule[];
  submissionMappings: SubmissionMapping[];
  // DFE-SUBMITCONFIRM-001: acknowledgement gate on the final step (absent ⇒ no gate).
  submitConfirmation?: SubmitConfirmationConfig;
  infoCards: InfoCardScreen[];
  allowInfocardSkip: boolean;
  infocardBackLabel?: string;
  infocardContinueLabel?: string;
  infocardStartLabel?: string;
  infocardSkipLabel?: string;
}
