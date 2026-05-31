// Field type registry — defines all supported field types and their metadata.
// Used by the component toolbox, properties panel, and field rendering logic.

export const FIELD_TYPE = {
  // Basic fields
  TEXT: 'text',
  TEXTAREA: 'textarea',
  NUMBER: 'number',
  DECIMAL: 'decimal',
  CURRENCY: 'currency',
  DATE: 'date',
  DATETIME: 'datetime',
  EMAIL: 'email',
  PHONE: 'phone',
  DROPDOWN: 'dropdown',
  MULTI_SELECT: 'multi_select',
  LOOKUP: 'lookup',
  CHECKBOX: 'checkbox',
  RADIO: 'radio',
  FILE_UPLOAD: 'file_upload',
  RICH_TEXT: 'rich_text',
  // Layout components
  TAB: 'tab',
  SECTION_1COL: 'section_1col',
  SECTION_2COL: 'section_2col',
  SECTION_3COL: 'section_3col',
  SECTION_CARD: 'section_card',
  SECTION_ACCORDION: 'section_accordion',
  SPACER: 'spacer',
  DIVIDER: 'divider',
  INFO_TEXT: 'info_text',
  HEADER_TEXT: 'header_text',
  // Advanced components
  REPEATING_GRID: 'repeating_grid',
  CHILD_ENTITY_GRID: 'child_entity_grid',
  DOCUMENT_UPLOAD: 'document_upload',
  TERMS_BLOCK: 'terms_block',
  DECLARATION_BLOCK: 'declaration_block',
  SUMMARY_BLOCK: 'summary_block',
} as const;

export type FieldType = (typeof FIELD_TYPE)[keyof typeof FIELD_TYPE];

export type FieldCategory = 'basic' | 'layout' | 'advanced';

export interface FieldTypeDefinition {
  type: FieldType;
  category: FieldCategory;
  /** Human-readable label shown in the toolbox */
  label: string;
  /** Fluent UI icon name for toolbox rendering */
  iconName: string;
  /** Whether this type supports option set configuration */
  hasOptions: boolean;
  /** Whether this type requires a lookup configuration */
  hasLookup: boolean;
  /** Whether this type is a layout container (not a data field) */
  isLayout: boolean;
}

