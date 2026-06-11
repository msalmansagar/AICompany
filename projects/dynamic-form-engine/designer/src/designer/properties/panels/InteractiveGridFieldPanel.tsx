import React, { useCallback } from 'react';
import {
  Badge,
  Button,
  Divider,
  Field,
  Input,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';
import { GridColumnPanel } from './GridColumnPanel';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px' },
  badgeRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  modeRow: { display: 'flex', gap: '6px' },
  modeButton: { flex: 1 },
  selectionRow: { display: 'flex', gap: '6px' },
  selectionButton: { flex: 1 },
  hint: { color: tokens.colorNeutralForeground3, fontSize: '11px' },
  sectionLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
});

interface Props {
  field: DesignerFieldModel;
}

export function InteractiveGridFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const updateField = useDesignerStore(s => s.updateField);

  const mode = field.gridMode ?? 'selection';
  const selectionMode = field.gridSelectionMode ?? 'single';

  const handleModeChange = useCallback(
    (m: 'selection' | 'entry') => { updateField(field.id, { gridMode: m }); },
    [field.id, updateField],
  );

  const handleSelectionModeChange = useCallback(
    (m: 'single' | 'multi') => { updateField(field.id, { gridSelectionMode: m }); },
    [field.id, updateField],
  );

  return (
    <div className={styles.root}>
      <div className={styles.badgeRow}>
        <Badge appearance="outline" color="brand">interactive-grid</Badge>
      </div>

      {/* Mode toggle */}
      <Field label="Grid Mode">
        <div className={styles.modeRow}>
          <Button
            className={styles.modeButton}
            appearance={mode === 'selection' ? 'primary' : 'outline'}
            size="small"
            onClick={() => handleModeChange('selection')}
            aria-pressed={mode === 'selection'}
          >
            Selection
          </Button>
          <Button
            className={styles.modeButton}
            appearance={mode === 'entry' ? 'primary' : 'outline'}
            size="small"
            onClick={() => handleModeChange('entry')}
            aria-pressed={mode === 'entry'}
          >
            Entry
          </Button>
        </div>
      </Field>

      {/* Entity name — both modes */}
      <Field
        label="Target Entity"
        hint="Dataverse entity logical name"
        required
      >
        <Input
          value={field.gridEntityName ?? ''}
          placeholder="e.g. account"
          onChange={(_, d) => updateField(field.id, { gridEntityName: d.value || null })}
          style={{ fontFamily: 'monospace' }}
        />
      </Field>

      {/* Selection mode config */}
      {mode === 'selection' && (
        <>
          <Field label="Selection Mode">
            <div className={styles.selectionRow}>
              <Button
                className={styles.selectionButton}
                appearance={selectionMode === 'single' ? 'primary' : 'outline'}
                size="small"
                onClick={() => handleSelectionModeChange('single')}
                aria-pressed={selectionMode === 'single'}
              >
                Single
              </Button>
              <Button
                className={styles.selectionButton}
                appearance={selectionMode === 'multi' ? 'primary' : 'outline'}
                size="small"
                onClick={() => handleSelectionModeChange('multi')}
                aria-pressed={selectionMode === 'multi'}
              >
                Multi
              </Button>
            </div>
          </Field>

          <Field
            label="Saved View ID"
            hint="System View GUID to drive columns and filter (optional)"
          >
            <Input
              value={field.gridSavedViewId ?? ''}
              placeholder="e.g. 00000000-0000-0000-0000-000000000000"
              onChange={(_, d) => updateField(field.id, { gridSavedViewId: d.value || null })}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Field>

          <Field
            label="Filter Expression"
            hint="OData/FetchXML filter applied server-side (optional)"
          >
            <Input
              value={field.gridFilterExpression ?? ''}
              placeholder="e.g. statuscode eq 1"
              onChange={(_, d) => updateField(field.id, { gridFilterExpression: d.value || null })}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Field>

          <Field label="Max Rows" hint="Row cap enforced server-side">
            <Input
              type="number"
              value={field.maxRows != null ? String(field.maxRows) : ''}
              placeholder="200"
              onChange={(_, d) =>
                updateField(field.id, { maxRows: d.value ? parseInt(d.value, 10) : null })
              }
            />
          </Field>

          <Divider />
          <Text className={styles.sectionLabel}>Dynamic Filtering (optional)</Text>

          <Field
            label="Depends On Field"
            hint="Field code of the controlling field"
          >
            <Input
              value={field.gridDependsOnFieldId ?? ''}
              placeholder="e.g. cs_filter_status"
              onChange={(_, d) => updateField(field.id, { gridDependsOnFieldId: d.value || null })}
              style={{ fontFamily: 'monospace' }}
            />
          </Field>

          <Field
            label="Filter Template"
            hint="FetchXML template — use {value} for the controlling field value"
          >
            <Input
              value={field.gridDependsOnFilterTemplate ?? ''}
              placeholder="e.g. <condition attribute='statuscode' value='{value}' />"
              onChange={(_, d) => updateField(field.id, { gridDependsOnFilterTemplate: d.value || null })}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Field>
        </>
      )}

      {/* Entry mode config */}
      {mode === 'entry' && (
        <>
          <Field label="Max Rows">
            <Input
              type="number"
              value={field.maxRows != null ? String(field.maxRows) : ''}
              placeholder="200"
              onChange={(_, d) =>
                updateField(field.id, { maxRows: d.value ? parseInt(d.value, 10) : null })
              }
            />
          </Field>
          <Field label="Min Rows" hint="Rows shown empty on load">
            <Input
              type="number"
              value={field.gridMinRows != null ? String(field.gridMinRows) : ''}
              placeholder="1"
              onChange={(_, d) =>
                updateField(field.id, { gridMinRows: d.value ? parseInt(d.value, 10) : null })
              }
            />
          </Field>
        </>
      )}

      <Divider />
      <GridColumnPanel
        fieldId={field.id}
        showIsEditable={mode === 'entry'}
      />
    </div>
  );
}
