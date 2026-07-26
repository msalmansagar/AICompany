import { useEffect, useMemo, useState } from 'react';
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

  // Stable array reference — Fluent UI Dropdown compares selectedOptions by reference.
  // A new array on every render causes Dropdown to fire onOptionSelect on each re-render,
  // creating an infinite loop: onOptionSelect → updateFieldValue → re-render → repeat.
  const selectedValue = useMemo(
    () => rawValue !== null && rawValue !== undefined ? [String(rawValue)] : [],
    [rawValue],
  );

  function handleOptionSelect(_event: unknown, data: { optionValue?: string }) {
    const next = data.optionValue ?? null;
    // Guard: skip if the value hasn't actually changed (Fluent UI can fire spuriously).
    const current = rawValue !== null && rawValue !== undefined ? String(rawValue) : null;
    if (next === current) return;
    updateFieldValue(field.schemaName, next);
  }

  const activeOptions = useMemo(
    () => resolvedOptions.filter((o) => o.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [resolvedOptions],
  );

  // Fluent's Dropdown keeps its display text in its own uncontrolled state, so a remount
  // (switching tabs and back) showed the placeholder again even though the value was still
  // set — the user reads that as "my filter cleared". Driving `value` from the selection
  // makes the text survive the remount.
  const selectedLabel = useMemo(() => {
    if (selectedValue.length === 0) return '';
    return activeOptions.find((option) => option.value === selectedValue[0])?.label ?? '';
  }, [activeOptions, selectedValue]);

  return (
    <Dropdown
      id={inputId}
      className={styles.dropdown}
      selectedOptions={selectedValue}
      value={selectedLabel}
      onOptionSelect={handleOptionSelect}
      placeholder={field.placeholder ?? 'Select an option'}
      disabled={isReadonly}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
    >
      {activeOptions.map((option) => (
        <Option key={option.value} value={option.value}>
          {option.label}
        </Option>
      ))}
    </Dropdown>
  );
}
