import type { KeyboardEvent, ReactNode } from 'react';
import type { ContinuationToken, Page } from '@dcp/domain';
import { usePagedQuery } from '../../data/usePagedQuery.js';
import { VirtualizedRows } from '../../data/VirtualizedRows.js';
import { EmptyState, ErrorState, LoadingSkeleton, rowActivation } from './primitives.js';

/**
 * Workspace V2's list, on the same large-data machinery as V1.
 *
 * Paging, continuation, stale-response suppression and de-duplication are `usePagedQuery`'s; the
 * bounded DOM is `VirtualizedRows`'s. Nothing is re-implemented and nothing is loaded whole: a change
 * of query restarts paging at the source, and only the visible window is rendered. What V2 adds is
 * presentation — the loading, empty and error states, and rows that open from the keyboard.
 */

export interface V2Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  width?: string;
  numeric?: boolean;
  /** The source column this one can be ordered by. Absent means the header is not a sort control. */
  sortField?: string;
}

/** The order a grid is asking the source for, so a header can show it and change it. */
export interface GridSort {
  field: string;
  descending: boolean;
}

export function V2DataGrid<T, Q extends object>({
  columns,
  fetchPage,
  query,
  rowKey,
  onRowOpen,
  rowLabel,
  isFiltered = false,
  selectedKey,
  sort,
  onSortChange,
  summary,
  fitsWidth = false,
  emptyTitle = 'Nothing here yet.',
  pageSize = 50,
  rowHeight = 44,
  height = 520,
  testId = 'v2-grid',
}: {
  columns: readonly V2Column<T>[];
  fetchPage: (request: Q & { pageSize: number; continuation?: ContinuationToken }) => Promise<Page<T>>;
  query: Q;
  rowKey: (item: T) => string;
  onRowOpen?: (item: T) => void;
  /** What a row is, for assistive technology — "Open case COL-1", say. */
  rowLabel?: (item: T) => string;
  /** Whether a search or filter is narrowing the list, which changes what "empty" means. */
  isFiltered?: boolean;
  /** The row shown as selected, for a list-and-preview layout. */
  selectedKey?: string | undefined;
  /** The current order, when headers may change it. The change is the caller's to send to the source. */
  sort?: GridSort | undefined;
  onSortChange?: (sort: GridSort) => void;
  /** What the list is, in words, for the footer — "4,363 cases · sorted by worst DPD first". */
  summary?: ReactNode;
  /**
   * Keep the table inside its container: sized columns keep their width, the unsized ones share
   * what is left and clip with an ellipsis, so a long name never forces a horizontal scroll.
   */
  fitsWidth?: boolean;
  emptyTitle?: string;
  pageSize?: number;
  rowHeight?: number;
  height?: number;
  testId?: string;
}) {
  const paged = usePagedQuery<T, Q>({ fetchPage, query, pageSize, rowKey });

  if (paged.status === 'loadingFirst' || paged.status === 'idle') {
    return <LoadingSkeleton rows={6} label="Loading the list" testId={`${testId}-loading`} />;
  }
  if (paged.status === 'error' && paged.items.length === 0) {
    return (
      <ErrorState
        title="The list could not be loaded."
        message="Try again. If it keeps happening, report it to your administrator."
        onRetry={paged.retry}
        testId={`${testId}-error`}
      />
    );
  }
  if (paged.status === 'empty') {
    return isFiltered
      ? <EmptyState title="Nothing matches the current filters." message="Clear or change a filter to see more." testId={`${testId}-empty-filtered`} />
      : <EmptyState title={emptyTitle} testId={`${testId}-empty`} />;
  }

  return (
    <div className={fitsWidth ? 'v2-grid v2-grid-fits' : 'v2-grid'} data-testid={testId}>
      <VirtualizedRows
        items={paged.items}
        rowKey={rowKey}
        rowHeight={rowHeight}
        height={height}
        columnCount={columns.length}
        head={<HeaderRow columns={columns} sort={sort} onSortChange={onSortChange} />}
        onReachEnd={paged.loadMore}
        data-testid={`${testId}-viewport`}
        renderRow={item => (
          <tr
            className={onRowOpen ? 'v2-row-link' : undefined}
            aria-label={rowLabel?.(item)}
            aria-selected={selectedKey === undefined ? undefined : rowKey(item) === selectedKey}
            {...(onRowOpen ? rowActivation(() => onRowOpen(item)) : {})}
            onKeyDown={onRowOpen ? moveBetweenRows(() => onRowOpen(item)) : undefined}
          >
            {columns.map(column => (
              <td key={column.key} className={column.numeric ? 'v2-num' : 'v2-cell'}>{column.render(item)}</td>
            ))}
          </tr>
        )}
        footer={<GridFooter paged={paged} testId={testId} summary={summary} />}
      />
    </div>
  );
}

/**
 * Enter and Space open the row (`rowActivation`); the arrow keys move focus to the neighbouring row,
 * so a list can be walked from the keyboard without tabbing through every cell.
 */
function moveBetweenRows(activate: () => void) {
  return (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const sibling = event.key === 'ArrowDown' ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
    if (sibling instanceof HTMLTableRowElement && sibling.tabIndex >= 0) { event.preventDefault(); sibling.focus(); }
  };
}

function HeaderRow<T>({ columns, sort, onSortChange }: {
  columns: readonly V2Column<T>[];
  sort?: GridSort | undefined;
  onSortChange?: ((sort: GridSort) => void) | undefined;
}) {
  return (
    <tr>
      {columns.map(column => {
        const isSorted = sort !== undefined && column.sortField === sort.field;
        const canSort = column.sortField !== undefined && onSortChange !== undefined;
        return (
          <th
            key={column.key}
            scope="col"
            className={column.numeric ? 'v2-num' : 'v2-cell'}
            style={column.width ? { width: column.width } : undefined}
            aria-sort={isSorted ? (sort.descending ? 'descending' : 'ascending') : undefined}
          >
            {canSort ? (
              <button
                type="button" className="v2-sort-header" data-testid={`v2-sort-${column.key}`}
                onClick={() => onSortChange({ field: column.sortField!, descending: isSorted ? !sort.descending : true })}
              >
                {column.header}
                <span className="v2-sort-mark" aria-hidden="true">{isSorted ? (sort.descending ? '▼' : '▲') : ''}</span>
              </button>
            ) : column.header}
          </th>
        );
      })}
    </tr>
  );
}

function GridFooter<T>({ paged, testId, summary }: { paged: ReturnType<typeof usePagedQuery<T, object>>; testId: string; summary?: ReactNode }) {
  return (
    <div className="v2-grid-footer" data-testid={`${testId}-footer`}>
      {summary !== undefined && <span className="v2-grid-summary" data-testid={`${testId}-summary`}>{summary}</span>}
      {paged.status === 'loadingMore' && <span data-testid={`${testId}-loading-more`}>Loading more…</span>}
      {paged.status === 'error' && paged.items.length > 0 && (
        <span data-testid={`${testId}-page-error`}>
          The next page could not be loaded.{' '}
          <button type="button" className="v2-btn" onClick={paged.retry}>Retry</button>
        </span>
      )}
      {paged.endOfResults && (
        <span data-testid={`${testId}-end`}>
          {paged.items.length}
          {paged.totalCount !== undefined ? ` of ${paged.totalCount}` : ''} shown — end of results
        </span>
      )}
      {!paged.endOfResults && paged.status === 'loaded' && (
        <span>{paged.items.length} shown — scroll for more</span>
      )}
    </div>
  );
}
