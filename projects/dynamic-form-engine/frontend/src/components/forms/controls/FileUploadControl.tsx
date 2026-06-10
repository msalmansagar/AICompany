import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Button,
  Text,
  makeStyles,
  shorthands,
  tokens,
  ProgressBar,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  DocumentRegular,
  DeleteRegular,
  ArrowUploadRegular,
} from '@fluentui/react-icons';
import { useFormContext } from '../../../contexts/FormContext';
import { filesApi, UploadedFileReference } from '../../../api/filesApi';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  dropzone: {
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalL,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease',
    ':hover': {
      ...shorthands.borderColor(tokens.colorBrandStroke1),
    },
  },
  dropzoneActive: {
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    backgroundColor: tokens.colorBrandBackground2,
  },
  dropzoneDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  uploadIcon: {
    fontSize: '32px',
    color: tokens.colorNeutralForeground3,
    marginBottom: tokens.spacingVerticalS,
  },
  hint: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    marginTop: tokens.spacingVerticalXS,
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalS,
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalXS,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  fileItemError: {
    ...shorthands.borderColor(tokens.colorPaletteRedForeground1),
    backgroundColor: tokens.colorPaletteRedBackground1,
  },
  fileIcon: {
    color: tokens.colorNeutralForeground2,
  },
  fileName: {
    flex: '1 1 0',
    fontSize: tokens.fontSizeBase300,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progress: {
    width: '100%',
    marginTop: tokens.spacingVerticalXXS,
  },
  errorText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
    whiteSpace: 'nowrap',
  },
});

interface FileUploadEntry {
  file: File;
  progress: number;
  uploadedRef: UploadedFileReference | null;
  error: string | null;
}

