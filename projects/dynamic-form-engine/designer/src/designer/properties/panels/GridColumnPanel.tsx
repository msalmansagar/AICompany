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
import type { DesignerGridColumnConfig, GridColumnFilterType, GridValidationFormat } from '@/state/models/DesignerFormModel';

const COLUMN_FIELD_TYPES = [
  { value: 'text',    label: 'Text' },
  { value: 'number',  label: 'Number' },
  { value: 'date',    label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'lookup',  label: 'Lookup' },
  { value: 'file',    label: 'File / Document' },
];

const VALIDATION_FORMATS: { value: GridValidationFormat; label: string }[] = [
  { value: 'none',         label: 'No format check' },
  { value: 'email',        label: 'Email address' },
  { value: 'phone',        label: 'Phone number' },
  { value: 'url',          label: 'URL' },
  { value: 'numeric',      label: 'Number' },
  { value: 'alphanumeric', label: 'Letters and numbers' },
  { value: 'custom',       label: 'Custom pattern…' },
];

const FILTER_TYPES: { value: GridColumnFilterType | 'auto'; label: string }[] = [
  { value: 'auto',      label: 'Auto (from field type)' },
  { value: 'text',      label: 'Text search' },
  { value: 'optionset', label: 'Option set' },
  { value: 'lookup',    label: 'Lookup (by name)' },
  { value: 'none',      label: 'No filter' },
];

function deriveDefaultFilterType(fieldType: string): GridColumnFilterType {
  if (['text', 'email', 'phone', 'textarea'].includes(fieldType)) return 'text';
  if (fieldType === 'dropdown') return 'optionset';
  if (fieldType === 'lookup') return 'lookup';
  return 'none';
}

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
  columnBadges: { display: 'flex', gap: '4px', alignItems: 'center' },
  groupHeading: {
    color: tokens.colorNeutralForeground3,
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: '2px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: '8px',
  },
  // The properties panel is 320px, leaving a measured 246px inside this card.
  // Three controls forced across it left ~82px each — narrower than a select's own
  // option text or the switch's Yes/No label, which is why they overlapped.
  //
  // Auto-fit reflows instead. The minimum is 112px because two columns need
  // 2 x min + 8px of gap to fit inside 246: at 120px that comes to 248 and every
  // row silently collapsed to one control per line, which is tidy but wastes half
  // the panel. 112 pairs them up, and three still cannot fit, so the switch drops
  // to its own line where its label has room.
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
    gap: '8px',
    alignItems: 'end',
  },
  fieldRowItem: { minWidth: 0 },
});

