import React from 'react';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import type { DesignerGridColumnConfig } from '@/state/models/DesignerFormModel';

/**
 * How many columns the canvas draws before truncating.
 *
 * The preview lives inside the field slot's drag handle, so it must never introduce its own
 * scroll container — a horizontally scrollable region there competes with dnd-kit for the
 * pointer. Truncating keeps the slot a fixed, draggable size however many columns exist.
 */
export const GRID_PREVIEW_COLUMN_LIMIT = 6;

const useStyles = makeStyles({
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    marginTop: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '4px',
  },
  headerCell: {
    padding: '3px 6px',
    textAlign: 'left',
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  headerCellHidden: {
    color: tokens.colorNeutralForeground4,
    fontStyle: 'italic',
  },
  placeholderCell: {
    padding: '3px 6px',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground4,
    fontSize: tokens.fontSizeBase100,
  },
  overflowNote: {
    display: 'block',
    marginTop: '2px',
    color: tokens.colorNeutralForeground3,
  },
});

interface GridPreviewProps {
  columns: DesignerGridColumnConfig[];
}

/** Draws a grid field's configured columns on the canvas as a miniature header row. */
export function GridPreview({ columns }: GridPreviewProps): React.ReactElement | null {
  const styles = useStyles();

  if (columns.length === 0) {
    return null;
  }

  const ordered = [...columns].sort((a, b) => a.displayOrder - b.displayOrder);
  const shown = ordered.slice(0, GRID_PREVIEW_COLUMN_LIMIT);
  const hiddenCount = ordered.length - shown.length;

  return (
    <div>
      <table className={styles.table} aria-hidden="true">
        <thead>
          <tr>
            {shown.map(column => (
              <th
                key={column.id}
                data-hidden={!column.isVisible}
                className={`${styles.headerCell} ${column.isVisible ? '' : styles.headerCellHidden}`}
                title={column.columnLabel}
              >
                {column.columnLabel || 'Untitled'}
                {column.isRequired ? ' *' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {shown.map(column => (
              <td key={column.id} className={styles.placeholderCell}>&nbsp;</td>
            ))}
          </tr>
        </tbody>
      </table>
      {hiddenCount > 0 && (
        <Text size={100} className={styles.overflowNote}>{`+${hiddenCount} more`}</Text>
      )}
    </div>
  );
}
