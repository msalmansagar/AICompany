import { apiGet, apiPost } from './apiClient';
import { isOnline } from './NetworkMonitor';
import {
  cacheFormList,
  getCachedFormList,
  cacheFormDefinition,
  getCachedFormDefinition,
} from './OfflineCache';
import {
  enqueueSubmission,
  getAllPending,
  removePending,
  type PendingSubmission,
} from './PendingSubmissionQueue';
import type {
  FormListItem,
  FormDefinition,
  FormButton,
  ButtonAction,
  TabDefinition,
  SectionDefinition,
  FieldDefinition,
  ValidationRule,
  OptionValue,
  FieldType,
} from '@qdb/shared';

// ── Backend response shapes (as returned by @qdb/shared) ──────

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

interface BackendFormButton {
  id: string;
  formDefinitionId: string;
  label: string;
  action: string;
  displayOrder: number;
  isVisible: boolean;
  isPrimary: boolean;
  confirmationRequired: boolean;
  confirmationMessage?: string;
  isActive: boolean;
}

interface BackendInfoCardItem {
  itemId: string;
  displayOrder: number;
  itemTitle: string;
  itemDescription: string | null;
  iconReference: string | null;
  downloadUrl: string | null;
}

interface BackendInfoCardSection {
  sectionId: string;
  displayOrder: number;
  sectionTitle: string | null;
  sectionType: 'numbered-steps' | 'icon-list' | 'download-list';
  noteText: string | null;
  items: BackendInfoCardItem[];
}

interface BackendInfoCardScreen {
  screenId: string;
  displayOrder: number;
  iconUrl: string | null;
  iconAltText: string | null;
  heading: string;
  subHeading: string | null;
  sections: BackendInfoCardSection[];
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
  buttons: BackendFormButton[];
  submissionMappings: BackendSubmissionMapping[];
  tabs: BackendTabDefinition[];
  // DFE-ADD-001 fields
  infoCards: BackendInfoCardScreen[];
  allowInfocardSkip: boolean;
  infocardBackLabel?: string;
  infocardContinueLabel?: string;
  infocardStartLabel?: string;
  infocardSkipLabel?: string;
}

// â”€â”€ Type normalization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FIELD_TYPE_MAP: Record<string, FieldType> = {
  richText: 'richtext',
  repeatingGrid: 'grid',
};

function normalizeFieldType(raw: string): FieldType {
  return (FIELD_TYPE_MAP[raw] ?? raw) as FieldType;
}

// â”€â”€ Mapping functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

function mapFormButton(btn: BackendFormButton): FormButton {
  return {
    buttonId: btn.id,
    label: btn.label,
    action: btn.action as ButtonAction,
    displayOrder: btn.displayOrder,
    isVisible: btn.isVisible,
    isPrimary: btn.isPrimary,
    confirmationRequired: btn.confirmationRequired,
    confirmationMessage: btn.confirmationMessage,
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
    buttons: (backend.buttons ?? []).map(mapFormButton),
    tabs: backend.tabs.map(mapTabDefinition),
    businessRules: [],
    submissionMappings: backend.submissionMappings.map((m) => ({
      mappingId: m.id,
      targetEntity: m.targetEntityLogicalName,
      fieldMappings: { [m.fieldId]: m.targetAttributeLogicalName },
    })),
    infoCards: (backend.infoCards ?? []).map((s) => ({
      screenId: s.screenId,
      displayOrder: s.displayOrder,
      iconUrl: s.iconUrl,
      iconAltText: s.iconAltText,
      heading: s.heading,
      subHeading: s.subHeading,
      sections: (s.sections ?? []).map((sec) => ({
        sectionId: sec.sectionId,
        displayOrder: sec.displayOrder,
        sectionTitle: sec.sectionTitle,
        sectionType: sec.sectionType,
        noteText: sec.noteText,
        items: (sec.items ?? []).map((item) => ({
          itemId: item.itemId,
          displayOrder: item.displayOrder,
          itemTitle: item.itemTitle,
          itemDescription: item.itemDescription,
          iconReference: item.iconReference,
          downloadUrl: item.downloadUrl,
        })),
      })),
    })),
    allowInfocardSkip: backend.allowInfocardSkip ?? false,
    infocardBackLabel: backend.infocardBackLabel,
    infocardContinueLabel: backend.infocardContinueLabel,
    infocardStartLabel: backend.infocardStartLabel,
    infocardSkipLabel: backend.infocardSkipLabel,
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

// ── Errors ────────────────────────────────────────────────────

export class OfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineError';
  }
}

// ── Sync result ────────────────────────────────────────────────

export interface SyncResult {
  submitted: number;
  failed: number;
  pending: PendingSubmission[];
}

// ── Public API ────────────────────────────────────────────────

export async function listForms(accessToken: string, locale?: string): Promise<FormListItem[]> {
  const online = await isOnline();

  if (!online) {
    const cached = await getCachedFormList();
    if (cached) return cached;
    throw new OfflineError('No cached form list — connect to network first');
  }

  const summaries = await apiGet<BackendFormSummary[]>('/api/forms', accessToken, { locale });
  const items = summaries.map(mapFormSummaryToListItem);
  await cacheFormList(items);
  return items;
}

export async function getFormDefinition(
  formCode: string,
  accessToken: string,
  locale?: string,
): Promise<FormDefinition> {
  const online = await isOnline();

  if (!online) {
    const cached = await getCachedFormDefinition(formCode);
    if (cached) return cached;
    throw new OfflineError(`No cached definition for form '${formCode}' — connect to network first`);
  }

  const backend = await apiGet<BackendFormDefinition>(
    `/api/forms/${formCode}/metadata`,
    accessToken,
    { locale },
  );
  const def = mapFormDefinition(backend);
  await cacheFormDefinition(formCode, def);
  return def;
}

export async function submitForm(
  formCode: string,
  formData: Record<string, unknown>,
  accessToken: string,
): Promise<'submitted' | 'queued'> {
  const online = await isOnline();

  if (!online) {
    await enqueueSubmission(formCode, formData);
    return 'queued';
  }

  await apiPost<{ formData: Record<string, unknown> }, unknown>(
    `/api/forms/${formCode}/submit`,
    { formData },
    accessToken,
  );
  return 'submitted';
}

interface SaveDraftPayload {
  formData: Record<string, unknown>;
  currentTabIndex: number;
  infoCardViewed: boolean;
  gridSchemaHash: Record<string, never>;
}

export async function saveDraft(
  formCode: string,
  formData: Record<string, unknown>,
  currentTabIndex: number,
  accessToken: string,
  infoCardViewed: boolean = false,
): Promise<void> {
  const payload: SaveDraftPayload = {
    formData,
    currentTabIndex,
    infoCardViewed,
    gridSchemaHash: {},
  };
  await apiPost<SaveDraftPayload, unknown>(
    `/api/forms/${formCode}/draft`,
    payload,
    accessToken,
  );
}

export async function syncPendingSubmissions(accessToken: string): Promise<SyncResult> {
  const pending = await getAllPending();
  let submitted = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await apiPost<{ formData: Record<string, unknown> }, unknown>(
        `/api/forms/${item.formCode}/submit`,
        { formData: item.formData },
        accessToken,
      );
      await removePending(item.id);
      submitted++;
    } catch {
      failed++;
    }
  }

  const remaining = await getAllPending();
  return { submitted, failed, pending: remaining };
}

export async function getPendingSubmissionCount(): Promise<number> {
  const pending = await getAllPending();
  return pending.length;
}
