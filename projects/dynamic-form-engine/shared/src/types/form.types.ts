// ─────────────────────────────────────────────────────────────
// Shared TypeScript contracts — used by both frontend and backend
// ─────────────────────────────────────────────────────────────

import type { DesignPayload } from './design.types';

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
  | 'interactive-grid';

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
  | 'customExpression';

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
  compareToFieldId?: string;       // for crossField
  compareToValue?: string;         // for dateBefore / dateAfter with fixed date
  customExpression?: string;       // safe DSL expression evaluated by ExpressionEngine
  ruleTemplateId?: string;         // optional link to shared qdb_rule_template record
  isActive: boolean;
  priority: number;
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

export interface FieldDefinition {
  id: string;
  sectionId: string;
  fieldType: FieldType;
  schemaName: string;              // logical name used as form field key
  label: string;
  placeholder?: string;
  tooltip?: string;
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
  maxRows?: number;                // repeatingGrid
  componentKey?: string;           // custom field type — key used to resolve from ComponentRegistry

  // DFE-ADD-002: Boolean field config (qdb_true_label, qdb_false_label, qdb_bool_render_style)
  trueLabel?: string;
  falseLabel?: string;
  boolRenderStyle?: 'toggle' | 'radio';

  // DFE-ADD-002: Info-card field config
  infoCardStyle?: 'info' | 'warning' | 'success' | 'error';
  infoCardTitle?: string;
  infoCardBody?: string;
  infoCardIcon?: string;

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
}

// ── Tab definition ────────────────────────────────────────────

export interface TabDefinition {
  id: string;
  formDefinitionId: string;
  label: string;
  iconName?: string;               // Fluent UI icon name
  displayOrder: number;
  isVisible: boolean;
  requiresPreviousTabComplete: boolean;
  sections: SectionDefinition[];
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
  columnConfigs: GridColumnConfig[];
  columnConfigHash?: string;       // SHA-256 truncated to 16 hex chars
  // DFE-ADD-002: flat mapper aliases used by CrmMetadataService
  mode?: GridMode;
  entityName?: string;
}

export interface GridRecord {
  id: string;
  values: Record<string, unknown>;
}

export interface GridRecordPage {
  records: GridRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isCapped: boolean;
}

// ── Grid schema hash validation result (DFE-ADD-002) ─────────

export interface GridSchemaHashResult {
  gridFieldId: string;
  invalidated: boolean;
  reason: string;
}

// ── Form definition (root) ────────────────────────────────────

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
  submissionMappings: SubmissionMapping[];
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
}
