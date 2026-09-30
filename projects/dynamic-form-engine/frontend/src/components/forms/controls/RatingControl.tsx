import { useMemo } from 'react';
import { Button, Rating, RatingDisplay, makeStyles, tokens } from '@fluentui/react-components';
import type { OptionValue } from '@qdb/shared';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';
import { useDisabledOptions } from './useDisabledOptions';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
});

/** A star's accessible name: its option's label, marked when a rule has disabled it. */
function starLabel(option: OptionValue | undefined, disabledOptions: ReadonlySet<string>, stars: number): string {
  const label = option?.label ?? String(stars);
  return option && disabledOptions.has(option.value) ? `${label} (unavailable)` : label;
}

/**
 * An option-set field drawn as stars (DFE-RULES-002 item 7).
 *
 * Star N stands for the Nth active option in display order; choosing it stores that option's
 * value, so the saved data is exactly what a dropdown would have saved. Each star is named by
 * its option's label for screen readers. Fluent's Rating follows the document direction, so an
 * Arabic form draws from the right with no extra handling.
 */
export function RatingControl({ field, inputId, isRequired, isReadonly, errorId }: ControlProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue, ruleState } = useFormContext();
  const disabledOptions = useDisabledOptions(field.id);

  const options = useMemo<OptionValue[]>(
    () => (ruleState.filteredOptions[field.id] ?? field.options ?? [])
      .filter((option) => option.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder),
    [ruleState.filteredOptions, field.id, field.options],
  );

  const rawValue = fieldValues[field.schemaName];
  const selectedIndex = options.findIndex((option) => option.value === String(rawValue ?? ''));
  const starValue = selectedIndex + 1;

  if (options.length < 2) return null;

  if (isReadonly) {
    return <RatingDisplay id={inputId} value={starValue} max={options.length} color="marigold" aria-label={field.label} />;
  }

  return (
    <div className={styles.root}>
      <Rating
        id={inputId}
        value={starValue}
        max={options.length}
        color="marigold"
        itemLabel={(stars) => starLabel(options[stars - 1], disabledOptions, stars)}
        onChange={(_event, data) => {
          // Fluent's Rating cannot disable a single star, so a star a rule has disabled is
          // announced as unavailable and choosing it changes nothing.
          const chosen = options[data.value - 1];
          if (!chosen || disabledOptions.has(chosen.value)) return;
          updateFieldValue(field.schemaName, chosen.value);
        }}
        aria-label={field.label}
        aria-required={isRequired}
        aria-describedby={errorId}
        aria-invalid={!!errorId}
      />
      {!isRequired && starValue > 0 && (
        <Button appearance="subtle" size="small" onClick={() => updateFieldValue(field.schemaName, null)}>
          Clear
        </Button>
      )}
    </div>
  );
}
