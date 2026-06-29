import { describe, it, expect } from 'vitest';
import type { NavigateActionConfig, TabDefinition } from '@qdb/shared';
import { resolveNavigationTabIndex } from './scopedButtonNavigation';

const tabs = [
  { id: 'tab-a' },
  { id: 'tab-b' },
  { id: 'tab-c' },
] as unknown as TabDefinition[];

const nav = (overrides: Partial<NavigateActionConfig>): NavigateActionConfig => ({
  type: 'navigate',
  target: 'nextStep',
  ...overrides,
});

describe('resolveNavigationTabIndex', () => {
  it('resolves_a_tab_target_to_its_index', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'tab', targetTabId: 'tab-c' }), tabs, 0)).toBe(2);
  });

  it('returns_null_for_an_unknown_tab_target', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'tab', targetTabId: 'nope' }), tabs, 0)).toBeNull();
  });

  it('advances_one_step_on_nextStep', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'nextStep' }), tabs, 0)).toBe(1);
  });

  it('clamps_nextStep_at_the_last_tab', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'nextStep' }), tabs, 2)).toBe(2);
  });

  it('goes_back_one_step_on_previousStep', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'previousStep' }), tabs, 2)).toBe(1);
  });

  it('clamps_previousStep_at_the_first_tab', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'previousStep' }), tabs, 0)).toBe(0);
  });

  it('returns_null_for_section_scroll (handled elsewhere)', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'section', targetSectionId: 's1' }), tabs, 0)).toBeNull();
  });

  it('returns_null_for_externalUrl_and_anotherForm (gated/deferred)', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'externalUrl', externalUrlKey: 'k' }), tabs, 0)).toBeNull();
    expect(resolveNavigationTabIndex(nav({ target: 'anotherForm', targetFormCode: 'x' }), tabs, 0)).toBeNull();
  });
});
