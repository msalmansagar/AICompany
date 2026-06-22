import { describe, it, expect } from 'vitest';
import { validateForPublish } from '@/validation/publishValidation';
import type { DesignerFormModel, DesignerTabModel, DesignerSectionModel, DesignerFieldModel } from '@/state/models/DesignerFormModel';
import { DEFAULT_STYLE } from '@/state/models/DesignerStyleModel';

// ---------------------------------------------------------------------------
// The type accepted by validateForPublish is DesignerState.
// We use the same interface shape here so the tests remain focused on
// behaviour rather than import mechanics — the function only reads the
// properties listed below, so we only provide those.
// ---------------------------------------------------------------------------

type PartialPublishState = Parameters<typeof validateForPublish>[0];

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeForm(overrides: Partial<DesignerFormModel> = {}): DesignerFormModel {
  return {
    id: 'form-1',
    name: 'Loan Application',
    code: 'loan_application',
    description: '',
    entityLogicalName: 'qdb_loan_application',
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
    ...overrides,
  };
}

function makeTab(overrides: Partial<DesignerTabModel> = {}): DesignerTabModel {
  return {
    id: 'tab-1',
    formId: 'form-1',
    label: 'Personal Details',
    iconName: null,
    sortOrder: 0,
    isVisible: true,
    requiresPreviousTabComplete: false,
    ...overrides,
  };
}

function makeSection(overrides: Partial<DesignerSectionModel> = {}): DesignerSectionModel {
  return {
    id: 'section-1',
    tabId: 'tab-1',
    label: 'Basic Info',
    description: null,
    columnCount: 1,
    isCollapsible: false,
    isExpandedByDefault: true,
    isVisible: true,
    sortOrder: 0,
    ...overrides,
  };
}

function makeField(overrides: Partial<DesignerFieldModel> = {}): DesignerFieldModel {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    label: 'Full Name',
    code: 'full_name',
    fieldType: 'text',
    placeholder: '',
    helpText: '',
    isRequired: true,
    isReadOnly: false,
    isHidden: false,
    defaultValue: null,
    currencyCode: null,
    decimalPlaces: null,
    maxRows: null,
    sortOrder: 0,
    columnSpan: 1,
    options: [],
    lookupConfig: null,
    componentKey: null,
    boolRenderStyle: null,
    trueLabel: null,
    falseLabel: null,
    infoCardStyle: null,
    infoCardTitle: null,
    infoCardBody: null,
    infoCardIcon: null,
    infoCardDownloadUrl: null,
    infoCardDownloadLabel: null,
    infoCardDownloadIcon: null,
    fileDownloadLabel: null,
    fileDownloadIcon: null,
    uploadDocumentSetting: null,
    downloadDocumentSetting: null,
    prefix: null,
    suffix: null,
    gridMode: null,
    gridEntityName: null,
    gridSelectionMode: null,
    gridMinRows: null,
    gridSavedViewId: null,
    gridFilterExpression: null,
    gridDependsOnFieldId: null,
    gridDependsOnFilterTemplate: null,
    gridColumns: [],
    ...overrides,
  };
}

