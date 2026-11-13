// FR-CSE-071 — wizard survey mode UI tests.
// RED until NewFormWizardScreen is updated with the Form Type step.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { CrmContext } from '@/app/App';
import type { CrmContextService } from '@/services/CrmContextService';
import { NewFormWizardScreen } from '@/screens/NewFormWizardScreen';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal CrmContextService mock whose probe result is determined by
 * `isFormTypeAvailable`. All other calls (themes, etc.) return an empty list.
 */
function buildMockCrmService(isFormTypeAvailable = true): CrmContextService {
  const mockWebApi = {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn().mockImplementation((_entity: string, query?: string) => {
      // The probe passes ?$select=qdb_form_type&$top=1 — reject when unavailable.
      if (!isFormTypeAvailable && query?.includes('qdb_form_type')) {
        return Promise.reject(new Error('Could not find a property named qdb_form_type'));
      }
      return Promise.resolve({ entities: [] });
    }),
    updateRecordConditional: vi.fn(),
    executeAction: vi.fn(),
  };
  return { getWebApi: () => mockWebApi } as unknown as CrmContextService;
}

function renderWizard(service: CrmContextService | null = null) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <CrmContext.Provider value={service}>
        <NewFormWizardScreen />
      </CrmContext.Provider>
    </FluentProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NewFormWizardScreen — survey mode (FR-CSE-071)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  // ---------------------------------------------------------------------------
  // Step 1 — Form Type choice
  // ---------------------------------------------------------------------------

  describe('step 1 — Form Type choice', () => {
    it('renders_Normal_Form_and_Survey_choice_cards_as_first_step', () => {
      renderWizard();

      expect(screen.getByRole('radio', { name: /normal form/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /survey/i })).toBeInTheDocument();
    });

    it('Normal_Form_is_selected_by_default', () => {
      renderWizard();

      expect(screen.getByRole('radio', { name: /normal form/i })).toHaveAttribute('aria-checked', 'true');
    });

    it('Survey_is_unchecked_by_default', () => {
      renderWizard();

      expect(screen.getByRole('radio', { name: /survey/i })).toHaveAttribute('aria-checked', 'false');
    });

    it('clicking_Survey_selects_it_and_deselects_Normal', async () => {
      const user = userEvent.setup({ delay: null });
      renderWizard();

      await user.click(screen.getByRole('radio', { name: /survey/i }));

      expect(screen.getByRole('radio', { name: /survey/i })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: /normal form/i })).toHaveAttribute('aria-checked', 'false');
    });

    it('clicking_back_from_step_1_navigates_to_form_list', async () => {
      const user = userEvent.setup({ delay: null });
      renderWizard();

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockNavigateTo).toHaveBeenCalledWith('form-list');
    });
  });

  // ---------------------------------------------------------------------------
  // Survey — step 2 Form Basics with srv_ prefix
  // ---------------------------------------------------------------------------

  describe('survey — Form Basics code prefix', () => {
    async function advanceToBasicsAsSurvey(user: ReturnType<typeof userEvent.setup>): Promise<void> {
      await user.click(screen.getByRole('radio', { name: /survey/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));
    }

    it('auto_derives_code_with_srv_prefix_when_survey_selected', async () => {
      const user = userEvent.setup({ delay: null });
      renderWizard();

      await advanceToBasicsAsSurvey(user);

      await user.type(screen.getByRole('textbox', { name: /form name/i }), 'Customer Feedback');

      expect(screen.getByRole('textbox', { name: /form code/i })).toHaveValue('srv_customer-feedback');
    });

    it('switches_to_non_srv_code_when_switching_back_to_Normal', async () => {
      const user = userEvent.setup({ delay: null });
      renderWizard();

      // Select Survey and advance
      await user.click(screen.getByRole('radio', { name: /survey/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Type a name so code gets srv_ prefix
      await user.type(screen.getByRole('textbox', { name: /form name/i }), 'Feedback');
      expect(screen.getByRole('textbox', { name: /form code/i })).toHaveValue('srv_feedback');

      // Go back to Form Type step, switch to Normal Form
      await user.click(screen.getByRole('button', { name: /back/i }));
      await user.click(screen.getByRole('radio', { name: /normal form/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Code is re-derived without srv_ prefix
      expect(screen.getByRole('textbox', { name: /form code/i })).toHaveValue('feedback');
    });
  });

  // ---------------------------------------------------------------------------
  // Survey — skips Target Entity step
  // ---------------------------------------------------------------------------

  describe('survey — Target Entity step is skipped', () => {
    async function advanceSurveyToTheme(user: ReturnType<typeof userEvent.setup>): Promise<void> {
      // Step 1: Form Type — select Survey
      await user.click(screen.getByRole('radio', { name: /survey/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));
      // Step 2: Form Basics — type name and proceed
      await user.type(screen.getByRole('textbox', { name: /form name/i }), 'Survey');
      await user.click(screen.getByRole('button', { name: /next/i }));
      // Step 3: Initial Structure — proceed
      await user.click(screen.getByRole('button', { name: /next/i }));
    }

    it('after_step_3_Structure_lands_directly_on_Theme_not_Target_Entity', async () => {
      const user = userEvent.setup({ delay: null });
      renderWizard();

      await advanceSurveyToTheme(user);

      // Target Entity must NOT appear
      expect(screen.queryByText(/target crm entity/i)).not.toBeInTheDocument();
      // The step heading "Theme" identifies the Theme step.
      expect(screen.getByRole('heading', { name: 'Theme' })).toBeInTheDocument();
    });

    it('back_from_Theme_step_goes_to_Structure_not_Target_Entity', async () => {
      const user = userEvent.setup({ delay: null });
      renderWizard();

      await advanceSurveyToTheme(user);

      // Go Back from Theme
      await user.click(screen.getByRole('button', { name: /back/i }));

      // Should show Initial Structure, not Target Entity
      expect(screen.queryByText(/target crm entity/i)).not.toBeInTheDocument();
      expect(screen.getByText(/number of initial tabs/i)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Survey button disabled when form_type column unavailable
  // ---------------------------------------------------------------------------

  describe('survey disabled when form type column is missing', () => {
    it('survey_button_is_disabled_when_probe_returns_column_missing', async () => {
      const service = buildMockCrmService(false);
      renderWizard(service);

      await waitFor(() => {
        expect(screen.getByRole('radio', { name: /survey/i })).toBeDisabled();
      });
    });

    it('survey_button_enabled_without_a_crm_service_no_probe_runs', () => {
      renderWizard(null);

      // No probe fires when crmService is null — Survey should be enabled (optimistic)
      expect(screen.getByRole('radio', { name: /survey/i })).not.toBeDisabled();
    });

    it('survey_reason_names_the_missing_columns_when_probe_returns_column_missing', async () => {
      renderWizard(buildMockCrmService(false));

      expect(await screen.findByRole('status')).toHaveTextContent(/does not have the survey columns/i);
    });

    it('survey_button_is_enabled_once_probe_confirms_the_column', async () => {
      renderWizard(buildMockCrmService(true));

      await waitFor(() => expect(screen.getByRole('radio', { name: /survey/i })).not.toBeDisabled());
    });

    it('survey_button_is_disabled_while_probe_is_pending', () => {
      const pending = { getWebApi: () => ({ retrieveMultipleRecords: () => new Promise(() => undefined) }) } as unknown as CrmContextService;

      renderWizard(pending);

      expect(screen.getByRole('radio', { name: /survey/i })).toBeDisabled();
      expect(screen.getByRole('status')).toHaveTextContent(/checking/i);
    });

    // A non-column failure (401, network) is shown as the reason, not mistaken for an org
    // without surveys and not hidden behind an optimistically enabled Survey card.
    it('survey_is_disabled_and_the_probe_error_shown_when_probe_throws_non_column_error', async () => {
      // "(401)" matches isClientError so withRetry stops at once; isMissingColumnError is false.
      const mockWebApi = {
        createRecord: vi.fn(),
        updateRecord: vi.fn(),
        deleteRecord: vi.fn(),
        retrieveRecord: vi.fn(),
        retrieveMultipleRecords: vi.fn().mockImplementation((_entity: string, query?: string) => {
          if (query?.includes('qdb_form_type')) {
            return Promise.reject(new Error('(401) Unauthorized'));
          }
          return Promise.resolve({ entities: [] });
        }),
        updateRecordConditional: vi.fn(),
        executeAction: vi.fn(),
      };
      const service = { getWebApi: () => mockWebApi } as unknown as CrmContextService;

      renderWizard(service);

      expect(await screen.findByRole('status')).toHaveTextContent(/could not check.*\(401\) Unauthorized/i);
      expect(screen.getByRole('radio', { name: /survey/i })).toBeDisabled();
    });
  });
});
