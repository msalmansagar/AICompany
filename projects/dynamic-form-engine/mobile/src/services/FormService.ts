import { apiGet, apiPost } from './apiClient';
import type {
  FormListItem,
  FormDefinition,
  TabDefinition,
  SectionDefinition,
  FieldDefinition,
  ValidationRule,
  OptionValue,
  FieldType,
} from '@qdb/form-engine-shared';

// ── Backend response shapes (as returned by @dfe/shared) ──────

interface BackendFormSummary {
  id: string;
  formCode: string;
  title: string;
  description?: string;
  status: string;
  version: number;
  modifiedAt: string;
}

interface BackendOptionValue {
  value: string;
  label: string;
  displayOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

interface BackendValidationRule {
  id: string;
  fieldId: string;
  ruleType: string;
  errorMessage: string;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  regexPattern?: string;
  compareToFieldId?: string;
  compareToValue?: string;
  customExpression?: string;
  isActive: boolean;
  priority: number;
}

interface BackendFieldDefinition {
  id: string;
  sectionId: string;
  fieldType: string;
  schemaName: string;
  label: string;
  placeholder?: string;
  tooltip?: string;
  defaultValue?: unknown;
  displayOrder: number;
  columnSpan: number;
  isRequired: boolean;
  isReadonly: boolean;
  isHidden: boolean;
  isVisible: boolean;
  options?: BackendOptionValue[];
  currencyCode?: string;
  decimalPlaces?: number;
  maxRows?: number;
  validationRules: BackendValidationRule[];
  businessRules: unknown[];
  lookupConfig?: {
    entityLogicalName: string;
    displayAttribute: string;
    valueAttribute: string;
    searchMinChars: number;
    maxResults: number;
  };
}

interface BackendSectionDefinition {
  id: string;
  tabId: string;
  label: string;
  description?: string;
  displayOrder: number;
  columns: number;
  isCollapsible: boolean;
  isCollapsedByDefault: boolean;
  isVisible: boolean;
  fields: BackendFieldDefinition[];
}

interface BackendTabDefinition {
  id: string;
  formDefinitionId: string;
  label: string;
  displayOrder: number;
  isVisible: boolean;
  sections: BackendSectionDefinition[];
}

interface BackendSubmissionMapping {
  id: string;
  formDefinitionId: string;
  fieldId: string;
  targetEntityLogicalName: string;
  targetAttributeLogicalName: string;
  isMappedToChildEntity: boolean;
}

interface BackendFormDefinition {
  id: string;
  formCode: string;
  title: string;
  description?: string;
  status: string;
  version: number;
  allowSaveDraft: boolean;
  confirmationMessage: string;
  submissionMappings: BackendSubmissionMapping[];
  tabs: BackendTabDefinition[];
}

// ── Type normalization ────────────────────────────────────────

const FIELD_TYPE_MAP: Record<string, FieldType> = {
  richText: 'richtext',
  repeatingGrid: 'grid',
};

function normalizeFieldType(raw: string): FieldType {
  return (FIELD_TYPE_MAP[raw] ?? raw) as FieldType;
}

// ── Mapping functions ─────────────────────────────────────────

function mapOptionValue(opt: BackendOptionValue): OptionValue {
  return { value: opt.value, label: opt.label, displayOrder: opt.displayOrder };
}

function mapValidationRule(rule: BackendValidationRule): ValidationRule {
  const params: Record<string, unknown> = {};
  if (rule.minLength !== undefined) params.minLength = rule.minLength;
  if (rule.maxLength !== undefined) params.maxLength = rule.maxLength;
  if (rule.minValue !== undefined) params.minValue = rule.minValue;
  if (rule.maxValue !== undefined) params.maxValue = rule.maxValue;
  if (rule.regexPattern !== undefined) params.regexPattern = rule.regexPattern;
  if (rule.compareToFieldId !== undefined) params.compareToFieldId = rule.compareToFieldId;
  if (rule.compareToValue !== undefined) params.compareToValue = rule.compareToValue;
  if (rule.customExpression !== undefined) params.customExpression = rule.customExpression;

  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    errorMessage: rule.errorMessage,
    ...(Object.keys(params).length > 0 ? { params } : {}),
  };
}

