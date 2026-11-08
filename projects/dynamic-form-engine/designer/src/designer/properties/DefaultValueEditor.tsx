import React, { useCallback, useMemo } from 'react';
import { Dropdown, Field, Input, Option, Text, makeStyles, tokens } from '@fluentui/react-components';
import {
  parseMultiSelectDefault,
  serialiseMultiSelectDefault,
} from '@qdb/shared';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerFieldModel, DesignerOptionValue } from '@/state/models/DesignerFormModel';

/** Field types whose default is one of the field's own options. */
const SINGLE_OPTION_TYPES = new Set(['dropdown', 'radio']);

/** Field types whose default is any number of the field's own options. */
const MULTI_OPTION_TYPES = new Set(['multi_select']);

/** The placeholder value for "no default", since an Option cannot carry an empty value. */
const NO_DEFAULT = '__none__';

const useStyles = makeStyles({
  emptyHint: {
    color: tokens.colorNeutralForeground3,
  },
});

interface Props {
  field: DesignerFieldModel;
}

/**
 * The Default Value control for one field.
 *
 * Option-backed field types pick from their own options rather than accepting free text,
 * because a typed value that does not match an option value silently selects nothing at
 * runtime. Every other type keeps the free-text box.
 */
export function DefaultValueEditor({ field }: Props): React.ReactElement {
  if (MULTI_OPTION_TYPES.has(field.fieldType)) {
    return <MultiOptionDefault field={field} />;
  }
  if (SINGLE_OPTION_TYPES.has(field.fieldType)) {
    return <SingleOptionDefault field={field} />;
  }
  return <FreeTextDefault field={field} />;
}

function FreeTextDefault({ field }: Props): React.ReactElement {
  const updateField = useDesignerStore(s => s.updateField);
  return (
    <Field label="Default Value">
      <Input
        value={field.defaultValue ?? ''}
        onChange={(_, data) => updateField(field.id, { defaultValue: data.value || null })}
        placeholder="Optional default value"
      />
    </Field>
  );
}

function SingleOptionDefault({ field }: Props): React.ReactElement {
  const updateField = useDesignerStore(s => s.updateField);
  const options = useSortedOptions(field.options);
  const selected = field.defaultValue ?? '';
  const isUnknown = selected !== '' && !options.some(o => o.value === selected);
  const selectedLabel = isUnknown
    ? missingOptionLabel(selected)
    : options.find(o => o.value === selected)?.label ?? '';

  const handleSelect = useCallback(
    (value: string) => {
      updateField(field.id, { defaultValue: value === NO_DEFAULT ? null : value });
    },
    [field.id, updateField],
  );

  if (options.length === 0) return <NoOptionsHint />;

  return (
    <Field label="Default Value" hint="Selected when the form opens.">
      <Dropdown
        value={selectedLabel}
        selectedOptions={selected ? [selected] : [NO_DEFAULT]}
        onOptionSelect={(_, data) => handleSelect(String(data.optionValue ?? NO_DEFAULT))}
        placeholder="No default"
      >
        <Option value={NO_DEFAULT}>No default</Option>
        {isUnknown && <Option value={selected}>{missingOptionLabel(selected)}</Option>}
        {options.map(option => (
          <Option key={option.value} value={option.value}>
            {option.label}
          </Option>
        ))}
      </Dropdown>
    </Field>
  );
}

function MultiOptionDefault({ field }: Props): React.ReactElement {
  const updateField = useDesignerStore(s => s.updateField);
  const options = useSortedOptions(field.options);
  const selected = useMemo(() => parseMultiSelectDefault(field.defaultValue), [field.defaultValue]);

  const handleSelect = useCallback(
    (values: string[]) => {
      updateField(field.id, { defaultValue: serialiseMultiSelectDefault(values) });
    },
    [field.id, updateField],
  );

  if (options.length === 0) return <NoOptionsHint />;

  const unknown = selected.filter(value => !options.some(o => o.value === value));
  const selectedLabels = selected
    .map(value => options.find(o => o.value === value)?.label ?? missingOptionLabel(value))
    .join(', ');

  return (
    <Field label="Default Value" hint="Selected when the form opens.">
      <Dropdown
        multiselect
        value={selectedLabels}
        selectedOptions={selected}
        onOptionSelect={(_, data) => handleSelect(data.selectedOptions)}
        placeholder="No default"
      >
        {unknown.map(value => (
          <Option key={value} value={value}>{missingOptionLabel(value)}</Option>
        ))}
        {options.map(option => (
          <Option key={option.value} value={option.value}>
            {option.label}
          </Option>
        ))}
      </Dropdown>
    </Field>
  );
}

function NoOptionsHint(): React.ReactElement {
  const styles = useStyles();
  return (
    <Field label="Default Value">
      <Text size={200} className={styles.emptyHint}>
        Add options first — a default is chosen from them.
      </Text>
    </Field>
  );
}

/**
 * A stored default naming no current option is shown as itself rather than as nothing.
 * Rendering it blank would read as "no default" while the old value stayed stored, and
 * the maker would have no way to see what the field actually carries.
 */
function missingOptionLabel(value: string): string {
  return `${value} (no longer an option)`;
}

function useSortedOptions(options: DesignerOptionValue[]): DesignerOptionValue[] {
  return useMemo(
    () => [...options].sort((a, b) => a.sortOrder - b.sortOrder),
    [options],
  );
}
