export type FieldType =
  | 'text' | 'textarea' | 'number' | 'currency' | 'decimal'
  | 'date' | 'datetime' | 'dropdown' | 'multiselect' | 'lookup'
  | 'checkbox' | 'radio' | 'email' | 'phone' | 'file'
  | 'richtext' | 'grid' | 'boolean' | 'info-card' | 'interactive-grid';

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
}

export type BooleanRenderStyle = 'toggle' | 'radio';
export type MultiselectRenderStyle = 'dropdown' | 'checkboxes';
export type RadioRenderStyle = 'list' | 'cards';
export type GridSelectionMode = 'single' | 'multi';
export type GridMode = 'selection' | 'entry';
export type InfoCardSectionType = 'numbered-steps' | 'icon-list' | 'download-list';

export interface GridColumnConfig {
  columnId: string;
  targetAttribute: string;
  columnLabel: string;
  displayOrder: number;
  columnFieldType: string;
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

export interface FieldDefinition {
  fieldId: string;
  fieldKey: string;
  fieldType: FieldType;
  displayLabel: string;
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
  gridConfig?: GridFieldConfig;
}

export interface SectionDefinition {
  sectionId: string;
  displayLabel: string;
  displayOrder: number;
  isCollapsible: boolean;
  isCollapsedByDefault?: boolean;
  fields: FieldDefinition[];
}

export interface TabDefinition {
  tabId: string;
  displayLabel: string;
  displayOrder: number;
  sections: SectionDefinition[];
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

export interface FormDefinition {
  formId: string;
  formCode: string;
  displayName: string;
  description: string;
  version: number;
  allowSaveDraft: boolean;
  confirmationMessage: string;
  tabs: TabDefinition[];
  buttons: FormButton[];
  businessRules: BusinessRule[];
  submissionMappings: SubmissionMapping[];
  infoCards: InfoCardScreen[];
  allowInfocardSkip: boolean;
  infocardBackLabel?: string;
  infocardContinueLabel?: string;
  infocardStartLabel?: string;
  infocardSkipLabel?: string;
}
