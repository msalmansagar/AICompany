import React from 'react';
import { Checkbox } from '@fluentui/react-components';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

export function CheckboxControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const { fieldValues, updateFieldValue } = useFormContext();

  const checked = (fieldValues[field.schemaName] as boolean | null | undefined) ?? false;

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    updateFieldValue(field.schemaName, event.target.checked);
  }

  return (
    <Checkbox
      id={inputId}
      label={field.label}
      checked={checked}
      onChange={handleChange}
      disabled={isReadonly}
      required={isRequired}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
    />
  );
}