function mapFieldDefinition(field: BackendFieldDefinition): FieldDefinition {
  return {
    fieldId: field.id,
    fieldKey: field.schemaName,
    fieldType: normalizeFieldType(field.fieldType),
    displayLabel: field.label,
    displayOrder: field.displayOrder,
    isRequiredDefault: field.isRequired,
    isReadonlyDefault: field.isReadonly,
    isVisibleDefault: !field.isHidden,
    validationRules: field.validationRules.map(mapValidationRule),
    optionValues: field.options?.map(mapOptionValue) ?? [],
    decimalPlaces: field.decimalPlaces,
    currencySymbol: field.currencyCode,
    // Encode full lookup config into lookupEntity as pipe-separated string
    // Format: entity|displayAttr|valueAttr|searchMin|maxResults
    lookupEntity: field.lookupConfig
      ? [
          field.lookupConfig.entityLogicalName,
          field.lookupConfig.displayAttribute,
          field.lookupConfig.valueAttribute,
          field.lookupConfig.searchMinChars ?? 2,
          field.lookupConfig.maxResults ?? 10,
        ].join('|')
      : undefined,
  };
}

function mapSectionDefinition(section: BackendSectionDefinition): SectionDefinition {
  return {
    sectionId: section.id,
    displayLabel: section.label,
    displayOrder: section.displayOrder,
    isCollapsible: section.isCollapsible,
    fields: section.fields.map(mapFieldDefinition),
  };
}

function mapTabDefinition(tab: BackendTabDefinition): TabDefinition {
  return {
    tabId: tab.id,
    displayLabel: tab.label,
    displayOrder: tab.displayOrder,
    sections: tab.sections.map(mapSectionDefinition),
  };
}

function mapFormDefinition(backend: BackendFormDefinition): FormDefinition {
  return {
    formId: backend.id,
    formCode: backend.formCode,
    displayName: backend.title,
    description: backend.description ?? '',
    version: backend.version,
    allowSaveDraft: backend.allowSaveDraft,
    confirmationMessage: backend.confirmationMessage,
    tabs: backend.tabs.map(mapTabDefinition),
    businessRules: [],
    submissionMappings: backend.submissionMappings.map((m) => ({
      mappingId: m.id,
      targetEntity: m.targetEntityLogicalName,
      fieldMappings: { [m.fieldId]: m.targetAttributeLogicalName },
    })),
  };
}

function mapFormSummaryToListItem(summary: BackendFormSummary): FormListItem {
  return {
    formId: summary.id,
    formCode: summary.formCode,
    displayName: summary.title,
    description: summary.description ?? '',
    requiresDesktop: false,
    hasDraft: false,
    version: summary.version,
  };
}

// ── Public API ────────────────────────────────────────────────

export async function listForms(accessToken: string): Promise<FormListItem[]> {
  const summaries = await apiGet<BackendFormSummary[]>('/api/forms', accessToken);
  return summaries.map(mapFormSummaryToListItem);
}

export async function getFormDefinition(
  formCode: string,
  accessToken: string
): Promise<FormDefinition> {
  const backend = await apiGet<BackendFormDefinition>(
    `/api/forms/${formCode}/metadata`,
    accessToken
  );
  return mapFormDefinition(backend);
}

export async function submitForm(
  formCode: string,
  formData: Record<string, unknown>,
  accessToken: string
): Promise<void> {
  await apiPost<{ formData: Record<string, unknown> }, unknown>(
    `/api/forms/${formCode}/submit`,
    { formData },
    accessToken
  );
}

export async function saveDraft(
  formCode: string,
  formData: Record<string, unknown>,
  currentTabIndex: number,
  accessToken: string
): Promise<void> {
  await apiPost<{ formData: Record<string, unknown>; currentTabIndex: number }, unknown>(
    `/api/forms/${formCode}/draft`,
    { formData, currentTabIndex },
    accessToken
  );
}
