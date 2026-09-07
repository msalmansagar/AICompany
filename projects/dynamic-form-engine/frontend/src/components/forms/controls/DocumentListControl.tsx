// Read-only view of documents already uploaded elsewhere on the form: name, size, and
// View / Download. Nothing here can add, replace or remove a file — it is what a file
// field renders once it is read-only, which is how a summary page shows its attachments.
//
// The documents come from another field when the maker sets sourceFieldSchemaName (the
// same binding the data-bound Label uses), so a summary page can display the upload field
// from an earlier tab without duplicating its schema name.
import { useState } from 'react';
import { Button, Link, makeStyles, tokens } from '@fluentui/react-components';
import { DocumentRegular, EyeRegular, ArrowDownloadRegular } from '@fluentui/react-icons';
import { useFormContext } from '../../../contexts/FormContext';
import { filesApi, UploadedFileReference } from '../../../api/filesApi';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalXS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  icon: { color: tokens.colorNeutralForeground2, flexShrink: 0 },
  name: {
    flex: '1 1 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase300,
  },
  size: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'nowrap',
  },
  empty: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  error: { color: tokens.colorPaletteRedForeground1, fontSize: tokens.fontSizeBase200 },
});

export function DocumentListControl({ field }: ControlProps) {
  const styles = useStyles();
  const { fieldValues } = useFormContext();
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const documents = readDocuments(fieldValues[field.sourceFieldSchemaName || field.schemaName]);

  if (documents.length === 0) {
    return <span className={styles.empty}>No documents uploaded</span>;
  }

  // Each action is independently switchable; unset means on, so fields configured before
  // the toggles existed keep both. With both off the list is names and sizes only.
  const canView = field.showDocumentView !== false;
  const canDownload = field.showDocumentDownload !== false;

  return (
    <div>
      <div className={styles.list} role="list" aria-label={`${field.label} documents`}>
        {documents.map((document) => (
          <DocumentRow
            key={document.fileId}
            document={document}
            canView={canView}
            canDownload={canDownload}
            styles={styles}
            onFailure={setFailedMessage}
          />
        ))}
      </div>
      {failedMessage && <div className={styles.error} role="alert">{failedMessage}</div>}
    </div>
  );
}

interface DocumentRowProps {
  document: UploadedFileReference;
  canView: boolean;
  canDownload: boolean;
  styles: ReturnType<typeof useStyles>;
  onFailure: (message: string | null) => void;
}

function DocumentRow({ document, canView, canDownload, styles, onFailure }: DocumentRowProps) {
  const [isBusy, setIsBusy] = useState(false);

  async function run(action: (ref: UploadedFileReference) => Promise<void>, verb: string) {
    setIsBusy(true);
    onFailure(null);
    try {
      await action(document);
    } catch {
      onFailure(`Could not ${verb} "${document.fileName}". Please try again.`);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className={styles.item} role="listitem">
      <DocumentRegular className={styles.icon} aria-hidden="true" />
      <span className={styles.name} title={document.fileName}>{document.fileName}</span>
      <span className={styles.size}>{formatFileSize(document.sizeBytes)}</span>
      {canView && (
        <Link
          as="button"
          type="button"
          disabled={isBusy}
          onClick={() => void run(filesApi.openFile, 'open')}
          aria-label={`View ${document.fileName}`}
        >
          <EyeRegular aria-hidden="true" /> View
        </Link>
      )}
      {canDownload && (
        <Button
          appearance="transparent"
          size="small"
          disabled={isBusy}
          icon={<ArrowDownloadRegular />}
          onClick={() => void run(filesApi.downloadFile, 'download')}
          aria-label={`Download ${document.fileName}`}
        >
          Download
        </Button>
      )}
    </div>
  );
}

function readDocuments(value: unknown): UploadedFileReference[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is UploadedFileReference =>
      typeof entry === 'object' && entry !== null && 'fileId' in entry && 'fileName' in entry,
  );
}

function formatFileSize(bytes: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
