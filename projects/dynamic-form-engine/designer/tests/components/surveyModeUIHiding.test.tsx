// FR-CSE-073 / FR-CSE-075 — survey mode UI hiding tests.
//
// F-1: covers the eight guards that hide non-survey settings/controls when
//      Form Type = Survey and asserts they are still present for Normal forms.
// F-2: covers the warning dialog that fires when a maker switches a PUBLISHED
//      survey to Normal (FR-CSE-075).

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

// ── Module mocks ──────────────────────────────────────────────────────────────

// Fluent UI's Dropdown renders its popup via floating-ui, which requires browser
// geometry APIs unavailable in jsdom. For the dialog interaction tests (F-2) we
// need Dropdown to fire onOptionSelect synchronously. Replace only Dropdown and
// Option with a native <select>/<option> pair; every other Fluent component is
// kept from the actual library so the UI-hiding assertions still work.
vi.mock('@fluentui/react-components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fluentui/react-components')>();
  return {
    ...actual,
    Option: ({ value, children }: { value?: string; children?: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
    Dropdown: ({
      onOptionSelect,
      selectedOptions,
      value,
      disabled,
      children,
    }: {
      onOptionSelect?: (_: unknown, data: { optionValue?: string }) => void;
      selectedOptions?: string[];
      value?: string;
      disabled?: boolean;
      children?: React.ReactNode;
    }) => (
      <select
        disabled={disabled}
        value={selectedOptions?.[0] ?? value ?? ''}
        onChange={e => onOptionSelect?.({}, { optionValue: e.target.value })}
      >
        {children}
      </select>
    ),
  };
});

// EntityCombobox makes CRM calls — replace with a stub so tests stay offline.
vi.mock('@/components/EntityCombobox', () => ({
  EntityCombobox: () => <div data-testid="entity-combobox" />,
}));

// TranslationsPanel makes CRM calls and uses CrmContext — stub it out.
vi.mock('@/designer/properties/panels/TranslationsPanel', () => ({
  TranslationsPanel: () => <div data-testid="translations-panel" />,
}));

// ValidationRulesPanel uses useDesignerStore.getState() / .setState() (Zustand
// static methods not present on a vi.fn mock). Stub it to avoid crashes when
// PropertyTabs renders all tabs via the mock below.
vi.mock('@/designer/properties/panels/ValidationRulesPanel', () => ({
  ValidationRulesPanel: () => <div data-testid="validation-rules-panel" />,
}));

// Mock DefaultValueEditor (reads complex store state).
vi.mock('@/designer/properties/DefaultValueEditor', () => ({
  DefaultValueEditor: () => <div data-testid="default-value-editor" />,
}));

// PropertyTabs normally only renders the ACTIVE tab's content. For these tests
// we want to assert guards in ALL tabs at once — render all content in parallel.
vi.mock('@/designer/properties/PropertyTabs', () => ({
  PropertyTabs: ({ tabs }: { tabs: Array<{ id: string; content: React.ReactNode | null }> }) => (
    <>
      {tabs.map(t => (
        <div key={t.id} data-testid={`tab-${t.id}`}>
          {t.content}
        </div>
      ))}
    </>
  ),
}));

// ── Store mock ────────────────────────────────────────────────────────────────

// All components under test read from useDesignerStore via a selector.
// We capture mockDesignerState by reference so beforeEach can reassign it.
interface MockDesignerState {
  form: Record<string, unknown> | null;
  fields: Record<string, unknown>;
  updateForm: ReturnType<typeof vi.fn>;
  updateField: ReturnType<typeof vi.fn>;
  navigateTo: ReturnType<typeof vi.fn>;
  selectItem: ReturnType<typeof vi.fn>;
  undo: ReturnType<typeof vi.fn>;
  redo: ReturnType<typeof vi.fn>;
  validationRules: Record<string, unknown>;
}

let mockDesignerState: MockDesignerState;

vi.mock('@/state/designerStore', () => ({
  useDesignerStore: vi.fn((selector: (s: MockDesignerState) => unknown) =>
    selector(mockDesignerState)
  ),
  // Named selector exports used by DesignerCommandBar
  selectCanUndo: (_s: MockDesignerState) => false,
  selectCanRedo: (_s: MockDesignerState) => false,
}));

// ── Test factories ────────────────────────────────────────────────────────────

