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

export function CheckboxFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const updateField = useDesignerStore(s => s.updateField);

  const isDefaultChecked = field.defaultValue === 'true';

  const handleDefaultCheckedChange = useCallback(
    (_: React.ChangeEvent<HTMLInputElement>, data: { checked: boolean }) => {
      updateField(field.id, { defaultValue: data.checked ? 'true' : 'false' });
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
        label="Default: Checked"
        checked={isDefaultChecked}
        onChange={handleDefaultCheckedChange}
      />
    </div>
  );
}
