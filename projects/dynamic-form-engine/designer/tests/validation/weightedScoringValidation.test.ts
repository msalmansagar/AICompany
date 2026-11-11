/**
 * FR-CSE-070 — Publish validation for Weighted surveys (PV-015..PV-018).
 *
 * PV-015: at least one scorable question must have effective weight > 0.
 * PV-016: every option of a scored choice question must have Points set
 *         (rating-style questions are exempt).
 * PV-017: scored number/decimal/currency questions must have both min and max.
 * PV-018: score min < score max.
 */

import { describe, it, expect } from 'vitest';
import { validateForPublish } from '@/validation/publishValidation';
import type { DesignerFormModel, DesignerFieldModel, DesignerOptionValue } from '@/state/models/DesignerFormModel';
import { DEFAULT_STYLE } from '@/state/models/DesignerStyleModel';

// ─── Factories ───────────────────────────────────────────────────────────────

type PartialPublishState = Parameters<typeof validateForPublish>[0];

function makeWeightedSurveyForm(overrides: Partial<DesignerFormModel> = {}): DesignerFormModel {
  return {
    id: 'form-1',
    name: 'Customer Survey',
    code: 'srv-cust-001',
    description: '',
    entityLogicalName: 'qdb_survey_response',
    status: 'draft',
    currentVersion: '1',
    themeId: null,
    allowSaveDraft: false,
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
    formType: 'Survey',
    scoringMode: 'Weighted',
    ...overrides,
  };
}

function makeOption(overrides: Partial<DesignerOptionValue> = {}): DesignerOptionValue {
  return {
    id: `opt-${Math.random().toString(36).slice(2)}`,
    label: 'Option A',
    value: 'a',
    sortOrder: 0,
    isDefault: false,
    notes: null,
    scorePoints: 5,
    ...overrides,
  };
}

function makeDropdownField(overrides: Partial<DesignerFieldModel> = {}): DesignerFieldModel {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    label: 'How satisfied were you?',
    code: 'satisfaction',
    fieldType: 'dropdown',
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
    options: [makeOption({ scorePoints: 1 }), makeOption({ value: 'b', scorePoints: 2 })],
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
    scoreWeight: 1,
    ...overrides,
  };
}

function makeNumberField(overrides: Partial<DesignerFieldModel> = {}): DesignerFieldModel {
  return makeDropdownField({
    id: 'field-2',
    code: 'satisfaction_score',
    label: 'Score',
    fieldType: 'number',
    options: [],
    scoreWeight: 1,
    scoreMin: 0,
    scoreMax: 100,
    ...overrides,
  });
}

function makeStateWithFields(fields: DesignerFieldModel[], formOverrides: Partial<DesignerFormModel> = {}): PartialPublishState {
  const fieldsMap = Object.fromEntries(fields.map((f) => [f.id, f]));
  const fieldOrder = { 'section-1': fields.map((f) => f.id) };

  return {
    form: makeWeightedSurveyForm(formOverrides),
    tabs: { 'tab-1': { id: 'tab-1', formId: 'form-1', label: 'Questions', iconName: null, sortOrder: 0, isVisible: true, requiresPreviousTabComplete: false, hideTabBar: false, revealsSectionsOneAtATime: false } },
    sections: { 'section-1': { id: 'section-1', tabId: 'tab-1', label: 'Survey', description: null, columnCount: 1, isCollapsible: false, isExpandedByDefault: true, isVisible: true, sortOrder: 0 } },
    fields: fieldsMap,
    tabOrder: ['tab-1'],
    sectionOrder: { 'tab-1': ['section-1'] },
    fieldOrder,
    validationRules: {},
    businessRules: {},
    style: DEFAULT_STYLE,
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
  } as unknown as PartialPublishState;
}

function issueCodesFor(state: PartialPublishState): string[] {
  return validateForPublish(state).issues.map((i) => i.code);
}

// ─── Skipped for non-weighted forms ──────────────────────────────────────────

