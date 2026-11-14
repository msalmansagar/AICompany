import React from 'react';
import { Dropdown, Field, Input, Option, Text, makeStyles, tokens } from '@fluentui/react-components';
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
  // FR-CSE-073: surveys do not use the number bar display style.
  const isSurvey = useDesignerStore(s => s.form?.formType === 'Survey');

  const isBar = field.numberDisplayStyle === 'bar';
  const isWeighted = useDesignerStore(s => s.form?.scoringMode === 'Weighted');
  // Candidate "max" fields: other numeric fields on the form.
  const maxOptions = Object.values(allFields).filter(
    f => f.id !== field.id && NUMERIC_TYPES.includes(f.fieldType),
  );
  const currentMax = maxOptions.find(f => f.code === field.barMaxFieldSchemaName);
  const currentValue = maxOptions.find(f => f.code === field.barValueFieldSchemaName);

  return (
    <div className={styles.root}>
      {/* FR-CSE-073: surveys use a plain text box for numbers — the utilization bar
          is a CRM-specific display mode that has no equivalent in a survey response. */}
      {!isSurvey && (
        <>
          <Field label="Display style" hint="A text box, or a read-only utilization bar (value vs a maximum field)">
            <Dropdown
              selectedOptions={[isBar ? 'bar' : 'textbox']}
              value={isBar ? 'Bar (utilization gauge)' : 'Text box'}
              onOptionSelect={(_, data) => {
                if (data.optionValue === 'bar') {
                  updateField(field.id, { numberDisplayStyle: 'bar' });
                } else {
                  updateField(field.id, { numberDisplayStyle: 'textbox', barMaxFieldSchemaName: null, barValueFieldSchemaName: null });
                }
              }}
            >
              <Option value="textbox">Text box</Option>
              <Option value="bar">Bar (utilization gauge)</Option>
            </Dropdown>
          </Field>

          {isBar && (
            <Field label="Value from field" hint="The bar's fill value. Leave empty to use this field's own value.">
              <Dropdown
                selectedOptions={field.barValueFieldSchemaName ? [field.barValueFieldSchemaName] : []}
                value={currentValue ? (currentValue.label || currentValue.code) : (field.barValueFieldSchemaName ?? '')}
                placeholder="This field's own value"
                onOptionSelect={(_, data) => updateField(field.id, { barValueFieldSchemaName: data.optionValue || null })}
              >
                <Option value="">This field's own value</Option>
                {maxOptions.map(f => (
                  <Option key={f.id} value={f.code}>{f.label || f.code}</Option>
                ))}
              </Dropdown>
            </Field>
          )}

          {isBar && (
            <Field label="Maximum from field" hint="The bar fills to the value ÷ the selected field's value">
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
        </>
      )}

      {/* FR-CSE-063: Weight — shown only on weighted surveys. */}
      {isWeighted && (
        <Field
          label="Weight"
          hint="How much this question counts relative to others. Leave blank to use weight 1."
        >
          <Input
            type="number"
            min={0}
            value={field.scoreWeight != null ? String(field.scoreWeight) : ''}
            onChange={(_, data) =>
              updateField(field.id, {
                scoreWeight: data.value !== '' ? Number(data.value) : null,
              })
            }
            placeholder="1"
          />
        </Field>
      )}

      {/* FR-CSE-064: Score range — number/decimal/currency only, weighted surveys only. */}
      {isWeighted && (
        <Field
          label="Score minimum"
          hint="The numeric value that maps to 0 points. Required when scoring this field."
        >
          <Input
            type="number"
            value={field.scoreMin != null ? String(field.scoreMin) : ''}
            onChange={(_, data) =>
              updateField(field.id, { scoreMin: data.value !== '' ? Number(data.value) : null })
            }
            placeholder="e.g. 0"
          />
        </Field>
      )}

      {isWeighted && (
        <Field
          label="Score maximum"
          hint="The numeric value that maps to full points. Must be greater than the minimum."
        >
          <Input
            type="number"
            value={field.scoreMax != null ? String(field.scoreMax) : ''}
            onChange={(_, data) =>
              updateField(field.id, { scoreMax: data.value !== '' ? Number(data.value) : null })
            }
            placeholder="e.g. 10"
          />
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
