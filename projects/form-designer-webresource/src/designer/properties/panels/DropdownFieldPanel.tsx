import React, { useCallback } from 'react';
import {
  Badge,
  Button,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { EditRegular } from '@fluentui/react-icons';
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
  optionsSummary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  infoNote: {
    color: tokens.colorNeutralForeground3,
  },
});

interface Props {
  field: DesignerFieldModel;
}

export function DropdownFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const navigateTo = useDesignerStore(s => s.navigateTo);
  const selectItem = useDesignerStore(s => s.selectItem);

  const optionCount = field.options.length;
  const optionLabel = `${optionCount} option${optionCount !== 1 ? 's' : ''} configured`;

  const handleEditOptions = useCallback(() => {
    selectItem(field.id, 'field');
    navigateTo('option-set-editor');
  }, [field.id, selectItem, navigateTo]);

  return (
    <div className={styles.root}>
      <div className={styles.badgeRow}>
        <Badge appearance="outline" color="brand">
          {field.fieldType}
        </Badge>
      </div>

      <div className={styles.optionsSummary}>
        <Text size={200}>{optionLabel}</Text>
        <Button
          appearance="primary"
          size="small"
          icon={<EditRegular />}
          onClick={handleEditOptions}
        >
          Edit Options
        </Button>
      </div>

      <Text size={200} className={styles.infoNote}>
        Options are applied to Dropdown, Multi-Select, and Radio field types.
      </Text>
    </div>
  );
}
