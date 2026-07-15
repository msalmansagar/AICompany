import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { FormDefinition } from '@qdb/shared';

const h = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }));

vi.mock('../../contexts/FormContext', () => ({ useFormContext: () => h.ctx }));
vi.mock('../../contexts/DesignContext', () => ({
  useDesignContext: () => ({ buttonDesigns: {}, formDesign: {} }),
}));

// eslint-disable-next-line import/first
import { FormActionBar } from './FormActionBar';

const setSubmitAcknowledged = vi.fn();

function baseCtx(over: Record<string, unknown> = {}) {
  return {
    formDefinition: { buttons: [] } as unknown as FormDefinition,
    isSubmitting: false,
    isDirty: false,
    isSubmitted: false,
    validationErrors: {},
    saveDraft: vi.fn(),
    submitForm: vi.fn(),
    resetForm: vi.fn(),
    submitAcknowledged: false,
    setSubmitAcknowledged,
    ...over,
  };
}

function withConfirmation(over: Record<string, unknown> = {}) {
  return baseCtx({
    formDefinition: {
      buttons: [],
      submitConfirmation: {
        checkboxLabel: 'I confirm the information is correct',
        dialogMessage: 'Are you sure you want to submit?',
      },
    } as unknown as FormDefinition,
    ...over,
  });
}

function renderBar() {
  return render(
    <FluentProvider theme={webLightTheme}>
      <FormActionBar showSubmit />
    </FluentProvider>,
  );
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement;
}

describe('FormActionBar submit-confirmation gate', () => {
  beforeEach(() => setSubmitAcknowledged.mockClear());

  it('no checkbox and enabled Submit when no confirmation configured (legacy)', () => {
    h.ctx = baseCtx();
    renderBar();

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(submitButton().disabled).toBe(false);
  });

  it('disables Submit until acknowledged', () => {
    h.ctx = withConfirmation({ submitAcknowledged: false });
    renderBar();

    expect(screen.getByRole('checkbox', { name: 'I confirm the information is correct' })).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
  });

  it('enables Submit once acknowledged', () => {
    h.ctx = withConfirmation({ submitAcknowledged: true });
    renderBar();

    expect(submitButton().disabled).toBe(false);
  });

  it('acknowledging opens the confirmation dialog and records the acknowledgement', () => {
    h.ctx = withConfirmation({ submitAcknowledged: false });
    renderBar();

    fireEvent.click(screen.getByRole('checkbox', { name: 'I confirm the information is correct' }));

    expect(setSubmitAcknowledged).toHaveBeenCalledWith(true);
    expect(screen.getByText('Are you sure you want to submit?')).toBeTruthy();
  });

  it('does not gate the submit in review mode (navigates to summary instead)', () => {
    h.ctx = withConfirmation({ submitAcknowledged: false });
    render(
      <FluentProvider theme={webLightTheme}>
        <FormActionBar showSubmit reviewMode onReview={vi.fn()} />
      </FluentProvider>,
    );

    // Review mode bypasses the acknowledgement gate — no confirm checkbox, submit enabled.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(submitButton().disabled).toBe(false);
  });
});
