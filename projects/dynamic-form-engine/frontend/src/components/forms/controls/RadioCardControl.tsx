import { makeStyles, tokens, mergeClasses } from '@fluentui/react-components';
import { CheckmarkCircleFilled } from '@fluentui/react-icons';
import type { OptionValue } from '@qdb/shared';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `2px solid ${tokens.colorNeutralStroke1}`,
    cursor: 'pointer',
    backgroundColor: tokens.colorNeutralBackground1,
    textAlign: 'center',
    transition: 'border-color 0.15s ease, background-color 0.15s ease',
  },
  cardSelected: {
    border: `2px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  cardDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  checkmark: {
    position: 'absolute',
    top: tokens.spacingVerticalXS,
    right: tokens.spacingHorizontalXS,
    color: tokens.colorBrandForeground1,
    fontSize: '18px',
  },
  label: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    lineHeight: tokens.lineHeightBase300,
  },
  description: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase200,
  },
  hiddenRadio: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
    pointerEvents: 'none',
  },
});

export function RadioCardControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue, ruleState } = useFormContext();

  const filteredByRule = ruleState.filteredOptions[field.id];
  const options: OptionValue[] = (filteredByRule ?? field.options ?? []).filter((o) => o.isActive);

  const rawValue = fieldValues[field.schemaName];
  const selectedValue = rawValue !== null && rawValue !== undefined ? String(rawValue) : '';

  function handleSelect(value: string) {
    if (!isReadonly) updateFieldValue(field.schemaName, value);
  }

  return (
    <div
      role="radiogroup"
      id={inputId}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
      className={styles.grid}
    >
      {options
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((option) => {
          const isSelected = selectedValue === option.value;
          return (
            <div
              key={option.value}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isReadonly}
              tabIndex={isReadonly ? -1 : 0}
              className={mergeClasses(
                styles.card,
                isSelected && styles.cardSelected,
                isReadonly && styles.cardDisabled,
              )}
              onClick={() => handleSelect(option.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(option.value);
                }
              }}
            >
              {isSelected && <CheckmarkCircleFilled className={styles.checkmark} />}
              <span className={styles.label}>{option.label}</span>
            </div>
          );
        })}
    </div>
  );
}
