import React from 'react';
import { Input, makeStyles, tokens } from '@fluentui/react-components';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  row: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    width: '100%',
  },
  dateInput: {
    flex: '2 1 0',
  },
  timeInput: {
    flex: '1 1 0',
  },
});

export function DateTimeControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue } = useFormContext();

  const rawValue = (fieldValues[field.schemaName] as string | null | undefined) ?? '';
  const [datePart, timePart] = splitDateTime(rawValue);

  function handleDateChange(event: React.ChangeEvent<HTMLInputElement>) {
    const newDate = event.target.value;
    updateFieldValue(field.schemaName, combineDateTime(newDate, timePart));
  }

  function handleTimeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const newTime = event.target.value;
    updateFieldValue(field.schemaName, combineDateTime(datePart, newTime));
  }

  return (
    <div className={styles.row}>
      <div className={styles.dateInput}>
        <Input
          id={inputId}
          type="date"
          value={datePart}
          onChange={handleDateChange}
          readOnly={isReadonly}
          disabled={isReadonly}
          required={isRequired}
          aria-required={isRequired}
          aria-describedby={errorId}
          aria-invalid={!!errorId}
          aria-label={`${field.label} date`}
          appearance="outline"
          style={{ width: '100%' }}
        />
      </div>
      <div className={styles.timeInput}>
        <Input
          type="time"
          value={timePart}
          onChange={handleTimeChange}
          readOnly={isReadonly}
          disabled={isReadonly}
          aria-label={`${field.label} time`}
          appearance="outline"
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}

function splitDateTime(isoString: string): [string, string] {
  if (!isoString) return ['', ''];

  const [date = '', time = ''] = isoString.split('T');
  return [date, time.substring(0, 5)];
}

function combineDateTime(date: string, time: string): string | null {
  if (!date) return null;

  return `${date}T${time || '00:00'}:00`;
}
