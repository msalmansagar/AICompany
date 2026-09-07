import type { FieldDefinition } from '@qdb/shared';

/** The subset of a field the visibility decision needs. */
type VisibilityInputs = Pick<FieldDefinition, 'id' | 'isVisible' | 'isHidden'>;

/**
 * Whether a field is shown to the user right now.
 *
 * `isHidden` is the field's STARTING state, not a permanent one. A rule that targets the
 * field decides instead: "hidden by default, revealed when the rule fires" is a normal
 * pattern, and it was impossible while the design-time flag overruled the rule — the rule
 * marked the field visible and the flag hid it again.
 *
 * With no rule targeting the field the answer is unchanged from before: a field is shown
 * when it is visible and not hidden.
 */
export function isFieldVisible(
  field: VisibilityInputs,
  fieldVisibility: Record<string, boolean>,
): boolean {
  const ruleVerdict = fieldVisibility[field.id];
  if (ruleVerdict !== undefined) return ruleVerdict;
  return field.isVisible && !field.isHidden;
}