/** Builds a minimal well-formed publish state that passes all validations. */
function makeValidState(overrides: Partial<PartialPublishState> = {}): PartialPublishState {
  const tab = makeTab();
  const section = makeSection();
  const field = makeField();

  return {
    form: makeForm(),
    tabs: { [tab.id]: tab },
    sections: { [section.id]: section },
    fields: { [field.id]: field },
    tabOrder: [tab.id],
    sectionOrder: { [tab.id]: [section.id] },
    fieldOrder: { [section.id]: [field.id] },
    validationRules: {},
    businessRules: {},
    style: DEFAULT_STYLE,
    // Navigation + UI state — not read by the validator but required by the type
    currentScreen: 'designer',
    dirtyIds: [],
    newIds: [],
    deletedIds: [],
    undoStack: [],
    redoStack: [],
    selectedId: null,
    selectedType: null,
    isDirty: false,
    isSaving: false,
    isPublishing: false,
    lastSavedAt: null,
    previewMode: null,
    // Actions — stubs, not invoked by the validator
    navigateTo: () => {},
    loadForm: () => {},
    resetDesigner: () => {},
    selectItem: () => {},
    clearSelection: () => {},
    updateForm: () => {},
    addTab: () => {},
    updateTab: () => {},
    deleteTab: () => {},
    reorderTabs: () => {},
    addSection: () => {},
    updateSection: () => {},
    deleteSection: () => {},
    reorderSections: () => {},
    addField: () => {},
    updateField: () => {},
    deleteField: () => {},
    reorderFields: () => {},
    moveField: () => {},
    updateStyle: () => {},
    undo: () => {},
    redo: () => {},
    markSaving: () => {},
    markSaved: () => {},
    markPublishing: () => {},
    markPublished: () => {},
    markDirty: () => {},
    markDeleted: () => {},
    setPreviewMode: () => {},
    ...overrides,
  } as PartialPublishState;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('validateForPublish', () => {

  it('validateForPublish_returnsValid_forWellFormedForm', () => {
    // Arrange
    const state = makeValidState();

    // Act
    const result = validateForPublish(state);

    // Assert
    expect(result.isValid).toBe(true);
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  // -------------------------------------------------------------------------

  it('validateForPublish_returnsError_whenFormNameIsEmpty', () => {
    // Arrange — form name is an empty string
    const state = makeValidState({
      form: makeForm({ name: '' }),
    });

    // Act
    const result = validateForPublish(state);

    // Assert
    expect(result.isValid).toBe(false);
    const pv001 = result.issues.find(i => i.code === 'PV-001');
    expect(pv001).toBeDefined();
    expect(pv001?.severity).toBe('error');
  });

  // -------------------------------------------------------------------------

  it('validateForPublish_returnsError_whenFormCodeIsInvalid', () => {
    // Arrange — code contains uppercase letters, which fails /^[a-z0-9_]+$/
    const state = makeValidState({
      form: makeForm({ code: 'Invalid-Code!' }),
    });

    // Act
    const result = validateForPublish(state);

    // Assert
    expect(result.isValid).toBe(false);
    const pv002 = result.issues.find(i => i.code === 'PV-002');
    expect(pv002).toBeDefined();
    expect(pv002?.severity).toBe('error');
  });

  // -------------------------------------------------------------------------

  it('validateForPublish_returnsError_whenNoTabsExist', () => {
    // Arrange — tabOrder is empty, tabs map is empty
    const state = makeValidState({
      tabOrder: [],
      tabs: {},
      sections: {},
      sectionOrder: {},
      fields: {},
      fieldOrder: {},
    });

    // Act
    const result = validateForPublish(state);

    // Assert
    expect(result.isValid).toBe(false);
    const pv003 = result.issues.find(i => i.code === 'PV-003');
    expect(pv003).toBeDefined();
    expect(pv003?.severity).toBe('error');
  });

  // -------------------------------------------------------------------------

  it('validateForPublish_returnsError_whenDuplicateFieldCodes', () => {
    // Arrange — two fields share the same code 'duplicate_code'
    const field1 = makeField({ id: 'field-1', code: 'duplicate_code', label: 'Field One', isRequired: true });
    const field2 = makeField({ id: 'field-2', code: 'duplicate_code', label: 'Field Two', sectionId: 'section-1', isRequired: true });

    const state = makeValidState({
      fields: { 'field-1': field1, 'field-2': field2 },
      fieldOrder: { 'section-1': ['field-1', 'field-2'] },
    });

    // Act
    const result = validateForPublish(state);

    // Assert
    expect(result.isValid).toBe(false);
    const pv008 = result.issues.find(i => i.code === 'PV-008');
    expect(pv008).toBeDefined();
    expect(pv008?.severity).toBe('error');
  });

  // -------------------------------------------------------------------------

  it('validateForPublish_returnsWarning_whenNoRequiredField', () => {
    // Arrange — the field is not required (isRequired: false), triggering PV-012 warning
    const fieldWithNoRequired = makeField({ isRequired: false });

    const state = makeValidState({
      fields: { 'field-1': fieldWithNoRequired },
    });

    // Act
    const result = validateForPublish(state);

    // Assert — the result is still valid (warning is not an error)
    expect(result.isValid).toBe(true);
    const pv012 = result.issues.find(i => i.code === 'PV-012');
    expect(pv012).toBeDefined();
    expect(pv012?.severity).toBe('warning');
  });

});
