// scopedButtonNavigation — DFE-BTN-001 in-form navigation resolution (pure).
//
// Maps a navigate action to the tab index the renderer should switch to, honouring
// BR-001 (NextStep/PreviousStep advance only through VISIBLE tabs) and providing the
// completion check for BR-002 (a tab with requiresPreviousTabComplete must not be
// reached while preceding required fields are incomplete). Kept pure (no React/DOM)
// so the stepping, visibility, and completion logic is unit-tested directly.

import type { NavigateActionConfig, TabDefinition, RuleEvaluationResult, FormFieldValues } from '@qdb/shared';
import { getTabZoneFields } from './tabFields';

export interface NavigationInput {
  action: NavigateActionConfig;
  tabs: readonly TabDefinition[];
  activeTabIndex: number;
  /** Effective visibility (definition flag overridden by business rules). */
  isTabVisible: (tab: TabDefinition, index: number) => boolean;
}

/**
 * Returns the tab index to activate for a navigate action, or null when the action
 * does not change the active tab (section scroll, externalUrl, anotherForm, an
 * unresolvable target, or no visible tab in the requested direction).
 */
export function resolveNavigationTabIndex(input: NavigationInput): number | null {
  const { action, tabs, activeTabIndex, isTabVisible } = input;
  switch (action.target) {
    case 'tab': {
      const index = tabs.findIndex((tab) => tab.id === action.targetTabId);
      return index >= 0 ? index : null;
    }
    case 'nextStep':
      return nextVisibleIndex(tabs, activeTabIndex, 1, isTabVisible);
    case 'previousStep':
      return nextVisibleIndex(tabs, activeTabIndex, -1, isTabVisible);
    default:
      return null;
  }
}

// First visible tab index strictly in the given direction, or null if none (BR-001).
function nextVisibleIndex(
  tabs: readonly TabDefinition[],
  from: number,
  step: 1 | -1,
  isTabVisible: (tab: TabDefinition, index: number) => boolean,
): number | null {
  for (let i = from + step; i >= 0 && i < tabs.length; i += step) {
    if (isTabVisible(tabs[i], i)) return i;
  }
  return null;
}

export interface CompletionInput {
  tabs: readonly TabDefinition[];
  ruleState: RuleEvaluationResult;
  fieldValues: FormFieldValues;
  targetTabIndex: number;
}

/**
 * BR-002: true when every effectively-visible, effectively-required field on every
 * effectively-visible tab BEFORE targetTabIndex has a non-empty value.
 */
export function arePrecedingTabsComplete(input: CompletionInput): boolean {
  const { tabs, ruleState, fieldValues, targetTabIndex } = input;
  for (let i = 0; i < targetTabIndex && i < tabs.length; i += 1) {
    const tab = tabs[i];
    if (!(ruleState.tabVisibility[tab.id] ?? tab.isVisible)) continue;
    for (const section of tab.sections) {
      for (const field of section.fields) {
        const visible = ruleState.fieldVisibility[field.id] ?? field.isVisible;
        const required = ruleState.fieldRequired[field.id] ?? field.isRequired;
        if (visible && required && isEmptyValue(fieldValues[field.schemaName])) {
          return false;
        }
      }
    }
    // DFE-TABZONE-001: header/footer zone fields also gate tab completion.
    for (const field of getTabZoneFields(tab)) {
      const visible = ruleState.fieldVisibility[field.id] ?? field.isVisible;
      const required = ruleState.fieldRequired[field.id] ?? field.isRequired;
      if (visible && required && isEmptyValue(fieldValues[field.schemaName])) {
        return false;
      }
    }
  }
  return true;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
