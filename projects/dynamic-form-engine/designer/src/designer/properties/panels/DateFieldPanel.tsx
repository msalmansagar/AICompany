import React, { useCallback } from 'react';
import { Badge, Switch, makeStyles } from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
});

interface Props {
  field: DesignerFieldModel;
}

export function DateFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const updateField = useDesignerStore(s => s.updateField);

  const includesTime = field.fieldType === 'datetime';

  const handleIncludeTimeChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement>, data: { checked: boolean }) => {
      updateField(field.id, { fieldType: data.checked ? 'datetime' : 'date' });
    },
    [field.id, updateField]
  );

  return (
    <div className={styles.root}>
      <div className={styles.badgeRow}>
        <Badge appearance="outline" color="brand">
          {field.fieldType}
        </Badge>
      </div>

      <Switch
        label="Include Time"
        checked={includesTime}
        onChange={handleIncludeTimeChange}
      />
    </div>
  );
}
