import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { CrmContext } from '@/app/App';

// ── Store mock ────────────────────────────────────────────────────────────────
const mockNavigateTo = vi.fn();
const mockLoadForm = vi.fn();

vi.mock('@/state/designerStore', () => ({
  useDesignerStore: vi.fn(() => ({
    navigateTo: mockNavigateTo,
    loadForm: mockLoadForm,
  })),
  DEFAULT_DESIGN_PAYLOAD: {},
}));

// ── Component under test ──────────────────────────────────────────────────────
import { NewFormWizardScreen } from '@/screens/NewFormWizardScreen';

function renderWizard() {
  return render(
    <FluentProvider theme={webLightTheme}>
      <CrmContext.Provider value={null}>
        <NewFormWizardScreen />
      </CrmContext.Provider>
    </FluentProvider>
  );
}

function getNameInput(): HTMLInputElement {
  const el = screen.getByRole('textbox', { name: /form name/i });
  if (!(el instanceof HTMLInputElement)) {
    throw new Error('Form Name element is not an HTMLInputElement');
  }
  return el;
}

function getCodeInput(): HTMLInputElement {
  const el = screen.getByRole('textbox', { name: /form code/i });
  if (!(el instanceof HTMLInputElement)) {
    throw new Error('Form Code element is not an HTMLInputElement');
  }
  return el;
}

describe('NewFormWizardScreen — FR-012(a) Form Code auto-derive dirty flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Explicit cleanup prevents DOM pollution when a test times out before RTL's
    // auto-cleanup hook runs, which would corrupt subsequent tests.
    cleanup();
  });

  it('auto_derives_code_from_name_before_manual_edit', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.type(getNameInput(), 'Loan Application Form');

    expect(getCodeInput().value).toBe('loan-application-form');
  });

  it('continues_updating_code_as_name_grows_while_unedited', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    const nameInput = getNameInput();
    await user.type(nameInput, 'Lo');
    expect(getCodeInput().value).toBe('lo');

    await user.type(nameInput, 'an');
    expect(getCodeInput().value).toBe('loan');
  });

  it('stops_auto_deriving_after_user_manually_edits_code', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    // Auto-derive fires as user types the name
    await user.type(getNameInput(), 'Loan');
    expect(getCodeInput().value).toBe('loan');

    // User manually overwrites the code field
    const codeInput = getCodeInput();
    await user.tripleClick(codeInput); // select all then type
    await user.clear(codeInput);
    await user.type(codeInput, 'my-custom-code');

    // Now type more in the name — code must NOT change
    await user.type(getNameInput(), ' Form');

    expect(getCodeInput().value).toBe('my-custom-code');
  });

  it('sanitizes_disallowed_characters_in_manual_code_input', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    const codeInput = getCodeInput();
    await user.type(codeInput, 'MY FORM!');

    // Uppercase and spaces/special chars are sanitized
    expect(getCodeInput().value).toBe('my-form-');
  });

  it('sanitizes_auto_derived_code_with_special_characters_in_name', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.type(getNameInput(), 'Loan (2026) Form');

    expect(getCodeInput().value).toBe('loan-2026-form');
  });

  it('NewFormWizardScreen_givenBackNavAfterAutoDerive_manualCodeEditSurvivesAndBlocksAutoDerive', async () => {
    // This test validates the core architectural choice: isFormCodeManuallyEdited lives in the
    // parent NewFormWizardScreen (not in a useRef inside StepFormBasics), so that navigating
    // Back from step 2 to step 1 — which unmounts and remounts StepFormBasics — does not
    // reset the dirty flag.
    const user = userEvent.setup({ delay: null });
    renderWizard();

    // Step 1: type a name → code auto-derives; Next becomes enabled
    await user.type(getNameInput(), 'AB');
    expect(getCodeInput().value).toBe('ab');

    // Navigate to step 2 then back to step 1 (StepFormBasics unmounts and remounts)
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /back/i }));

    // Manually edit the code field after returning to step 1
    const codeInput = getCodeInput();
    await user.tripleClick(codeInput);
    await user.clear(codeInput);
    await user.type(codeInput, 'mv');

    // Typing more in the name must NOT overwrite the manually set code
    await user.type(getNameInput(), 'C');

    expect(getCodeInput().value).toBe('mv');
  });
});
