import React, { useCallback } from 'react';
import {
  Field,
  Input,
  Select,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import { CssPropertyEditor } from '@/components/common/CssPropertyEditor';
import type { SectionDesign } from '@qdb/shared';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '14px' },
  placeholder: {
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    padding: '24px',
  },
});

interface SectionStylePanelProps {
  sectionId: string | null;
}

/** SectionStylePanel — renders all SectionDesign fields for the given section. */
export function SectionStylePanel({ sectionId }: SectionStylePanelProps): React.ReactElement {
  const styles = useStyles();
  const sectionDesigns = useDesignerStore(s => s.designPayload.sectionDesigns);
  const updateSectionDesign = useDesignerStore(s => s.updateSectionDesign);

  if (!sectionId) {
    return (
      <div className={styles.placeholder}>
        <Text size={200}>Select a section in the canvas to edit its style.</Text>
      </div>
    );
  }

  const design: Partial<SectionDesign> = sectionDesigns[sectionId] ?? {};

  const patch = useCallback(
    (update: Partial<SectionDesign>) => updateSectionDesign(sectionId, update),
    [updateSectionDesign, sectionId]
  );

  return (
    <div className={styles.root}>
      <Text weight="semibold" size={300} block>Section: {sectionId}</Text>

      <Field label="Background Color">
        <Input value={design.backgroundColor ?? ''} onChange={(_, d) => patch({ backgroundColor: d.value || undefined })} placeholder="#ffffff" />
      </Field>

      <Field label="Border Style">
        <Input value={design.borderStyle ?? ''} onChange={(_, d) => patch({ borderStyle: d.value || undefined })} placeholder="1px solid #e0e0e0" />
      </Field>

      <Field label="Padding">
        <Input value={design.padding ?? ''} onChange={(_, d) => patch({ padding: d.value || undefined })} placeholder="16px" />
      </Field>

      <Field label="Margin">
        <Input value={design.margin ?? ''} onChange={(_, d) => patch({ margin: d.value || undefined })} placeholder="0" />
      </Field>

      <Field label="Column Layout">
        <Select
          value={String(design.columnLayout ?? 1)}
          onChange={(_, d) => patch({ columnLayout: parseInt(d.value, 10) as 1 | 2 | 3 | 4 })}
        >
          <option value="1">1 Column</option>
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </Select>
      </Field>

      <Field label="Card Style">
        <Select value={design.cardStyle ?? 'Flat'} onChange={(_, d) => patch({ cardStyle: d.value as SectionDesign['cardStyle'] })}>
          <option value="Flat">Flat</option>
          <option value="Elevated">Elevated</option>
          <option value="Outlined">Outlined</option>
        </Select>
      </Field>

      <Field label="Collapsible Style">
        <Select value={design.collapsibleStyle ?? 'None'} onChange={(_, d) => patch({ collapsibleStyle: d.value as SectionDesign['collapsibleStyle'] })}>
          <option value="None">None</option>
          <option value="Animated">Animated</option>
          <option value="Instant">Instant</option>
        </Select>
      </Field>

      <Field label="Visibility Animation">
        <Select value={design.visibilityAnimation ?? 'None'} onChange={(_, d) => patch({ visibilityAnimation: d.value as SectionDesign['visibilityAnimation'] })}>
          <option value="None">None</option>
          <option value="Fade">Fade</option>
          <option value="Slide">Slide</option>
        </Select>
      </Field>

      <Text weight="semibold" size={200} block>Header Style</Text>
      <CssPropertyEditor
        value={design.headerStyle ?? {}}
        onChange={headerStyle => patch({ headerStyle })}
      />
    </div>
  );
}
