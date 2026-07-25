// DFE-FBE-002 — form completion %: share of required, visible fields that have a value.
import type { FormDefinition, FormFieldValues } from '@qdb/shared';
import { getTabZoneFields } from './tabFields';

interface RuleStateMaps {
  tabVisibility: Record<string, boolean>;
  sectionVisibility: Record<string, boolean>;
  fieldVisibility: Record<string, boolean>;
  fieldRequired: Record<string, boolean>;
}

export interface FormCompletion {
  percent: number;
  filled: number;
  total: number;
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Completion = filled / total over the required, currently-visible fields.
 * Rule-hidden tabs/sections/fields and non-required fields are excluded.
 * Returns 100% when there are no required visible fields.
 */
export function computeFormCompletion(
  formDefinition: FormDefinition,
  fieldValues: FormFieldValues,
  ruleState: RuleStateMaps,
): FormCompletion {
  let total = 0;
  let filled = 0;
  for (const tab of formDefinition.tabs) {
    if (!(ruleState.tabVisibility[tab.id] ?? tab.isVisible)) continue;
    for (const section of tab.sections) {
      if (!(ruleState.sectionVisibility[section.id] ?? section.isVisible)) continue;
      for (const field of section.fields) {
        const visible = ruleState.fieldVisibility[field.id] ?? field.isVisible;
        const required = ruleState.fieldRequired[field.id] ?? field.isRequired;
        if (!visible || !required) continue;
        total += 1;
        if (isFilled(fieldValues[field.schemaName])) filled += 1;
      }
    }
    // DFE-TABZONE-001: count header/footer zone fields (gated by tab visibility only).
    for (const field of getTabZoneFields(tab)) {
      const visible = ruleState.fieldVisibility[field.id] ?? field.isVisible;
      const required = ruleState.fieldRequired[field.id] ?? field.isRequired;
      if (!visible || !required) continue;
      total += 1;
      if (isFilled(fieldValues[field.schemaName])) filled += 1;
    }
  }
  const percent = total === 0 ? 100 : Math.round((filled / total) * 100);
  return { percent, filled, total };
}
