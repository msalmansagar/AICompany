export type FieldType =
  | 'text' | 'textarea' | 'number' | 'currency' | 'decimal'
  | 'date' | 'datetime' | 'dropdown' | 'multiselect' | 'lookup'
  | 'checkbox' | 'radio' | 'email' | 'phone' | 'file'
  | 'richtext' | 'grid';

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
}

export interface SectionDefinition {
  sectionId: string;
  displayLabel: string;
  displayOrder: number;
  isCollapsible: boolean;
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
}
