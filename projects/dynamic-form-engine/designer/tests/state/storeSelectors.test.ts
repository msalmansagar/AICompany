import { describe, it, expect, beforeEach } from 'vitest';
import {
  useDesignerStore,
  selectActiveTabSections,
  selectSectionFields,
  selectCanUndo,
  selectCanRedo,
} from '@/state/designerStore';
import type { DesignerFormModel, DesignerTabModel, DesignerSectionModel, DesignerFieldModel } from '@/state/models/DesignerFormModel';
import type { DesignerStyleModel } from '@/state/models/DesignerStyleModel';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

const STUB_STYLE: DesignerStyleModel = {
  themeId: null,
  themeName: 'Default',
  primaryColor: '#0078d4',
  accentColor: '#005a9e',
  backgroundColor: '#ffffff',
  fontFamily: 'Segoe UI',
  fontSizeBase: 14,
  borderRadius: 4,
  fieldSpacing: 16,
  labelPosition: 'above',
  buttonStyle: 'filled',
  customCss: '',
};

const STUB_FORM: DesignerFormModel = {
  id: 'form-sel',
  name: 'Selector Test Form',
  code: 'selector_test',
  description: '',
  entityLogicalName: 'qdb_test',
  status: 'draft',
  currentVersion: '1',
  themeId: null,
  allowSaveDraft: true,
  draftExpiryDays: null,
  showSummaryStep: false,
  powerAutomateFlowId: null,
  confirmationMessage: null,
  confirmationRecordRefAttribute: null,
  accessGroupId: null,
  createdBy: 'user-1',
  createdOn: new Date(),
  modifiedBy: 'user-1',
  modifiedOn: new Date(),
};

const TAB_A: DesignerTabModel = { id: 'tab-a', formId: 'form-sel', label: 'Tab A', iconName: null, sortOrder: 0, isVisible: true, requiresPreviousTabComplete: false, hideTabBar: false };
const TAB_B: DesignerTabModel = { id: 'tab-b', formId: 'form-sel', label: 'Tab B', iconName: null, sortOrder: 1, isVisible: true, requiresPreviousTabComplete: false, hideTabBar: false };

const SECTION_A1: DesignerSectionModel = { id: 'sec-a1', tabId: 'tab-a', label: 'A Section 1', description: null, columnCount: 1, isCollapsible: false, isExpandedByDefault: true, isVisible: true, sortOrder: 0 };
const SECTION_A2: DesignerSectionModel = { id: 'sec-a2', tabId: 'tab-a', label: 'A Section 2', description: null, columnCount: 1, isCollapsible: false, isExpandedByDefault: true, isVisible: true, sortOrder: 1 };
const SECTION_B1: DesignerSectionModel = { id: 'sec-b1', tabId: 'tab-b', label: 'B Section 1', description: null, columnCount: 1, isCollapsible: false, isExpandedByDefault: true, isVisible: true, sortOrder: 0 };

