// Pure helper functions for FormLinter.
// Extracted to keep FormLinter.ts within the 400-line guideline.
// These functions are private to the linting domain — do not import outside FormLinter.

import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';
import type { DesignerValidationRule } from '@/state/models/DesignerRuleModel';
import type { BusinessRuleDefinition } from '@/types/businessRule';
import type { SubmissionMapping } from '@/services/SubmissionMappingService';

/** Groups all field IDs by their trimmed code value. Used by L001. */
export function groupFieldIdsByCode(
  fields: Record<string, DesignerFieldModel>
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const field of Object.values(fields)) {
    const code = field.code.trim();
    if (!code) continue;
    const existing = result.get(code) ?? [];
    existing.push(field.id);
    result.set(code, existing);
  }

  return result;
}

/** Builds a Set of field IDs that have at least one submission mapping. */
export function buildMappedFieldIdSet(mappings: SubmissionMapping[]): Set<string> {
  return new Set(mappings.map(m => m.fieldId));
}

/**
 * Builds the Set of field codes from all fields in the form.
 * Empty codes are excluded — they are caught by publish validation (PV-007).
 */
export function buildFieldCodeSet(fields: Record<string, DesignerFieldModel>): Set<string> {
  const codes = new Set<string>();
  for (const field of Object.values(fields)) {
    const code = field.code.trim();
    if (code) codes.add(code);
  }
  return codes;
}

/**
 * Returns the set of field IDs that carry any conditional_required validation rule.
 * Used to exempt those fields from L002 (they are handled by L007 instead).
 */
export function buildConditionalRequiredFieldIdSet(
  rules: Record<string, DesignerValidationRule>
): Set<string> {
  const ids = new Set<string>();
  for (const rule of Object.values(rules)) {
    // String() coercion: 'conditional_required' is not yet in ValidationRuleType union.
    if (String(rule.ruleType) === 'conditional_required') {
      ids.add(rule.fieldId);
    }
  }
  return ids;
}

/**
 * Collects all field codes referenced by a business rule definition that are NOT
 * in the validCodes set. Empty codes are skipped. Deduplicates: each orphaned code
 * appears at most once.
 */
export function collectOrphanedBusinessRuleCodes(
  definition: BusinessRuleDefinition,
  validCodes: Set<string>
): string[] {
  const referenced = new Set<string>();

  const triggerCode = definition.trigger_field_code.trim();
  if (triggerCode) referenced.add(triggerCode);

  for (const condition of definition.condition_group.conditions) {
    const condCode = condition.field_code.trim();
    if (condCode) referenced.add(condCode);
  }

  for (const action of definition.actions) {
    const actionCode = action.target_field_code.trim();
    if (actionCode) referenced.add(actionCode);
  }

  return [...referenced].filter(code => !validCodes.has(code));
}
