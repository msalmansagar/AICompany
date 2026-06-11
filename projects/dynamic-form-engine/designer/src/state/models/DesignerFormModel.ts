// Domain model for a form definition as held in the designer local state.
// Temp IDs are prefixed with 'tmp_' until the record is persisted to CRM.

export type FormStatus = 'draft' | 'published' | 'archived';

export interface DesignerFormModel {
  /** CRM GUID or 'tmp_form_<timestamp>' for unsaved forms */
  id: string;
  name: string;
  code: string;
  description: string;
  entityLogicalName: string;
  status: FormStatus;
  currentVersion: string;
  themeId: string | null;
  allowSaveDraft: boolean;
  draftExpiryDays: number | null;
  powerAutomateFlowId: string | null;
  confirmationMessage: string | null;
  confirmationRecordRefAttribute: string | null;
  accessGroupId: string | null;
  createdBy: string;
  createdOn: Date;
  modifiedBy: string;
  modifiedOn: Date;
}

export interface DesignerTabModel {
  /** CRM GUID or 'tmp_tab_<timestamp>' */
  id: string;
  formId: string;
  label: string;
  iconName: string | null;
  sortOrder: number;
  isVisible: boolean;
  requiresPreviousTabComplete: boolean;
}

export interface DesignerSectionModel {
  /** CRM GUID or 'tmp_section_<timestamp>' */
  id: string;
  tabId: string;
  label: string;
  description: string | null;
  columnCount: 1 | 2 | 3;
  isCollapsible: boolean;
  isExpandedByDefault: boolean;
  isVisible: boolean;
  sortOrder: number;
}

export interface DesignerOptionValue {
  id: string;
  label: string;
  value: string;
  sortOrder: number;
  isDefault: boolean;
}

export interface DesignerLookupConfig {
  targetEntity: string;
  displayField: string;
  valueField: string;
  filterQuery: string | null;
  searchMinChars: number;
  maxResults: number;
}

export interface DesignerFieldModel {
  /** CRM GUID or 'tmp_field_<timestamp>' */
  id: string;
  sectionId: string;
  label: string;
  code: string;
  fieldType: string;
  placeholder: string;
  helpText: string;
  isRequired: boolean;
  isReadOnly: boolean;
  isHidden: boolean;
  defaultValue: string | null;
  currencyCode: string | null;
  decimalPlaces: number | null;
  maxRows: number | null;
  sortOrder: number;
  columnSpan: 1 | 2 | 3;
  /** Present for dropdown, multi_select, radio field types */
  options: DesignerOptionValue[];
  /** Present for lookup, child_entity_grid field types */
  lookupConfig: DesignerLookupConfig | null;
  // Sprint 3 — populated when fieldType = 'custom'
  componentKey: string | null;
  // Sprint 4 — boolean field config
  boolRenderStyle: 'toggle' | 'radio' | null;
  trueLabel: string | null;
  falseLabel: string | null;
  // Sprint 4 — info-card inline field config
  infoCardStyle: 'info' | 'warning' | 'success' | 'error' | null;
  infoCardTitle: string | null;
  infoCardBody: string | null;
  infoCardIcon: string | null;
}
