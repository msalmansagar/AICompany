import React, { useCallback } from 'react';
import {
  Badge,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';

type InfoCardStyle = 'info' | 'warning' | 'success' | 'error';

const STYLE_COLOURS: Record<InfoCardStyle, { border: string; bg: string; label: string }> = {
  info:    { border: '#0078d4', bg: '#eff6fc', label: 'Info' },
  warning: { border: '#f7630c', bg: '#fff4e5', label: 'Warning' },
  success: { border: '#107c10', bg: '#f0f9f0', label: 'Success' },
  error:   { border: '#d92b2b', bg: '#fef0f0', label: 'Error' },
};

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px' },
  badgeRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  styleRow: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  styleButton: { flex: '1 1 auto', minWidth: '70px' },
  preview: {
    padding: '10px 14px',
    borderRadius: '4px',
    borderLeft: '4px solid',
    fontSize: '13px',
  },
  previewTitle: { fontWeight: '600', marginBottom: '4px' },
  previewBody: { color: tokens.colorNeutralForeground2, lineHeight: '1.4' },
  note: { color: tokens.colorNeutralForeground3, fontSize: '11px' },
});

const INFO_CARD_STYLES: InfoCardStyle[] = ['info', 'warning', 'success', 'error'];

interface Props {
  field: DesignerFieldModel;
}

export function InfoCardFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const updateField = useDesignerStore(s => s.updateField);

  const cardStyle: InfoCardStyle = field.infoCardStyle ?? 'info';
  const colours = STYLE_COLOURS[cardStyle];

  const handleStyleChange = useCallback(
    (style: InfoCardStyle) => { updateField(field.id, { infoCardStyle: style }); },
    [field.id, updateField],
  );

  return (
    <div className={styles.root}>
      <div className={styles.badgeRow}>
        <Badge appearance="outline" color="brand">info-card</Badge>
        <Badge appearance="filled" color="informative">Display only — no input</Badge>
      </div>

      <Field label="Style">
        <div className={styles.styleRow}>
          {INFO_CARD_STYLES.map(s => (
            <Button
              key={s}
              className={styles.styleButton}
              appearance={cardStyle === s ? 'primary' : 'outline'}
              size="small"
              onClick={() => handleStyleChange(s)}
              aria-pressed={cardStyle === s}
            >
              {STYLE_COLOURS[s].label}
            </Button>
          ))}
        </div>
      </Field>

      <Field label="Title" hint="Bold headline (optional)">
        <Input
          value={field.infoCardTitle ?? ''}
          placeholder="e.g. Important Notice"
          onChange={(_, d) => updateField(field.id, { infoCardTitle: d.value || null })}
        />
      </Field>

      <Field label="Body Text" hint="One item per line when a list style is chosen">
        <Textarea
          value={field.infoCardBody ?? ''}
          placeholder="e.g. Please read before submitting your application."
          rows={3}
          onChange={(_, d) => updateField(field.id, { infoCardBody: d.value || null })}
        />
      </Field>

      <Field label="List Style" hint="Render the body (one item per line) as a list">
        <Select
          value={field.infoCardListType ?? ''}
          onChange={(_, d) =>
            updateField(field.id, {
              infoCardListType: (d.value || null) as DesignerFieldModel['infoCardListType'],
            })
          }
        >
          <option value="">Plain text (no list)</option>
          <option value="bullet">Bullet list</option>
          <option value="numbered-arabic">Numbered (1, 2, 3)</option>
          <option value="numbered-roman">Numbered (I, II, III)</option>
        </Select>
      </Field>

      {field.infoCardListType && (
        <Field label="List Marker" hint="Marker shape for each item">
          <Select
            value={field.infoCardListMarker ?? 'plain'}
            onChange={(_, d) =>
              updateField(field.id, {
                infoCardListMarker: (d.value || null) as DesignerFieldModel['infoCardListMarker'],
              })
            }
          >
            <option value="plain">Plain</option>
            <option value="circle">Circle</option>
            <option value="none">None</option>
          </Select>
        </Field>
      )}

      <Field label="Icon Name" hint="Fluent UI icon name (optional)">
        <Input
          value={field.infoCardIcon ?? ''}
          placeholder="e.g. InfoRegular"
          onChange={(_, d) => updateField(field.id, { infoCardIcon: d.value || null })}
          style={{ fontFamily: 'monospace' }}
        />
      </Field>

      <Field label="Download URL" hint="Optional link shown at the bottom of the card">
        <Input
          value={field.infoCardDownloadUrl ?? ''}
          placeholder="https://example.com/document.pdf"
          onChange={(_, d) => updateField(field.id, { infoCardDownloadUrl: d.value || null })}
          type="url"
        />
      </Field>

      <Field label="Download Label" hint='Button text — defaults to "Download" when left blank. Hidden when Download Icon is set.'>
        <Input
          value={field.infoCardDownloadLabel ?? ''}
          placeholder="Download"
          onChange={(_, d) => updateField(field.id, { infoCardDownloadLabel: d.value || null })}
        />
      </Field>

      <Field label="Download Icon" hint="Icon name — if set, the icon is shown instead of the label (icon wins)">
        <Input
          value={field.infoCardDownloadIcon ?? ''}
          placeholder="e.g. ArrowDownloadRegular"
          onChange={(_, d) => updateField(field.id, { infoCardDownloadIcon: d.value || null })}
          style={{ fontFamily: 'monospace' }}
        />
      </Field>

      {/* Live preview */}
      {(field.infoCardTitle || field.infoCardBody || field.infoCardDownloadUrl) && (
        <div
          className={styles.preview}
          style={{ borderLeftColor: colours.border, backgroundColor: colours.bg }}
          aria-label="Banner preview"
        >
          {field.infoCardTitle && (
            <div className={styles.previewTitle}>{field.infoCardTitle}</div>
          )}
          {field.infoCardBody && (
            <div className={styles.previewBody}>{field.infoCardBody}</div>
          )}
          {field.infoCardDownloadUrl && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: colours.border }}>
              ⬇ {field.infoCardDownloadLabel || 'Download'}
            </div>
          )}
        </div>
      )}

      <span className={styles.note}>
        This field is display-only. It shows a banner at runtime — no value is collected.
      </span>
    </div>
  );
}