export function FileUploadControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { updateFieldValue } = useFormContext();
  const [uploadEntries, setUploadEntries] = useState<FileUploadEntry[]>([]);

  // Track whether the user has interacted — avoids marking the form dirty on mount.
  const hasInteracted = useRef(false);

  // Sync uploaded file IDs into FormContext whenever entries change.
  // Using useEffect (not a side effect inside a state updater) is the correct pattern.
  useEffect(() => {
    if (!hasInteracted.current) return;

    const uploadedIds = uploadEntries
      .filter((e) => e.uploadedRef !== null)
      .map((e) => e.uploadedRef!.fileId);

    updateFieldValue(field.schemaName, uploadedIds);
  }, [uploadEntries, field.schemaName, updateFieldValue]);

  const config = field.fileUploadConfig;
  const maxFiles = config?.maxFiles ?? 1;
  const maxSize = config?.maxFileSizeBytes ?? 10 * 1024 * 1024;
  const accept = config?.allowedMimeTypes
    ? Object.fromEntries(config.allowedMimeTypes.map((m) => [m, []]))
    : undefined;

  const updateEntry = useCallback(
    (index: number, patch: Partial<FileUploadEntry>) => {
      setUploadEntries((prev) =>
        prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
      );
    },
    [],
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      hasInteracted.current = true;

      const startIndex = uploadEntries.length;
      const newEntries: FileUploadEntry[] = acceptedFiles.map((file) => ({
        file,
        progress: 0,
        uploadedRef: null,
        error: null,
      }));

      setUploadEntries((prev) => [...prev, ...newEntries]);

      await Promise.all(
        newEntries.map(async (entry, relativeIndex) => {
          const entryIndex = startIndex + relativeIndex;

          try {
            const response = await filesApi.upload(
              field.id,
              entry.file,
              (progress) => updateEntry(entryIndex, { progress }),
            );

            const uploaded = (response as unknown as { data: UploadedFileReference }).data;
            // State update triggers the useEffect above, which syncs the field value.
            updateEntry(entryIndex, { uploadedRef: uploaded, progress: 100 });
          } catch (uploadError) {
            updateEntry(entryIndex, {
              error: uploadError instanceof Error ? uploadError.message : 'Upload failed',
              progress: 0,
            });
          }
        }),
      );
    },
    [field.id, uploadEntries.length, updateEntry],
  );

  function removeFile(index: number) {
    hasInteracted.current = true;
    setUploadEntries((prev) => prev.filter((_, i) => i !== index));
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    maxFiles: maxFiles - uploadEntries.length,
    disabled: isReadonly || uploadEntries.length >= maxFiles,
    multiple: maxFiles > 1,
  });

  const canAddMore = !isReadonly && uploadEntries.length < maxFiles;
  const failedEntries = uploadEntries.filter((e) => e.error);

  const formattedMaxSize = formatBytes(maxSize);
  const allowedTypes = resolveAllowedTypesLabel(config?.allowedFileExtensions, config?.allowedMimeTypes);

  return (
    <div>
      {canAddMore && (
        <div
          {...getRootProps()}
          className={`${styles.dropzone} ${isDragActive ? styles.dropzoneActive : ''}`}
          id={inputId}
          aria-required={isRequired}
          aria-describedby={errorId}
          aria-invalid={!!errorId}
          role="button"
          tabIndex={0}
        >
          <input {...getInputProps()} aria-label={`Upload files for ${field.label}`} />
          <div className={styles.uploadIcon}>
            <ArrowUploadRegular />
          </div>
          <Text>
            {isDragActive
              ? 'Drop files here'
              : 'Drag and drop files here, or click to browse'}
          </Text>
          <div className={styles.hint}>
            <Text>{allowedTypes} — max {formattedMaxSize} per file</Text>
            {maxFiles > 1 && (
              <Text block>
                Up to {maxFiles} files ({uploadEntries.length} uploaded)
              </Text>
            )}
          </div>
        </div>
      )}

      {failedEntries.length > 0 && (
        <MessageBar intent="error" style={{ marginTop: tokens.spacingVerticalS }}>
          <MessageBarBody>
            {failedEntries.length === 1
              ? `Upload failed for "${failedEntries[0].file.name}". Remove it and try again.`
              : `${failedEntries.length} uploads failed. Remove the failed files and try again.`}
          </MessageBarBody>
        </MessageBar>
      )}

      {uploadEntries.length > 0 && (
        <div className={styles.fileList} role="list" aria-label="Uploaded files">
          {uploadEntries.map((entry, index) => (
            <div
              key={index}
              className={`${styles.fileItem} ${entry.error ? styles.fileItemError : ''}`}
              role="listitem"
            >
              <DocumentRegular className={styles.fileIcon} aria-hidden="true" />
              <span className={styles.fileName}>{entry.file.name}</span>

              {entry.progress > 0 && entry.progress < 100 && !entry.error && (
                <ProgressBar
                  className={styles.progress}
                  value={entry.progress / 100}
                  aria-label={`Uploading ${entry.file.name}: ${entry.progress}%`}
                />
              )}

              {entry.error && (
                <span className={styles.errorText} role="alert">
                  Failed — remove &amp; retry
                </span>
              )}

              {!isReadonly && (
                <Button
                  appearance="transparent"
                  icon={<DeleteRegular />}
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${entry.file.name}`}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

const EXTENSION_LABELS: Record<number, string> = {
  100000000: 'PDF',
  100000001: 'JPEG',
  100000002: 'PNG',
  100000003: 'GIF',
  100000004: 'WEBP',
  100000005: 'DOCX',
  100000006: 'DOC',
  100000007: 'XLSX',
  100000008: 'XLS',
  100000009: 'PPTX',
  100000010: 'TXT',
  100000011: 'CSV',
  100000012: 'ZIP',
  100000013: 'MP4',
  100000014: 'MP3',
};

function resolveAllowedTypesLabel(
  extensionCodes: number[] | undefined,
  mimeTypes: string[] | undefined,
): string {
  if (extensionCodes && extensionCodes.length > 0) {
    return extensionCodes
      .map((code) => EXTENSION_LABELS[code] ?? String(code))
      .join(', ');
  }
  if (mimeTypes && mimeTypes.length > 0) {
    return mimeTypes.join(', ');
  }
  return 'Any file type';
}
