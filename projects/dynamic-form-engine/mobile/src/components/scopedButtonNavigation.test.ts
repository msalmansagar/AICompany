import type { NavigateActionConfig, TabDefinition } from '@qdb/shared';
import { resolveNavigationTabIndex, resolveSectionTabIndex } from './scopedButtonNavigation';

const tabs = [{ tabId: 'a' }, { tabId: 'b' }, { tabId: 'c' }] as unknown as TabDefinition[];

const sectionTabs = [
  { tabId: 'a', sections: [{ sectionId: 'sec-1' }, { sectionId: 'sec-2' }] },
  { tabId: 'b', sections: [{ sectionId: 'sec-3' }] },
] as unknown as TabDefinition[];

const nav = (overrides: Partial<NavigateActionConfig>): NavigateActionConfig => ({
  type: 'navigate',
  target: 'nextStep',
  ...overrides,
});

describe('resolveNavigationTabIndex (mobile)', () => {
  it('resolves a tab target by tabId', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'tab', targetTabId: 'c' }), tabs, 0)).toBe(2);
  });

  it('returns null for an unknown tab target', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'tab', targetTabId: 'x' }), tabs, 0)).toBeNull();
  });

  it('advances on nextStep', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'nextStep' }), tabs, 0)).toBe(1);
  });

  it('returns null on nextStep from the last tab', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'nextStep' }), tabs, 2)).toBeNull();
  });

  it('goes back on previousStep', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'previousStep' }), tabs, 2)).toBe(1);
  });

  it('returns null on previousStep from the first tab', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'previousStep' }), tabs, 0)).toBeNull();
  });

  it('returns null for section / externalUrl / anotherForm (handled elsewhere / gated)', () => {
    // section is resolved by resolveSectionTabIndex, not this function
    expect(resolveNavigationTabIndex(nav({ target: 'section', targetSectionId: 's' }), tabs, 0)).toBeNull();
    expect(resolveNavigationTabIndex(nav({ target: 'externalUrl', externalUrlKey: 'k' }), tabs, 0)).toBeNull();
    expect(resolveNavigationTabIndex(nav({ target: 'anotherForm', targetFormCode: 'f' }), tabs, 0)).toBeNull();
  });
});

describe('resolveSectionTabIndex (mobile)', () => {
  it('finds the tab that owns the section', () => {
    expect(resolveSectionTabIndex('sec-3', sectionTabs)).toBe(1);
    expect(resolveSectionTabIndex('sec-1', sectionTabs)).toBe(0);
  });

  it('matches the section id case-insensitively', () => {
    expect(resolveSectionTabIndex('SEC-3', sectionTabs)).toBe(1);
  });

  it('returns null when no tab contains the section', () => {
    expect(resolveSectionTabIndex('sec-missing', sectionTabs)).toBeNull();
  });
});
