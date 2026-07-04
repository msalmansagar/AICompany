import React, { useCallback, useEffect, useRef } from 'react';
import {
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Switch,
  Text,
  Textarea,
  makeStyles,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import type { FormDesign } from '@qdb/shared';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '14px' },
  warning: { marginTop: '4px' },
});

/** Removes @import rules, url(), expression(), or behaviour() — basic preview-time security gate.
 *  This is advisory feedback only; the authoritative sanitiser runs on the backend/runtime. */
function sanitizeCss(css: string): string {
  return css
    .replace(/@import\b[^;]*;?/gi, '')
    .replace(/url\s*\([^)]*\)/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/behaviou?r\s*\([^)]*\)/gi, '');
}

function hasSanitizationRemoved(original: string, sanitized: string): boolean {
  return original.trim() !== sanitized.trim();
}

/** FormStylePanel — FormDesign extras + customCss with inline sanitization feedback. */
export function FormStylePanel(): React.ReactElement {
  const styles = useStyles();
  const formDesign = useDesignerStore(s => s.designPayload.formDesign);
  const updateFormDesign = useDesignerStore(s => s.updateFormDesign);
  const [cssWarning, setCssWarning] = React.useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback(
    (update: Partial<FormDesign>) => updateFormDesign(update),
    [updateFormDesign]
  );

  function handleCssChange(raw: string): void {
    patch({ customCss: raw });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const sanitized = sanitizeCss(raw);
      setCssWarning(hasSanitizationRemoved(raw, sanitized));
    }, 300);
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div className={styles.root}>
      <Text weight="semibold" size={300} block>Layout</Text>

      <Field label="Layout Type">
        <Select value={formDesign.layoutType} onChange={(_, d) => patch({ layoutType: d.value as FormDesign['layoutType'] })}>
          <option value="SingleColumn">Single Column</option>
          <option value="TwoColumn">Two Column</option>
          <option value="Grid">Grid</option>
          <option value="Stepper">Stepper</option>
          <option value="Wizard">Wizard</option>
          <option value="Accordion">Accordion</option>
          <option value="TabBased">Tab Based</option>
          <option value="InlineCompact">Inline Compact</option>
        </Select>
      </Field>

      <Field label="Alignment">
        <Select value={formDesign.alignment} onChange={(_, d) => patch({ alignment: d.value as FormDesign['alignment'] })}>
          <option value="Left">Left</option>
          <option value="Center">Center</option>
          <option value="Right">Right</option>
        </Select>
      </Field>

      <Field label="Max Width">
        <Input
          value={formDesign.maxWidth ?? ''}
          onChange={(_, d) => patch({ maxWidth: d.value || undefined })}
          placeholder="e.g. 800px"
        />
      </Field>

      <Field label="Section Style">
        <Select value={formDesign.sectionStyle} onChange={(_, d) => patch({ sectionStyle: d.value as FormDesign['sectionStyle'] })}>
          <option value="Card">Card</option>
          <option value="Flat">Flat</option>
          <option value="Outlined">Outlined</option>
        </Select>
      </Field>

      <Switch
        label="Animation Enabled"
        checked={formDesign.animationEnabled}
        onChange={(_, d) => patch({ animationEnabled: d.checked })}
      />

      <Switch
        label="Sticky Action Bar"
        checked={formDesign.stickyActionBar}
        onChange={(_, d) => patch({ stickyActionBar: d.checked })}
      />

      <Switch
        label="Skeleton Loader"
        checked={formDesign.skeletonLoaderEnabled}
        onChange={(_, d) => patch({ skeletonLoaderEnabled: d.checked })}
      />

      <Text weight="semibold" size={300} block>Custom CSS</Text>
      <Textarea
        value={formDesign.customCss ?? ''}
        onChange={(_, d) => handleCssChange(d.value)}
        placeholder="/* Custom styles here */"
        rows={6}
        style={{ fontFamily: 'monospace', fontSize: '12px' }}
      />
      {cssWarning && (
        <MessageBar intent="warning" className={styles.warning}>
          <MessageBarBody>
            Some rules were removed as they do not meet the security policy.
          </MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}
