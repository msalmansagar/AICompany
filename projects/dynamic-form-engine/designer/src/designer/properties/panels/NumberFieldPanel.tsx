import React from 'react';
import { Dropdown, Field, Option, Text, makeStyles, tokens } from '@fluentui/react-components';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';
import { useDesignerStore } from '@/state/designerStore';

// Numeric display style (number / decimal / currency): a text box, or a read-only
// utilization bar (value ÷ a maximum field). DFE-NUMBAR.
// Currency code and decimal places are rendered by the common Field Properties
// section, so this panel only owns the bar-mode configuration.
const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '10px' },
  infoNote: {
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    padding: '10px 12px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

const NUMERIC_TYPES = ['number', 'decimal', 'currency'];

interface Props {
  field: DesignerFieldModel;
}

export function NumberFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const updateField = useDesignerStore(state => state.updateField);
  const allFields = useDesignerStore(state => state.fields);

  const isBar = field.numberDisplayStyle === 'bar';
  // Candidate "max" fields: other numeric fields on the form.
  const maxOptions = Object.values(allFields).filter(
    f => f.id !== field.id && NUMERIC_TYPES.includes(f.fieldType),
  );
  const currentMax = maxOptions.find(f => f.code === field.barMaxFieldSchemaName);

  return (
    <div className={styles.root}>
      <Field label="Display style" hint="A text box, or a read-only utilization bar (value vs a maximum field)">
        <Dropdown
          selectedOptions={[isBar ? 'bar' : 'textbox']}
          value={isBar ? 'Bar (utilization gauge)' : 'Text box'}
          onOptionSelect={(_, data) => {
            if (data.optionValue === 'bar') {
              updateField(field.id, { numberDisplayStyle: 'bar' });
            } else {
              updateField(field.id, { numberDisplayStyle: 'textbox', barMaxFieldSchemaName: null });
            }
          }}
        >
          <Option value="textbox">Text box</Option>
          <Option value="bar">Bar (utilization gauge)</Option>
        </Dropdown>
      </Field>

      {isBar && (
        <Field label="Maximum from field" hint="The bar fills to this field's value ÷ the selected field's value">
          <Dropdown
            selectedOptions={field.barMaxFieldSchemaName ? [field.barMaxFieldSchemaName] : []}
            value={currentMax ? (currentMax.label || currentMax.code) : (field.barMaxFieldSchemaName ?? '')}
            placeholder="Select the total / max field"
            onOptionSelect={(_, data) => updateField(field.id, { barMaxFieldSchemaName: data.optionValue })}
          >
            {maxOptions.map(f => (
              <Option key={f.id} value={f.code}>{f.label || f.code}</Option>
            ))}
          </Dropdown>
        </Field>
      )}

      <div className={styles.infoNote}>
        <Text size={200}>
          Use the Validation Rules section below to add minimum/maximum value constraints.
          The bar is read-only (a utilization gauge, e.g. Utilized ÷ Total Limit).
        </Text>
      </div>
    </div>
  );
}
