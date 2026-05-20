import {
  Combobox,
  Option,
  makeStyles,
} from '@fluentui/react-components';
import type { OptionValue } from '@dfe/shared';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  combobox: {
    width: '100%',
  },
});

export function MultiSelectControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue, ruleState } = useFormContext();

  const filteredByRule = ruleState.filteredOptions[field.id];
  const options: OptionValue[] = filteredByRule ?? field.options ?? [];
  const activeOptions = options.filter((o) => o.isActive);

  const rawValue = fieldValues[field.schemaName];
  const selectedValues: string[] = Array.isArray(rawValue)
    ? rawValue.map(String)
    : [];

  function handleOptionSelect(_event: unknown, data: { selectedOptions: string[] }) {
    updateFieldValue(field.schemaName, data.selectedOptions);
  }

  const selectedLabels = selectedValues
    .map((v) => activeOptions.find((o) => o.value === v)?.label ?? v)
    .join(', ');

  return (
    <Combobox
      id={inputId}
      className={styles.combobox}
      multiselect
      selectedOptions={selectedValues}
      onOptionSelect={handleOptionSelect}
      placeholder={field.placeholder ?? 'Select options'}
      disabled={isReadonly}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
      value={selectedLabels}
    >
      {activeOptions
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((option) => (
          <Option key={option.value} value={option.value}>
            {option.label}
          </Option>
        ))}
    </Combobox>
  );
}
