// DFE-APIVAL-CAM-001: an API Validation rule needs a key and saves it with the rule.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

const store = vi.hoisted(() => {
  const state: Record<string, unknown> = {
    validationRules: {},
    fields: { f1: { id: 'f1', code: 'iban' }, f2: { id: 'f2', code: 'holder' } },
    dirtyIds: [],
  };
  const setState = vi.fn((patch: Record<string, unknown>) => Object.assign(state, patch));
  const useDesignerStore = Object.assign(
    (selector: (s: typeof state) => unknown) => selector(state),
    { getState: () => state, setState },
  );
  return { state, setState, useDesignerStore };
});

vi.mock('@/state/designerStore', () => ({ useDesignerStore: store.useDesignerStore }));

import { ValidationRulesPanel } from '@/designer/properties/panels/ValidationRulesPanel';

function openApiRuleForm() {
  render(
    <FluentProvider theme={webLightTheme}>
      <ValidationRulesPanel fieldId="f1" />
    </FluentProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
  fireEvent.change(screen.getByLabelText('Rule Type'), { target: { value: 'api_validation' } });
}

function saveButton(): HTMLElement {
  const buttons = screen.getAllByRole('button', { name: 'Add Rule' });
  return buttons[buttons.length - 1]!;
}

describe('ValidationRulesPanel API Validation', () => {
  beforeEach(() => {
    store.setState.mockClear();
    store.state.validationRules = {};
  });

  it('ValidationRulesPanel_ApiRuleWithoutKey_CannotBeSaved', () => {
    openApiRuleForm();

    expect(saveButton()).toBeDisabled();
  });

  it('ValidationRulesPanel_ApiRuleWithKey_SavesTheTrimmedKey', () => {
    openApiRuleForm();
    fireEvent.change(screen.getByLabelText(/Validation key/), { target: { value: ' IBAN ' } });

    fireEvent.click(saveButton());

    const saved = Object.values(store.state.validationRules as Record<string, unknown>);
    expect(saved).toEqual([expect.objectContaining({ ruleType: 'api_validation', validationKey: 'IBAN' })]);
  });
});
