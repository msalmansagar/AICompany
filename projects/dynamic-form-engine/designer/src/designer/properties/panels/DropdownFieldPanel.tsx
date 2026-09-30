import React, { useCallback } from 'react';
import {
  Badge,
  Button,
  Field,
  Select,
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

type DisplayStyle = 'list' | 'cards' | 'rating';

/** The styles each option field can draw with; cards exist only for radios. */
const DISPLAY_STYLES_BY_TYPE: Partial<Record<string, Array<{ value: DisplayStyle; label: string }>>> = {
  dropdown: [
    { value: 'list', label: 'Dropdown' },
    { value: 'rating', label: 'Rating (stars)' },
  ],
  radio: [
    { value: 'list', label: 'List' },
    { value: 'cards', label: 'Cards' },
    { value: 'rating', label: 'Rating (stars)' },
  ],
};

export function DropdownFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const navigateTo = useDesignerStore(s => s.navigateTo);
  const updateField = useDesignerStore(s => s.updateField);
  const styleOptions = DISPLAY_STYLES_BY_TYPE[field.fieldType] ?? [];
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

      {styleOptions.length > 0 && (
        <Field
          label="Display style"
          hint={field.radioRenderStyle === 'rating' ? 'Option 1 is one star; each later option adds a star.' : undefined}
        >
          <Select
            value={field.radioRenderStyle ?? 'list'}
            onChange={(_, d) => {
              const chosen = styleOptions.find(option => option.value === d.value);
              if (chosen) updateField(field.id, { radioRenderStyle: chosen.value });
            }}
          >
            {styleOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>
      )}

      <Text size={200} className={styles.infoNote}>
        Options are applied to Dropdown, Multi-Select, and Radio field types.
      </Text>
    </div>
  );
}