export const FIELD_TYPE_DEFINITIONS: Record<FieldType, FieldTypeDefinition> = {
  [FIELD_TYPE.TEXT]: { type: FIELD_TYPE.TEXT, category: 'basic', label: 'Text', iconName: 'TextField', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.TEXTAREA]: { type: FIELD_TYPE.TEXTAREA, category: 'basic', label: 'Text Area', iconName: 'AlignLeft', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.NUMBER]: { type: FIELD_TYPE.NUMBER, category: 'basic', label: 'Number', iconName: 'NumberField', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.DECIMAL]: { type: FIELD_TYPE.DECIMAL, category: 'basic', label: 'Decimal', iconName: 'NumberField', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.CURRENCY]: { type: FIELD_TYPE.CURRENCY, category: 'basic', label: 'Currency', iconName: 'Money', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.DATE]: { type: FIELD_TYPE.DATE, category: 'basic', label: 'Date', iconName: 'Calendar', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.DATETIME]: { type: FIELD_TYPE.DATETIME, category: 'basic', label: 'Date & Time', iconName: 'DateTime', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.EMAIL]: { type: FIELD_TYPE.EMAIL, category: 'basic', label: 'Email', iconName: 'Mail', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.PHONE]: { type: FIELD_TYPE.PHONE, category: 'basic', label: 'Phone', iconName: 'Phone', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.DROPDOWN]: { type: FIELD_TYPE.DROPDOWN, category: 'basic', label: 'Dropdown', iconName: 'ChevronDownCircle', hasOptions: true, hasLookup: false, isLayout: false },
  [FIELD_TYPE.MULTI_SELECT]: { type: FIELD_TYPE.MULTI_SELECT, category: 'basic', label: 'Multi-select', iconName: 'MultiSelect', hasOptions: true, hasLookup: false, isLayout: false },
  [FIELD_TYPE.LOOKUP]: { type: FIELD_TYPE.LOOKUP, category: 'basic', label: 'Lookup', iconName: 'Search', hasOptions: false, hasLookup: true, isLayout: false },
  [FIELD_TYPE.CHECKBOX]: { type: FIELD_TYPE.CHECKBOX, category: 'basic', label: 'Checkbox', iconName: 'CheckboxComposite', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.RADIO]: { type: FIELD_TYPE.RADIO, category: 'basic', label: 'Radio Group', iconName: 'RadioBullet', hasOptions: true, hasLookup: false, isLayout: false },
  [FIELD_TYPE.FILE_UPLOAD]: { type: FIELD_TYPE.FILE_UPLOAD, category: 'basic', label: 'File Upload', iconName: 'Upload', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.RICH_TEXT]: { type: FIELD_TYPE.RICH_TEXT, category: 'basic', label: 'Rich Text', iconName: 'Font', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.TAB]: { type: FIELD_TYPE.TAB, category: 'layout', label: 'Tab', iconName: 'Tab', hasOptions: false, hasLookup: false, isLayout: true },
  [FIELD_TYPE.SECTION_1COL]: { type: FIELD_TYPE.SECTION_1COL, category: 'layout', label: 'Section (1 column)', iconName: 'ColumnSingle', hasOptions: false, hasLookup: false, isLayout: true },
  [FIELD_TYPE.SECTION_2COL]: { type: FIELD_TYPE.SECTION_2COL, category: 'layout', label: 'Section (2 columns)', iconName: 'ColumnTwo', hasOptions: false, hasLookup: false, isLayout: true },
  [FIELD_TYPE.SECTION_3COL]: { type: FIELD_TYPE.SECTION_3COL, category: 'layout', label: 'Section (3 columns)', iconName: 'ColumnThree', hasOptions: false, hasLookup: false, isLayout: true },
  [FIELD_TYPE.SECTION_CARD]: { type: FIELD_TYPE.SECTION_CARD, category: 'layout', label: 'Card Section', iconName: 'GroupedList', hasOptions: false, hasLookup: false, isLayout: true },
  [FIELD_TYPE.SECTION_ACCORDION]: { type: FIELD_TYPE.SECTION_ACCORDION, category: 'layout', label: 'Accordion Section', iconName: 'CollapseMenu', hasOptions: false, hasLookup: false, isLayout: true },
  [FIELD_TYPE.SPACER]: { type: FIELD_TYPE.SPACER, category: 'layout', label: 'Spacer', iconName: 'SpacingVertical', hasOptions: false, hasLookup: false, isLayout: true },
  [FIELD_TYPE.DIVIDER]: { type: FIELD_TYPE.DIVIDER, category: 'layout', label: 'Divider', iconName: 'Remove', hasOptions: false, hasLookup: false, isLayout: true },
  [FIELD_TYPE.INFO_TEXT]: { type: FIELD_TYPE.INFO_TEXT, category: 'layout', label: 'Info Text', iconName: 'Info', hasOptions: false, hasLookup: false, isLayout: true },
  [FIELD_TYPE.HEADER_TEXT]: { type: FIELD_TYPE.HEADER_TEXT, category: 'layout', label: 'Header Text', iconName: 'Header1', hasOptions: false, hasLookup: false, isLayout: true },
  [FIELD_TYPE.REPEATING_GRID]: { type: FIELD_TYPE.REPEATING_GRID, category: 'advanced', label: 'Repeating Grid', iconName: 'TableComputed', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.CHILD_ENTITY_GRID]: { type: FIELD_TYPE.CHILD_ENTITY_GRID, category: 'advanced', label: 'Child Entity Grid', iconName: 'GridViewSmall', hasOptions: false, hasLookup: true, isLayout: false },
  [FIELD_TYPE.DOCUMENT_UPLOAD]: { type: FIELD_TYPE.DOCUMENT_UPLOAD, category: 'advanced', label: 'Document Upload', iconName: 'DocumentApproval', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.TERMS_BLOCK]: { type: FIELD_TYPE.TERMS_BLOCK, category: 'advanced', label: 'Terms & Conditions', iconName: 'Compliance', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.DECLARATION_BLOCK]: { type: FIELD_TYPE.DECLARATION_BLOCK, category: 'advanced', label: 'Declaration Block', iconName: 'Assign', hasOptions: false, hasLookup: false, isLayout: false },
  [FIELD_TYPE.SUMMARY_BLOCK]: { type: FIELD_TYPE.SUMMARY_BLOCK, category: 'advanced', label: 'Summary Block', iconName: 'StackedBarChart', hasOptions: false, hasLookup: false, isLayout: false },
};

export const BASIC_FIELD_TYPES = Object.values(FIELD_TYPE_DEFINITIONS).filter(d => d.category === 'basic');
export const LAYOUT_FIELD_TYPES = Object.values(FIELD_TYPE_DEFINITIONS).filter(d => d.category === 'layout');
export const ADVANCED_FIELD_TYPES = Object.values(FIELD_TYPE_DEFINITIONS).filter(d => d.category === 'advanced');