function buildSurveyForm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'form-1',
    formType: 'Survey',
    status: 'draft',
    isFormTypeAvailable: true,
    code: 'srv_test',
    name: 'Test Survey',
    description: '',
    entityLogicalName: '',
    allowSaveDraft: false,
    draftExpiryDays: null,
    showSummaryStep: false,
    showProgressBar: false,
    summaryMode: 'None',
    confirmationMessage: null,
    confirmationRecordRefAttribute: null,
    accessGroupId: null,
    powerAutomateFlowId: null,
    iconName: null,
    imageUrl: null,
    headerText: null,
    headerImageUrl: null,
    footerText: null,
    footerImageUrl: null,
    submitConfirmationLabel: null,
    submitConfirmationMessage: null,
    isScoringAvailable: false,
    scoringMode: 'None',
    ...overrides,
  };
}

function buildNormalForm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return buildSurveyForm({
    formType: 'Standard',
    code: 'test_form',
    name: 'Test Normal Form',
    allowSaveDraft: true,
    ...overrides,
  });
}

function buildTextField(): Record<string, unknown> {
  return {
    id: 'field-1',
    fieldType: 'text',
    label: 'First Name',
    code: 'first_name',
    isRequired: false,
    isReadOnly: false,
    isHidden: false,
    defaultValue: null,
    sortOrder: 0,
    columnSpan: 1,
    placeholder: null,
    helpText: null,
    currencyCode: null,
    decimalPlaces: null,
    maxRows: null,
    maxFiles: null,
    gridPageSize: null,
    gridPagingStyle: null,
    placement: 'body',
    prefixLabel: null,
    suffixLabel: null,
  };
}

function buildNumberField(): Record<string, unknown> {
  return {
    ...buildTextField(),
    id: 'field-2',
    fieldType: 'number',
    label: 'Score',
    code: 'score',
    numberDisplayStyle: 'textbox',
    barMaxFieldSchemaName: null,
    barValueFieldSchemaName: null,
  };
}

function resetMockState(form: Record<string, unknown> | null = null): void {
  mockDesignerState = {
    form,
    fields: {},
    updateForm: vi.fn(),
    updateField: vi.fn(),
    navigateTo: vi.fn(),
    selectItem: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    validationRules: {},
  };
}

function wrap(ui: React.ReactElement): React.ReactElement {
  return <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>;
}

beforeEach(() => resetMockState());
afterEach(() => cleanup());

// ── Imports under test (after mocks are set up) ───────────────────────────────

import { FormProperties } from '@/designer/properties/FormProperties';
import { DesignerCommandBar } from '@/designer/commandbar/DesignerCommandBar';
import { FieldProperties } from '@/designer/properties/FieldProperties';
import { NumberFieldPanel } from '@/designer/properties/panels/NumberFieldPanel';

// ── F-1: FormProperties — five guards (FR-CSE-073) ───────────────────────────

describe('FormProperties — survey mode hides non-survey settings (F-1)', () => {

  it('target_entity_is_absent_for_survey_form', () => {
    resetMockState(buildSurveyForm());
    render(wrap(<FormProperties />));

    expect(screen.queryByText(/target crm entity/i)).not.toBeInTheDocument();
  });

  it('target_entity_is_present_for_normal_form', () => {
    resetMockState(buildNormalForm());
    render(wrap(<FormProperties />));

    expect(screen.getByText(/target crm entity/i)).toBeInTheDocument();
  });

  it('allow_save_as_draft_is_absent_for_survey_form', () => {
    resetMockState(buildSurveyForm());
    render(wrap(<FormProperties />));

    expect(screen.queryByText(/allow save as draft/i)).not.toBeInTheDocument();
  });

  it('allow_save_as_draft_is_present_for_normal_form', () => {
    resetMockState(buildNormalForm({ allowSaveDraft: false }));
    render(wrap(<FormProperties />));

    expect(screen.getByText(/allow save as draft/i)).toBeInTheDocument();
  });

  it('power_automate_flow_id_is_absent_for_survey_form', () => {
    resetMockState(buildSurveyForm());
    render(wrap(<FormProperties />));

    expect(screen.queryByText(/power automate flow id/i)).not.toBeInTheDocument();
  });

  it('power_automate_flow_id_is_present_for_normal_form', () => {
    resetMockState(buildNormalForm());
    render(wrap(<FormProperties />));

    expect(screen.getByText(/power automate flow id/i)).toBeInTheDocument();
  });

  it('reference_number_attribute_is_absent_for_survey_form', () => {
    resetMockState(buildSurveyForm());
    render(wrap(<FormProperties />));

    expect(screen.queryByText(/reference number attribute/i)).not.toBeInTheDocument();
  });

  it('reference_number_attribute_is_present_for_normal_form', () => {
    resetMockState(buildNormalForm());
    render(wrap(<FormProperties />));

    expect(screen.getByText(/reference number attribute/i)).toBeInTheDocument();
  });

  it('access_group_id_is_absent_for_survey_form', () => {
    resetMockState(buildSurveyForm());
    render(wrap(<FormProperties />));

    expect(screen.queryByText(/access group id/i)).not.toBeInTheDocument();
  });

  it('access_group_id_is_present_for_normal_form', () => {
    resetMockState(buildNormalForm());
    render(wrap(<FormProperties />));

    expect(screen.getByText(/access group id/i)).toBeInTheDocument();
  });
});

