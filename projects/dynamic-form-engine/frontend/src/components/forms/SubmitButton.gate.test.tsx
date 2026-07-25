import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { FormDefinition } from '@qdb/shared';

const h = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
}));

vi.mock('../../contexts/FormContext', () => ({
  useFormContext: () => h.ctx,
}));
vi.mock('../../contexts/DesignContext', () => ({
  useDesignContext: () => ({ formDesign: { buttonStyle: 'Primary' } }),
}));

// eslint-disable-next-line import/first
import { SubmitButton } from './SubmitButton';

const setSubmitAcknowledged = vi.fn();

function baseCtx(over: Record<string, unknown> = {}) {
  return {
    submitForm: vi.fn(),
    isSubmitting: false,
    validationErrors: {},
    isSubmitted: false,
    formDefinition: null as FormDefinition | null,
    submitAcknowledged: false,
    setSubmitAcknowledged,
    ...over,
  };
}

function withConfirmation(over: Record<string, unknown> = {}) {
  return baseCtx({
    formDefinition: {
      submitConfirmation: {
        checkboxLabel: 'I confirm the information is correct',
        dialogMessage: 'Are you sure you want to submit?',
      },
    } as unknown as FormDefinition,
    ...over,
  });
}

function renderButton() {
  return render(
    <FluentProvider theme={webLightTheme}>
      <SubmitButton />
    </FluentProvider>,
  );
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /submit form/i }) as HTMLButtonElement;
}

describe('SubmitButton confirmation gate', () => {
  beforeEach(() => {
    setSubmitAcknowledged.mockClear();
  });

  it('has no checkbox and an enabled Submit when no confirmation is configured (legacy)', () => {
    h.ctx = baseCtx();
    renderButton();

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(submitButton().disabled).toBe(false);
  });

  it('disables Submit until the acknowledgement checkbox is ticked', () => {
    h.ctx = withConfirmation({ submitAcknowledged: false });
    renderButton();

    expect(screen.getByRole('checkbox', { name: 'I confirm the information is correct' })).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
  });

  it('enables Submit once acknowledged', () => {
    h.ctx = withConfirmation({ submitAcknowledged: true });
    renderButton();

    expect(submitButton().disabled).toBe(false);
  });

  it('acknowledging opens the confirmation dialog and records the acknowledgement', () => {
    h.ctx = withConfirmation({ submitAcknowledged: false });
    renderButton();

    fireEvent.click(screen.getByRole('checkbox', { name: 'I confirm the information is correct' }));

    expect(setSubmitAcknowledged).toHaveBeenCalledWith(true);
    expect(screen.getByText('Are you sure you want to submit?')).toBeTruthy();
  });
});
