import { useMemo, useState } from 'react';
import {
  Combobox,
  Option,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { LookupResult } from '@dfe/shared';
import { useFormContext } from '../../../contexts/FormContext';
import { useLookupSearch } from '../../../hooks/useLookupSearch';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  combobox: {
    width: '100%',
  },
  spinnerWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: tokens.spacingVerticalXS,
  },
});

interface LookupValue {
  id: string;
  displayName: string;
}

export function LookupControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue } = useFormContext();
  const [inputText, setInputText] = useState('');

  const lookupConfig = field.lookupConfig;

  // dependsOnFieldId is resolved to a schema name in CrmMetadataService,
  // so fieldValues[dependsOnFieldId] correctly reads the parent field's current value.
  const dependsOnValue = lookupConfig?.dependsOnFieldId
    ? String(fieldValues[lookupConfig.dependsOnFieldId] ?? '')
    : undefined;

  // Substitute the parent value into the template, falling back to the static filter.
  const effectiveFilter = useMemo(() => {
    if (lookupConfig?.dependsOnFilterTemplate && dependsOnValue) {
      return lookupConfig.dependsOnFilterTemplate.replace('{value}', dependsOnValue);
    }
    return lookupConfig?.filterExpression;
  }, [lookupConfig?.dependsOnFilterTemplate, lookupConfig?.filterExpression, dependsOnValue]);

  const { results, isSearching, search } = useLookupSearch({
    entityName: lookupConfig?.entityLogicalName ?? '',
    displayAttribute: lookupConfig?.displayAttribute ?? 'name',
    valueAttribute: lookupConfig?.valueAttribute,
    maxResults: lookupConfig?.maxResults ?? 10,
    filterExpression: effectiveFilter,
  });

  const rawValue = fieldValues[field.schemaName] as LookupValue | null | undefined;
  const selectedLabel = rawValue?.displayName ?? '';

  const minChars = lookupConfig?.searchMinChars ?? 2;

  function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
    const query = event.target.value;
    setInputText(query);

    if (query.length >= minChars) {
      search(query);
    }
  }

  function handleOptionSelect(_event: unknown, data: { optionValue?: string }) {
    const selected = results.find((r) => r.id === data.optionValue);

    if (selected) {
      updateFieldValue(field.schemaName, {
        id: selected.id,
        displayName: selected.displayName,
      } satisfies LookupValue);

      setInputText(selected.displayName);
    }
  }

  function handleClear() {
    updateFieldValue(field.schemaName, null);
    setInputText('');
  }

  const displayValue = inputText || selectedLabel;

  return (
    <Combobox
      id={inputId}
      className={styles.combobox}
      value={displayValue}
      onInput={handleInput}
      selectedOptions={rawValue ? [rawValue.id] : []}
      onOptionSelect={handleOptionSelect}
      placeholder={field.placeholder ?? `Search ${lookupConfig?.entityLogicalName ?? ''}...`}
      disabled={isReadonly}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
      freeform
      clearable
      onChange={(e) => { if (!e.target.value) handleClear(); }}
    >
      {isSearching && (
        <Option value="__searching__" text="Searching..." disabled>
          <div className={styles.spinnerWrapper}>
            <Spinner size="tiny" />
            Searching...
          </div>
        </Option>
      )}

      {!isSearching && inputText.length >= minChars && results.length === 0 && (
        <Option value="__no_results__" text="No results found" disabled>
          No results found
        </Option>
      )}

      {!isSearching &&
        results.map((result: LookupResult) => (
          <Option key={result.id} value={result.id} text={result.displayName}>
            {result.displayName}
          </Option>
        ))}
    </Combobox>
  );
}
