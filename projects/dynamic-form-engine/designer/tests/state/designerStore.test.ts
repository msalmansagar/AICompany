import { describe, it, expect, beforeEach } from 'vitest';
import { useDesignerStore, DEFAULT_DESIGN_PAYLOAD } from '@/state/designerStore';
import type { DesignerFormModel, DesignerTabModel, DesignerSectionModel, DesignerFieldModel } from '@/state/models/DesignerFormModel';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeForm(overrides: Partial<DesignerFormModel> = {}): DesignerFormModel {
  return {
    id: 'form-1',
    name: 'Application Form',
    code: 'application_form',
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
    createdOn: new Date('2024-01-01'),
    modifiedBy: 'user-1',
    modifiedOn: new Date('2024-01-01'),
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
    hideTabBar: false,
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
    isRequired: false,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadMinimalForm(): void {
  const { loadForm } = useDesignerStore.getState();
  loadForm({ form: makeForm(), tabs: [makeTab()], sections: [makeSection()], fields: [makeField()], validationRules: [], businessRules: [], designPayload: DEFAULT_DESIGN_PAYLOAD });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('useDesignerStore', () => {
  beforeEach(() => {
    useDesignerStore.getState().resetDesigner();
  });

  // -------------------------------------------------------------------------

  it('addTab_addsToTabsMap_andTabOrder', () => {
    // Arrange
    const newTab = makeTab({ id: 'tab-new', label: 'New Tab', sortOrder: 0 });

    // Act
    useDesignerStore.getState().addTab(newTab);

    // Assert
    const state = useDesignerStore.getState();
    expect(state.tabs['tab-new']).toBeDefined();
    expect(state.tabOrder).toContain('tab-new');
    expect(state.sectionOrder['tab-new']).toEqual([]);
    expect(state.isDirty).toBe(true);
  });

  // -------------------------------------------------------------------------

  it('deleteTab_removesTab_andItsFieldsAndSections', () => {
    // Arrange
    loadMinimalForm();
    // Confirm baseline state
    expect(useDesignerStore.getState().tabs['tab-1']).toBeDefined();
    expect(useDesignerStore.getState().sections['section-1']).toBeDefined();
    expect(useDesignerStore.getState().fields['field-1']).toBeDefined();

    // Act
    useDesignerStore.getState().deleteTab('tab-1');

    // Assert
    const state = useDesignerStore.getState();
    expect(state.tabs['tab-1']).toBeUndefined();
    expect(state.sections['section-1']).toBeUndefined();
    expect(state.fields['field-1']).toBeUndefined();
    expect(state.tabOrder).not.toContain('tab-1');
    expect(state.deletedIds).toContain('tab-1');
    expect(state.deletedIds).toContain('section-1');
    expect(state.deletedIds).toContain('field-1');
  });

  // -------------------------------------------------------------------------

  it('addField_addsToFieldsMap_andFieldOrder', () => {
    // Arrange
    loadMinimalForm();
    const newField = makeField({ id: 'field-new', code: 'email', label: 'Email', sectionId: 'section-1', sortOrder: 1 });

    // Act
    useDesignerStore.getState().addField(newField);

    // Assert
    const state = useDesignerStore.getState();
    expect(state.fields['field-new']).toBeDefined();
    expect(state.fieldOrder['section-1']).toContain('field-new');
    expect(state.isDirty).toBe(true);
  });

  // -------------------------------------------------------------------------

  it('moveField_updatesSourceAndTargetSectionOrders', () => {
    // Arrange — load a form with two sections and one field in section-1
    const { loadForm } = useDesignerStore.getState();
    const sectionA = makeSection({ id: 'section-a', tabId: 'tab-1', sortOrder: 0 });
    const sectionB = makeSection({ id: 'section-b', tabId: 'tab-1', label: 'Employment', sortOrder: 1 });
    const field = makeField({ id: 'field-x', sectionId: 'section-a' });

    loadForm({ form: makeForm(), tabs: [makeTab()], sections: [sectionA, sectionB], fields: [field], validationRules: [], businessRules: [], designPayload: DEFAULT_DESIGN_PAYLOAD });

    // Act — move field-x from section-a to section-b at index 0
    useDesignerStore.getState().moveField('field-x', 'section-b', 0);

    // Assert
    const state = useDesignerStore.getState();
    expect(state.fieldOrder['section-a']).not.toContain('field-x');
    expect(state.fieldOrder['section-b']).toContain('field-x');
    expect(state.fields['field-x'].sectionId).toBe('section-b');
  });

  // -------------------------------------------------------------------------

  it('reorderTabs_updatesTabOrder_andSortOrders', () => {
    // Arrange — load a form with two tabs
    const { loadForm } = useDesignerStore.getState();
    const tabA = makeTab({ id: 'tab-a', label: 'Tab A', sortOrder: 0 });
    const tabB = makeTab({ id: 'tab-b', label: 'Tab B', sortOrder: 1 });
    loadForm({ form: makeForm(), tabs: [tabA, tabB], sections: [], fields: [], validationRules: [], businessRules: [], designPayload: DEFAULT_DESIGN_PAYLOAD });

    // Act — swap the order
    useDesignerStore.getState().reorderTabs(['tab-b', 'tab-a']);

    // Assert
    const state = useDesignerStore.getState();
    expect(state.tabOrder).toEqual(['tab-b', 'tab-a']);
    expect(state.tabs['tab-b'].sortOrder).toBe(0);
    expect(state.tabs['tab-a'].sortOrder).toBe(1);
  });

  // -------------------------------------------------------------------------

  it('undo_restoresPreviousSnapshot', () => {
    // Arrange — start clean, add a tab (pushes snapshot), then undo
    const tabBefore = makeTab({ id: 'tab-undo', label: 'Will be undone', sortOrder: 0 });

    // Act
    useDesignerStore.getState().addTab(tabBefore);
    expect(useDesignerStore.getState().tabs['tab-undo']).toBeDefined();

    useDesignerStore.getState().undo();

    // Assert — the tab that was added must no longer exist
    const state = useDesignerStore.getState();
    expect(state.tabs['tab-undo']).toBeUndefined();
    expect(state.tabOrder).not.toContain('tab-undo');
  });

  // -------------------------------------------------------------------------

  it('redo_reappliesUndoneSnapshot', () => {
    // Arrange — add a tab, undo it, then redo
    const tab = makeTab({ id: 'tab-redo', label: 'Redo Tab', sortOrder: 0 });

    useDesignerStore.getState().addTab(tab);
    useDesignerStore.getState().undo();
    expect(useDesignerStore.getState().tabs['tab-redo']).toBeUndefined();

    // Act
    useDesignerStore.getState().redo();

    // Assert — tab is restored after redo
    const state = useDesignerStore.getState();
    expect(state.tabs['tab-redo']).toBeDefined();
    expect(state.tabOrder).toContain('tab-redo');
  });

  // -------------------------------------------------------------------------

  it('markSaved_clearsDirtyState', () => {
    // Arrange — add a tab to make the store dirty
    useDesignerStore.getState().addTab(makeTab({ id: 'tab-dirty' }));
    expect(useDesignerStore.getState().isDirty).toBe(true);

    // Act
    useDesignerStore.getState().markSaved();

    // Assert
    const state = useDesignerStore.getState();
    expect(state.isDirty).toBe(false);
    expect(state.dirtyIds).toEqual([]);
    expect(state.newIds).toEqual([]);
    expect(state.deletedIds).toEqual([]);
    expect(state.lastSavedAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------

  it('markSaved_withResolvedIds_replacesTempIdsWithRealGuids', () => {
    // Arrange — add a tab with a temp ID
    const tempTab = makeTab({ id: 'tmp_tab_001', label: 'Temp Tab' });
    useDesignerStore.getState().addTab(tempTab);

    // Act — mark saved with a resolved ID map
    const resolvedIds: Record<string, string> = { 'tmp_tab_001': 'real-guid-tab-001' };
    useDesignerStore.getState().markSaved(resolvedIds);

    // Assert — temp ID is gone, real GUID exists
    const state = useDesignerStore.getState();
    expect(state.tabs['tmp_tab_001']).toBeUndefined();
    expect(state.tabs['real-guid-tab-001']).toBeDefined();
    expect(state.tabs['real-guid-tab-001'].id).toBe('real-guid-tab-001');
    expect(state.tabOrder).toContain('real-guid-tab-001');
    expect(state.tabOrder).not.toContain('tmp_tab_001');
  });
});
