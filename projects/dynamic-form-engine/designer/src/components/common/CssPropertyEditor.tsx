import React from 'react';
import { Button, Input, Text } from '@fluentui/react-components';
import { DeleteRegular, AddRegular } from '@fluentui/react-icons';

interface CssPropertyEditorProps {
  value: Record<string, string>;
  onChange: (styles: Record<string, string>) => void;
}

interface PropertyRow {
  key: string;
  val: string;
}

function buildRows(value: Record<string, string>): PropertyRow[] {
  return Object.entries(value).map(([key, val]) => ({ key, val }));
}

function rowsToRecord(rows: PropertyRow[]): Record<string, string> {
  return Object.fromEntries(
    rows.filter(r => r.key.trim() !== '').map(r => [r.key.trim(), r.val])
  );
}

/**
 * Inline CSS key-value pair editor. Each row = one CSS property + value.
 * No external dependencies beyond Fluent UI v9.
 */
export function CssPropertyEditor({ value, onChange }: CssPropertyEditorProps): React.ReactElement {
  const rows = buildRows(value);

  function updateKey(index: number, newKey: string): void {
    const updated = rows.map((r, i) => i === index ? { ...r, key: newKey } : r);
    onChange(rowsToRecord(updated));
  }

  function updateVal(index: number, newVal: string): void {
    const updated = rows.map((r, i) => i === index ? { ...r, val: newVal } : r);
    onChange(rowsToRecord(updated));
  }

  function removeRow(index: number): void {
    const updated = rows.filter((_, i) => i !== index);
    onChange(rowsToRecord(updated));
  }

  function addRow(): void {
    const updated = [...rows, { key: '', val: '' }];
    onChange(rowsToRecord(updated));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {rows.map((row, index) => (
        <div key={index} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <Input
            value={row.key}
            onChange={(_, d) => updateKey(index, d.value)}
            placeholder="property"
            aria-label={`CSS property name ${index + 1}`}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
          />
          <Text size={200}>:</Text>
          <Input
            value={row.val}
            onChange={(_, d) => updateVal(index, d.value)}
            placeholder="value"
            aria-label={`CSS property value ${index + 1}`}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
          />
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            onClick={() => removeRow(index)}
            aria-label={`Remove property ${row.key || String(index + 1)}`}
            size="small"
          />
        </div>
      ))}
      <Button
        appearance="subtle"
        icon={<AddRegular />}
        onClick={addRow}
        size="small"
        style={{ alignSelf: 'flex-start' }}
      >
        Add property
      </Button>
    </div>
  );
}
