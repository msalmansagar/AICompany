// Lazy-loaded advanced components panel.
// Only loaded when the user expands the Advanced accordion for the first time.
import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { DraggableToolboxItem } from './DraggableToolboxItem';
import type { FieldTypeDefinition } from '@/constants/fieldTypes';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
    padding: '8px',
  },
});

interface AdvancedComponentsPanelProps {
  fieldTypes: FieldTypeDefinition[];
}

export function AdvancedComponentsPanel({ fieldTypes }: AdvancedComponentsPanelProps): React.ReactElement {
  const styles = useStyles();
  return (
    <div className={styles.grid}>
      {fieldTypes.map(fieldDef => (
        <DraggableToolboxItem key={fieldDef.type} fieldDef={fieldDef} />
      ))}
    </div>
  );
}
