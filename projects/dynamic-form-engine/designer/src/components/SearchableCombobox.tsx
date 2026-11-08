import React, { useEffect, useMemo, useState } from 'react';
import { Combobox, Option, makeStyles, tokens } from '@fluentui/react-components';

// Cap options rendered at once — search narrows the list, and metadata sets
// (entities/attributes) can run to several hundred entries.
const MAX_RENDERED_OPTIONS = 100;

export interface ComboItem {
  value: string;
  secondary: string;
  tertiary?: string;
}

export interface SearchableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  items: ComboItem[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel: string;
}

const useStyles = makeStyles({
  // minWidth on the component's own class, not on an ancestor: Fluent's Combobox defaults
  // to min-width 250px, wider than a grid column card's cell, and an ancestor '& *' override
  // only wins by style insertion order — it held in the dev build and lost in the production
  // bundle, so the picker painted 87px past the rail edge only when deployed. A class passed
  // into the component goes through mergeClasses, where the caller's value wins by rule.
  combobox: { width: '100%', minWidth: 0 },
  optionRow: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  optionPrimary: { fontFamily: 'monospace', fontSize: '13px' },
  optionSecondary: { fontSize: '11px', color: tokens.colorNeutralForeground3 },
});

/**
 * Freeform combobox that filters a metadata list by value or display label.
 * The stored value is always the option's logical/schema name, so it
 * round-trips to Dataverse unchanged. Freeform typing is preserved as a manual
 * fallback when metadata is unavailable (offline or an unlisted entity).
 *
 * Fluent's Combobox fires `onInput` (not `onChange`) as the user types — a
 * single `query` state seeded from the committed value drives the input.
 */
export function SearchableCombobox({
  value,
  onChange,
  items,
  placeholder,
  disabled,
  loading,
  ariaLabel,
}: SearchableComboboxProps): React.ReactElement {
  const styles = useStyles();
  const [query, setQuery] = useState(value);

  // Reflect external value changes (e.g. an entity prefilled after metadata
  // loads). onInput commits to the parent, so this never fights active typing.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const needle = query.trim().toLowerCase();
  const { shown, total } = useMemo(() => {
    const matches = needle
      ? items.filter(
          item =>
            item.value.toLowerCase().includes(needle) ||
            item.secondary.toLowerCase().includes(needle),
        )
      : items;
    return { shown: matches.slice(0, MAX_RENDERED_OPTIONS), total: matches.length };
  }, [items, needle]);

  return (
    <Combobox
      className={styles.combobox}
      freeform
      disabled={disabled}
      placeholder={loading ? 'Loading…' : placeholder}
      value={query}
      aria-label={ariaLabel}
      onInput={event => {
        const typed = (event.target as HTMLInputElement).value;
        setQuery(typed);
        onChange(typed);
      }}
      onOptionSelect={(_, data) => {
        const selected = data.optionValue ?? '';
        setQuery(selected);
        onChange(selected);
      }}
    >
      {shown.length === 0 ? (
        <Option key="__none" text="" disabled>
          {loading ? 'Loading…' : 'No matches'}
        </Option>
      ) : (
        <>
          {shown.map(item => (
            <Option key={item.value} value={item.value} text={item.value}>
              <span className={styles.optionRow}>
                <span className={styles.optionPrimary}>{item.value}</span>
                <span className={styles.optionSecondary}>
                  {item.secondary}
                  {item.tertiary ? ` · ${item.tertiary}` : ''}
                </span>
              </span>
            </Option>
          ))}
          {total > shown.length && (
            <Option key="__more" text="" disabled>
              {`Showing ${shown.length} of ${total} — type to narrow`}
            </Option>
          )}
        </>
      )}
    </Combobox>
  );
}
