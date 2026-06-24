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

  const affixStyle: React.CSSProperties = {
    paddingTop: '6px',
    fontSize: '14px',
    color: '#616161',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
      {field.prefix && <span style={affixStyle}>{field.prefix}</span>}
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
        style={{ flex: 1 }}
      />
      {field.suffix && <span style={affixStyle}>{field.suffix}</span>}
    </div>
  );
}
