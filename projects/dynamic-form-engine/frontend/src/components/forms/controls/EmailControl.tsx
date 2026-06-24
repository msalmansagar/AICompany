import React from 'react';
import { Input } from '@fluentui/react-components';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

export function EmailControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const { fieldValues, updateFieldValue } = useFormContext();

  const value = (fieldValues[field.schemaName] as string | null | undefined) ?? '';

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    updateFieldValue(field.schemaName, event.target.value);
  }

  return (
    <Input
      id={inputId}
      type="email"
      value={value}
      onChange={handleChange}
      placeholder={field.placeholder ?? 'name@example.com'}
      readOnly={isReadonly}
      disabled={isReadonly}
      required={isRequired}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
      contentBefore={field.prefix ? <span>{field.prefix}</span> : undefined}
      contentAfter={field.suffix ? <span>{field.suffix}</span> : undefined}
      appearance="outline"
      style={{ width: '100%' }}
    />
  );
}
