import { useEffect, useState } from 'react';
import {
  Dropdown,
  Option,
  makeStyles,
} from '@fluentui/react-components';
import type { OptionValue } from '@qdb/shared';
import { useFormContext } from '../../../contexts/FormContext';
import { optionsApi } from '../../../api/optionsApi';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  dropdown: {
    width: '100%',
  },
});

export function DropdownControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { formCode, fieldValues, updateFieldValue, ruleState } = useFormContext();

  const [dynamicOptions, setDynamicOptions] = useState<OptionValue[] | null>(null);

  const filteredByRule = ruleState.filteredOptions[field.id];
  const staticOptions = field.options ?? [];
  const resolvedOptions = filteredByRule ?? dynamicOptions ?? staticOptions;

  // Load options dynamically when none are defined statically
  useEffect(() => {
    if (staticOptions.length > 0 || filteredByRule) return;

    let cancelled = false;

    optionsApi.getOptions(field.id, formCode).then((response) => {
      if (!cancelled) {
        const data = (response as unknown as { data: OptionValue[] }).data;
        setDynamicOptions(data ?? []);
      }
    }).catch(() => {
      if (!cancelled) setDynamicOptions([]);
    });

    return () => {
      cancelled = true;
    };
  }, [field.id, staticOptions.length, filteredByRule]);

  const rawValue = fieldValues[field.schemaName];
  const selectedValue = rawValue !== null && rawValue !== undefined ? [String(rawValue)] : [];

  function handleOptionSelect(_event: unknown, data: { optionValue?: string }) {
    updateFieldValue(field.schemaName, data.optionValue ?? null);
  }

  const activeOptions = resolvedOptions.filter((o) => o.isActive);

  return (
    <Dropdown
      id={inputId}
      className={styles.dropdown}
      selectedOptions={selectedValue}
      onOptionSelect={handleOptionSelect}
      placeholder={field.placeholder ?? 'Select an option'}
      disabled={isReadonly}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
    >
      {activeOptions
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((option) => (
          <Option key={option.value} value={option.value}>
            {option.label}
          </Option>
        ))}
    </Dropdown>
  );
}
