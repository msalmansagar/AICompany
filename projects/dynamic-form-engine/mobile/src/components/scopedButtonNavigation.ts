// scopedButtonNavigation (mobile) — DFE-BTN-001 in-form navigation resolution.
//
// Pure tab-index resolution for the React Native renderer. The mobile TabDefinition
// (shared/src/types/form.ts) has no isVisible/requiresPreviousTabComplete fields, so
// BR-001 (skip invisible) and BR-002 (completion gate) do not apply on mobile — next/
// previous are simple bounded steps. Section scroll is G-3 gated; externalUrl/
// anotherForm/callApi are gated — all resolve to null (no tab change) here.

import type { NavigateActionConfig, TabDefinition } from '@qdb/shared';

export function resolveNavigationTabIndex(
  action: NavigateActionConfig,
  tabs: readonly TabDefinition[],
  activeTabIndex: number,
): number | null {
  switch (action.target) {
    case 'tab': {
      const index = tabs.findIndex((tab) => tab.tabId === action.targetTabId);
      return index >= 0 ? index : null;
    }
    case 'nextStep': {
      const next = activeTabIndex + 1;
      return next < tabs.length ? next : null;
    }
    case 'previousStep': {
      const prev = activeTabIndex - 1;
      return prev >= 0 ? prev : null;
    }
    default:
      return null;
  }
}
