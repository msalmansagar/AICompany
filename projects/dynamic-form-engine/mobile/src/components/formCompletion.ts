// DFE-FBE-002 (mobile) — form completion %: required, visible fields that have a value.
import type { FormDefinition } from '@qdb/shared';

interface RuleMaps {
  visibilityMap: Map<string, boolean>;
  requiredMap: Map<string, boolean>;
}

export interface FormCompletion { percent: number; filled: number; total: number }

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function computeMobileCompletion(
  form: FormDefinition,
  values: Record<string, unknown>,
  ruleState: RuleMaps,
): FormCompletion {
  let total = 0;
  let filled = 0;
  for (const tab of form.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        const visible = ruleState.visibilityMap.has(field.fieldKey)
          ? ruleState.visibilityMap.get(field.fieldKey) === true
          : field.isVisibleDefault;
        const required = ruleState.requiredMap.has(field.fieldKey)
          ? ruleState.requiredMap.get(field.fieldKey) === true
          : field.isRequiredDefault;
        if (!visible || !required) continue;
        total += 1;
        if (isFilled(values[field.fieldKey])) filled += 1;
      }
    }
  }
  const percent = total === 0 ? 100 : Math.round((filled / total) * 100);
  return { percent, filled, total };
}
