// FR-CSE-074 — survey-specific publish validation.
// RED until publishValidation.ts is updated.

import { describe, it, expect } from 'vitest';
import { validateForPublish } from '@/validation/publishValidation';
import type {
  DesignerFormModel,
  DesignerTabModel,
  DesignerSectionModel,
} from '@/state/models/DesignerFormModel';

type PartialPublishState = Parameters<typeof validateForPublish>[0];

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeSurveyForm(overrides: Partial<DesignerFormModel> = {}): DesignerFormModel {
  return {
    id: 'form-1',
    name: 'Customer Feedback',
    code: 'srv_customer_feedback',
    description: '',
    entityLogicalName: '',
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
    ...overrides,
  };
}

function makeNormalForm(overrides: Partial<DesignerFormModel> = {}): DesignerFormModel {
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
    label: 'Questions',
    iconName: null,
    sortOrder: 0,
    isVisible: true,
    requiresPreviousTabComplete: false,
    hideTabBar: false,
    revealsSectionsOneAtATime: false,
    ...overrides,
  };
}

function makeSection(overrides: Partial<DesignerSectionModel> = {}): DesignerSectionModel {
  return {
    id: 'section-1',
    tabId: 'tab-1',
    label: 'Section 1',
    description: null,
    columnCount: 1,
    isCollapsible: false,
    isExpandedByDefault: true,
    isVisible: true,
    sortOrder: 0,
    ...overrides,
  };
}

/** Minimal field — cast to avoid having to replicate every DesignerFieldModel column. */
function makeField(fieldType: string = 'text', overrides: Record<string, unknown> = {}): object {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    label: 'Full Name',
    code: 'full_name',
    fieldType,
    placeholder: '',
    helpText: '',
    isRequired: true,
    isReadOnly: false,
    isHidden: false,
    defaultValue: null,
    sortOrder: 0,
    columnSpan: 1,
    options: [],
    lookupConfig: null,
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
    componentKey: null,
    maxRows: null,
    ...overrides,
  };
}

function buildSurveyState(fields: Record<string, object> = {}): PartialPublishState {
  const tab = makeTab();
  const section = makeSection();
  const defaultField = makeField('text');
  return {
    form: makeSurveyForm(),
    tabOrder: [tab.id],
    tabs: { [tab.id]: tab },
    sectionOrder: { [tab.id]: [section.id] },
    sections: { [section.id]: section },
    fields: Object.keys(fields).length > 0 ? fields : { [(defaultField as { id: string }).id]: defaultField },
  } as unknown as PartialPublishState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateForPublish — survey mode (FR-CSE-074)', () => {
  describe('PV-011 (no entity) is skipped for surveys', () => {
    it('survey_with_no_entity_does_not_produce_PV011', () => {
      const state = buildSurveyState();

      const { issues } = validateForPublish(state);

      const pv011 = issues.filter(i => i.code === 'PV-011');
      expect(pv011).toHaveLength(0);
    });

    it('normal_form_with_no_entity_still_produces_PV011', () => {
      const tab = makeTab();
      const section = makeSection();
      const field = makeField('text', { isRequired: true });
      const state = {
        form: makeNormalForm({ entityLogicalName: '' }),
        tabOrder: [tab.id],
        tabs: { [tab.id]: tab },
        sectionOrder: { [tab.id]: [section.id] },
        sections: { [section.id]: section },
        fields: { [(field as { id: string }).id]: field },
      } as unknown as PartialPublishState;

      const { issues } = validateForPublish(state);

      expect(issues.some(i => i.code === 'PV-011')).toBe(true);
    });
  });

  describe('PV-012 (no required fields warning) is skipped for surveys', () => {
    it('survey_with_no_required_fields_produces_no_PV012', () => {
      const tab = makeTab();
      const section = makeSection();
      const field = makeField('text', { id: 'f1', isRequired: false });
      const state = {
        form: makeSurveyForm(),
        tabOrder: [tab.id],
        tabs: { [tab.id]: tab },
        sectionOrder: { [tab.id]: [section.id] },
        sections: { [section.id]: section },
        fields: { [(field as { id: string }).id]: field },
      } as unknown as PartialPublishState;

      const { issues } = validateForPublish(state);

      expect(issues.some(i => i.code === 'PV-012')).toBe(false);
    });
  });

  describe('PV-019 (non-survey field type present in survey)', () => {
    it('survey_with_lookup_field_produces_PV019_naming_the_field_label', () => {
      const lookupField = makeField('lookup', { id: 'f-lookup', label: 'CRM Record', code: 'crm_record' });
      const state = buildSurveyState({ [(lookupField as { id: string }).id]: lookupField });

      const { issues } = validateForPublish(state);

      const pv019 = issues.filter(i => i.code === 'PV-019');
      expect(pv019.length).toBeGreaterThan(0);
      expect(pv019[0].message).toContain('CRM Record');
    });

    it('survey_with_multiple_disallowed_fields_produces_one_PV019_per_field', () => {
      const f1 = makeField('lookup', { id: 'f1', label: 'CRM Lookup', code: 'crm_lookup' });
      const f2 = makeField('file_upload', { id: 'f2', label: 'Document', code: 'document' });
      const state = buildSurveyState({
        [(f1 as { id: string }).id]: f1,
        [(f2 as { id: string }).id]: f2,
      });

      const { issues } = validateForPublish(state);

      expect(issues.filter(i => i.code === 'PV-019')).toHaveLength(2);
    });

    it('PV019_uses_field_code_when_label_is_empty', () => {
      const f = makeField('lookup', { id: 'f1', label: '', code: 'crm_lookup' });
      const state = buildSurveyState({ [(f as { id: string }).id]: f });

      const { issues } = validateForPublish(state);

      const pv019 = issues.filter(i => i.code === 'PV-019');
      expect(pv019[0].message).toContain('crm_lookup');
    });

    it('survey_with_only_allowed_types_produces_no_PV019', () => {
      const f = makeField('text');
      const state = buildSurveyState({ [(f as { id: string }).id]: f });

      const { issues } = validateForPublish(state);

      expect(issues.filter(i => i.code === 'PV-019')).toHaveLength(0);
    });

    it('PV019_does_not_fire_for_normal_forms_with_lookup_fields', () => {
      const tab = makeTab();
      const section = makeSection();
      const lookupField = makeField('lookup');
      const state = {
        form: makeNormalForm(),
        tabOrder: [tab.id],
        tabs: { [tab.id]: tab },
        sectionOrder: { [tab.id]: [section.id] },
        sections: { [section.id]: section },
        fields: { [(lookupField as { id: string }).id]: lookupField },
      } as unknown as PartialPublishState;

      const { issues } = validateForPublish(state);

      expect(issues.filter(i => i.code === 'PV-019')).toHaveLength(0);
    });
  });

  describe('survey with no disallowed types is valid', () => {
    it('valid_survey_produces_no_errors', () => {
      const state = buildSurveyState();

      const { isValid, issues } = validateForPublish(state);

      expect(issues.filter(i => i.severity === 'error')).toHaveLength(0);
      expect(isValid).toBe(true);
    });
  });
});
