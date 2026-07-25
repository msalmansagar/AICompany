import React, { useCallback } from 'react';
import {
  Badge,
  Button,
  Divider,
  Field,
  Input,
  Select,
  Switch,
  Text,
  Textarea,
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
  // DFE-GRIDSRC-001: data source (Dataverse entity vs static JSON), display mode,
  // and interactivity for selection/display grids.
  const dataSource = field.gridDataSource ?? 'entity';
  const displayMode = field.gridDisplayMode ?? 'columns';
  const cardLayout = field.gridCardLayout ?? 'grid';
  const pagingStyle = field.gridPagingStyle ?? 'prevnext';
  const gridViewMode = field.gridViewMode ?? 'both';
  const selectable = field.gridSelectable !== false;

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

      {/* Entity name — entry mode, or selection with a Dataverse data source */}
      {(mode === 'entry' || dataSource === 'entity') && (
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
      )}

      {/* Selection / display config */}
      {mode === 'selection' && (
        <>
          {/* DFE-GRIDSRC-001: data source */}
          <Field label="Data Source">
            <div className={styles.modeRow}>
              <Button
                className={styles.modeButton}
                appearance={dataSource === 'entity' ? 'primary' : 'outline'}
                size="small"
                onClick={() => updateField(field.id, { gridDataSource: 'entity' })}
                aria-pressed={dataSource === 'entity'}
              >
                Entity
              </Button>
              <Button
                className={styles.modeButton}
                appearance={dataSource === 'json' ? 'primary' : 'outline'}
                size="small"
                onClick={() => updateField(field.id, { gridDataSource: 'json' })}
                aria-pressed={dataSource === 'json'}
              >
                JSON
              </Button>
            </div>
          </Field>

          {dataSource === 'json' && (
            <Field label="JSON Data" hint="A JSON array of row objects; keys map to the column attributes below.">
              <Textarea
                value={field.gridJsonData ?? ''}
                placeholder={'[{"name":"Alice","role":"Engineer"}]'}
                onChange={(_, d) => updateField(field.id, { gridJsonData: d.value || null })}
                rows={5}
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
            </Field>
          )}

          {/* DFE-GRIDSRC-001: display mode */}
          <Field label="Display As">
            <div className={styles.modeRow}>
              <Button
                className={styles.modeButton}
                appearance={displayMode === 'columns' ? 'primary' : 'outline'}
                size="small"
                onClick={() => updateField(field.id, { gridDisplayMode: 'columns' })}
                aria-pressed={displayMode === 'columns'}
              >
                Columns
              </Button>
              <Button
                className={styles.modeButton}
                appearance={displayMode === 'infocard' ? 'primary' : 'outline'}
                size="small"
                onClick={() => updateField(field.id, { gridDisplayMode: 'infocard' })}
                aria-pressed={displayMode === 'infocard'}
              >
                InfoCard
              </Button>
            </div>
          </Field>

          <Field label="View Mode" hint="Which views the user gets: Both (with a toggle), List only, or Cards only.">
            <Select
              value={gridViewMode}
              onChange={(_, d) =>
                updateField(field.id, { gridViewMode: d.value as 'both' | 'table' | 'card' })
              }
            >
              <option value="both">Both (toggle)</option>
              <option value="table">List only</option>
              <option value="card">Cards only</option>
            </Select>
          </Field>

          {displayMode === 'infocard' && (
            <>
              <Field label="Card Layout" hint="Grid = multi-column cards; Row = full-width horizontal list rows.">
                <div className={styles.modeRow}>
                  <Button
                    className={styles.modeButton}
                    appearance={cardLayout === 'grid' ? 'primary' : 'outline'}
                    size="small"
                    onClick={() => updateField(field.id, { gridCardLayout: 'grid' })}
                    aria-pressed={cardLayout === 'grid'}
                  >
                    Grid
                  </Button>
                  <Button
                    className={styles.modeButton}
                    appearance={cardLayout === 'row' ? 'primary' : 'outline'}
                    size="small"
                    onClick={() => updateField(field.id, { gridCardLayout: 'row' })}
                    aria-pressed={cardLayout === 'row'}
                  >
                    Row
                  </Button>
                </div>
              </Field>
              <Field label="Card Icon" hint="Fluent icon name shown on each card (optional), e.g. PersonRegular">
                <Input
                  value={field.gridCardIcon ?? ''}
                  placeholder="e.g. PersonRegular"
                  onChange={(_, d) => updateField(field.id, { gridCardIcon: d.value || null })}
                  style={{ fontFamily: 'monospace' }}
                />
              </Field>
            </>
          )}

          <Field label="Selectable" hint="Off = read-only display (no row selection).">
            <Switch
              checked={selectable}
              onChange={(_, d) => updateField(field.id, { gridSelectable: d.checked })}
            />
          </Field>

          {selectable && (
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
          )}

          {/* Entity-source-only settings */}
          {dataSource === 'entity' && (
            <>
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

              <Field label="Max Rows" hint="Total row cap across all pages, enforced server-side">
                <Input
                  type="number"
                  value={field.maxRows != null ? String(field.maxRows) : ''}
                  placeholder="200"
                  onChange={(_, d) =>
                    updateField(field.id, { maxRows: d.value ? parseInt(d.value, 10) : null })
                  }
                />
              </Field>

              <Field label="Rows per Page" hint="Records shown per page before Next/Previous (default 50)">
                <Input
                  type="number"
                  value={field.gridPageSize != null ? String(field.gridPageSize) : ''}
                  placeholder="50"
                  onChange={(_, d) =>
                    updateField(field.id, { gridPageSize: d.value ? parseInt(d.value, 10) : null })
                  }
                />
              </Field>

              <Field label="Paging Style" hint="Previous/Next buttons, or numbered page buttons">
                <Select
                  value={pagingStyle}
                  onChange={(_, d) =>
                    updateField(field.id, { gridPagingStyle: d.value as 'prevnext' | 'numbered' })
                  }
                >
                  <option value="prevnext">Prev / Next</option>
                  <option value="numbered">Numbered</option>
                </Select>
              </Field>

              <Divider />
              <Text className={styles.sectionLabel}>Dynamic Filtering (optional)</Text>

              <Field
                label="Depends On Field(s)"
                hint="One or more controlling form-field schema names, comma-separated. Each supplies a {schemaName} value to the template below."
              >
                <Input
                  value={field.gridDependsOnFieldId ?? ''}
                  placeholder="e.g. cs_service, cs_region, statuscode"
                  onChange={(_, d) => updateField(field.id, { gridDependsOnFieldId: d.value || null })}
                  style={{ fontFamily: 'monospace' }}
                />
              </Field>

              <Field
                label="Filter Template"
                hint="Boolean filter over the grid entity: conditions joined by and/or with parentheses; values via {fieldSchemaName}. Quote text/GUID values, leave numbers unquoted. Empty fields drop their condition."
              >
                <Input
                  value={field.gridDependsOnFilterTemplate ?? ''}
                  placeholder="e.g. cs_service eq '{cs_service}' and ( cs_region eq '{cs_region}' or statuscode eq {statuscode} )"
                  onChange={(_, d) => updateField(field.id, { gridDependsOnFilterTemplate: d.value || null })}
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />
              </Field>
            </>
          )}
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
