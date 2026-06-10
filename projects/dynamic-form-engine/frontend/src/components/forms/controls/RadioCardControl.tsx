import { makeStyles, mergeClasses, tokens, Text } from '@fluentui/react-components';
import {
  PersonRegular,
  BriefcaseRegular,
  DocumentRegular,
  CalendarRegular,
  StarRegular,
  ShieldRegular,
  HomeRegular,
  PeopleRegular,
  ClockRegular,
  PersonCircleRegular,
  LockClosedRegular,
} from '@fluentui/react-icons';
import type { OptionValue } from '@qdb/shared';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';
import type { FC } from 'react';

// Registry of supported Fluent UI icon names → components (24px).
// Add entries here as new icon names are introduced in option data.
const ICON_REGISTRY: Record<string, FC<{ className?: string }>> = {
  PersonRegular,
  BriefcaseRegular,
  DocumentRegular,
  CalendarRegular,
  StarRegular,
  ShieldRegular,
  HomeRegular,
  PeopleRegular,
  ClockRegular,
  PersonCircleRegular,
  LockClosedRegular,
};

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  // Each card is a clickable option
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `2px solid ${tokens.colorNeutralStroke1}`,
    cursor: 'pointer',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    outline: 'none',
  },
  cardSelected: {
    border: `2px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    boxShadow: tokens.shadow8,
  },
  cardDisabled: {
    opacity: '0.5',
    cursor: 'not-allowed',
  },
  // Top row: radio indicator + icon side by side
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Custom radio circle drawn in CSS
  radioCircle: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    border: `2px solid ${tokens.colorNeutralStroke1}`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    border: `2px solid ${tokens.colorBrandForeground1}`,
  },
  // Inner dot shown when selected
  radioDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandForeground1,
  },
  // Option icon
  icon: {
    fontSize: '28px',
    color: tokens.colorNeutralForeground3,
  },
  iconSelected: {
    color: tokens.colorBrandForeground1,
  },
  // Option label (heading)
  heading: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    lineHeight: tokens.lineHeightBase300,
  },
  // Optional description below heading
  description: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase200,
  },
  descriptionSelected: {
    color: tokens.colorNeutralForeground2,
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
      aria-label={field.label}
      className={styles.grid}
    >
      {options
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((option) => {
          const isSelected = selectedValue === option.value;
          const IconComponent = option.iconName ? ICON_REGISTRY[option.iconName] : undefined;

          return (
            <div
              key={option.value}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isReadonly}
              aria-label={option.description
                ? `${option.label}: ${option.description}`
                : option.label}
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
              {/* Top row: radio circle (left) + icon (right) */}
              <div className={styles.topRow}>
                <div
                  className={mergeClasses(
                    styles.radioCircle,
                    isSelected && styles.radioCircleSelected,
                  )}
                >
                  {isSelected && <div className={styles.radioDot} />}
                </div>

                {IconComponent && (
                  <IconComponent
                    className={mergeClasses(
                      styles.icon,
                      isSelected && styles.iconSelected,
                    )}
                  />
                )}
              </div>

              {/* Heading */}
              <Text className={styles.heading}>{option.label}</Text>

              {/* Description (optional) */}
              {option.description && (
                <Text
                  className={mergeClasses(
                    styles.description,
                    isSelected && styles.descriptionSelected,
                  )}
                >
                  {option.description}
                </Text>
              )}
            </div>
          );
        })}
    </div>
  );
}
