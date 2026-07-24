// DFE-CBTN-001 — ScopedButtonBar two-axis rendering: visibility (isVisible /
// visibleWhen) and enablement (isActive / enabledWhen), with exact legacy
// preservation for buttons that declare no conditions.
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScopedButton, RuleEvaluationResult } from '@qdb/shared';

const { mockUseFormContext, mockDispatch } = vi.hoisted(() => ({
  mockUseFormContext: vi.fn(),
  mockDispatch: vi.fn(),
}));
vi.mock('../../contexts/FormContext', () => ({ useFormContext: mockUseFormContext }));
vi.mock('./useScopedButtonAction', () => ({ useScopedButtonAction: () => mockDispatch }));

import { ScopedButtonBar } from './ScopedButtonBar';

function makeButton(id: string, overrides: Partial<ScopedButton> = {}): ScopedButton {
  return {
    id,
    placementScope: 'tab',
    placementId: 'tab-1',
    label: id,
    displayOrder: 1,
    isPrimary: false,
    isVisible: true,
    confirmationRequired: false,
    action: { type: 'saveDraft' },
    isActive: true,
    ...overrides,
  };
}

function setRuleState(partial: Partial<RuleEvaluationResult>) {
  mockUseFormContext.mockReturnValue({
    isSubmitting: false,
    ruleState: {
      fieldVisibility: {},
      sectionVisibility: {},
      tabVisibility: {},
      fieldRequired: {},
      fieldReadonly: {},
      fieldValues: {},
      filteredOptions: {},
      buttonVisibility: {},
      buttonEnabledState: {},
      ...partial,
    },
  });
}

describe('ScopedButtonBar (DFE-CBTN-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRuleState({});
  });

  it('renders a legacy button (no conditions) visible and enabled — unchanged', () => {
    render(<ScopedButtonBar buttons={[makeButton('save')]} />);
    const btn = screen.getByRole('button', { name: 'save' });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('does NOT render a legacy button with isActive=false — exact legacy behavior', () => {
    render(<ScopedButtonBar buttons={[makeButton('save', { isActive: false })]} />);
    expect(screen.queryByRole('button', { name: 'save' })).not.toBeInTheDocument();
  });

  it('hides a button whose visibleWhen evaluated false', () => {
    setRuleState({ buttonVisibility: { approve: false } });
    render(
      <ScopedButtonBar
        buttons={[makeButton('approve', { visibleWhen: { conditions: [], logic: 'AND' } })]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'approve' })).not.toBeInTheDocument();
  });

  it('shows a button whose visibleWhen evaluated true', () => {
    setRuleState({ buttonVisibility: { approve: true } });
    render(
      <ScopedButtonBar
        buttons={[makeButton('approve', { visibleWhen: { conditions: [], logic: 'AND' } })]}
      />,
    );
    expect(screen.getByRole('button', { name: 'approve' })).toBeInTheDocument();
  });

  it('renders a button with enabledWhen=false as visible but disabled (not clickable)', () => {
    setRuleState({ buttonEnabledState: { submit: false } });
    render(
      <ScopedButtonBar
        buttons={[makeButton('submit', { enabledWhen: { conditions: [], logic: 'AND' } })]}
      />,
    );
    const btn = screen.getByRole('button', { name: 'submit' });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it('renders a button with enabledWhen=true as enabled', () => {
    setRuleState({ buttonEnabledState: { submit: true } });
    render(
      <ScopedButtonBar
        buttons={[makeButton('submit', { enabledWhen: { conditions: [], logic: 'AND' } })]}
      />,
    );
    expect(screen.getByRole('button', { name: 'submit' })).not.toBeDisabled();
  });
});
