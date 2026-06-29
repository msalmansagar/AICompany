// useScopedButtonAction — DFE-BTN-001 click dispatcher for tab/section buttons.
//
// Maps a clicked ScopedButton to its runtime behaviour using FormContext. Cleared
// scope: in-form navigation (tab/section/nextStep/previousStep), finalSubmit (with
// the button id so the backend resolves its extra-params), and saveDraft.
// externalUrl and callApi are gated on G-1; anotherForm awaits portal router wiring
// — all three log and no-op rather than guess.

import { useCallback } from 'react';
import type { ScopedButton, NavigateActionConfig } from '@qdb/shared';
import { useFormContext } from '../../contexts/FormContext';
import { logger } from '../../utils/logger';
import { resolveNavigationTabIndex } from './scopedButtonNavigation';

export function useScopedButtonAction(): (button: ScopedButton) => void {
  const { formDefinition, activeTabIndex, setActiveTabIndex, submitForm, saveDraft } = useFormContext();

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
        const targetIndex = resolveNavigationTabIndex(nav, formDefinition?.tabs ?? [], activeTabIndex);
        if (targetIndex !== null) setActiveTabIndex(targetIndex);
      }
    },
    [formDefinition, activeTabIndex, setActiveTabIndex, submitForm, saveDraft],
  );
}
