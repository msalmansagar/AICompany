import React, { useCallback, useContext, useState } from 'react';
import { DesignService } from '@/services/DesignService';
import {
  Button,
  Divider,
  Field,
  Input,
  Select,
  Slider,
  Spinner,
  Text,
  Textarea,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeftRegular, SaveRegular } from '@fluentui/react-icons';
import { CrmContext } from '@/app/App';
import { useDesignerStore } from '@/state/designerStore';
import type { ButtonStyle, DesignerStyleModel, LabelPosition } from '@/state/models/DesignerStyleModel';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '360px',
    flexShrink: 0,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  previewArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    overflow: 'auto',
  },
  sectionTitle: {
    marginBottom: '12px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  colorSwatch: {
    width: '36px',
    height: '36px',
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
  },
  colorInput: {
    opacity: 0,
    position: 'absolute' as const,
    width: 0,
    height: 0,
  },
  toggleRow: {
    display: 'flex',
    gap: '8px',
  },
  toggleButton: {
    flex: 1,
    padding: '8px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'center' as const,
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: '13px',
  },
  toggleButtonSelected: {
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: 600,
  },
  previewCard: {
    borderRadius: '8px',
    padding: '32px',
    boxShadow: tokens.shadow16,
    width: '360px',
    minHeight: '280px',
  },
  previewFieldWrapper: {
    marginBottom: '16px',
  },
  saveBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    paddingTop: '8px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: '13px',
  },
  suffixInput: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
});

interface ColorPickerFieldProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

function ColorPickerField({ label, value, onChange }: ColorPickerFieldProps): React.ReactElement {
  const styles = useStyles();

  return (
    <div className={styles.colorRow}>
      <label style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          className={styles.colorSwatch}
          style={{ backgroundColor: value }}
          aria-label={`Pick ${label} color, current: ${value}`}
          onClick={(e) => {
            const input = (e.currentTarget.nextSibling as HTMLInputElement | null);
            input?.click();
          }}
        />
        <input
          type="color"
          className={styles.colorInput}
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label={`${label} color picker`}
          tabIndex={-1}
        />
      </label>
      <Field label={label} style={{ flex: 1 }}>
        <Input
          value={value}
          onChange={(_, data) => onChange(data.value)}
          placeholder="#000000"
          style={{ fontFamily: 'monospace' }}
        />
      </Field>
    </div>
  );
}

interface ToggleGroupProps<T extends string> {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

function ToggleGroup<T extends string>({ label, options, value, onChange }: ToggleGroupProps<T>): React.ReactElement {
  const styles = useStyles();

  return (
    <Field label={label}>
      <div className={styles.toggleRow}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            className={`${styles.toggleButton} ${value === option.value ? styles.toggleButtonSelected : ''}`}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

interface LivePreviewMiniatureProps {
  style: DesignerStyleModel;
}

function LivePreviewMiniature({ style }: LivePreviewMiniatureProps): React.ReactElement {
  const styles = useStyles();

  const labelStyle: React.CSSProperties = {
    fontSize: `${style.fontSizeBase}px`,
    fontFamily: style.fontFamily,
    color: '#333333',
    marginBottom: style.labelPosition === 'above' ? '4px' : '0',
    display: style.labelPosition === 'above' ? 'block' : 'inline-block',
    minWidth: style.labelPosition === 'beside' ? '100px' : undefined,
  };

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '6px 10px',
    borderRadius: `${style.borderRadius}px`,
    border: `1px solid #ccc`,
    fontSize: `${style.fontSizeBase}px`,
    fontFamily: style.fontFamily,
    boxSizing: 'border-box' as const,
  };

  const buttonStyle: React.CSSProperties = {
    marginTop: '16px',
    padding: '8px 20px',
    borderRadius: `${style.borderRadius}px`,
    fontSize: `${style.fontSizeBase}px`,
    fontFamily: style.fontFamily,
    backgroundColor: style.buttonStyle === 'filled' ? style.primaryColor : 'transparent',
    color: style.buttonStyle === 'filled' ? '#ffffff' : style.primaryColor,
    border: style.buttonStyle === 'outline' ? `2px solid ${style.primaryColor}` : 'none',
    cursor: 'pointer',
  };

  const fieldWrapperStyle: React.CSSProperties = {
    display: style.labelPosition === 'beside' ? 'flex' : 'block',
    alignItems: style.labelPosition === 'beside' ? 'center' : undefined,
    gap: style.labelPosition === 'beside' ? '12px' : undefined,
    marginBottom: `${style.fieldSpacing}px`,
  };

  return (
    <div
      className={styles.previewCard}
      style={{ backgroundColor: style.backgroundColor, borderRadius: `${style.borderRadius}px` }}
      aria-label="Theme preview"
    >
      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '18px', fontWeight: 600, fontFamily: style.fontFamily, color: style.primaryColor }}>
          Sample Form
        </span>
      </div>

      <div style={fieldWrapperStyle}>
        <label style={labelStyle}>First Name</label>
        <input type="text" style={inputStyle} defaultValue="John" readOnly aria-label="Sample first name" />
      </div>

      <div style={fieldWrapperStyle}>
        <label style={labelStyle}>Email Address</label>
        <input type="email" style={inputStyle} defaultValue="john@example.com" readOnly aria-label="Sample email" />
      </div>

      <button type="button" style={buttonStyle}>Submit</button>
    </div>
  );
}

