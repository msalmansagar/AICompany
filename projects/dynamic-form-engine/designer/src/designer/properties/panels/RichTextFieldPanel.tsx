import React from 'react';
import { Badge, Text, makeStyles, tokens } from '@fluentui/react-components';
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
  infoNote: {
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    padding: '10px 12px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

interface Props {
  field: DesignerFieldModel;
}

export function RichTextFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.badgeRow}>
        <Badge appearance="outline" color="brand">
          {field.fieldType}
        </Badge>
      </div>

      <div className={styles.infoNote}>
        <Text size={200}>
          Toolbar options for the rich text editor are controlled by the portal
          renderer. Use the CSS Class field above to apply custom editor styles.
        </Text>
      </div>
    </div>
  );
}
