import React, { useMemo } from 'react';
import { Checkbox, Field, Input, Text, makeStyles, tokens } from '@fluentui/react-components';
import type { RuleAction, RuleActionType } from '@/types/businessRule';

/** One selectable option of a target field, as the disable-options picker needs it. */
export interface RuleOptionChoice {
  value: string;
  label: string;
}

/** Action types that carry a value, and the input each one needs. */
const VALUE_EDITORS: Partial<Record<RuleActionType, 'text' | 'expression' | 'options'>> = {
  set_value: 'text',
  show_message: 'text',
  calculate_value: 'expression',
  disable_options: 'options',
};

const useStyles = makeStyles({
  optionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    maxHeight: '160px',
    overflowY: 'auto',
    paddingTop: tokens.spacingVerticalXS,
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
});

interface ActionValueEditorProps {
  action: RuleAction;
  /** Options of the field the action targets; empty when the field has none. */
  targetOptions: RuleOptionChoice[];
  onChange: (patch: Partial<RuleAction>) => void;
}

/**
 * The value input for one action, switched on what the action does with it.
 *
 * A calculation is typed as an expression over field codes; a disable-options action picks
 * from the target field's own options so a maker never has to know an option's stored value.
 */
export function ActionValueEditor({ action, targetOptions, onChange }: ActionValueEditorProps): React.ReactElement | null {
  const editor = VALUE_EDITORS[action.action_type];
  if (editor === undefined) return null;

  if (editor === 'options') {
    return <DisabledOptionsPicker value={action.value} options={targetOptions} onChange={onChange} />;
  }

  const isExpression = editor === 'expression';
  return (
    <Field
      label={isExpression ? 'Expression' : 'Value'}
      hint={isExpression ? 'Field codes in braces, e.g. {quantity} * {unit_price}' : undefined}
      style={{ flex: 1 }}
    >
      <Input
        value={action.value ?? ''}
        placeholder={isExpression ? '{quantity} * 1.1' : undefined}
        onChange={(_, d) => onChange({ value: d.value })}
      />
    </Field>
  );
}

interface DisabledOptionsPickerProps {
  value: string | undefined;
  options: RuleOptionChoice[];
  onChange: (patch: Partial<RuleAction>) => void;
}

/** The option values a disable-options action names, stored as a JSON array of strings. */
export function parseDisabledOptionValues(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(',').map(entry => entry.trim()).filter(entry => entry !== '');
  }
}

function DisabledOptionsPicker({ value, options, onChange }: DisabledOptionsPickerProps): React.ReactElement {
  const styles = useStyles();
  const selected = useMemo(() => new Set(parseDisabledOptionValues(value)), [value]);

  const toggle = (optionValue: string, isChecked: boolean): void => {
    const next = new Set(selected);
    if (isChecked) next.add(optionValue);
    else next.delete(optionValue);
    onChange({ value: JSON.stringify([...next]) });
  };

  if (options.length === 0) {
    return (
      <Field label="Options to disable" hint="Comma-separated option values" style={{ flex: 1 }}>
        <Input value={value ?? ''} onChange={(_, d) => onChange({ value: d.value })} />
      </Field>
    );
  }

  // Not wrapped in a Fluent Field: a Field hands its single control id to its child, and with
  // several checkboxes every label would point at the first one.
  return (
    <div style={{ flex: 1 }}>
      <Text size={300} weight="semibold">Options to disable</Text>
      <div className={styles.optionList} role="group" aria-label="Options to disable">
        {options.map(option => (
          <Checkbox
            key={option.value}
            label={option.label}
            checked={selected.has(option.value)}
            onChange={(_, d) => toggle(option.value, !!d.checked)}
          />
        ))}
        {selected.size === 0 && (
          <Text size={200} className={styles.hint}>Pick at least one option.</Text>
        )}
      </div>
    </div>
  );
}
