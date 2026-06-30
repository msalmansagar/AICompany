import type { NavigateActionConfig, TabDefinition } from '@qdb/shared';
import { resolveNavigationTabIndex } from './scopedButtonNavigation';

const tabs = [{ tabId: 'a' }, { tabId: 'b' }, { tabId: 'c' }] as unknown as TabDefinition[];

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

  it('returns null for section / externalUrl / anotherForm (gated on mobile)', () => {
    expect(resolveNavigationTabIndex(nav({ target: 'section', targetSectionId: 's' }), tabs, 0)).toBeNull();
    expect(resolveNavigationTabIndex(nav({ target: 'externalUrl', externalUrlKey: 'k' }), tabs, 0)).toBeNull();
    expect(resolveNavigationTabIndex(nav({ target: 'anotherForm', targetFormCode: 'f' }), tabs, 0)).toBeNull();
  });
});
