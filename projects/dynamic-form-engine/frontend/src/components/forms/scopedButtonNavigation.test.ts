import { describe, it, expect } from 'vitest';
import type { NavigateActionConfig, TabDefinition, SectionDefinition, RuleEvaluationResult } from '@qdb/shared';
import {
  resolveNavigationTabIndex,
  arePrecedingTabsComplete,
  resolveNavigationSectionIndex,
  isSectionComplete,
} from './scopedButtonNavigation';

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

// ── Section stepping (reveal sections one at a time) ──────────────────────────

const sections = [
  { id: 'sec-1', isVisible: true, fields: [] },
  { id: 'sec-2', isVisible: true, fields: [] },
  { id: 'sec-3', isVisible: true, fields: [] },
] as unknown as SectionDefinition[];

const allSectionsVisible = () => true;

describe('resolveNavigationSectionIndex', () => {
  it('advances_to_the_next_section', () => {
    expect(
      resolveNavigationSectionIndex({ action: nav({ target: 'nextSection' }), sections, activeSectionIndex: 0, isSectionVisible: allSectionsVisible }),
    ).toBe(1);
  });

  it('goes_back_to_the_previous_section', () => {
    expect(
      resolveNavigationSectionIndex({ action: nav({ target: 'previousSection' }), sections, activeSectionIndex: 2, isSectionVisible: allSectionsVisible }),
    ).toBe(1);
  });

  it('returns_null_past_the_last_section', () => {
    expect(
      resolveNavigationSectionIndex({ action: nav({ target: 'nextSection' }), sections, activeSectionIndex: 2, isSectionVisible: allSectionsVisible }),
    ).toBeNull();
  });

  it('returns_null_before_the_first_section', () => {
    expect(
      resolveNavigationSectionIndex({ action: nav({ target: 'previousSection' }), sections, activeSectionIndex: 0, isSectionVisible: allSectionsVisible }),
    ).toBeNull();
  });

  it('steps_over_a_section_hidden_by_a_rule', () => {
    const skipMiddle = (_s: SectionDefinition, index: number) => index !== 1;
    expect(
      resolveNavigationSectionIndex({ action: nav({ target: 'nextSection' }), sections, activeSectionIndex: 0, isSectionVisible: skipMiddle }),
    ).toBe(2);
  });

  it('ignores_tab_stepping_targets', () => {
    expect(
      resolveNavigationSectionIndex({ action: nav({ target: 'nextStep' }), sections, activeSectionIndex: 0, isSectionVisible: allSectionsVisible }),
    ).toBeNull();
  });
});

describe('isSectionComplete', () => {
  const emptyRules = { fieldVisibility: {}, fieldRequired: {}, tabVisibility: {}, sectionVisibility: {} } as unknown as RuleEvaluationResult;

  const sectionWith = (fields: unknown[]): SectionDefinition =>
    ({ id: 'sec', isVisible: true, fields } as unknown as SectionDefinition);

  it('passes_when_a_required_field_has_a_value', () => {
    const section = sectionWith([{ id: 'f1', schemaName: 'cr', isVisible: true, isRequired: true }]);
    expect(isSectionComplete({ section, ruleState: emptyRules, fieldValues: { cr: '123' } })).toBe(true);
  });

  it('fails_when_a_required_field_is_empty', () => {
    const section = sectionWith([{ id: 'f1', schemaName: 'cr', isVisible: true, isRequired: true }]);
    expect(isSectionComplete({ section, ruleState: emptyRules, fieldValues: { cr: '  ' } })).toBe(false);
  });

  it('ignores_an_optional_empty_field', () => {
    const section = sectionWith([{ id: 'f1', schemaName: 'cr', isVisible: true, isRequired: false }]);
    expect(isSectionComplete({ section, ruleState: emptyRules, fieldValues: {} })).toBe(true);
  });

  it('does_not_block_on_a_required_field_hidden_by_a_rule', () => {
    const section = sectionWith([{ id: 'f1', schemaName: 'cr', isVisible: true, isRequired: true }]);
    const hidden = { ...emptyRules, fieldVisibility: { f1: false } } as unknown as RuleEvaluationResult;
    expect(isSectionComplete({ section, ruleState: hidden, fieldValues: {} })).toBe(true);
  });

  it('blocks_on_a_field_made_required_by_a_rule', () => {
    const section = sectionWith([{ id: 'f1', schemaName: 'cr', isVisible: true, isRequired: false }]);
    const required = { ...emptyRules, fieldRequired: { f1: true } } as unknown as RuleEvaluationResult;
    expect(isSectionComplete({ section, ruleState: required, fieldValues: {} })).toBe(false);
  });
});
