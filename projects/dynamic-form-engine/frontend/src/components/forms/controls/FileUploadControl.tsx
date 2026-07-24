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
  ArrowDownloadRegular,
  DocumentAddRegular,
} from '@fluentui/react-icons';
import { DynamicIcon } from '../DynamicIcon';
import { useFormContext } from '../../../contexts/FormContext';
import { filesApi, UploadedFileReference } from '../../../api/filesApi';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  downloadButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorBrandForeground1,
    cursor: 'pointer',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: 'transparent',
    marginBottom: tokens.spacingVerticalS,
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2,
    },
  },
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
  fileName: string;
  file: File | undefined;
  progress: number;
  uploadedRef: UploadedFileReference | null;
  error: string | null;
  previewUrl: string;
}

export function FileUploadControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { updateFieldValue, fieldValues } = useFormContext();
  const [uploadEntries, setUploadEntries] = useState<FileUploadEntry[]>([]);

  // Track whether the user has interacted — avoids marking the form dirty on mount.
  const hasInteracted = useRef(false);

  // Re-hydrate entries from FormContext on mount (e.g. after tab switch causes remount).
  const isHydrated = useRef(false);
  useEffect(() => {
    if (isHydrated.current) return;
    isHydrated.current = true;

    const stored = fieldValues[field.schemaName];
    if (!Array.isArray(stored) || stored.length === 0) return;

    const hydratedEntries: FileUploadEntry[] = (stored as UploadedFileReference[]).map((ref) => ({
      fileName: ref.fileName,
      file: undefined,
      progress: 100,
      uploadedRef: ref,
      error: null,
      previewUrl: ref.previewUrl ?? ref.url,
    }));

    setUploadEntries(hydratedEntries);
    // hasInteracted stays false — hydration must not re-trigger updateFieldValue
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync uploaded file IDs into FormContext whenever entries change.
  // Using useEffect (not a side effect inside a state updater) is the correct pattern.
  useEffect(() => {
    if (!hasInteracted.current) return;

    const uploadedRefs = uploadEntries
      .filter((e) => e.uploadedRef !== null)
      .map((e) => ({ ...e.uploadedRef!, previewUrl: e.previewUrl }));

    updateFieldValue(field.schemaName, uploadedRefs);
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
        fileName: file.name,
        file,
        progress: 0,
        uploadedRef: null,
        error: null,
        previewUrl: URL.createObjectURL(file),
      }));

      setUploadEntries((prev) => [...prev, ...newEntries]);

      await Promise.all(
        acceptedFiles.map(async (file, relativeIndex) => {
          const entryIndex = startIndex + relativeIndex;

          try {
            const response = await filesApi.upload(
              field.id,
              file,
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
    const previewUrl = uploadEntries[index].previewUrl;
    if (previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setUploadEntries((prev) => prev.filter((_, i) => i !== index));
  }

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept,
    maxSize,
    maxFiles: maxFiles - uploadEntries.length,
    disabled: isReadonly || uploadEntries.length >= maxFiles,
    multiple: maxFiles > 1,
    // noClick: the dropzone still accepts drag-and-drop, but "click to add" is driven
    // by the explicit button below (via open()) once at least one file is present.
  });

  const canAddMore = !isReadonly && uploadEntries.length < maxFiles;
  const failedEntries = uploadEntries.filter((e) => e.error);

  const formattedMaxSize = formatBytes(maxSize);
  const allowedTypes = resolveAllowedTypesLabel(config?.allowedFileExtensions, config?.allowedMimeTypes);

  const [isDownloading, setIsDownloading] = useState(false);

  function handleTemplateDownload() {
    const setting = field.downloadDocumentSetting;
    if (!setting || isDownloading) return;
    setIsDownloading(true);
    filesApi.downloadTemplate(setting).finally(() => setIsDownloading(false));
  }

  const hasDownloadSection = !!(field.fileDownloadIcon ?? field.fileDownloadLabel ?? field.downloadDocumentSetting);

  return (
    <div>
      {hasDownloadSection && (
        <button
          type="button"
          className={styles.downloadButton}
          onClick={handleTemplateDownload}
          disabled={isDownloading}
          aria-label={field.fileDownloadLabel ?? 'Download template'}
          aria-busy={isDownloading}
        >
          {field.fileDownloadIcon ? (
            <DynamicIcon iconName={field.fileDownloadIcon} size={16} />
          ) : (
            <>
              <ArrowDownloadRegular fontSize={14} />
              {isDownloading ? 'Downloading…' : (field.fileDownloadLabel || 'Download Template')}
            </>
          )}
        </button>
      )}
      {canAddMore && uploadEntries.length === 0 && (
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
              ? `Upload failed for "${failedEntries[0].fileName}". Remove it and try again.`
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
              <span className={styles.fileName}>{entry.fileName}</span>

              {entry.progress > 0 && entry.progress < 100 && !entry.error && (
                <ProgressBar
                  className={styles.progress}
                  value={entry.progress / 100}
                  aria-label={`Uploading ${entry.fileName}: ${entry.progress}%`}
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
                  aria-label={`Remove ${entry.fileName}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Explicit add-more affordance once at least one document is present.
          The hidden input must stay mounted here — open() clicks it, and the
          drag-and-drop dropzone above (which also carries the input) is not
          rendered once files exist. */}
      {canAddMore && uploadEntries.length > 0 && (
        <>
          <input {...getInputProps()} aria-label={`Upload more files for ${field.label}`} />
          <Button
            appearance="secondary"
            icon={<DocumentAddRegular />}
            onClick={open}
            style={{ marginTop: tokens.spacingVerticalS }}
          >
            Add new Document
          </Button>
        </>
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
