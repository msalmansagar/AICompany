// RED — failing until RuleEngine is wired correctly
import { describe, it, expect, beforeEach } from 'vitest';
import { RuleEngine } from './RuleEngine';
import type { BusinessRule, FormFieldValues } from '@dfe/shared';

describe('RuleEngine', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  it('evaluate_returnsEmptyResult_whenNoRulesProvided', async () => {
    const result = await engine.evaluate([], {});

    expect(result.fieldVisibility).toEqual({});
    expect(result.sectionVisibility).toEqual({});
    expect(result.tabVisibility).toEqual({});
    expect(result.fieldRequired).toEqual({});
    expect(result.fieldReadonly).toEqual({});
    expect(result.fieldValues).toEqual({});
  });

  it('evaluate_hidesField_whenConditionMatches', async () => {
    const rule: BusinessRule = {
      id: 'rule-1',
      name: 'Hide field when status is inactive',
      conditions: [{ fieldId: 'status', operator: 'equals', value: 'inactive' }],
      conditionsLogic: 'AND',
      action: 'hideField',
      targetFieldId: 'details',
      priority: 1,
      isActive: true,
    };

    const fieldValues: FormFieldValues = { status: 'inactive' };
    const result = await engine.evaluate([rule], fieldValues);

    expect(result.fieldVisibility['details']).toBe(false);
  });

  it('evaluate_showsField_whenConditionMatches', async () => {
    const rule: BusinessRule = {
      id: 'rule-2',
      name: 'Show field when type is business',
      conditions: [{ fieldId: 'type', operator: 'equals', value: 'business' }],
      conditionsLogic: 'AND',
      action: 'showField',
      targetFieldId: 'companyName',
      priority: 1,
      isActive: true,
    };

    const result = await engine.evaluate([rule], { type: 'business' });

    expect(result.fieldVisibility['companyName']).toBe(true);
  });

  it('evaluate_doesNotFireRule_whenConditionDoesNotMatch', async () => {
    const rule: BusinessRule = {
      id: 'rule-3',
      name: 'Hide field on mismatch',
      conditions: [{ fieldId: 'status', operator: 'equals', value: 'inactive' }],
      conditionsLogic: 'AND',
      action: 'hideField',
      targetFieldId: 'details',
      priority: 1,
      isActive: true,
    };

    const result = await engine.evaluate([rule], { status: 'active' });

    expect(result.fieldVisibility['details']).toBeUndefined();
  });

  it('evaluate_skipsInactiveRule', async () => {
    const rule: BusinessRule = {
      id: 'rule-4',
      name: 'Inactive rule',
      conditions: [{ fieldId: 'status', operator: 'equals', value: 'inactive' }],
      conditionsLogic: 'AND',
      action: 'hideField',
      targetFieldId: 'details',
      priority: 1,
      isActive: false,
    };

    const result = await engine.evaluate([rule], { status: 'inactive' });

    expect(result.fieldVisibility['details']).toBeUndefined();
  });

  it('evaluate_makesFieldRequired_whenConditionMatches', async () => {
    const rule: BusinessRule = {
      id: 'rule-5',
      name: 'Require phone when sms consent given',
      conditions: [{ fieldId: 'smsConsent', operator: 'equals', value: true }],
      conditionsLogic: 'AND',
      action: 'makeRequired',
      targetFieldId: 'phoneNumber',
      priority: 1,
      isActive: true,
    };

    const result = await engine.evaluate([rule], { smsConsent: true });

    expect(result.fieldRequired['phoneNumber']).toBe(true);
  });

  it('evaluate_setsFieldValue_whenSetValueActionFires', async () => {
    const rule: BusinessRule = {
      id: 'rule-6',
      name: 'Set country to US when zip detected',
      conditions: [{ fieldId: 'zipPrefix', operator: 'equals', value: 'US' }],
      conditionsLogic: 'AND',
      action: 'setValue',
      targetFieldId: 'country',
      actionValue: 'United States',
      priority: 1,
      isActive: true,
    };

    const result = await engine.evaluate([rule], { zipPrefix: 'US' });

    expect(result.fieldValues['country']).toBe('United States');
  });

  it('evaluate_hidesSection_whenHideSectionActionFires', async () => {
    const rule: BusinessRule = {
      id: 'rule-7',
      name: 'Hide address section for digital-only',
      conditions: [{ fieldId: 'deliveryType', operator: 'equals', value: 'digital' }],
      conditionsLogic: 'AND',
      action: 'hideSection',
      targetSectionId: 'section-address',
      priority: 1,
      isActive: true,
    };

    const result = await engine.evaluate([rule], { deliveryType: 'digital' });

    expect(result.sectionVisibility['section-address']).toBe(false);
  });

  it('evaluate_usesORLogic_whenConditionsLogicIsOR', async () => {
    const rule: BusinessRule = {
      id: 'rule-8',
      name: 'Hide tab when either condition is true',
      conditions: [
        { fieldId: 'typeA', operator: 'equals', value: 'skip' },
        { fieldId: 'typeB', operator: 'equals', value: 'skip' },
      ],
      conditionsLogic: 'OR',
      action: 'hideTab',
      targetTabId: 'tab-advanced',
      priority: 1,
      isActive: true,
    };

    const result = await engine.evaluate([rule], { typeA: 'other', typeB: 'skip' });

    expect(result.tabVisibility['tab-advanced']).toBe(false);
  });
});
