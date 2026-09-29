import React from 'react';
import { Field, Input, Select } from '@fluentui/react-components';
import {
  formatRelativeDateRef,
  parseRelativeDateRef,
  type RelativeDateAnchor,
  type RelativeDateRef,
  type RelativeDateUnit,
} from '@qdb/shared';

const ANCHOR_OPTIONS: Array<{ value: RelativeDateAnchor; label: string }> = [
  { value: 'today',      label: 'Today' },
  { value: 'monthStart', label: 'Start of this month' },
  { value: 'monthEnd',   label: 'End of this month' },
];

const UNIT_OPTIONS: Array<{ value: RelativeDateUnit; label: string }> = [
  { value: 'd', label: 'days' },
  { value: 'm', label: 'months' },
  { value: 'y', label: 'years' },
];

const DEFAULT_REF: RelativeDateRef = { anchor: 'today', offset: 0, unit: 'd' };

/** The reference a token names, or the default when the token is not one we define. */
export function readRelativeDateRef(token: string): RelativeDateRef {
  return parseRelativeDateRef(token) ?? DEFAULT_REF;
}

interface RelativeDateRefEditorProps {
  /** The current token, e.g. "@monthEnd+10y". */
  value: string;
  onChange: (token: string) => void;
}

/**
 * Composes a relative date token from an anchor, an offset and a unit.
 *
 * A maker thinks "ten years from the end of this month", never "@monthEnd+10y"; the token is
 * what the rule stores and the runtime resolves.
 */
export function RelativeDateRefEditor({ value, onChange }: RelativeDateRefEditorProps): React.ReactElement {
  const ref = readRelativeDateRef(value);

  const update = (patch: Partial<RelativeDateRef>): void => {
    onChange(formatRelativeDateRef({ ...ref, ...patch }));
  };

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
      <Field label="Relative to" style={{ flex: 2 }}>
        <Select
          value={ref.anchor}
          onChange={(_, d) => update({ anchor: d.value as RelativeDateAnchor })}
          aria-label="Relative to"
        >
          {ANCHOR_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Plus or minus" style={{ flex: 1 }}>
        <Input
          type="number"
          value={String(ref.offset)}
          onChange={(_, d) => update({ offset: Number(d.value) || 0 })}
          aria-label="Offset"
        />
      </Field>
      <Field label="Unit" style={{ flex: 1 }}>
        <Select
          value={ref.unit}
          onChange={(_, d) => update({ unit: d.value as RelativeDateUnit })}
          aria-label="Offset unit"
        >
          {UNIT_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
