import React from 'react';
import { Field, Textarea, Text, makeStyles, tokens } from '@fluentui/react-components';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';
import { useDesignerStore } from '@/state/designerStore';

// DFE-FBE-001 — Label field config panel.
// Wave 1: static content. Data-bound (mirror another field's value) is Wave 2 (C-001-gated).
const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '10px' },
  note: {
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    padding: '8px 10px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

interface Props {
  field: DesignerFieldModel;
}

export function LabelFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const updateField = useDesignerStore(state => state.updateField);

  return (
    <div className={styles.root}>
      <Field label="Static Content" hint="Read-only text shown on the form (headings, notes, instructions)">
        <Textarea
          value={field.staticContent ?? ''}
          onChange={(_, data) => updateField(field.id, { staticContent: data.value || null })}
          resize="vertical"
          placeholder="e.g. Please review your details below."
        />
      </Field>
      <div className={styles.note}>
        <Text size={200}>
          Data-bound labels (mirroring another field&apos;s value read-only) arrive in a later release.
        </Text>
      </div>
    </div>
  );
}
