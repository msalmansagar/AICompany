// Domain model for a form definition as held in the designer local state.
// Temp IDs are prefixed with 'tmp_' until the record is persisted to CRM.

import type { SummaryMode } from '@qdb/shared';

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
  showSummaryStep: boolean;
  // DFE-FBE-001: None/SystemGenerated/Manual. Absent/null on legacy forms (derived from showSummaryStep).
  summaryMode?: SummaryMode | null;
  // DFE-FBE-002: form-completion progress bar.
  showProgressBar?: boolean;
  // DFE-SUBMITCONFIRM-001: acknowledgement gate on the final step (label present ⇒ active).
  submitConfirmationLabel?: string | null;
  submitConfirmationMessage?: string | null;
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
  // DFE-FBE-001: tab description + manual-summary designation.
  description?: string | null;
  isSummaryTab?: boolean;
  sortOrder: number;
  isVisible: boolean;
  requiresPreviousTabComplete: boolean;
  /** When true the tab navigation bar is hidden while this tab is active. Sections and fields still render. */
  hideTabBar: boolean;
}

export interface DesignerSectionModel {
  /** CRM GUID or 'tmp_section_<timestamp>' */
  id: string;
  tabId: string;
  label: string;
  description: string | null;
  // DFE-FBE-001: section header icon.
  iconName?: string | null;
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
  notes: string | null;
}

export interface DesignerLookupConfig {
  targetEntity: string;
  displayField: string;
  valueField: string;
  filterQuery: string | null;
  searchMinChars: number;
  maxResults: number;
  // DFE-APILOOKUP-001 — optional so existing entity-lookup config stays unchanged.
  source?: 'entity' | 'api';
  apiEndpointKey?: string | null;
  apiValuePath?: string | null;
  apiLabelPath?: string | null;
  apiSearchParamName?: string | null;
  apiSearchMode?: 'typeahead' | 'fetchAll' | null;
  // DFE-LKPCOL-001 — multi-column + per-language display.
  displayColumns?: DesignerLookupDisplayColumn[] | null;
}

export interface DesignerLookupDisplayColumn {
  attribute: string;
  arabicAttribute?: string | null;
  header?: string | null;
}

export type GridColumnFilterType = 'text' | 'optionset' | 'lookup' | 'none';

export interface DesignerGridColumnConfig {
  /** CRM GUID or 'tmp_col_<timestamp>' for unsaved columns */
  id: string;
  columnLabel: string;
  targetAttribute: string;
  columnFieldType: string;
  displayOrder: number;
  isEditable: boolean;
  optionsJson: string | null;
  filterType: GridColumnFilterType;
  lookupTargetEntity: string | null;
  lookupDisplayAttribute: string | null;
  lookupValueAttribute: string | null;
}

export interface DesignerFieldModel {
  /** CRM GUID or 'tmp_field_<timestamp>' */
  id: string;
  sectionId: string;
  // DFE-TABZONE-001 — tab header/footer placement. Absent/body ⇒ renders in the
  // section body (legacy). Header/Footer render in the tab zone; tabId targets the tab.
  placement?: 'header' | 'footer' | 'body';
  tabId?: string | null;
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
  // DFE-NUMBAR: number/decimal/currency display style + the fields providing the bar's value/max.
  numberDisplayStyle?: 'textbox' | 'bar' | null;
  barMaxFieldSchemaName?: string | null;
  barValueFieldSchemaName?: string | null;
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
  // DFE-INFOLIST-001 — optional so existing field factories/fixtures don't break.
  infoCardListType?: 'bullet' | 'numbered-arabic' | 'numbered-roman' | null;
  infoCardListMarker?: 'circle' | 'plain' | 'none' | null;
  infoCardTitle: string | null;
  infoCardBody: string | null;
  infoCardIcon: string | null;
  infoCardDownloadUrl: string | null;
  infoCardDownloadLabel: string | null;
  infoCardDownloadIcon: string | null;
  // File field — template download before upload
  fileDownloadLabel: string | null;
  fileDownloadIcon: string | null;
  uploadDocumentSetting: string | null;
  downloadDocumentSetting: string | null;
  // Prefix / suffix decorators
  prefix: string | null;
  suffix: string | null;
  // DFE-FBE-001 — Label field: static content + optional data-bound source field schema name.
  staticContent?: string | null;
  sourceFieldSchemaName?: string | null;
  // Sprint 5 — interactive-grid / repeating-grid config
  gridMode: 'selection' | 'entry' | null;
  gridEntityName: string | null;
  gridSelectionMode: 'single' | 'multi' | null;
  gridMinRows: number | null;
  gridSavedViewId: string | null;
  gridFilterExpression: string | null;
  gridDependsOnFieldId: string | null;
  gridDependsOnFilterTemplate: string | null;
  // DFE-GRIDSRC-001: data source + display config for selection/display grids.
  gridDataSource?: 'entity' | 'json' | null;
  gridJsonData?: string | null;
  gridDisplayMode?: 'columns' | 'infocard' | null;
  gridCardLayout?: 'grid' | 'row' | null;
  gridSelectable?: boolean | null;
  gridCardIcon?: string | null;
  gridColumns: DesignerGridColumnConfig[];
}
