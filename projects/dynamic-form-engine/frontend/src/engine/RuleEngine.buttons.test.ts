// DFE-CBTN-001 — RuleEngine.evaluateButtons: per-button conditional visibility
// and enablement, reusing the same operator machinery as evaluate().
import { describe, it, expect, beforeEach } from 'vitest';
import { RuleEngine } from './RuleEngine';
import type { ScopedButton, ButtonConditionSet, FormFieldValues } from '@qdb/shared';

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

const statusIsSubmitted: ButtonConditionSet = {
  conditions: [{ fieldId: 'status', operator: 'equals', value: 'submitted' }],
  logic: 'AND',
};

describe('RuleEngine.evaluateButtons', () => {
  let engine: RuleEngine;
  beforeEach(() => {
    engine = new RuleEngine();
  });

  it('returns empty maps when no button declares a condition set', async () => {
    const result = await engine.evaluateButtons([makeButton('b1'), makeButton('b2')], {});
    expect(result.buttonVisibility).toEqual({});
    expect(result.buttonEnabledState).toEqual({});
  });

  it('sets visibility true when visibleWhen matches', async () => {
    const button = makeButton('approve', { visibleWhen: statusIsSubmitted });
    const values: FormFieldValues = { status: 'submitted' };
    const result = await engine.evaluateButtons([button], values);
    expect(result.buttonVisibility['approve']).toBe(true);
  });

  it('sets visibility false when visibleWhen does not match', async () => {
    const button = makeButton('approve', { visibleWhen: statusIsSubmitted });
    const values: FormFieldValues = { status: 'draft' };
    const result = await engine.evaluateButtons([button], values);
    expect(result.buttonVisibility['approve']).toBe(false);
  });

  it('honours OR logic across conditions', async () => {
    const orSet: ButtonConditionSet = {
      conditions: [
        { fieldId: 'status', operator: 'equals', value: 'submitted' },
        { fieldId: 'status', operator: 'equals', value: 'review' },
      ],
      logic: 'OR',
    };
    const button = makeButton('approve', { visibleWhen: orSet });
    const matched = await engine.evaluateButtons([button], { status: 'review' });
    expect(matched.buttonVisibility['approve']).toBe(true);
    const unmatched = await engine.evaluateButtons([button], { status: 'draft' });
    expect(unmatched.buttonVisibility['approve']).toBe(false);
  });

  it('honours AND logic (all conditions must hold)', async () => {
    const andSet: ButtonConditionSet = {
      conditions: [
        { fieldId: 'status', operator: 'equals', value: 'submitted' },
        { fieldId: 'amount', operator: 'greaterThan', value: 0 },
      ],
      logic: 'AND',
    };
    const button = makeButton('approve', { visibleWhen: andSet });
    const all = await engine.evaluateButtons([button], { status: 'submitted', amount: 5 });
    expect(all.buttonVisibility['approve']).toBe(true);
    const partial = await engine.evaluateButtons([button], { status: 'submitted', amount: 0 });
    expect(partial.buttonVisibility['approve']).toBe(false);
  });

  it('evaluates enabledWhen independently into buttonEnabledState', async () => {
    const button = makeButton('submit', { enabledWhen: statusIsSubmitted });
    const enabled = await engine.evaluateButtons([button], { status: 'submitted' });
    expect(enabled.buttonEnabledState['submit']).toBe(true);
    expect(enabled.buttonVisibility['submit']).toBeUndefined();
    const disabled = await engine.evaluateButtons([button], { status: 'draft' });
    expect(disabled.buttonEnabledState['submit']).toBe(false);
  });

  it('omits a button from maps for the axis it does not declare', async () => {
    const button = makeButton('mixed', { visibleWhen: statusIsSubmitted });
    const result = await engine.evaluateButtons([button], { status: 'submitted' });
    expect(result.buttonVisibility['mixed']).toBe(true);
    expect(result.buttonEnabledState['mixed']).toBeUndefined();
  });
});