export function ThemeEditorScreen(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);

  const style = useDesignerStore(s => s.style);
  const form = useDesignerStore(s => s.form);
  const updateStyle = useDesignerStore(s => s.updateStyle);
  const navigateTo = useDesignerStore(s => s.navigateTo);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleBack = useCallback(() => {
    navigateTo('designer');
  }, [navigateTo]);

  const handleSave = useCallback(async () => {
    if (!crmService) return;
    if (!style.themeName.trim()) {
      setSaveError('Theme name is required.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const webApi = crmService.getWebApi();
      const designService = new DesignService(webApi);

      const themeId = await designService.upsertTheme(
        {
          name: style.themeName.trim(),
          primaryColor: style.primaryColor,
          accentColor: style.accentColor,
          backgroundColor: style.backgroundColor,
          fontFamily: style.fontFamily,
          fontSizeBase: style.fontSizeBase,
          borderRadius: style.borderRadius,
        },
        style.themeId
      );

      // Store the saved theme ID and link it to the form design record
      updateStyle({ themeId });

      if (form?.id && !form.id.startsWith('tmp_')) {
        await designService.upsertFormDesign({
          formId: form.id,
          themeId,
          customCss: style.customCss,
        });
      }

      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save theme');
    } finally {
      setIsSaving(false);
    }
  }, [crmService, style, form, updateStyle]);

  const patch = useCallback(
    (update: Partial<DesignerStyleModel>) => updateStyle(update),
    [updateStyle]
  );

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={handleBack}
          aria-label="Back to designer"
        >
          Back to Designer
        </Button>
        <Text size={400} weight="semibold">Theme Editor</Text>
      </div>

      <div className={styles.body}>
        <div className={styles.sidebar}>
          <div>
            <Text weight="semibold" size={300} className={styles.sectionTitle} block>Theme</Text>
            <Field label="Theme Name" required>
              <Input
                value={style.themeName}
                onChange={(_, data) => { patch({ themeName: data.value }); setSaveSuccess(false); }}
                placeholder="e.g. QDB Corporate Theme"
              />
            </Field>
          </div>

          <Divider />

          <div>
            <Text weight="semibold" size={300} className={styles.sectionTitle} block>Colors</Text>
            <div className={styles.formGroup}>
              <ColorPickerField
                label="Primary Color"
                value={style.primaryColor}
                onChange={color => patch({ primaryColor: color })}
              />
              <ColorPickerField
                label="Accent Color"
                value={style.accentColor}
                onChange={color => patch({ accentColor: color })}
              />
              <ColorPickerField
                label="Background Color"
                value={style.backgroundColor}
                onChange={color => patch({ backgroundColor: color })}
              />
            </div>
          </div>

          <Divider />

          <div>
            <Text weight="semibold" size={300} className={styles.sectionTitle} block>Typography</Text>
            <div className={styles.formGroup}>
              <Field label="Font Family">
                <Input
                  value={style.fontFamily}
                  onChange={(_, data) => patch({ fontFamily: data.value })}
                  placeholder="'Segoe UI', sans-serif"
                />
              </Field>
              <Field label="Base Font Size">
                <div className={styles.suffixInput}>
                  <Input
                    type="number"
                    value={String(style.fontSizeBase)}
                    onChange={(_, data) => {
                      const n = parseInt(data.value, 10);
                      if (!isNaN(n) && n >= 10 && n <= 24) patch({ fontSizeBase: n });
                    }}
                    style={{ width: '80px' }}
                  />
                  <Text size={200}>px</Text>
                </div>
              </Field>
            </div>
          </div>

          <Divider />

          <div>
            <Text weight="semibold" size={300} className={styles.sectionTitle} block>Spacing &amp; Shape</Text>
            <div className={styles.formGroup}>
              <Field label={`Border Radius: ${style.borderRadius}px`}>
                <Slider
                  min={0}
                  max={16}
                  step={1}
                  value={style.borderRadius}
                  onChange={(_, data) => patch({ borderRadius: data.value })}
                  aria-label="Border radius"
                />
              </Field>
              <Field label="Field Spacing">
                <Select
                  value={String(style.fieldSpacing)}
                  onChange={(_, data) => patch({ fieldSpacing: parseInt(data.value, 10) })}
                >
                  <option value="8">Compact (8px)</option>
                  <option value="16">Normal (16px)</option>
                  <option value="24">Relaxed (24px)</option>
                </Select>
              </Field>
            </div>
          </div>

          <Divider />

          <div>
            <Text weight="semibold" size={300} className={styles.sectionTitle} block>Label Position</Text>
            <ToggleGroup<LabelPosition>
              label=""
              options={[
                { value: 'above', label: 'Above' },
                { value: 'beside', label: 'Beside' },
              ]}
              value={style.labelPosition}
              onChange={v => patch({ labelPosition: v })}
            />
          </div>

          <div>
            <Text weight="semibold" size={300} className={styles.sectionTitle} block>Button Style</Text>
            <ToggleGroup<ButtonStyle>
              label=""
              options={[
                { value: 'filled', label: 'Filled' },
                { value: 'outline', label: 'Outline' },
                { value: 'subtle', label: 'Subtle' },
              ]}
              value={style.buttonStyle}
              onChange={v => patch({ buttonStyle: v })}
            />
          </div>

          <Divider />

          <div>
            <Text weight="semibold" size={300} className={styles.sectionTitle} block>Custom CSS</Text>
            <Textarea
              value={style.customCss}
              onChange={(_, data) => patch({ customCss: data.value })}
              placeholder="/* Add custom styles here */"
              rows={6}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </div>

          <div className={styles.saveBar}>
            {saveError && <span className={styles.errorText}>{saveError}</span>}
            {saveSuccess && !saveError && (
              <span style={{ color: tokens.colorPaletteGreenForeground1, fontSize: '13px' }}>
                Theme saved successfully
              </span>
            )}
            <Button
              appearance="primary"
              icon={isSaving ? <Spinner size="tiny" /> : <SaveRegular />}
              onClick={() => void handleSave()}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Theme'}
            </Button>
          </div>
        </div>

        <div className={styles.previewArea}>
          <div>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: '16px', textAlign: 'center' }}>
              Live Preview
            </Text>
            <LivePreviewMiniature style={style} />
          </div>
        </div>
      </div>
    </div>
  );
}
