import {
  Button,
  Card,
  CardHeader,
  Link,
  makeStyles,
  tokens,
  Text,
  Badge,
} from '@fluentui/react-components';
import { DocumentRegular, EditRegular } from '@fluentui/react-icons';
import { useState } from 'react';
import { useFormContext } from '../../contexts/FormContext';
import type { UploadedFileReference } from '../../api/filesApi';
import { filesApi } from '../../api/filesApi';
import type { FieldDefinition, GridColumnConfig } from '@qdb/shared';
import { getTabZoneFields } from './tabFields';

interface FormSummaryProps {
  onEditTab: (tabIndex: number) => void;
}

const useStyles = makeStyles({
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  summaryHeader: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  stats: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  tabSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  tabHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  gridFieldRow: {
    padding: `${tokens.spacingVerticalS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  fieldLabel: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
  },
  fieldValue: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    wordBreak: 'break-word',
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  fileIcon: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
  },
  fileName: {
    flex: '1 1 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileSize: {
    flexShrink: 0,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  gridTable: {
    borderCollapse: 'collapse' as const,
    width: '100%',
    fontSize: tokens.fontSizeBase200,
    marginTop: tokens.spacingVerticalXS,
  },
  gridTh: {
    textAlign: 'left' as const,
    padding: '5px 8px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  gridTd: {
    padding: '5px 8px',
    color: tokens.colorNeutralForeground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  gridMore: {
    padding: '4px 8px',
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
});

function isDisplayable(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

const GRID_TYPES = new Set(['grid', 'repeatingGrid', 'interactive-grid']);
// File and richText fields expand to full width (they can't be squeezed into a 2-column grid cell)
const FULL_WIDTH_TYPES = new Set(['file', 'richText', 'richtext']);

export function FormSummary({ onEditTab }: FormSummaryProps) {
  const styles = useStyles();
  const { formDefinition, fieldValues, ruleState } = useFormContext();

  if (!formDefinition) return null;

  const visibleTabs = formDefinition.tabs
    .filter((tab) => ruleState.tabVisibility[tab.id] ?? tab.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  let requiredFilled = 0;
  let requiredTotal = 0;

  // DFE-TABZONE-001: count section fields and header/footer zone fields alike.
  const countRequired = (field: FieldDefinition) => {
    if (!(ruleState.fieldVisibility[field.id] ?? field.isVisible)) return;
    if (field.isHidden || field.fieldType === 'info-card') return;
    const isRequired = ruleState.fieldRequired[field.id] ?? field.isRequired;
    if (!isRequired) return;
    requiredTotal++;
    if (isDisplayable(fieldValues[field.schemaName])) requiredFilled++;
  };

  for (const tab of visibleTabs) {
    for (const section of tab.sections) {
      if (!(ruleState.sectionVisibility[section.id] ?? section.isVisible)) continue;
      for (const field of section.fields) countRequired(field);
    }
    for (const field of getTabZoneFields(tab)) countRequired(field);
  }

  return (
    <div className={styles.wrapper} aria-label="Form summary">
      <div className={styles.summaryHeader}>Review your answers</div>

      <div className={styles.stats} aria-live="polite">
        <Badge
          appearance="outline"
          color={requiredFilled === requiredTotal ? 'success' : 'warning'}
        >
          {requiredFilled} / {requiredTotal} required fields filled
        </Badge>
      </div>

      {visibleTabs.map((tab, tabIndex) => {
        const visibleSections = tab.sections
          .filter((s) => ruleState.sectionVisibility[s.id] ?? s.isVisible)
          .sort((a, b) => a.displayOrder - b.displayOrder);

        // DFE-TABZONE-001: header/footer zone fields are part of the tab's answers too.
        const headerFields = tab.headerFields ?? [];
        const footerFields = tab.footerFields ?? [];
        const tabHasAnyFilledField =
          filterFilledFields(headerFields, ruleState, fieldValues).length > 0 ||
          filterFilledFields(footerFields, ruleState, fieldValues).length > 0 ||
          visibleSections.some(
            (section) => filterFilledFields(section.fields, ruleState, fieldValues).length > 0,
          );

        if (!tabHasAnyFilledField) return null;

        return (
          <div key={tab.id} className={styles.tabSection}>
            <div className={styles.tabHeader}>
              <div className={styles.tabTitle}>{tab.label}</div>
              <Button
                appearance="subtle"
                size="small"
                icon={<EditRegular />}
                onClick={() => onEditTab(tabIndex)}
                aria-label={`Edit ${tab.label}`}
              >
                Edit
              </Button>
            </div>

            {/* DFE-TABZONE-001: header-zone answers, above the section groups. */}
            <SummaryFieldGroup
              key={`${tab.id}-header`}
              label="Header"
              fields={headerFields}
              fieldValues={fieldValues}
              ruleState={ruleState}
              styles={styles}
            />

            {visibleSections.map((section) => (
              <SummaryFieldGroup
                key={section.id}
                label={section.label}
                fields={section.fields}
                fieldValues={fieldValues}
                ruleState={ruleState}
                styles={styles}
              />
            ))}

            {/* DFE-TABZONE-001: footer-zone answers, below the section groups. */}
            <SummaryFieldGroup
              key={`${tab.id}-footer`}
              label="Footer"
              fields={footerFields}
              fieldValues={fieldValues}
              ruleState={ruleState}
              styles={styles}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Grid mini-table ─────────────────────────────────────────────────────────

// ─── Filled-field group (shared by sections and tab header/footer zones) ──────

type SummaryStyles = ReturnType<typeof useStyles>;

function filterFilledFields(
  fields: FieldDefinition[],
  ruleState: { fieldVisibility: Record<string, boolean> },
  fieldValues: Record<string, unknown>,
): FieldDefinition[] {
  return fields
    .filter((f) => {
      if (!(ruleState.fieldVisibility[f.id] ?? f.isVisible)) return false;
      if (f.isHidden || f.fieldType === 'info-card') return false;
      return isDisplayable(fieldValues[f.schemaName]);
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

function SummaryFieldEntry({ field, value, styles }: { field: FieldDefinition; value: unknown; styles: SummaryStyles }) {
  if (GRID_TYPES.has(field.fieldType)) {
    return (
      <div className={styles.gridFieldRow}>
        <div className={styles.fieldLabel} style={{ marginBottom: '6px' }}>{field.label}</div>
        <GridMiniTable field={field} value={value} styles={styles} />
      </div>
    );
  }
  if (FULL_WIDTH_TYPES.has(field.fieldType)) {
    return (
      <div className={styles.gridFieldRow}>
        <div className={styles.fieldLabel} style={{ marginBottom: '6px' }}>{field.label}</div>
        <FieldValueDisplay field={field} value={value} />
      </div>
    );
  }
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{field.label}</span>
      <span className={styles.fieldValue}>
        <FieldValueDisplay field={field} value={value} />
      </span>
    </div>
  );
}

interface SummaryFieldGroupProps {
  label: string;
  fields: FieldDefinition[];
  fieldValues: Record<string, unknown>;
  ruleState: { fieldVisibility: Record<string, boolean> };
  styles: SummaryStyles;
}

// Renders a titled card of a field group's filled fields, or nothing when empty.
function SummaryFieldGroup({ label, fields, fieldValues, ruleState, styles }: SummaryFieldGroupProps) {
  const filledFields = filterFilledFields(fields, ruleState, fieldValues);
  if (filledFields.length === 0) return null;
  return (
    <Card aria-label={label}>
      <CardHeader header={<Text weight="semibold">{label}</Text>} />
      <div aria-label={`${label} fields`}>
        {filledFields.map((field) => (
          <SummaryFieldEntry key={field.id} field={field} value={fieldValues[field.schemaName]} styles={styles} />
        ))}
      </div>
    </Card>
  );
}

interface GridMiniTableProps {
  field: FieldDefinition;
  value: unknown;
  styles: ReturnType<typeof useStyles>;
}

const MAX_GRID_ROWS = 5;
const MAX_GRID_COLS = 5;

function GridMiniTable({ field, value, styles }: GridMiniTableProps) {
  const rows = Array.isArray(value) ? (value as Array<unknown>) : [];
  const isSelection = field.gridConfig?.mode === 'selection';
  const rowWord = isSelection ? 'record' : 'row';

  if (rows.length === 0) {
    return (
      <span style={{ color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 }}>
        No {rowWord}s
      </span>
    );
  }

  const cols: GridColumnConfig[] = [...(field.gridConfig?.columnConfigs ?? [])]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .slice(0, MAX_GRID_COLS);

  if (cols.length === 0) {
    return (
      <span>
        {rows.length} {rowWord}{rows.length !== 1 ? 's' : ''}{isSelection ? ' selected' : ' entered'}
      </span>
    );
  }

  const displayRows = rows.slice(0, MAX_GRID_ROWS);
  const overflow = rows.length - MAX_GRID_ROWS;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={styles.gridTable}>
        <thead>
          <tr>
            {cols.map((col) => (
              <th key={col.columnId} className={styles.gridTh}>
                {col.columnLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, i) => {
            const rowVals = extractRowValues(row);
            return (
              <tr
                key={i}
                style={{
                  backgroundColor:
                    i % 2 === 0
                      ? tokens.colorNeutralBackground1
                      : tokens.colorNeutralBackground2,
                }}
              >
                {cols.map((col) => {
                  const cellValue = rowVals[col.targetAttribute];
                  const isDownloadableFile =
                    col.columnFieldType === 'file' && isFileReference(cellValue);
                  return (
                    <td key={col.columnId} className={styles.gridTd}>
                      {isDownloadableFile ? (
                        <FileDownloadLink fileRef={cellValue} />
                      ) : (
                        formatCellValue(cellValue, col.columnFieldType)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {overflow > 0 && (
        <div className={styles.gridMore}>
          …and {overflow} more {rowWord}{overflow !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

function extractRowValues(row: unknown): Record<string, unknown> {
  if (row === null || row === undefined || typeof row !== 'object') return {};
  const r = row as Record<string, unknown>;
  if (r['values'] && typeof r['values'] === 'object') {
    return r['values'] as Record<string, unknown>;
  }
  return r;
}

function formatCellValue(value: unknown, columnFieldType?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (columnFieldType === 'file') {
    if (typeof value === 'object' && value !== null && 'fileName' in value) {
      return String((value as { fileName: unknown }).fileName);
    }
    return 'Document';
  }
  if (columnFieldType === 'boolean') return value ? 'Yes' : 'No';
  if (columnFieldType === 'date') {
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (columnFieldType === 'datetime') {
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

// ─── Scalar field value display ───────────────────────────────────────────────

interface FieldValueDisplayProps {
  field: FieldDefinition;
  value: unknown;
}

function isFileRefArray(value: unknown): value is UploadedFileReference[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    'fileId' in (value[0] as object) &&
    'fileName' in (value[0] as object)
  );
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// DFE-SUMMARY-DL — download an uploaded document (file field or grid cell) through the
// authenticated API. A plain href can't carry the bearer token, so downloads go via filesApi.
function isFileReference(value: unknown): value is UploadedFileReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fileName' in value &&
    'url' in value
  );
}

function FileDownloadLink({ fileRef }: { fileRef: UploadedFileReference }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = () => {
    setIsDownloading(true);
    filesApi
      .downloadFile(fileRef)
      .finally(() => setIsDownloading(false));
  };

  return (
    <Link
      as="button"
      type="button"
      onClick={handleDownload}
      disabled={isDownloading}
      title={`Download ${fileRef.fileName}`}
    >
      {fileRef.fileName}
    </Link>
  );
}

function FieldValueDisplay({ field, value }: FieldValueDisplayProps) {
  const styles = useStyles();

  switch (field.fieldType) {
    case 'checkbox':
    case 'boolean':
      return <span>{Boolean(value) ? 'Yes' : 'No'}</span>;

    case 'dropdown':
    case 'radio': {
      const option = field.options?.find((o) => o.value === String(value));
      return <span>{option?.label ?? String(value)}</span>;
    }

    case 'multiselect': {
      const selected = Array.isArray(value) ? value.map(String) : [];
      const labels = selected.map(
        (v) => field.options?.find((o) => o.value === v)?.label ?? v,
      );
      return <span>{labels.join(', ') || 'None selected'}</span>;
    }

    case 'lookup': {
      const lookupVal = value as { displayName?: string } | null;
      return <span>{lookupVal?.displayName ?? String(value)}</span>;
    }

    case 'number':
    case 'decimal': {
      const num = Number(value);
      if (isNaN(num)) return <span>{String(value)}</span>;
      const decimals = field.decimalPlaces ?? (field.fieldType === 'decimal' ? 2 : 0);
      return (
        <span>
          {new Intl.NumberFormat(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }).format(num)}
        </span>
      );
    }

    case 'currency': {
      const code = field.currencyCode ?? 'USD';
      const num = Number(value);
      if (isNaN(num)) return <span>{String(value)}</span>;
      return (
        <span>
          {new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(num)}
        </span>
      );
    }

    case 'date': {
      const d = new Date(String(value));
      return (
        <span>
          {isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      );
    }

    case 'datetime': {
      const d = new Date(String(value));
      return (
        <span>
          {isNaN(d.getTime())
            ? String(value)
            : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      );
    }

    case 'file': {
      if (!isFileRefArray(value)) {
        return <span>{Array.isArray(value) ? value.length : 1} file(s)</span>;
      }
      return (
        <div className={styles.fileList}>
          {value.map((ref) => (
            <div key={ref.fileId} className={styles.fileItem}>
              <DocumentRegular className={styles.fileIcon} aria-hidden="true" />
              <span className={styles.fileName}>
                <FileDownloadLink fileRef={ref} />
              </span>
              <span className={styles.fileSize}>{formatFileSize(ref.sizeBytes)}</span>
            </div>
          ))}
        </div>
      );
    }

    case 'richText':
      return <span>{String(value).replace(/<[^>]*>/g, ' ').trim()}</span>;

    default:
      return <span>{String(value)}</span>;
  }
}
