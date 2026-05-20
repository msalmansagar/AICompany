import React from 'react';
import { Input } from '@fluentui/react-components';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

interface NumberControlProps extends ControlProps {
  prefix?: string;
  onBlurFormat?: (value: number) => string;
}

export function NumberControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
  prefix,
}: NumberControlProps) {
  const { fieldValues, updateFieldValue } = useFormContext();

  const rawValue = fieldValues[field.schemaName];
  const displayValue = rawValue !== null && rawValue !== undefined ? String(rawValue) : '';

  const minRule = field.validationRules.find((r) => r.ruleType === 'minValue');
  const maxRule = field.validationRules.find((r) => r.ruleType === 'maxValue');

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;

    if (raw === '') {
      updateFieldValue(field.schemaName, null);
      return;
    }

    const parsed = parseFloat(raw);

    if (!isNaN(parsed)) {
      updateFieldValue(field.schemaName, parsed);
    }
  }

  return (
    <Input
      id={inputId}
      type="number"
      value={displayValue}
      onChange={handleChange}
      placeholder={field.placeholder}
      readOnly={isReadonly}
      disabled={isReadonly}
      required={isRequired}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
      min={minRule?.minValue}
      max={maxRule?.maxValue}
      contentBefore={prefix ? <span>{prefix}</span> : undefined}
      appearance="outline"
    />
  );
}
