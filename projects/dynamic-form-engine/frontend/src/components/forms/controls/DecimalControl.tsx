import React from 'react';
import { Input } from '@fluentui/react-components';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

export function DecimalControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const { fieldValues, updateFieldValue } = useFormContext();

  const rawValue = fieldValues[field.schemaName];
  const precision = field.decimalPlaces ?? 2;

  const displayValue =
    rawValue !== null && rawValue !== undefined ? String(rawValue) : '';

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
      const rounded = parseFloat(parsed.toFixed(precision));
      updateFieldValue(field.schemaName, rounded);
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
      step={Math.pow(10, -precision)}
      appearance="outline"
      style={{ width: '100%' }}
    />
  );
}
