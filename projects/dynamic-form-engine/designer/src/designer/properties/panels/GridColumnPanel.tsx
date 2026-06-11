import React, { useCallback } from 'react';
import {
  Badge,
  Button,
  Field,
  Input,
  Select,
  Switch,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular, ArrowUpRegular, ArrowDownRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerGridColumnConfig } from '@/state/models/DesignerFormModel';

const COLUMN_FIELD_TYPES = [
  { value: 'text',    label: 'Text' },
  { value: 'number',  label: 'Number' },
  { value: 'date',    label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'dropdown', label: 'Dropdown' },
];

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '10px' },
  addRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  heading: { color: tokens.colorNeutralForeground3, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  emptyState: { color: tokens.colorNeutralForeground3, fontSize: '12px', fontStyle: 'italic', padding: '8px 0' },
  columnCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '6px',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  columnActions: { display: 'flex', gap: '4px' },
  fieldRow: { display: 'flex', gap: '8px' },
  fieldRowItem: { flex: 1, minWidth: 0 },
});

function generateTempColId(): string {
  return `tmp_col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface Props {
  fieldId: string;
  showIsEditable?: boolean;
}

export function GridColumnPanel({ fieldId, showIsEditable = false }: Props): React.ReactElement {
  const styles = useStyles();
  const field = useDesignerStore(s => s.fields[fieldId]);
  const updateField = useDesignerStore(s => s.updateField);

  const columns: DesignerGridColumnConfig[] = field?.gridColumns ?? [];

  const handleAdd = useCallback(() => {
    const newCol: DesignerGridColumnConfig = {
      id: generateTempColId(),
      columnLabel: '',
      targetAttribute: '',
      columnFieldType: 'text',
      displayOrder: columns.length,
      isEditable: false,
      optionsJson: null,
    };
    updateField(fieldId, { gridColumns: [...columns, newCol] });
  }, [fieldId, columns, updateField]);

  const handleUpdate = useCallback(
    (colId: string, patch: Partial<DesignerGridColumnConfig>) => {
      updateField(fieldId, {
        gridColumns: columns.map(c => c.id === colId ? { ...c, ...patch } : c),
      });
    },
    [fieldId, columns, updateField],
  );

  const handleDelete = useCallback(
    (colId: string) => {
      const updated = columns
        .filter(c => c.id !== colId)
        .map((c, i) => ({ ...c, displayOrder: i }));
      updateField(fieldId, { gridColumns: updated });
    },
    [fieldId, columns, updateField],
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const updated = [...columns];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      updateField(fieldId, { gridColumns: updated.map((c, i) => ({ ...c, displayOrder: i })) });
    },
    [fieldId, columns, updateField],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index === columns.length - 1) return;
      const updated = [...columns];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      updateField(fieldId, { gridColumns: updated.map((c, i) => ({ ...c, displayOrder: i })) });
    },
    [fieldId, columns, updateField],
  );

  return (
    <div className={styles.root}>
      <div className={styles.addRow}>
        <Text className={styles.heading}>Columns ({columns.length})</Text>
        <Button
          appearance="outline"
          size="small"
          icon={<AddRegular />}
          onClick={handleAdd}
        >
          Add Column
        </Button>
      </div>

      {columns.length === 0 && (
        <Text className={styles.emptyState}>
          No columns defined. Add at least one column to show data in the grid.
        </Text>
      )}

      {columns.map((col, index) => (
        <div key={col.id} className={styles.columnCard}>
          <div className={styles.columnHeader}>
            <Badge appearance="filled" color="informative" size="small">
              Col {index + 1}
            </Badge>
            <div className={styles.columnActions}>
              <Button
                size="small"
                appearance="subtle"
                icon={<ArrowUpRegular />}
                disabled={index === 0}
                onClick={() => handleMoveUp(index)}
                aria-label="Move column up"
              />
              <Button
                size="small"
                appearance="subtle"
                icon={<ArrowDownRegular />}
                disabled={index === columns.length - 1}
                onClick={() => handleMoveDown(index)}
                aria-label="Move column down"
              />
              <Button
                size="small"
                appearance="subtle"
                icon={<DeleteRegular />}
                onClick={() => handleDelete(col.id)}
                aria-label="Delete column"
              />
            </div>
          </div>

          <div className={styles.fieldRow}>
            <Field label="Column Label" className={styles.fieldRowItem}>
              <Input
                size="small"
                value={col.columnLabel}
                placeholder="e.g. Full Name"
                onChange={(_, d) => handleUpdate(col.id, { columnLabel: d.value })}
              />
            </Field>
            <Field label="CRM Attribute" className={styles.fieldRowItem}>
              <Input
                size="small"
                value={col.targetAttribute}
                placeholder="e.g. qdb_full_name"
                onChange={(_, d) => handleUpdate(col.id, { targetAttribute: d.value })}
                style={{ fontFamily: 'monospace' }}
              />
            </Field>
          </div>

          <div className={styles.fieldRow}>
            <Field label="Field Type" className={styles.fieldRowItem}>
              <Select
                size="small"
                value={col.columnFieldType}
                onChange={(_, d) => handleUpdate(col.id, { columnFieldType: d.value })}
              >
                {COLUMN_FIELD_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>

            {showIsEditable && (
              <Field label="Editable" className={styles.fieldRowItem}>
                <Switch
                  checked={col.isEditable}
                  onChange={(_, d) => handleUpdate(col.id, { isEditable: d.checked })}
                  label={col.isEditable ? 'Yes' : 'No'}
                />
              </Field>
            )}
          </div>

          {col.columnFieldType === 'dropdown' && (
            <Field
              label="Options JSON"
              hint={'[{"value":"a","label":"Option A"},...]'}
            >
              <Input
                size="small"
                value={col.optionsJson ?? ''}
                placeholder='[{"value":"a","label":"Option A"}]'
                onChange={(_, d) => handleUpdate(col.id, { optionsJson: d.value || null })}
                style={{ fontFamily: 'monospace', fontSize: '11px' }}
              />
            </Field>
          )}
        </div>
      ))}
    </div>
  );
}
