import React from 'react';
import { Input } from '@fluentui/react-components';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

export function DateControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const { fieldValues, updateFieldValue } = useFormContext();

  const rawValue = fieldValues[field.schemaName];
  const displayValue = rawValue ? String(rawValue).substring(0, 10) : '';

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    updateFieldValue(field.schemaName, event.target.value || null);
  }

  return (
    <Input
      id={inputId}
      type="date"
      value={displayValue}
      onChange={handleChange}
      readOnly={isReadonly}
      disabled={isReadonly}
      required={isRequired}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
      appearance="outline"
      style={{ width: '100%' }}
    />
  );
}