function generateTempColId(): string {
  return `tmp_col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// A cleared box means "no limit", not zero. Anything that is not a positive whole number
// stores as null rather than NaN, which would reach Dataverse as an invalid Integer.
function parseMaxLength(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Whether the column has any rule that could produce a message worth wording. */
function hasAnyValidation(col: DesignerGridColumnConfig): boolean {
  return col.isRequired
    || col.maxLength != null
    || (col.validationFormat !== 'none' && col.validationFormat !== undefined);
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
      isVisible: true,
      isEditable: false,
      isRequired: false,
      maxLength: null,
      validationFormat: 'none',
      validationPattern: null,
      validationMessage: null,
      optionsJson: null,
      filterType: 'text',
      lookupTargetEntity: null,
      lookupDisplayAttribute: null,
      lookupValueAttribute: null,
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
            <div className={styles.columnBadges}>
              <Badge appearance="filled" color="informative" size="small">
                Col {index + 1}
              </Badge>
              {!col.isVisible && (
                <Badge appearance="tint" color="subtle" size="small">
                  Hidden
                </Badge>
              )}
            </div>
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
                onChange={(_, d) => {
                  const newFieldType = d.value;
                  handleUpdate(col.id, {
                    columnFieldType: newFieldType,
                    filterType: deriveDefaultFilterType(newFieldType),
                  });
                }}
              >
                {COLUMN_FIELD_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>

            <Field label="Filter Type" className={styles.fieldRowItem}>
              <Select
                size="small"
                value={col.filterType ?? 'auto'}
                onChange={(_, d) => {
                  const ft = d.value === 'auto'
                    ? deriveDefaultFilterType(col.columnFieldType)
                    : d.value as GridColumnFilterType;
                  handleUpdate(col.id, { filterType: ft });
                }}
              >
                {FILTER_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>

            <Field
              label="Visible"
              className={styles.fieldRowItem}
              hint="Hidden columns are still saved and published — the grid just does not draw them."
            >
              <Switch
                checked={col.isVisible}
                onChange={(_, d) => handleUpdate(col.id, { isVisible: d.checked })}
                label={col.isVisible ? 'Yes' : 'No'}
              />
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

          {col.filterType === 'lookup' && (
            <div className={styles.fieldRow}>
              <Field label="Lookup Entity" className={styles.fieldRowItem} hint="e.g. contact">
                <Input
                  size="small"
                  value={col.lookupTargetEntity ?? ''}
                  placeholder="contact"
                  onChange={(_, d) => handleUpdate(col.id, { lookupTargetEntity: d.value || null })}
                  style={{ fontFamily: 'monospace' }}
                />
              </Field>
              <Field label="Display Attribute" className={styles.fieldRowItem} hint="e.g. fullname">
                <Input
                  size="small"
                  value={col.lookupDisplayAttribute ?? ''}
                  placeholder="fullname"
                  onChange={(_, d) => handleUpdate(col.id, { lookupDisplayAttribute: d.value || null })}
                  style={{ fontFamily: 'monospace' }}
                />
              </Field>
              <Field label="Value / ID Attribute" className={styles.fieldRowItem} hint="stored ID — blank ⇒ primary key">
                <Input
                  size="small"
                  value={col.lookupValueAttribute ?? ''}
                  placeholder="accountid"
                  onChange={(_, d) => handleUpdate(col.id, { lookupValueAttribute: d.value || null })}
                  style={{ fontFamily: 'monospace' }}
                />
              </Field>
            </div>
          )}

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

          <Text className={styles.groupHeading}>Validation</Text>

          <div className={styles.fieldRow}>
            <Field label="Required" className={styles.fieldRowItem}>
              <Switch
                checked={col.isRequired}
                onChange={(_, d) => handleUpdate(col.id, { isRequired: d.checked })}
                label={col.isRequired ? 'Yes' : 'No'}
              />
            </Field>

            <Field label="Max Length" className={styles.fieldRowItem} hint="blank ⇒ no limit">
              <Input
                size="small"
                type="number"
                min={1}
                value={col.maxLength != null ? String(col.maxLength) : ''}
                placeholder="—"
                onChange={(_, d) => handleUpdate(col.id, { maxLength: parseMaxLength(d.value) })}
              />
            </Field>

            <Field label="Format" className={styles.fieldRowItem}>
              <Select
                size="small"
                value={col.validationFormat}
                onChange={(_, d) => handleUpdate(col.id, { validationFormat: d.value as GridValidationFormat })}
              >
                {VALIDATION_FORMATS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          {col.validationFormat === 'custom' && (
            <Field label="Pattern" hint="Regular expression, e.g. ^[A-Z]{2}[0-9]{6}$">
              <Input
                size="small"
                value={col.validationPattern ?? ''}
                placeholder="^[A-Z]{2}[0-9]{6}$"
                onChange={(_, d) => handleUpdate(col.id, { validationPattern: d.value || null })}
                style={{ fontFamily: 'monospace', fontSize: '11px' }}
              />
            </Field>
          )}

          {hasAnyValidation(col) && (
            <Field label="Error Message" hint="Blank ⇒ a message is generated from the rule.">
              <Input
                size="small"
                value={col.validationMessage ?? ''}
                placeholder="e.g. Enter a valid CR number"
                onChange={(_, d) => handleUpdate(col.id, { validationMessage: d.value || null })}
              />
            </Field>
          )}
        </div>
      ))}
    </div>
  );
}
