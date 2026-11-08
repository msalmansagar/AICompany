// Every rule used to be re-read on every keystroke: trigger_event existed in the designer's
// saved JSON but no engine ever looked at it. The four events differ only in WHICH moment's
// field values a rule's conditions are read against — that is what makes the choice visible
// to a user rather than a setting that stores and does nothing.

import { describe, it, expect } from 'vitest';
import type { BusinessRule } from '@qdb/shared';
import { RuleEngine } from './RuleEngine';

const TAB = 'tab-delivery';
const engine = new RuleEngine();

function hideTabWhenSupplierIs(value: string, triggerEvent?: string): BusinessRule {
  return {
    id: `rule-${triggerEvent ?? 'default'}`,
    name: 'Hide Delivery Details',
    triggerEvent,
    conditions: [{ fieldId: 'qdb_supplier', operator: 'equals', value }],
    conditionsLogic: 'AND',
    action: 'hideTab',
    targetTabId: TAB,
    priority: 1,
    isActive: true,
  } as unknown as BusinessRule;
}

const hidden = (r: { tabVisibility: Record<string, boolean> }) => r.tabVisibility[TAB] === false;

describe('RuleEngine — on_change (and rules with no trigger event)', () => {
  it('readsTheLiveValue', async () => {
    const result = await engine.evaluate([hideTabWhenSupplierIs('QNB', 'on_change')], { qdb_supplier: 'QNB' });

    expect(hidden(result)).toBe(true);
  });

  // Rules published before trigger events existed must keep behaving exactly as they did.
  it('treatsAMissingTriggerEventAsOnChange', async () => {
    const result = await engine.evaluate([hideTabWhenSupplierIs('QNB')], { qdb_supplier: 'QNB' });

    expect(hidden(result)).toBe(true);
  });

  it('stopsMatchingAsSoonAsTheLiveValueChanges', async () => {
    const result = await engine.evaluate([hideTabWhenSupplierIs('QNB', 'on_change')], { qdb_supplier: 'Other' });

    expect(result.tabVisibility[TAB]).toBeUndefined();
  });
});

describe('RuleEngine — on_load', () => {
  it('readsTheValuesTheFormLoadedWith_notTheLiveOnes', async () => {
    const result = await engine.evaluate(
      [hideTabWhenSupplierIs('QNB', 'on_load')],
      { qdb_supplier: 'Changed since load' },
      { atLoad: { qdb_supplier: 'QNB' } },
    );

    expect(hidden(result)).toBe(true);
  });

  it('doesNotReactToLaterEdits', async () => {
    const result = await engine.evaluate(
      [hideTabWhenSupplierIs('QNB', 'on_load')],
      { qdb_supplier: 'QNB' },
      { atLoad: { qdb_supplier: 'something else' } },
    );

    expect(result.tabVisibility[TAB]).toBeUndefined();
  });
});

describe('RuleEngine — on_blur', () => {
  it('readsTheValueAsAtTheLastBlur', async () => {
    const result = await engine.evaluate(
      [hideTabWhenSupplierIs('QNB', 'on_blur')],
      { qdb_supplier: 'QN' },
      { atLastBlur: { qdb_supplier: 'QNB' } },
    );

    expect(hidden(result)).toBe(true);
  });

  // The whole point of on_blur: a half-typed value must not fire the rule.
  it('ignoresTypingThatHasNotBlurredYet', async () => {
    const result = await engine.evaluate(
      [hideTabWhenSupplierIs('QNB', 'on_blur')],
      { qdb_supplier: 'QNB' },
      { atLastBlur: { qdb_supplier: 'QN' } },
    );

    expect(result.tabVisibility[TAB]).toBeUndefined();
  });
});

describe('RuleEngine — on_save', () => {
  it('doesNotFireBeforeASaveHasBeenAttempted', async () => {
    const result = await engine.evaluate(
      [hideTabWhenSupplierIs('QNB', 'on_save')],
      { qdb_supplier: 'QNB' },
      { atSave: null },
    );

    expect(result.tabVisibility[TAB]).toBeUndefined();
  });

  it('firesAgainstTheValuesSubmitted', async () => {
    const result = await engine.evaluate(
      [hideTabWhenSupplierIs('QNB', 'on_save')],
      { qdb_supplier: 'edited after submitting' },
      { atSave: { qdb_supplier: 'QNB' } },
    );

    expect(hidden(result)).toBe(true);
  });
});

describe('RuleEngine — rules with different trigger events on one form', () => {
  // Each rule is read against its own moment, and all their effects land in one result.
  it('evaluatesEachAgainstItsOwnMoment', async () => {
    const onLoadRule = { ...hideTabWhenSupplierIs('AtLoad', 'on_load'), targetTabId: 'tab-a' } as BusinessRule;
    const onChangeRule = { ...hideTabWhenSupplierIs('Live', 'on_change'), targetTabId: 'tab-b' } as BusinessRule;

    const result = await engine.evaluate(
      [onLoadRule, onChangeRule],
      { qdb_supplier: 'Live' },
      { atLoad: { qdb_supplier: 'AtLoad' } },
    );

    expect(result.tabVisibility['tab-a']).toBe(false);
    expect(result.tabVisibility['tab-b']).toBe(false);
  });

  // Falling back to the live values keeps a caller that supplies no moments working.
  it('fallsBackToLiveValues_whenNoMomentsAreSupplied', async () => {
    const result = await engine.evaluate([hideTabWhenSupplierIs('QNB', 'on_load')], { qdb_supplier: 'QNB' });

    expect(hidden(result)).toBe(true);
  });
});
