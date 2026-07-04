import React from 'react';
import { Dropdown, Field, Option, Textarea, Text, makeStyles, tokens } from '@fluentui/react-components';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';
import { useDesignerStore } from '@/state/designerStore';

// DFE-FBE-001/002 — Label field config: static text, or a data-bound mirror of another
// field's value (shown read-only, e.g. on a manual summary tab).
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
  const allFields = useDesignerStore(state => state.fields);

  // Candidate source fields: any other non-label field (mirror its value read-only).
  const sourceOptions = Object.values(allFields).filter(
    f => f.id !== field.id && f.fieldType !== 'label',
  );
  const isBound = !!field.sourceFieldSchemaName;
  const currentSource = sourceOptions.find(f => f.code === field.sourceFieldSchemaName);

  return (
    <div className={styles.root}>
      <Field label="Display mode" hint="Static text, or mirror another field's value read-only">
        <Dropdown
          selectedOptions={[isBound ? 'bound' : 'static']}
          value={isBound ? 'Mirror a field value' : 'Static text'}
          onOptionSelect={(_, data) => {
            if (data.optionValue === 'bound') {
              updateField(field.id, { staticContent: null, sourceFieldSchemaName: sourceOptions[0]?.code ?? '' });
            } else {
              updateField(field.id, { sourceFieldSchemaName: null });
            }
          }}
        >
          <Option value="static">Static text</Option>
          <Option value="bound">Mirror a field value</Option>
        </Dropdown>
      </Field>

      {isBound ? (
        <Field label="Source field" hint="This label shows the selected field's current value, read-only">
          <Dropdown
            selectedOptions={field.sourceFieldSchemaName ? [field.sourceFieldSchemaName] : []}
            value={currentSource ? (currentSource.label || currentSource.code) : (field.sourceFieldSchemaName ?? '')}
            placeholder="Select a field to mirror"
            onOptionSelect={(_, data) => updateField(field.id, { sourceFieldSchemaName: data.optionValue })}
          >
            {sourceOptions.map(f => (
              <Option key={f.id} value={f.code}>{f.label || f.code}</Option>
            ))}
          </Dropdown>
        </Field>
      ) : (
        <Field label="Static Content" hint="Read-only text shown on the form (headings, notes, instructions)">
          <Textarea
            value={field.staticContent ?? ''}
            onChange={(_, data) => updateField(field.id, { staticContent: data.value || null })}
            resize="vertical"
            placeholder="e.g. Please review your details below."
          />
        </Field>
      )}

      <div className={styles.note}>
        <Text size={200}>
          Bound labels are ideal on a Manual summary tab — each mirrors an answer read-only
          (file → count, choice → selected label, etc.).
        </Text>
      </div>
    </div>
  );
}
