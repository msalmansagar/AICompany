import { useId, useMemo, type CSSProperties } from 'react';
import {
  Label,
  makeStyles,
  tokens,
  Text,
  Tooltip,
} from '@fluentui/react-components';
import type { FieldDefinition } from '@dfe/shared';
import { useDesignContext } from '../../contexts/DesignContext';
import { StyleEngine } from '../../theme/StyleEngine';
import { ComponentStyleResolver } from '../../theme/ComponentStyleResolver';
import { TextInputControl } from './controls/TextInputControl';
import { TextAreaControl } from './controls/TextAreaControl';
import { NumberControl } from './controls/NumberControl';
import { DateControl } from './controls/DateControl';
import { DateTimeControl } from './controls/DateTimeControl';
import { DropdownControl } from './controls/DropdownControl';
import { MultiSelectControl } from './controls/MultiSelectControl';
import { LookupControl } from './controls/LookupControl';
import { CheckboxControl } from './controls/CheckboxControl';
import { RadioControl } from './controls/RadioControl';
import { CurrencyControl } from './controls/CurrencyControl';
import { DecimalControl } from './controls/DecimalControl';
import { EmailControl } from './controls/EmailControl';
import { PhoneControl } from './controls/PhoneControl';
import { FileUploadControl } from './controls/FileUploadControl';
import { RepeatingGridControl } from './controls/RepeatingGridControl';
import { RichTextControl } from './controls/RichTextControl';
import { DynamicIcon } from './DynamicIcon';

const useStyles = makeStyles({
  fieldWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  labelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  requiredMark: {
    color: tokens.colorPaletteRedForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  tooltipIcon: {
    color: tokens.colorNeutralForeground3,
    cursor: 'help',
  },
  // Floating label layout — the input grows to fill the container
  // and the label is positioned absolutely above the input.
  floatingWrapper: {
    position: 'relative',
  },
  floatingLabel: {
    position: 'absolute',
    top: '-10px',
    left: '8px',
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    backgroundColor: 'var(--qdb-color-surface, ' + tokens.colorNeutralBackground1 + ')',
    padding: `0 ${tokens.spacingHorizontalXXS}`,
    zIndex: 1,
  },
  controlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
});

export interface FieldRendererProps {
  field: FieldDefinition;
  isVisible: boolean;
  isRequired: boolean;
  isReadonly: boolean;
  error?: string;
}

// FieldRenderer is NOT wrapped in React.memo — conflicts with RHF Controller subscriptions.
export function FieldRenderer({
  field,
  isVisible,
  isRequired,
  isReadonly,
  error,
}: FieldRendererProps) {
  const styles = useStyles();
  const inputId = useId();
  const errorId = `${inputId}-error`;

  const design = useDesignContext();
  const fieldDesign = design.fieldDesigns[field.id];

  const resolvedProps = useMemo(
    () => ComponentStyleResolver.resolve(fieldDesign, design.theme),
    [fieldDesign, design.theme],
  );

  const fieldStyle = useMemo(
    () => StyleEngine.resolveField(design, field.id),
    [design, field.id],
  );

  const isFloating = design.formDesign.labelPosition === 'Floating';

  if (!isVisible) return null;

  const controlProps = {
    field,
    inputId,
    isRequired,
    isReadonly,
    errorId: error ? errorId : undefined,
    appearance: resolvedProps.appearance,
  };

  const labelElement = field.fieldType !== 'checkbox' && (
    <Label
      htmlFor={inputId}
      required={isRequired}
      style={fieldStyle.labelStyle as CSSProperties}
      className={isFloating ? styles.floatingLabel : undefined}
    >
      {field.label}
    </Label>
  );

  const tooltipElement = field.tooltip && (
    <Tooltip content={field.tooltip} relationship="label">
      <span
        className={styles.tooltipIcon}
        aria-label={field.tooltip}
        tabIndex={0}
        role="img"
      >
        {/* Using a unicode circle info icon as a safe fallback */}
        &#9432;
      </span>
    </Tooltip>
  );

  return (
    <div
      className={styles.fieldWrapper}
      style={fieldStyle.containerStyle as CSSProperties}
    >
      {!isFloating && (
        <div className={styles.labelRow}>
          {labelElement}
          {tooltipElement}
        </div>
      )}

      <div
        className={isFloating ? styles.floatingWrapper : styles.controlRow}
      >
        {isFloating && labelElement}

        {fieldDesign?.iconPrefix && (
          <DynamicIcon iconName={fieldDesign.iconPrefix} size={16} />
        )}

        <FieldControl controlProps={controlProps} />

        {fieldDesign?.iconSuffix && (
          <DynamicIcon iconName={fieldDesign.iconSuffix} size={16} />
        )}
      </div>

      {!isFloating && tooltipElement === false && null}

      {error && (
        <Text
          id={errorId}
          className={styles.errorText}
          role="alert"
          aria-live="polite"
        >
          {error}
        </Text>
      )}
    </div>
  );
}

export interface ControlProps {
  field: FieldDefinition;
  inputId: string;
  isRequired: boolean;
  isReadonly: boolean;
  errorId?: string;
  appearance?: 'outline' | 'filled-darker' | 'underline';
}

function FieldControl({ controlProps }: { controlProps: ControlProps }) {
  const { field } = controlProps;

  switch (field.fieldType) {
    case 'text':
      return <TextInputControl {...controlProps} />;
    case 'textarea':
      return <TextAreaControl {...controlProps} />;
    case 'number':
      return <NumberControl {...controlProps} />;
    case 'date':
      return <DateControl {...controlProps} />;
    case 'datetime':
      return <DateTimeControl {...controlProps} />;
    case 'dropdown':
      return <DropdownControl {...controlProps} />;
    case 'multiselect':
      return <MultiSelectControl {...controlProps} />;
    case 'lookup':
      return <LookupControl {...controlProps} />;
    case 'checkbox':
      return <CheckboxControl {...controlProps} />;
    case 'radio':
      return <RadioControl {...controlProps} />;
    case 'currency':
      return <CurrencyControl {...controlProps} />;
    case 'decimal':
      return <DecimalControl {...controlProps} />;
    case 'email':
      return <EmailControl {...controlProps} />;
    case 'phone':
      return <PhoneControl {...controlProps} />;
    case 'file':
      return <FileUploadControl {...controlProps} />;
    case 'repeatingGrid':
      return <RepeatingGridControl {...controlProps} />;
    case 'richText':
      return <RichTextControl {...controlProps} />;
    default:
      return (
        <Text>
          Unsupported field type: {(field as FieldDefinition).fieldType}
        </Text>
      );
  }
}
