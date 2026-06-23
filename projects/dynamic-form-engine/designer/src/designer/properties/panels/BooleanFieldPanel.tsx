import React, { useCallback } from 'react';
import {
  Badge,
  Button,
  Field,
  Input,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px' },
  badgeRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  renderStyleRow: { display: 'flex', gap: '6px' },
  renderStyleButton: { flex: 1 },
  labelRow: { display: 'flex', flexDirection: 'column', gap: '8px' },
  hint: { color: tokens.colorNeutralForeground3, fontSize: '11px' },
});

interface Props {
  field: DesignerFieldModel;
}

export function BooleanFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const updateField = useDesignerStore(s => s.updateField);

  const renderStyle = field.boolRenderStyle ?? 'toggle';

  const handleStyleChange = useCallback(
    (style: 'toggle' | 'radio') => { updateField(field.id, { boolRenderStyle: style }); },
    [field.id, updateField],
  );

  return (
    <div className={styles.root}>
      <div className={styles.badgeRow}>
        <Badge appearance="outline" color="brand">boolean</Badge>
      </div>

      <Field label="Display Style">
        <div className={styles.renderStyleRow}>
          <Button
            className={styles.renderStyleButton}
            appearance={renderStyle === 'toggle' ? 'primary' : 'outline'}
            size="small"
            onClick={() => handleStyleChange('toggle')}
            aria-pressed={renderStyle === 'toggle'}
          >
            Toggle Switch
          </Button>
          <Button
            className={styles.renderStyleButton}
            appearance={renderStyle === 'radio' ? 'primary' : 'outline'}
            size="small"
            onClick={() => handleStyleChange('radio')}
            aria-pressed={renderStyle === 'radio'}
          >
            Yes / No Radio
          </Button>
        </div>
      </Field>

      {renderStyle === 'radio' && (
        <div className={styles.labelRow}>
          <Field label="Yes Label" hint="Label for the affirmative option">
            <Input
              value={field.trueLabel ?? ''}
              placeholder="Yes"
              onChange={(_, d) => updateField(field.id, { trueLabel: d.value || null })}
            />
          </Field>
          <Field label="No Label" hint="Label for the negative option">
            <Input
              value={field.falseLabel ?? ''}
              placeholder="No"
              onChange={(_, d) => updateField(field.id, { falseLabel: d.value || null })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
