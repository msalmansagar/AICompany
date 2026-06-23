import { Checkbox, makeStyles, tokens } from '@fluentui/react-components';
import type { OptionValue } from '@qdb/shared';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
});

export function CheckboxGroupControl({
  field,
  isReadonly,
}: ControlProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue, ruleState } = useFormContext();

  const filteredByRule = ruleState.filteredOptions[field.id];
  const options: OptionValue[] = (filteredByRule ?? field.options ?? []).filter((o) => o.isActive);

  const rawValue = fieldValues[field.schemaName];
  const selectedValues: string[] = Array.isArray(rawValue) ? rawValue.map(String) : [];

  function handleChange(value: string, checked: boolean) {
    const next = checked
      ? [...selectedValues, value]
      : selectedValues.filter((v) => v !== value);
    updateFieldValue(field.schemaName, next);
  }

  return (
    <div className={styles.group}>
      {options
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((option) => (
          <Checkbox
            key={option.value}
            label={option.label}
            checked={selectedValues.includes(option.value)}
            disabled={isReadonly}
            onChange={(_e, data) => handleChange(option.value, !!data.checked)}
          />
        ))}
    </div>
  );
}
