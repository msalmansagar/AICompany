import React from 'react';
import { Textarea } from '@fluentui/react-components';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

export function TextAreaControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const { fieldValues, updateFieldValue } = useFormContext();

  const value = (fieldValues[field.schemaName] as string | null | undefined) ?? '';

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    updateFieldValue(field.schemaName, event.target.value);
  }

  return (
    <Textarea
      id={inputId}
      value={value}
      onChange={handleChange}
      placeholder={field.placeholder}
      readOnly={isReadonly}
      disabled={isReadonly}
      required={isRequired}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
      resize="vertical"
      appearance="outline"
      style={{ width: '100%' }}
    />
  );
}
