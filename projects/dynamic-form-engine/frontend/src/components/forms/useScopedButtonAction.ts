// useScopedButtonAction — DFE-BTN-001 click dispatcher for tab/section buttons.
//
// Maps a clicked ScopedButton to its runtime behaviour using FormContext. Cleared
// scope: in-form navigation (tab/section/nextStep/previousStep — skipping invisible
// tabs per BR-001 and blocking a requiresPreviousTabComplete target with incomplete
// preceding fields per BR-002), finalSubmit (with the button id so the backend
// resolves its extra-params), and saveDraft. externalUrl and callApi are gated on
// G-1; anotherForm awaits portal router wiring — all three log and no-op.

import { useCallback } from 'react';
import type { ScopedButton, NavigateActionConfig, SectionDefinition, TabDefinition } from '@qdb/shared';
import { useFormContext } from '../../contexts/FormContext';
import { logger } from '../../utils/logger';
import {
  resolveNavigationTabIndex,
  arePrecedingTabsComplete,
  resolveNavigationSectionIndex,
  incompleteFieldsOf,
} from './scopedButtonNavigation';

// Scrolls to a section once it is present in the DOM. After a cross-tab switch the
// target tab re-renders asynchronously, so retry across a few animation frames until
// the section anchor exists (then give up rather than loop forever).
function scrollToSectionWhenReady(sectionId: string, attempts = 0): void {
  const element = document.getElementById(`section-${sectionId}`);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (attempts >= 20) return;
  requestAnimationFrame(() => scrollToSectionWhenReady(sectionId, attempts + 1));
}

export function useScopedButtonAction(): (button: ScopedButton) => void {
  const {
    formDefinition, ruleState, fieldValues, activeTabIndex, setActiveTabIndex,
    activeSectionIndex, setActiveSectionIndex, reportValidationErrors, submitForm, saveDraft,
  } =
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
        const tabs = formDefinition?.tabs ?? [];

        if (nav.target === 'section') {
          if (!nav.targetSectionId) return;
          // Find the tab that owns the target section. Match case-insensitively — the stored
          // config may use a differently-cased GUID than the form definition and DOM id — and
          // use the definition's own id for the DOM lookup so the anchor always matches.
          const wantedSectionId = nav.targetSectionId.toLowerCase();
          let owningTabIndex = -1;
          let domSectionId = nav.targetSectionId;
          for (let index = 0; index < tabs.length; index++) {
            const match = (tabs[index].sections ?? []).find((s) => s.id.toLowerCase() === wantedSectionId);
            if (match) {
              owningTabIndex = index;
              domSectionId = match.id;
              break;
            }
          }
          if (owningTabIndex === -1) {
            logger.warn('scoped_button_nav_section_not_found', { buttonId, targetSectionId: nav.targetSectionId });
            return;
          }
          // Cross-tab: switch to the section's tab first, then scroll once it has rendered.
          if (owningTabIndex !== activeTabIndex) setActiveTabIndex(owningTabIndex);
          scrollToSectionWhenReady(domSectionId);
          return;
        }

        if (nav.target === 'nextSection' || nav.target === 'previousSection') {
          dispatchSectionStep(nav, buttonId);
          return;
        }

        if (nav.target === 'externalUrl' || nav.target === 'anotherForm') {
          logger.warn('scoped_button_navigation_gated', { buttonId, target: nav.target });
          return;
        }

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

      /**
       * Steps within the active tab's visible sections. Silent no-op on a tab that shows all
       * its sections at once — the target is meaningless there, and the designer's publish
       * lint is what stops such a button being configured in the first place.
       */
      function dispatchSectionStep(nav: NavigateActionConfig, buttonId: string): void {
        const tab = (formDefinition?.tabs ?? [])[activeTabIndex];
        if (!tab?.revealsSectionsOneAtATime) {
          logger.warn('scoped_button_section_step_on_all_at_once_tab', { buttonId, tabId: tab?.id });
          return;
        }

        const isSectionVisible = (section: SectionDefinition) =>
          ruleState.sectionVisibility[section.id] ?? section.isVisible;
        const sections = (tab.sections ?? [])
          .filter(isSectionVisible)
          .sort((a, b) => a.displayOrder - b.displayOrder);

        // Going forward is gated on the section the user is leaving; going back never is,
        // so an incomplete section cannot trap them.
        if (nav.target === 'nextSection') {
          const current = sections[Math.min(activeSectionIndex, sections.length - 1)];
          const blocking = current
            ? incompleteFieldsOf({ section: current, ruleState, fieldValues })
            : [];
          if (blocking.length > 0) {
            // Name them on the fields themselves. Refusing without a word reads as a button
            // that does not work, and the user has nothing to act on.
            reportValidationErrors(
              Object.fromEntries(blocking.map((field) => [field.id, [`${field.label} is required`]])),
            );
            logger.warn('scoped_button_section_step_blocked_incomplete', { buttonId, sectionId: current?.id });
            return;
          }
        }

        const targetIndex = resolveNavigationSectionIndex({
          action: nav,
          sections,
          activeSectionIndex,
          isSectionVisible,
        });
        if (targetIndex === null) return;
        setActiveSectionIndex(targetIndex);
      }
    },
    [
      formDefinition, ruleState, fieldValues, activeTabIndex, setActiveTabIndex,
      activeSectionIndex, setActiveSectionIndex, reportValidationErrors, submitForm, saveDraft,
    ],
  );
}
