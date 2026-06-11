import React from 'react';
import {
  Badge,
  Divider,
  Field,
  Input,
  makeStyles,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';
import { GridColumnPanel } from './GridColumnPanel';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px' },
  badgeRow: { display: 'flex', alignItems: 'center', gap: '8px' },
});

interface Props {
  field: DesignerFieldModel;
}

export function RepeatingGridFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const updateField = useDesignerStore(s => s.updateField);

  return (
    <div className={styles.root}>
      <div className={styles.badgeRow}>
        <Badge appearance="outline" color="brand">repeating-grid</Badge>
      </div>

      <Field
        label="Target Entity"
        hint="Dataverse entity logical name for row submission"
      >
        <Input
          value={field.gridEntityName ?? ''}
          placeholder="e.g. qdb_application_item"
          onChange={(_, d) => updateField(field.id, { gridEntityName: d.value || null })}
          style={{ fontFamily: 'monospace' }}
        />
      </Field>

      <Field label="Max Rows" hint="Leave blank for no limit">
        <Input
          type="number"
          value={field.maxRows != null ? String(field.maxRows) : ''}
          placeholder="e.g. 10"
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

      <Divider />

      <GridColumnPanel fieldId={field.id} showIsEditable={true} />
    </div>
  );
}
