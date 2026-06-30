import { describe, it, expect } from 'vitest';
import type { NavigateActionConfig, TabDefinition, RuleEvaluationResult } from '@qdb/shared';
import { resolveNavigationTabIndex, arePrecedingTabsComplete } from './scopedButtonNavigation';

const tabs = [
  { id: 'tab-a', isVisible: true },
  { id: 'tab-b', isVisible: true },
  { id: 'tab-c', isVisible: true },
] as unknown as TabDefinition[];

const allVisible = () => true;

const nav = (overrides: Partial<NavigateActionConfig>): NavigateActionConfig => ({
  type: 'navigate',
  target: 'nextStep',
  ...overrides,
});

describe('resolveNavigationTabIndex', () => {
  it('resolves_a_tab_target_to_its_index', () => {
    expect(
      resolveNavigationTabIndex({ action: nav({ target: 'tab', targetTabId: 'tab-c' }), tabs, activeTabIndex: 0, isTabVisible: allVisible }),
    ).toBe(2);
  });

  it('returns_null_for_an_unknown_tab_target', () => {
    expect(
      resolveNavigationTabIndex({ action: nav({ target: 'tab', targetTabId: 'nope' }), tabs, activeTabIndex: 0, isTabVisible: allVisible }),
    ).toBeNull();
  });

  it('advances_one_step_on_nextStep', () => {
    expect(
      resolveNavigationTabIndex({ action: nav({ target: 'nextStep' }), tabs, activeTabIndex: 0, isTabVisible: allVisible }),
    ).toBe(1);
  });

  it('returns_null_on_nextStep_from_the_last_tab (stays put)', () => {
    expect(
      resolveNavigationTabIndex({ action: nav({ target: 'nextStep' }), tabs, activeTabIndex: 2, isTabVisible: allVisible }),
    ).toBeNull();
  });

  it('goes_back_one_step_on_previousStep', () => {
    expect(
      resolveNavigationTabIndex({ action: nav({ target: 'previousStep' }), tabs, activeTabIndex: 2, isTabVisible: allVisible }),
    ).toBe(1);
  });

  it('returns_null_on_previousStep_from_the_first_tab', () => {
    expect(
      resolveNavigationTabIndex({ action: nav({ target: 'previousStep' }), tabs, activeTabIndex: 0, isTabVisible: allVisible }),
    ).toBeNull();
  });

  it('skips_an_invisible_tab_on_nextStep (BR-001 / DEF-002)', () => {
    const isTabVisible = (tab: TabDefinition) => tab.id !== 'tab-b';
    expect(
      resolveNavigationTabIndex({ action: nav({ target: 'nextStep' }), tabs, activeTabIndex: 0, isTabVisible }),
    ).toBe(2);
  });

  it('returns_null_for_section_externalUrl_anotherForm', () => {
    expect(resolveNavigationTabIndex({ action: nav({ target: 'section', targetSectionId: 's' }), tabs, activeTabIndex: 0, isTabVisible: allVisible })).toBeNull();
    expect(resolveNavigationTabIndex({ action: nav({ target: 'externalUrl', externalUrlKey: 'k' }), tabs, activeTabIndex: 0, isTabVisible: allVisible })).toBeNull();
    expect(resolveNavigationTabIndex({ action: nav({ target: 'anotherForm', targetFormCode: 'x' }), tabs, activeTabIndex: 0, isTabVisible: allVisible })).toBeNull();
  });
});

const emptyRuleState = {
  fieldVisibility: {},
  sectionVisibility: {},
  tabVisibility: {},
  fieldRequired: {},
  fieldReadonly: {},
} as unknown as RuleEvaluationResult;

const completionTabs = [
  {
    id: 't0',
    isVisible: true,
    sections: [
      { id: 's0', fields: [{ id: 'f1', schemaName: 'qdb_name', isVisible: true, isRequired: true }] },
    ],
  },
  { id: 't1', isVisible: true, sections: [] },
] as unknown as TabDefinition[];

describe('arePrecedingTabsComplete (BR-002 / DEF-003)', () => {
  it('returns_true_when_required_preceding_fields_are_filled', () => {
    expect(
      arePrecedingTabsComplete({ tabs: completionTabs, ruleState: emptyRuleState, fieldValues: { qdb_name: 'Ada' }, targetTabIndex: 1 }),
    ).toBe(true);
  });

  it('returns_false_when_a_required_preceding_field_is_empty', () => {
    expect(
      arePrecedingTabsComplete({ tabs: completionTabs, ruleState: emptyRuleState, fieldValues: {}, targetTabIndex: 1 }),
    ).toBe(false);
  });

  it('returns_true_when_target_is_the_first_tab (no preceding fields)', () => {
    expect(
      arePrecedingTabsComplete({ tabs: completionTabs, ruleState: emptyRuleState, fieldValues: {}, targetTabIndex: 0 }),
    ).toBe(true);
  });
});
