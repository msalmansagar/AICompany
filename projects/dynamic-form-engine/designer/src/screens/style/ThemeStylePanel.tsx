import React, { useCallback, useContext, useState } from 'react';
import {
  Button,
  Divider,
  Field,
  Input,
  MessageBar,
  Select,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { SaveRegular } from '@fluentui/react-icons';
import { CrmContext } from '@/app/App';
import { useDesignerStore } from '@/state/designerStore';
import { DesignService } from '@/services/DesignService';
import { PublishService } from '@/services/PublishService';
import { WcagContrastIndicator } from '@/components/wcag/WcagContrastIndicator';
import type { ThemeDefinition } from '@qdb/shared';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '16px' },
  section: { display: 'flex', flexDirection: 'column', gap: '12px' },
  colorRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  swatch: {
    width: '32px', height: '32px', borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    cursor: 'pointer', flexShrink: 0, padding: 0,
  },
  hiddenInput: { opacity: 0, position: 'absolute', width: 0, height: 0 },
  saveBar: {
    display: 'flex', justifyContent: 'flex-end', gap: '8px',
    paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    alignItems: 'center',
  },
});

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  foreground?: string;
  background?: string;
  contrastLabel?: string;
}

function ColorField({ label, value, onChange, foreground, background, contrastLabel }: ColorFieldProps): React.ReactElement {
  const styles = useStyles();

  function openPicker(e: React.MouseEvent<HTMLButtonElement>): void {
    const input = e.currentTarget.nextElementSibling as HTMLInputElement | null;
    input?.click();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div className={styles.colorRow}>
        <label style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            className={styles.swatch}
            style={{ backgroundColor: value }}
            onClick={openPicker}
            aria-label={`Pick ${label} colour, current: ${value}`}
          />
          <input
            type="color"
            className={styles.hiddenInput}
            value={value}
            onChange={e => onChange(e.target.value)}
            aria-label={`${label} colour picker`}
            tabIndex={-1}
          />
        </label>
        <Field label={label} style={{ flex: 1 }}>
          <Input
            value={value}
            onChange={(_, d) => onChange(d.value)}
            placeholder="#000000"
            style={{ fontFamily: 'monospace' }}
          />
        </Field>
      </div>
      {foreground && background && contrastLabel && (
        <WcagContrastIndicator
          foregroundHex={foreground}
          backgroundHex={background}
          label={contrastLabel}
        />
      )}
    </div>
  );
}

