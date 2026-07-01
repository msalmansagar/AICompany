import React, { useCallback } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Checkbox,
  Divider,
  Field,
  Input,
  Select,
  makeStyles,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import { TranslationsPanel } from '@/designer/properties/panels/TranslationsPanel';
import { ScopedButtonsPanel } from '@/designer/properties/panels/ScopedButtonsPanel';

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
  const formCode = useDesignerStore(state => state.form?.code ?? '');

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

      {/* DFE-FBE-001: section header icon (Fluent UI icon name, same as tabs). */}
      <Field label="Icon Name" hint="Fluent UI icon name (e.g. Person, Document, Money)">
        <Input
          value={section.iconName ?? ''}
          onChange={(_, data) => updateSection(sectionId, { iconName: data.value || null })}
          placeholder="e.g. Document"
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

      <Divider />
      <Accordion collapsible multiple>
        <AccordionItem value="buttons">
          <AccordionHeader>Buttons</AccordionHeader>
          <AccordionPanel>
            <ScopedButtonsPanel scope="section" placementId={sectionId} />
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="translations">
          <AccordionHeader>Translations</AccordionHeader>
          <AccordionPanel>
            <TranslationsPanel
              entityName="qdb_form_section"
              recordId={sectionId}
              entityLabel="Section"
              formCode={formCode}
            />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
