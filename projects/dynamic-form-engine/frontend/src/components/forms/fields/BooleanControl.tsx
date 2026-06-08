// Boolean field renderer — supports 'toggle' and 'radio' render styles.
// BR-019: if trueLabel or falseLabel are missing, render an error state and log.

import {
  Switch,
  RadioGroup,
  Radio,
  makeStyles,
  tokens,
  Text,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { useFormContext } from '../../../contexts/FormContext';
import { logger } from '../../../utils/logger';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  toggleLabel: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    userSelect: 'none',
  },
  toggleLabelInactive: {
    color: tokens.colorNeutralForeground3,
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  errorState: {
    padding: tokens.spacingVerticalXS,
  },
});

// Picklist: 1 = toggle, 2 = radio-pair (matches qdb_bool_render_style).
type BooleanRenderStyle = 'toggle' | 'radio';

function resolveBooleanRenderStyle(raw: unknown): BooleanRenderStyle {
  if (raw === 'radio' || raw === 2) return 'radio';
  return 'toggle';
}

export function BooleanControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue } = useFormContext();

  const rawValue = fieldValues[field.schemaName];
  // Coerce to boolean | undefined. Never treat as a string.
  const boolValue: boolean | undefined =
    rawValue === true ? true : rawValue === false ? false : undefined;

  // BR-019: both labels are required for a boolean field to render.
  const trueLabel = field.trueLabel;
  const falseLabel = field.falseLabel;

  if (!trueLabel || !falseLabel) {
    // Log a structured warning. The backend should have prevented this state
    // but the portal is defensive at render time per BR-019.
    logger.error('boolean_field_missing_labels', {
      fieldId: field.id,
      fieldKey: field.schemaName,
    });

    return (
      <MessageBar intent="error" className={styles.errorState}>
        <MessageBarBody>
          Configuration error: boolean field &quot;{field.label}&quot; is missing
          labels. Contact your form administrator.
        </MessageBarBody>
      </MessageBar>
    );
  }

  const renderStyle = resolveBooleanRenderStyle(field.boolRenderStyle);

  function handleToggleChange(_event: unknown, data: { checked: boolean }) {
    updateFieldValue(field.schemaName, data.checked);
  }

  function handleRadioChange(_event: unknown, data: { value: string }) {
    // Radio stores value as string 'true' / 'false' — convert to boolean primitive.
    updateFieldValue(field.schemaName, data.value === 'true');
  }

  if (renderStyle === 'toggle') {
    const isChecked = boolValue === true;
    const activeLabelClass = isChecked ? styles.toggleLabel : styles.toggleLabelInactive;
    const inactiveLabelClass = isChecked ? styles.toggleLabelInactive : styles.toggleLabel;

    return (
      <div
        className={styles.toggleRow}
        id={inputId}
        aria-describedby={errorId}
        aria-invalid={!!errorId}
      >
        <Text
          className={inactiveLabelClass}
          aria-hidden="true"
        >
          {falseLabel}
        </Text>
        <Switch
          checked={isChecked}
          onChange={handleToggleChange}
          disabled={isReadonly}
          required={isRequired}
          aria-required={isRequired}
          aria-label={`${field.label}: ${isChecked ? trueLabel : falseLabel}`}
        />
        <Text
          className={activeLabelClass}
          aria-hidden="true"
        >
          {trueLabel}
        </Text>
      </div>
    );
  }

  // Radio-pair mode
  // RHF stores boolean; RadioGroup needs string value.
  const radioValue =
    boolValue === true ? 'true' : boolValue === false ? 'false' : '';

  return (
    <RadioGroup
      id={inputId}
      className={styles.radioGroup}
      value={radioValue}
      onChange={handleRadioChange}
      disabled={isReadonly}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
      layout="vertical"
    >
      <Radio value="true" label={trueLabel} />
      <Radio value="false" label={falseLabel} />
    </RadioGroup>
  );
}
