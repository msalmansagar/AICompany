// ─────────────────────────────────────────────────────────────
// Shared TypeScript contracts — used by both frontend and backend
// ─────────────────────────────────────────────────────────────

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
  | 'richText';

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
  customExpression?: string;       // Phase 2 — safe DSL expression
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
  submissionMappings: SubmissionMapping[];
  buttons: FormButton[];
  tabs: TabDefinition[];
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
    | 'adminConfigChanged';
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
