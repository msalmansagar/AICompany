import React, { useCallback } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Field,
  Input,
  Select,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import { CssPropertyEditor } from '@/components/common/CssPropertyEditor';
import type { FieldDesign } from '@qdb/shared';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '14px' },
  placeholder: {
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    padding: '24px',
  },
});

interface FieldStylePanelProps {
  fieldId: string | null;
}

/** FieldStylePanel — all FieldDesign fields with expandable sub-style sections. */
export function FieldStylePanel({ fieldId }: FieldStylePanelProps): React.ReactElement {
  const styles = useStyles();
  const fieldDesigns = useDesignerStore(s => s.designPayload.fieldDesigns);
  const updateFieldDesign = useDesignerStore(s => s.updateFieldDesign);

  if (!fieldId) {
    return (
      <div className={styles.placeholder}>
        <Text size={200}>Select a field in the canvas to edit its style.</Text>
      </div>
    );
  }

  const design: Partial<FieldDesign> = fieldDesigns[fieldId] ?? {};

  const patch = useCallback(
    (update: Partial<FieldDesign>) => updateFieldDesign(fieldId, update),
    [updateFieldDesign, fieldId]
  );

  return (
    <div className={styles.root}>
      <Text weight="semibold" size={300} block>Field: {fieldId}</Text>

      <Field label="Input Style">
        <Select value={design.inputStyle ?? 'Outlined'} onChange={(_, d) => patch({ inputStyle: d.value as FieldDesign['inputStyle'] })}>
          <option value="Outlined">Outlined</option>
          <option value="Filled">Filled</option>
          <option value="Standard">Standard</option>
        </Select>
      </Field>

      <Field label="Width">
        <Select value={design.width ?? 'Full'} onChange={(_, d) => patch({ width: d.value as FieldDesign['width'] })}>
          <option value="Full">Full</option>
          <option value="Half">Half</option>
          <option value="Custom">Custom</option>
        </Select>
      </Field>

      {design.width === 'Custom' && (
        <Field label="Custom Width">
          <Input value={design.customWidth ?? ''} onChange={(_, d) => patch({ customWidth: d.value || undefined })} placeholder="e.g. 300px" />
        </Field>
      )}

      <Field label="Height">
        <Input value={design.height ?? ''} onChange={(_, d) => patch({ height: d.value || undefined })} placeholder="auto" />
      </Field>

      <Field label="Icon Prefix">
        <Input value={design.iconPrefix ?? ''} onChange={(_, d) => patch({ iconPrefix: d.value || undefined })} placeholder="icon name or SVG" />
      </Field>

      <Field label="Icon Suffix">
        <Input value={design.iconSuffix ?? ''} onChange={(_, d) => patch({ iconSuffix: d.value || undefined })} placeholder="icon name or SVG" />
      </Field>

      <Accordion collapsible multiple>
        <AccordionItem value="focus">
          <AccordionHeader>Focus Style</AccordionHeader>
          <AccordionPanel>
            <CssPropertyEditor value={design.focusStyle ?? {}} onChange={s => patch({ focusStyle: s })} />
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="error">
          <AccordionHeader>Error Style</AccordionHeader>
          <AccordionPanel>
            <CssPropertyEditor value={design.errorStyle ?? {}} onChange={s => patch({ errorStyle: s })} />
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="disabled">
          <AccordionHeader>Disabled Style</AccordionHeader>
          <AccordionPanel>
            <CssPropertyEditor value={design.disabledStyle ?? {}} onChange={s => patch({ disabledStyle: s })} />
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="placeholder">
          <AccordionHeader>Placeholder Style</AccordionHeader>
          <AccordionPanel>
            <CssPropertyEditor value={design.placeholderStyle ?? {}} onChange={s => patch({ placeholderStyle: s })} />
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem value="tooltip">
          <AccordionHeader>Tooltip Style</AccordionHeader>
          <AccordionPanel>
            <CssPropertyEditor value={design.tooltipStyle ?? {}} onChange={s => patch({ tooltipStyle: s })} />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