// ── FormProperties — Form Code hint and separators (FR-CSE-023) ──────────────
// The box used to turn every hyphen into an underscore, so one keystroke rewrote an
// existing code such as three-changes-demo. PV-002 accepts both separators.

describe('FormProperties — Form Code hint and separators', () => {
  it('code_hint_lists_hyphens_and_underscores_for_normal_form', () => {
    resetMockState(buildNormalForm());
    render(wrap(<FormProperties />));

    expect(screen.getByText('Lowercase letters, numbers, hyphens and underscores.')).toBeInTheDocument();
  });

  it('code_hint_names_the_survey_prefix_for_survey_form', () => {
    resetMockState(buildSurveyForm());
    render(wrap(<FormProperties />));

    expect(screen.getByText(/survey codes start with srv_ or srv-/i)).toBeInTheDocument();
  });

  it('editing_the_code_keeps_existing_hyphens', () => {
    resetMockState(buildNormalForm({ code: 'three-changes-demo' }));
    render(wrap(<FormProperties />));

    fireEvent.change(screen.getByRole('textbox', { name: /form code/i }), { target: { value: 'three-changes-demo2' } });

    expect(mockDesignerState.updateForm).toHaveBeenCalledWith({ code: 'three-changes-demo2' });
  });

  it('editing_the_code_still_replaces_other_characters_with_underscores', () => {
    resetMockState(buildNormalForm());
    render(wrap(<FormProperties />));

    fireEvent.change(screen.getByRole('textbox', { name: /form code/i }), { target: { value: 'My Form!' } });

    expect(mockDesignerState.updateForm).toHaveBeenCalledWith({ code: 'my_form_' });
  });
});

// ── F-1: DesignerCommandBar — Mapping command guard (FR-CSE-073) ──────────────

describe('DesignerCommandBar — Mapping command hidden for surveys (F-1)', () => {
  const baseProps = {
    formName: 'Test',
    formStatus: 'draft' as const,
    isDirty: false,
    isSaving: false,
    onSaveDraft: vi.fn(),
    onPublish: vi.fn(),
    onPreview: vi.fn(),
    onOpenForm: vi.fn(),
    onFormProperties: vi.fn(),
    onVersionHistory: vi.fn(),
    onBusinessRules: vi.fn(),
    onSubmissionMapping: vi.fn(),
    onThemeEditor: vi.fn(),
    onTranslations: vi.fn(),
    onBack: vi.fn(),
  };

  it('mapping_command_is_absent_for_survey_form', () => {
    resetMockState();
    render(wrap(<DesignerCommandBar {...baseProps} formType="Survey" />));

    expect(screen.queryByRole('button', { name: /mapping/i })).not.toBeInTheDocument();
  });

  it('mapping_command_is_present_for_normal_form', () => {
    resetMockState();
    render(wrap(<DesignerCommandBar {...baseProps} formType="Standard" />));

    expect(screen.getByRole('button', { name: /mapping/i })).toBeInTheDocument();
  });

  it('mapping_command_is_present_when_form_type_is_unset', () => {
    resetMockState();
    render(wrap(<DesignerCommandBar {...baseProps} formType={undefined} />));

    expect(screen.getByRole('button', { name: /mapping/i })).toBeInTheDocument();
  });
});

