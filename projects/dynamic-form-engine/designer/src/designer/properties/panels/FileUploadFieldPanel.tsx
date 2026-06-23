import React, { useCallback, useState } from 'react';
import {
  Badge,
  Field,
  Input,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';

function validateUploadSetting(value: string): string | null {
  if (!value.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return 'Invalid JSON — check for missing quotes, commas, or brackets.';
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).entityName !== 'string' ||
    !Array.isArray((parsed as Record<string, unknown>).attributeConfig)
  ) {
    return 'Must have shape: { "entityName": "...", "attributeConfig": [...] }';
  }
  return null;
}

function validateDownloadSetting(value: string): string | null {
  if (!value.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return 'Invalid JSON — check for missing quotes, commas, or brackets.';
  }
  const root = parsed as Record<string, unknown>;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof root.downloadSetting !== 'object' ||
    root.downloadSetting === null ||
    !Array.isArray((root.downloadSetting as Record<string, unknown>).attributeConfig)
  ) {
    return 'Must have shape: { "downloadSetting": { "attributeConfig": [...] } }';
  }
  const configs = (root.downloadSetting as Record<string, unknown>).attributeConfig as Array<Record<string, unknown>>;
  const hasDocumentName = configs.some((c) => c.attributeName === 'documentName');
  if (!hasDocumentName) {
    return 'attributeConfig must include an entry with "attributeName": "documentName".';
  }
  return null;
}

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px' },
  badgeRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  note: { color: tokens.colorNeutralForeground3, fontSize: '11px' },
});

const UPLOAD_SETTING_PLACEHOLDER = JSON.stringify(
  {
    entityName: 'qdb_edms',
    attributeConfig: [
      {
        attributeName: 'qdb_templateguid@odata.bind',
        attributeValue: '/qdb_documenttemplates(00000000-0000-0000-0000-000000000000)',
        type: 'lookup',
      },
    ],
  },
  null,
  2,
);

const DOWNLOAD_SETTING_PLACEHOLDER = JSON.stringify(
  {
    downloadSetting: {
      attributeConfig: [
        { attributeName: 'documentName', attributeValue: 'Application Form', type: 'string' },
      ],
    },
  },
  null,
  2,
);

interface Props {
  field: DesignerFieldModel;
}

export function FileUploadFieldPanel({ field }: Props): React.ReactElement {
  const styles = useStyles();
  const updateField = useDesignerStore(s => s.updateField);

  const [uploadError, setUploadError] = useState<string | null>(
    () => validateUploadSetting(field.uploadDocumentSetting ?? ''),
  );
  const [downloadError, setDownloadError] = useState<string | null>(
    () => validateDownloadSetting(field.downloadDocumentSetting ?? ''),
  );

  const handleChange = useCallback(
    (key: keyof DesignerFieldModel, value: string | null) => {
      updateField(field.id, { [key]: value } as Partial<DesignerFieldModel>);
    },
    [field.id, updateField],
  );

  return (
    <div className={styles.root}>
      <div className={styles.badgeRow}>
        <Badge appearance="outline" color="brand">{field.fieldType}</Badge>
      </div>

      <Field
        label="Download Label"
        hint='Label on the template-download button shown before upload. Hidden when Download Icon is set.'
      >
        <Input
          value={field.fileDownloadLabel ?? ''}
          placeholder="Download Template"
          onChange={(_, d) => handleChange('fileDownloadLabel', d.value || null)}
        />
      </Field>

      <Field
        label="Download Icon"
        hint="Icon name for the download button — if set, shown instead of the label (icon wins)"
      >
        <Input
          value={field.fileDownloadIcon ?? ''}
          placeholder="e.g. ArrowDownloadRegular"
          onChange={(_, d) => handleChange('fileDownloadIcon', d.value || null)}
          style={{ fontFamily: 'monospace' }}
        />
      </Field>

      <Field
        label="Upload Document Setting"
        hint="JSON — tells the backend which CRM entity/attributes to create when the user uploads a file"
        validationState={uploadError ? 'error' : 'none'}
        validationMessage={uploadError ?? undefined}
      >
        <Textarea
          value={field.uploadDocumentSetting ?? ''}
          placeholder={UPLOAD_SETTING_PLACEHOLDER}
          rows={6}
          onChange={(_, d) => handleChange('uploadDocumentSetting', d.value || null)}
          onBlur={(e) => setUploadError(validateUploadSetting(e.target.value))}
          style={{ fontFamily: 'monospace', fontSize: '12px' }}
        />
      </Field>

      <Field
        label="Download Document Setting"
        hint="JSON — tells the backend which CRM document to generate when the user clicks the download button"
        validationState={downloadError ? 'error' : 'none'}
        validationMessage={downloadError ?? undefined}
      >
        <Textarea
          value={field.downloadDocumentSetting ?? ''}
          placeholder={DOWNLOAD_SETTING_PLACEHOLDER}
          rows={6}
          onChange={(_, d) => handleChange('downloadDocumentSetting', d.value || null)}
          onBlur={(e) => setDownloadError(validateDownloadSetting(e.target.value))}
          style={{ fontFamily: 'monospace', fontSize: '12px' }}
        />
      </Field>

      <span className={styles.note}>
        File upload constraints (allowed types, maximum size) are defined in
        the portal renderer configuration, not in the form definition.
      </span>
    </div>
  );
}