const SPRINT45_NULLS = { boolRenderStyle: null, trueLabel: null, falseLabel: null, infoCardStyle: null, infoCardTitle: null, infoCardBody: null, infoCardIcon: null, infoCardDownloadUrl: null, infoCardDownloadLabel: null, infoCardDownloadIcon: null, fileDownloadLabel: null, fileDownloadIcon: null, uploadDocumentSetting: null, downloadDocumentSetting: null, prefix: null, suffix: null, gridMode: null, gridEntityName: null, gridSelectionMode: null, gridMinRows: null, gridSavedViewId: null, gridFilterExpression: null, gridDependsOnFieldId: null, gridDependsOnFilterTemplate: null, gridColumns: [] };
const FIELD_A1_1: DesignerFieldModel = { id: 'fld-a1-1', sectionId: 'sec-a1', label: 'Field 1', code: 'field_1', fieldType: 'text', placeholder: '', helpText: '', isRequired: false, isReadOnly: false, isHidden: false, defaultValue: null, currencyCode: null, decimalPlaces: null, maxRows: null, sortOrder: 0, columnSpan: 1, options: [], lookupConfig: null, componentKey: null, ...SPRINT45_NULLS };
const FIELD_A1_2: DesignerFieldModel = { id: 'fld-a1-2', sectionId: 'sec-a1', label: 'Field 2', code: 'field_2', fieldType: 'text', placeholder: '', helpText: '', isRequired: false, isReadOnly: false, isHidden: false, defaultValue: null, currencyCode: null, decimalPlaces: null, maxRows: null, sortOrder: 1, columnSpan: 1, options: [], lookupConfig: null, componentKey: null, ...SPRINT45_NULLS };
const FIELD_B1_1: DesignerFieldModel = { id: 'fld-b1-1', sectionId: 'sec-b1', label: 'Field 3', code: 'field_3', fieldType: 'text', placeholder: '', helpText: '', isRequired: false, isReadOnly: false, isHidden: false, defaultValue: null, currencyCode: null, decimalPlaces: null, maxRows: null, sortOrder: 0, columnSpan: 1, options: [], lookupConfig: null, componentKey: null, ...SPRINT45_NULLS };

// ---------------------------------------------------------------------------

describe('designer store selectors', () => {
  beforeEach(() => {
    useDesignerStore.getState().resetDesigner();
    useDesignerStore.getState().loadForm(
      STUB_FORM,
      [TAB_A, TAB_B],
      [SECTION_A1, SECTION_A2, SECTION_B1],
      [FIELD_A1_1, FIELD_A1_2, FIELD_B1_1],
      [],
      [],
      STUB_STYLE
    );
  });

  // -------------------------------------------------------------------------

  it('selectActiveTabSections_returnsOnlySectionsForGivenTab', () => {
    // Arrange
    const state = useDesignerStore.getState();

    // Act
    const sectionsForTabA = selectActiveTabSections('tab-a')(state);
    const sectionsForTabB = selectActiveTabSections('tab-b')(state);

    // Assert — tab-a has two sections, tab-b has one
    expect(sectionsForTabA).toHaveLength(2);
    expect(sectionsForTabA.map(s => s.id)).toContain('sec-a1');
    expect(sectionsForTabA.map(s => s.id)).toContain('sec-a2');

    expect(sectionsForTabB).toHaveLength(1);
    expect(sectionsForTabB[0].id).toBe('sec-b1');
  });

  // -------------------------------------------------------------------------

  it('selectSectionFields_returnsOnlyFieldsForGivenSection', () => {
    // Arrange
    const state = useDesignerStore.getState();

    // Act
    const fieldsInSectionA1 = selectSectionFields('sec-a1')(state);
    const fieldsInSectionB1 = selectSectionFields('sec-b1')(state);

    // Assert — sec-a1 has two fields, sec-b1 has one
    expect(fieldsInSectionA1).toHaveLength(2);
    expect(fieldsInSectionA1.map(f => f.id)).toContain('fld-a1-1');
    expect(fieldsInSectionA1.map(f => f.id)).toContain('fld-a1-2');

    expect(fieldsInSectionB1).toHaveLength(1);
    expect(fieldsInSectionB1[0].id).toBe('fld-b1-1');
  });

  // -------------------------------------------------------------------------

  it('selectCanUndo_returnsFalse_whenUndoStackIsEmpty', () => {
    // Arrange — freshly loaded form has no undo history
    const state = useDesignerStore.getState();

    // Act
    const canUndo = selectCanUndo(state);

    // Assert
    expect(canUndo).toBe(false);
  });

  // -------------------------------------------------------------------------

  it('selectCanRedo_returnsFalse_whenRedoStackIsEmpty', () => {
    // Arrange — freshly loaded form has no redo history
    const state = useDesignerStore.getState();

    // Act
    const canRedo = selectCanRedo(state);

    // Assert
    expect(canRedo).toBe(false);
  });
});
