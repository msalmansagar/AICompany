import { useId, useMemo, type CSSProperties } from 'react';
import {
  Label,
  makeStyles,
  tokens,
  Text,
  Tooltip,
} from '@fluentui/react-components';
import type { FieldDefinition } from '@qdb/shared';
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
import { BooleanControl } from './fields/BooleanControl';
import { InfoCardField } from './fields/InfoCardField';
import { InteractiveGridField } from './fields/InteractiveGridField';
import { DynamicIcon } from './DynamicIcon';
import { ComponentRegistry } from '../../registry/ComponentRegistry';

const useStyles = makeStyles({
  fieldWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    width: '100%',
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
  // Floating label layout â€” the input grows to fill the container
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
    width: '100%',
  },
  controlFill: {
    flex: 1,
    minWidth: 0,
  },
});

export interface FieldRendererProps {
  field: FieldDefinition;
  isVisible: boolean;
  isRequired: boolean;
  isReadonly: boolean;
  error?: string;
  // Passed through for interactive-grid lazy loading (ADR-ADD-003).
  isTabActive?: boolean;
}

// FieldRenderer is NOT wrapped in React.memo â€” conflicts with RHF Controller subscriptions.
export function FieldRenderer({
  field,
  isVisible,
  isRequired,
  isReadonly,
  error,
  isTabActive = false,
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

  // info-card is purely presentational — skip the label/error wrapper entirely.
  if (field.fieldType === 'info-card') {
    return <InfoCardField field={field} />;
  }

  const controlProps = {
    field,
    inputId,
    isRequired,
    isReadonly,
    errorId: error ? errorId : undefined,
    appearance: resolvedProps.appearance,
    // Forwarded to interactive-grid for lazy tab-activation loading (ADR-ADD-003).
    isTabActive,
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

        <div className={isFloating ? undefined : styles.controlFill}>
          <FieldControl controlProps={controlProps} />
        </div>

        {fieldDesign?.iconSuffix && (
          <DynamicIcon iconName={fieldDesign.iconSuffix} size={16} />
        )}
      </div>

      {!isFloating && !tooltipElement && null}

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
  // Forwarded to interactive-grid for lazy tab-activation loading (ADR-ADD-003).
  isTabActive?: boolean;
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
    // DFE-ADD-002: Boolean field type.
    case 'boolean':
      return <BooleanControl {...controlProps} />;
    // DFE-ADD-002: Info-card field type (display-only, handled by early-return in FieldRenderer).
    // Included here so the switch remains exhaustive for direct FieldControl callers.
    case 'info-card':
      return <InfoCardField field={controlProps.field} />;
    // DFE-ADD-002: Interactive Grid field type (Selection + Entry modes).
    case 'interactive-grid':
      return (
        <InteractiveGridField
          {...controlProps}
          isTabActive={controlProps.isTabActive ?? false}
        />
      );
    case 'custom': {
      const key = field.componentKey ?? '';
      const CustomComponent = ComponentRegistry.resolve(key);
      if (!CustomComponent) {
        return <Text>Custom component &apos;{key}&apos; is not registered</Text>;
      }
      return <CustomComponent {...controlProps} />;
    }
    default:
      return (
        <Text>
          Unsupported field type: {(field as FieldDefinition).fieldType}
        </Text>
      );
  }
}
