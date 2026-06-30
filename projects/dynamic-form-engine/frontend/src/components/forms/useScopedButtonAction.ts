// useScopedButtonAction — DFE-BTN-001 click dispatcher for tab/section buttons.
//
// Maps a clicked ScopedButton to its runtime behaviour using FormContext. Cleared
// scope: in-form navigation (tab/section/nextStep/previousStep — skipping invisible
// tabs per BR-001 and blocking a requiresPreviousTabComplete target with incomplete
// preceding fields per BR-002), finalSubmit (with the button id so the backend
// resolves its extra-params), and saveDraft. externalUrl and callApi are gated on
// G-1; anotherForm awaits portal router wiring — all three log and no-op.

import { useCallback } from 'react';
import type { ScopedButton, NavigateActionConfig, TabDefinition } from '@qdb/shared';
import { useFormContext } from '../../contexts/FormContext';
import { logger } from '../../utils/logger';
import { resolveNavigationTabIndex, arePrecedingTabsComplete } from './scopedButtonNavigation';

export function useScopedButtonAction(): (button: ScopedButton) => void {
  const { formDefinition, ruleState, fieldValues, activeTabIndex, setActiveTabIndex, submitForm, saveDraft } =
    useFormContext();

  return useCallback(
    (button: ScopedButton) => {
      const action = button.action;
      switch (action.type) {
        case 'saveDraft':
          void saveDraft();
          return;
        case 'finalSubmit':
          void submitForm(button.id);
          return;
        case 'callApi':
          logger.warn('scoped_button_callapi_gated', { buttonId: button.id });
          return;
        case 'navigate':
          dispatchNavigate(action, button.id);
          return;
      }

      function dispatchNavigate(nav: NavigateActionConfig, buttonId: string): void {
        if (nav.target === 'section') {
          if (nav.targetSectionId) {
            document
              .getElementById(`section-${nav.targetSectionId}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          return;
        }
        if (nav.target === 'externalUrl' || nav.target === 'anotherForm') {
          logger.warn('scoped_button_navigation_gated', { buttonId, target: nav.target });
          return;
        }

        const tabs = formDefinition?.tabs ?? [];
        const isTabVisible = (tab: TabDefinition) => ruleState.tabVisibility[tab.id] ?? tab.isVisible;
        const targetIndex = resolveNavigationTabIndex({ action: nav, tabs, activeTabIndex, isTabVisible });
        if (targetIndex === null) return;

        // BR-002: do not navigate to a tab requiring prior completion while preceding
        // required fields are incomplete.
        const targetTab = tabs[targetIndex];
        const mustBeComplete =
          targetTab.requiresPreviousTabComplete === true || nav.requiresPreviousTabsComplete === true;
        if (mustBeComplete && !arePrecedingTabsComplete({ tabs, ruleState, fieldValues, targetTabIndex: targetIndex })) {
          logger.warn('scoped_button_nav_blocked_incomplete', { buttonId, targetTabId: targetTab.id });
          return;
        }
        setActiveTabIndex(targetIndex);
      }
    },
    [formDefinition, ruleState, fieldValues, activeTabIndex, setActiveTabIndex, submitForm, saveDraft],
  );
}
