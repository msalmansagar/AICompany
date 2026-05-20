import React, { useCallback } from 'react';
import {
  Checkbox,
  Field,
  Input,
  Select,
  makeStyles,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';

const useStyles = makeStyles({
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
});

interface SectionPropertiesProps {
  sectionId: string;
}

export function SectionProperties({ sectionId }: SectionPropertiesProps): React.ReactElement {
  const styles = useStyles();
  const section = useDesignerStore(state => state.sections[sectionId]);
  const updateSection = useDesignerStore(state => state.updateSection);

  const handleColumnCountChange = useCallback(
    (_: React.ChangeEvent<HTMLSelectElement>, data: { value: string }) => {
      updateSection(sectionId, { columnCount: parseInt(data.value, 10) as 1 | 2 | 3 });
    },
    [sectionId, updateSection]
  );

  if (!section) return <></>;

  return (
    <div className={styles.form}>
      <Field label="Section Label">
        <Input
          value={section.label}
          onChange={(_, data) => updateSection(sectionId, { label: data.value })}
          placeholder="e.g. Contact Details"
        />
      </Field>

      <Field label="Description" hint="Shown below the section heading">
        <Input
          value={section.description ?? ''}
          onChange={(_, data) => updateSection(sectionId, { description: data.value || null })}
          placeholder="Optional instructional text"
        />
      </Field>

      <Field label="Column Layout">
        <Select
          value={String(section.columnCount)}
          onChange={handleColumnCountChange}
        >
          <option value="1">1 Column</option>
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
        </Select>
      </Field>

      <Checkbox
        label="Visible by default"
        checked={section.isVisible}
        onChange={(_, data) => updateSection(sectionId, { isVisible: data.checked === true })}
      />

      <Checkbox
        label="Collapsible"
        checked={section.isCollapsible}
        onChange={(_, data) => updateSection(sectionId, { isCollapsible: data.checked === true })}
      />

      {section.isCollapsible && (
        <Checkbox
          label="Expanded by default"
          checked={section.isExpandedByDefault}
          onChange={(_, data) =>
            updateSection(sectionId, { isExpandedByDefault: data.checked === true })
          }
        />
      )}
    </div>
  );
}