describe('validateWeightedScoring — not applicable', () => {
  it('skips_all_scoring_checks_for_a_Standard_form', () => {
    const state = makeStateWithFields(
      [makeDropdownField({ options: [] })],
      { formType: 'Standard', scoringMode: undefined },
    );

    expect(issueCodesFor(state)).not.toContain('PV-015');
  });

  it('skips_all_scoring_checks_when_scoringMode_is_None', () => {
    const state = makeStateWithFields(
      [makeDropdownField({ options: [] })],
      { scoringMode: 'None' },
    );

    expect(issueCodesFor(state)).not.toContain('PV-015');
  });

  it('skips_all_scoring_checks_when_formType_is_not_Survey', () => {
    const state = makeStateWithFields(
      [makeDropdownField({ options: [] })],
      { formType: undefined, scoringMode: 'Weighted' },
    );

    expect(issueCodesFor(state)).not.toContain('PV-015');
  });
});

// ─── PV-015 ───────────────────────────────────────────────────────────────────

describe('PV-015 — at least one actively-scored question', () => {
  it('fails_when_the_only_question_is_a_yes_no_field_which_has_no_options_to_score', () => {
    const state = makeStateWithFields([makeDropdownField({ fieldType: 'boolean', options: [], scoreWeight: 2 })]);

    expect(issueCodesFor(state)).toContain('PV-015');
  });

  it('passes_when_a_dropdown_field_has_default_weight', () => {
    // scoreWeight null/undefined → effective weight 1 → passes PV-015
    const state = makeStateWithFields([makeDropdownField({ scoreWeight: null })]);

    expect(issueCodesFor(state)).not.toContain('PV-015');
  });

  it('passes_when_a_dropdown_field_has_explicit_weight_above_zero', () => {
    const state = makeStateWithFields([makeDropdownField({ scoreWeight: 2 })]);

    expect(issueCodesFor(state)).not.toContain('PV-015');
  });

  it('fails_when_all_scorable_fields_have_weight_zero', () => {
    const state = makeStateWithFields([makeDropdownField({ scoreWeight: 0 })]);

    const codes = issueCodesFor(state);
    expect(codes).toContain('PV-015');
  });

  it('fails_when_there_are_no_scorable_fields_at_all', () => {
    // A text field is not scorable
    const state = makeStateWithFields([makeDropdownField({ fieldType: 'text', options: [], scoreWeight: undefined })]);

    expect(issueCodesFor(state)).toContain('PV-015');
  });

  it('fails_when_all_scorable_fields_are_excluded_by_weight_zero', () => {
    const field1 = makeDropdownField({ id: 'f1', code: 'q1', scoreWeight: 0 });
    const field2 = makeNumberField({ id: 'f2', code: 'q2', scoreWeight: 0 });

    expect(issueCodesFor(makeStateWithFields([field1, field2]))).toContain('PV-015');
  });
});

// ─── PV-016 ───────────────────────────────────────────────────────────────────

describe('PV-016 — all options must have Points (non-rating style)', () => {
  it('passes_when_every_option_has_Points_set', () => {
    const field = makeDropdownField({
      options: [makeOption({ scorePoints: 1 }), makeOption({ value: 'b', scorePoints: 3 })],
    });

    expect(issueCodesFor(makeStateWithFields([field]))).not.toContain('PV-016');
  });

  it('fails_when_at_least_one_option_is_missing_Points', () => {
    const field = makeDropdownField({
      options: [makeOption({ scorePoints: 1 }), makeOption({ value: 'b', scorePoints: null })],
    });

    expect(issueCodesFor(makeStateWithFields([field]))).toContain('PV-016');
  });

  it('exempts_a_rating_style_radio_field_from_PV016', () => {
    // Rating fields use the option's numeric position — no scorePoints needed
    const field = makeDropdownField({
      fieldType: 'radio',
      radioRenderStyle: 'rating',
      options: [makeOption({ scorePoints: null }), makeOption({ value: 'b', scorePoints: null })],
    });

    expect(issueCodesFor(makeStateWithFields([field]))).not.toContain('PV-016');
  });

  it('skips_PV016_check_for_a_field_with_weight_zero', () => {
    // Weight 0 means excluded — option completeness does not matter
    const field = makeDropdownField({
      scoreWeight: 0,
      options: [makeOption({ scorePoints: null })],
    });
    // PV-015 fires, but PV-016 must not (the field is excluded)
    expect(issueCodesFor(makeStateWithFields([field]))).not.toContain('PV-016');
  });
});

