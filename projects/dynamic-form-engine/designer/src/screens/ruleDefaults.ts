import type { BusinessRuleDefinition } from '@/types/businessRule';
import type { RuleTriggerEvent } from '@qdb/shared';

interface TriggerEventOption {
  value: RuleTriggerEvent;
  label: string;
  hint: string;
}

/**
 * The trigger events offered in the rule editor.
 *
 * This list must not drift from what the runtime honours: an option the engine ignores is a
 * setting that saves, publishes and then silently does nothing. A test pins it to the
 * runtime's own RULE_TRIGGER_EVENTS.
 */
export const TRIGGER_EVENT_OPTIONS: readonly TriggerEventOption[] = [
  {
    value: 'on_change',
    label: 'On Change',
    hint: 'Re-checked as the user types or picks a value.',
  },
  {
    value: 'on_load',
    label: 'On Load',
    hint: 'Checked once against the values the form opened with; later edits do not change it.',
  },
  {
    value: 'on_blur',
    label: 'On Blur',
    hint: 'Checked when the user leaves a field, rather than on every keystroke.',
  },
  {
    value: 'on_save',
    label: 'On Save',
    hint: 'Held until the user submits, then checked against what they submitted.',
  },
];

/** The element a maker asked for a rule from, carried into the rule editor. */
export interface RuleCreationTarget {
  type: 'tab';
  id: string;
}

/**
 * The rule a maker gets when they ask for a new one.
 *
 * When they asked from a specific element, the first action is aimed at it. Hiding is the
 * useful default: everything is visible until a rule says otherwise, so a rule that shows an
 * already-visible tab does nothing the maker can see.
 */
export function buildDefaultDefinition(
  fieldCodes: string[],
  target: RuleCreationTarget | null,
): BusinessRuleDefinition {
  const firstFieldCode = fieldCodes[0] ?? '';

  return {
    version: '1.0',
    trigger_field_code: firstFieldCode,
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'AND',
      conditions: [{ field_code: firstFieldCode, operator: 'equals', value: '' }],
    },
    actions: [buildDefaultAction(firstFieldCode, target)],
  };
}

function buildDefaultAction(firstFieldCode: string, target: RuleCreationTarget | null) {
  if (target?.type === 'tab') {
    return { action_type: 'hide_tab' as const, target_tab_id: target.id };
  }
  return { action_type: 'show_field' as const, target_field_code: firstFieldCode };
}
