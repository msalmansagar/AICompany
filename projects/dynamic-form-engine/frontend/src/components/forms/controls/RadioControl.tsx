import {
  RadioGroup,
  Radio,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
});

export function RadioControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue, ruleState } = useFormContext();

  const filteredByRule = ruleState.filteredOptions[field.id];
  const options = (filteredByRule ?? field.options ?? []).filter((o) => o.isActive);

  const rawValue = fieldValues[field.schemaName];
  const value = rawValue !== null && rawValue !== undefined ? String(rawValue) : '';

  function handleChange(_event: unknown, data: { value: string }) {
    updateFieldValue(field.schemaName, data.value);
  }

  return (
    <RadioGroup
      id={inputId}
      className={styles.radioGroup}
      value={value}
      onChange={handleChange}
      disabled={isReadonly}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
      layout="vertical"
    >
      {options
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            label={option.label}
          />
        ))}
    </RadioGroup>
  );
}