// ─── PV-017 ───────────────────────────────────────────────────────────────────

describe('PV-017 — scored number questions must have both min and max', () => {
  it('passes_when_both_scoreMin_and_scoreMax_are_set', () => {
    const field = makeNumberField({ scoreMin: 0, scoreMax: 100 });

    expect(issueCodesFor(makeStateWithFields([field]))).not.toContain('PV-017');
  });

  it('fails_when_only_scoreMin_is_missing', () => {
    const field = makeNumberField({ scoreMin: null, scoreMax: 100 });

    expect(issueCodesFor(makeStateWithFields([field]))).toContain('PV-017');
  });

  it('fails_when_only_scoreMax_is_missing', () => {
    const field = makeNumberField({ scoreMin: 0, scoreMax: null });

    expect(issueCodesFor(makeStateWithFields([field]))).toContain('PV-017');
  });

  it('fails_when_both_scoreMin_and_scoreMax_are_missing', () => {
    const field = makeNumberField({ scoreMin: null, scoreMax: null });

    expect(issueCodesFor(makeStateWithFields([field]))).toContain('PV-017');
  });

  it('applies_to_decimal_fields_as_well', () => {
    const field = makeNumberField({ fieldType: 'decimal', scoreMin: null, scoreMax: null });

    expect(issueCodesFor(makeStateWithFields([field]))).toContain('PV-017');
  });

  it('applies_to_currency_fields_as_well', () => {
    const field = makeNumberField({ fieldType: 'currency', scoreMin: null, scoreMax: null });

    expect(issueCodesFor(makeStateWithFields([field]))).toContain('PV-017');
  });
});

// ─── PV-018 ───────────────────────────────────────────────────────────────────

describe('PV-018 — scoreMin must be strictly less than scoreMax', () => {
  it('passes_when_scoreMin_is_less_than_scoreMax', () => {
    const field = makeNumberField({ scoreMin: -10, scoreMax: 10 });

    expect(issueCodesFor(makeStateWithFields([field]))).not.toContain('PV-018');
  });

  it('fails_when_scoreMin_equals_scoreMax', () => {
    const field = makeNumberField({ scoreMin: 50, scoreMax: 50 });

    expect(issueCodesFor(makeStateWithFields([field]))).toContain('PV-018');
  });

  it('fails_when_scoreMin_is_greater_than_scoreMax', () => {
    const field = makeNumberField({ scoreMin: 100, scoreMax: 10 });

    expect(issueCodesFor(makeStateWithFields([field]))).toContain('PV-018');
  });

  it('skips_PV018_when_PV017_already_fired_for_the_same_field', () => {
    // When both are absent PV-017 fires; PV-018 must not also fire (no data to compare)
    const field = makeNumberField({ scoreMin: null, scoreMax: null });

    const codes = issueCodesFor(makeStateWithFields([field]));
    expect(codes).toContain('PV-017');
    expect(codes).not.toContain('PV-018');
  });
});

// ─── Well-formed weighted survey ─────────────────────────────────────────────

describe('validateWeightedScoring — full valid weighted survey', () => {
  it('raises_no_scoring_issues_for_a_correctly_configured_survey', () => {
    const dropdownField = makeDropdownField({
      id: 'f1',
      code: 'q1',
      scoreWeight: 2,
      options: [makeOption({ scorePoints: 0 }), makeOption({ value: 'b', scorePoints: 10 })],
    });
    const numberField = makeNumberField({ id: 'f2', code: 'q2', scoreWeight: 1, scoreMin: 0, scoreMax: 100 });

    const codes = issueCodesFor(makeStateWithFields([dropdownField, numberField]));

    expect(codes).not.toContain('PV-015');
    expect(codes).not.toContain('PV-016');
    expect(codes).not.toContain('PV-017');
    expect(codes).not.toContain('PV-018');
  });
});
