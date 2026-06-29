// scopedButtonNavigation — DFE-BTN-001 in-form navigation resolution (pure).
//
// Maps a navigate action to the tab index the renderer should switch to. Kept
// pure (no React, no DOM) so the stepping/bounds logic is unit-tested directly.
// Section scrolling, external URL, and another-form navigation are handled by the
// hook (DOM side-effects / gated), not here.

import type { NavigateActionConfig, TabDefinition } from '@qdb/shared';

/**
 * Returns the tab index to activate for a navigate action, or null when the
 * action does not change the active tab (section scroll, externalUrl, anotherForm,
 * or an unresolvable targetTabId).
 */
export function resolveNavigationTabIndex(
  action: NavigateActionConfig,
  tabs: readonly TabDefinition[],
  activeTabIndex: number,
): number | null {
  switch (action.target) {
    case 'tab': {
      const index = tabs.findIndex((tab) => tab.id === action.targetTabId);
      return index >= 0 ? index : null;
    }
    case 'nextStep':
      return tabs.length === 0 ? null : Math.min(activeTabIndex + 1, tabs.length - 1);
    case 'previousStep':
      return Math.max(activeTabIndex - 1, 0);
    default:
      return null;
  }
}