/** ThemeStylePanel — all ThemeDefinition fields with live preview updates to the store. */
export function ThemeStylePanel(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);

  const theme = useDesignerStore(s => s.designPayload.theme);
  const form = useDesignerStore(s => s.form);
  const updateTheme = useDesignerStore(s => s.updateTheme);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCacheUpdating, setIsCacheUpdating] = useState(false);

  const patch = useCallback(
    (update: Partial<ThemeDefinition>) => { updateTheme(update); setSaveSuccess(false); },
    [updateTheme]
  );

  const handleSave = useCallback(async () => {
    if (!crmService) return;
    if (!theme.themeName.trim()) { setSaveError('Theme name is required.'); return; }
    setIsSaving(true); setSaveError(null); setSaveSuccess(false);

    try {
      const service = new DesignService(crmService.getWebApi());
      const themeId = await service.upsertTheme({
        name: theme.themeName.trim(),
        themeCode: theme.themeCode || 'CUSTOM',
        primaryColor: theme.primaryColor,
        secondaryColor: theme.secondaryColor,
        backgroundColor: theme.backgroundColor,
        surfaceColor: theme.surfaceColor,
        textPrimaryColor: theme.textPrimaryColor,
        textSecondaryColor: theme.textSecondaryColor,
        borderColor: theme.borderColor,
        errorColor: theme.errorColor,
        successColor: theme.successColor,
        warningColor: theme.warningColor,
        fontFamily: theme.fontFamily,
        fontUrl: theme.fontUrl,
        baseFontSize: theme.baseFontSize,
        shadowStyle: theme.shadowStyle,
        spacingScale: theme.spacingScale,
        isDarkMode: theme.isDarkMode,
      }, theme.id || null);

      updateTheme({ id: themeId });

      if (form?.id && !form.id.startsWith('tmp_')) {
        await service.upsertFormDesign({ formId: form.id, themeId, customCss: '' });
      }
      setSaveSuccess(true);
      // SC-03: fire-and-forget cache regeneration job after successful style save.
      if (form?.id && !form.id.startsWith('tmp_') && form.code && form.currentVersion) {
        setIsCacheUpdating(true);
        void (async () => {
          try {
            if (!crmService) return;
            const publishService = new PublishService(crmService.getWebApi());
            await publishService.triggerStyleChangeCache({
              formDefinitionId: form.id,
              formCode: form.code,
              targetVersion: form.currentVersion,
            });
          } catch {
            // Non-blocking — cache will regenerate on next publish.
          } finally {
            setIsCacheUpdating(false);
          }
        })();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [crmService, theme, form, updateTheme]);

  const bg = theme.backgroundColor ?? '#ffffff';
  const primary = theme.primaryColor;

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <Text weight="semibold" size={300} block>Identity</Text>
        <Field label="Theme Name" required>
          <Input value={theme.themeName} onChange={(_, d) => patch({ themeName: d.value })} placeholder="e.g. QDB Corporate" />
        </Field>
        <Field label="Theme Code">
          <Input value={theme.themeCode} onChange={(_, d) => patch({ themeCode: d.value })} placeholder="e.g. QDB_CORP" style={{ fontFamily: 'monospace' }} />
        </Field>
      </div>

      <Divider />

      <div className={styles.section}>
        <Text weight="semibold" size={300} block>Primary Colours</Text>
        <ColorField label="Primary" value={primary} onChange={v => patch({ primaryColor: v })}
          foreground={primary} background={bg} contrastLabel="Primary on Background" />
        <ColorField label="Background" value={bg} onChange={v => patch({ backgroundColor: v })} />
        <ColorField label="Surface" value={theme.surfaceColor ?? '#f5f5f5'} onChange={v => patch({ surfaceColor: v })}
          foreground={primary} background={theme.surfaceColor ?? '#f5f5f5'} contrastLabel="Primary on Surface" />
      </div>

      <Divider />

      <div className={styles.section}>
        <Text weight="semibold" size={300} block>Text Colours</Text>
        <ColorField label="Text Primary" value={theme.textPrimaryColor ?? '#323130'}
          onChange={v => patch({ textPrimaryColor: v })}
          foreground={theme.textPrimaryColor ?? '#323130'} background={bg} contrastLabel="Text on Background" />
        <ColorField label="Text Secondary" value={theme.textSecondaryColor ?? '#605e5c'}
          onChange={v => patch({ textSecondaryColor: v })} />
      </div>

      <Divider />

      <div className={styles.section}>
        <Text weight="semibold" size={300} block>State Colours</Text>
        <ColorField label="Error" value={theme.errorColor ?? '#d92b2b'} onChange={v => patch({ errorColor: v })} />
        <ColorField label="Success" value={theme.successColor ?? '#107c10'} onChange={v => patch({ successColor: v })} />
        <ColorField label="Warning" value={theme.warningColor ?? '#f7630c'} onChange={v => patch({ warningColor: v })} />
      </div>

      <Divider />

      <div className={styles.section}>
        <Text weight="semibold" size={300} block>Typography &amp; Shape</Text>
        <Field label="Font Family">
          <Input value={theme.fontFamily ?? ''} onChange={(_, d) => patch({ fontFamily: d.value })} placeholder="'Segoe UI', sans-serif" />
        </Field>
        <Field label="Font URL (Google Fonts / CDN)">
          <Input value={theme.fontUrl ?? ''} onChange={(_, d) => patch({ fontUrl: d.value })} placeholder="https://fonts.googleapis.com/..." />
        </Field>
        <Field label="Shadow Style">
          <Select value={theme.shadowStyle ?? 'None'} onChange={(_, d) => patch({ shadowStyle: d.value as ThemeDefinition['shadowStyle'] })}>
            <option value="None">None</option>
            <option value="Subtle">Subtle</option>
            <option value="Strong">Strong</option>
          </Select>
        </Field>
        <Field label="Spacing Scale">
          <Select value={theme.spacingScale ?? 'Normal'} onChange={(_, d) => patch({ spacingScale: d.value as ThemeDefinition['spacingScale'] })}>
            <option value="Compact">Compact</option>
            <option value="Normal">Normal</option>
            <option value="Comfortable">Comfortable</option>
          </Select>
        </Field>
      </div>

      <div className={styles.saveBar}>
        {saveError && <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{saveError}</Text>}
        {saveSuccess && <Text size={200} style={{ color: tokens.colorPaletteGreenForeground1 }}>Saved</Text>}
        <Button appearance="primary" icon={isSaving ? <Spinner size="tiny" /> : <SaveRegular />}
          onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Theme'}
        </Button>
      </div>
      {isCacheUpdating && (
        <MessageBar intent="warning" style={{ marginTop: '8px' }}>
          Cache updating — published form will reflect style changes within 30 seconds.
        </MessageBar>
      )}
    </div>
  );
}