// ── F-1: FieldProperties — CRM Mapping section guard (FR-CSE-073) ────────────

describe('FieldProperties — CRM Mapping section hidden for surveys (F-1)', () => {
  it('crm_mapping_section_is_absent_for_survey_form', () => {
    resetMockState(buildSurveyForm());
    mockDesignerState.fields = { 'field-1': buildTextField() };

    render(wrap(<FieldProperties fieldId="field-1" />));

    expect(screen.queryByText(/crm mapping/i)).not.toBeInTheDocument();
  });

  it('crm_mapping_section_is_present_for_normal_form', () => {
    resetMockState(buildNormalForm());
    mockDesignerState.fields = { 'field-1': buildTextField() };

    render(wrap(<FieldProperties fieldId="field-1" />));

    expect(screen.getByText(/crm mapping/i)).toBeInTheDocument();
  });
});

// ── F-1: NumberFieldPanel — Display Style guard (FR-CSE-073) ─────────────────

describe('NumberFieldPanel — Display Style hidden for surveys (F-1)', () => {
  it('display_style_is_absent_for_survey_form', () => {
    resetMockState(buildSurveyForm());
    mockDesignerState.fields = { 'field-2': buildNumberField() };

    const field = buildNumberField() as unknown as Parameters<typeof NumberFieldPanel>[0]['field'];
    render(wrap(<NumberFieldPanel field={field} />));

    expect(screen.queryByText(/display style/i)).not.toBeInTheDocument();
  });

  it('display_style_is_present_for_normal_form', () => {
    resetMockState(buildNormalForm());
    mockDesignerState.fields = { 'field-2': buildNumberField() };

    const field = buildNumberField() as unknown as Parameters<typeof NumberFieldPanel>[0]['field'];
    render(wrap(<NumberFieldPanel field={field} />));

    expect(screen.getByText(/display style/i)).toBeInTheDocument();
  });
});

// ── F-2: FormProperties — warning dialog when switching published survey (FR-CSE-075) ──
//
// The Fluent Dropdown at the top of this file is mocked to a native <select> so that
// fireEvent.change fires onOptionSelect synchronously in jsdom (Fluent's floating popup
// requires browser geometry APIs that are not available in jsdom).

describe('FormProperties — warning dialog for published survey type switch (F-2)', () => {
  function selectFormType(nextType: string): void {
    // The Form Type select is currently showing "Survey" as its value —
    // find it by its current display value and change it to the new type.
    // The Fluent Dropdown is mocked to a native <select> (see file-level mock above)
    // so fireEvent.change fires onOptionSelect synchronously.
    const formTypeSelect = screen.getByDisplayValue('Survey') as HTMLSelectElement;
    fireEvent.change(formTypeSelect, { target: { value: nextType } });
  }

  it('dialog_opens_when_switching_published_survey_to_normal', () => {
    resetMockState(buildSurveyForm({ status: 'published' }));
    render(wrap(<FormProperties />));

    selectFormType('Standard');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/switch to normal form/i)).toBeInTheDocument();
  });

  it('cancel_keeps_survey_and_closes_dialog', async () => {
    resetMockState(buildSurveyForm({ status: 'published' }));
    const user = userEvent.setup({ delay: null });
    render(wrap(<FormProperties />));

    selectFormType('Standard');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // updateForm must NOT have been called — form type remains Survey.
    expect(mockDesignerState.updateForm).not.toHaveBeenCalled();
  });

  it('switch_to_normal_calls_updateForm_with_Standard', async () => {
    resetMockState(buildSurveyForm({ status: 'published' }));
    const user = userEvent.setup({ delay: null });
    render(wrap(<FormProperties />));

    selectFormType('Standard');
    await user.click(screen.getByRole('button', { name: /switch to normal/i }));

    expect(mockDesignerState.updateForm).toHaveBeenCalledWith({ formType: 'Standard' });
  });

  it('dialog_does_not_open_when_switching_draft_survey_to_normal', () => {
    resetMockState(buildSurveyForm({ status: 'draft' }));
    render(wrap(<FormProperties />));

    selectFormType('Standard');

    // No dialog for a draft survey — updateForm is called directly.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockDesignerState.updateForm).toHaveBeenCalledWith({ formType: 'Standard' });
  });
});
