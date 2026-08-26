// Business rules were reachable only from the command bar, and the editor that opened had no
// idea which element the maker had been looking at. A rule that hides a tab therefore had to
// be aimed by hand every time. Asking for a rule from a tab now carries the tab with it.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDesignerStore } from '@/state/designerStore';
import { buildDefaultDefinition } from '@/screens/ruleDefaults';

describe('designerStore — requesting a rule for a tab', () => {
  beforeEach(() => {
    useDesignerStore.setState({ pendingRuleCreationTarget: null, currentScreen: 'designer' });
  });

  it('recordsTheTabAsThePendingTarget', () => {
    useDesignerStore.getState().requestRuleForTab('tab-7');

    expect(useDesignerStore.getState().pendingRuleCreationTarget).toEqual({ type: 'tab', id: 'tab-7' });
  });

  it('opensTheRuleEditor', () => {
    useDesignerStore.getState().requestRuleForTab('tab-7');

    expect(useDesignerStore.getState().currentScreen).toBe('rule-config');
  });

  // The target is consumed once. Leaving it set would seed a fresh rule every later visit.
  it('isClearedOnceConsumed', () => {
    useDesignerStore.getState().requestRuleForTab('tab-7');

    useDesignerStore.getState().clearPendingRuleCreationTarget();

    expect(useDesignerStore.getState().pendingRuleCreationTarget).toBeNull();
  });
});

describe('buildDefaultDefinition', () => {
  const fieldCodes = ['qdb_supplier', 'qdb_amount'];

  it('defaultsToShowingAField_whenNoTargetIsRequested', () => {
    const definition = buildDefaultDefinition(fieldCodes, null);

    expect(definition.actions[0].action_type).toBe('show_field');
  });

  it('aimsAtTheTab_whenATabWasRequested', () => {
    const definition = buildDefaultDefinition(fieldCodes, { type: 'tab', id: 'tab-7' });

    expect(definition.actions[0].action_type).toBe('hide_tab');
    expect(definition.actions[0].target_tab_id).toBe('tab-7');
  });

  // Hide is the useful default: a tab is visible until a rule says otherwise, so a rule that
  // shows an already-visible tab does nothing the maker can see.
  it('doesNotCarryAFieldTarget_whenAimedAtATab', () => {
    const definition = buildDefaultDefinition(fieldCodes, { type: 'tab', id: 'tab-7' });

    expect(definition.actions[0].target_field_code).toBeUndefined();
  });

  it('stillSeedsTheTriggerFromTheFirstField', () => {
    const definition = buildDefaultDefinition(fieldCodes, { type: 'tab', id: 'tab-7' });

    expect(definition.trigger_field_code).toBe('qdb_supplier');
  });
});
