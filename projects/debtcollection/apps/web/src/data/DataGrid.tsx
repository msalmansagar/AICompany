import type { ReactNode } from 'react';
import type { ContinuationToken, Page } from '@dcp/domain';
import { usePagedQuery } from './usePagedQuery.js';
import { VirtualizedRows } from './VirtualizedRows.js';

/**
 * The workspace's large-data grid: server-paged, infinitely scrolled, virtually rendered.
 *
 * Every list that can grow with the book uses this one component, so the properties that matter are
 * proven once rather than re-argued per screen. What it will not do is as important as what it will:
 * there is no prop that loads everything, no client-side filter and no client-side sort. A narrowing
 * that is not in the query does not happen.
 *
 * Request state is explicit rather than a single spinner. "Loading the first page" and "loading the
 * next page" look different to a user, and "empty because nothing matches" is not the same answer as
 * "empty because it failed" — a grid that shows the same grey shimmer for all three is telling the
 * user nothing.
 *
 * It renders the approved grid: `.grid-wrap` wrapping `table.grid`, with the prototype's sticky
 * header, `.empty-row` for an empty result and `.empty-state` for a failure.
 */

export interface DataGridColumn<T> {
  key: string;
  header: string;
  /** The approved grid renders values; formatting only, never calculation. */
  render: (item: T) => ReactNode;
  width?: string;
  /** Right-aligns and tabular-aligns the column, as the prototype's `.num` does. */
  numeric?: boolean;
}

export interface DataGridProps<T, Q extends object> {
  columns: readonly DataGridColumn<T>[];
  fetchPage: (request: Q & { pageSize: number; continuation?: ContinuationToken }) => Promise<Page<T>>;
  query: Q;
  rowKey: (item: T) => string;
  pageSize?: number;
  rowHeight?: number;
  height?: number;
  onRowClick?: (item: T) => void;
  /** Shown when the query matched nothing. The approved empty states are per-screen wording. */
  emptyMessage?: string;
  enabled?: boolean;
  'data-testid'?: string;
}

export function DataGrid<T, Q extends object>({
  columns,
  fetchPage,
  query,
  rowKey,
  pageSize = 50,
  // 44px is the approved row height — `table.grid tbody td` in the ported stylesheet.
  rowHeight = 44,
  height = 520,
  onRowClick,
  emptyMessage = 'Nothing matches the current filters.',
  enabled = true,
  'data-testid': testId = 'data-grid',
}: DataGridProps<T, Q>) {
  const paged = usePagedQuery<T, Q>({ fetchPage, query, pageSize, rowKey, enabled });

  if (paged.status === 'loadingFirst') {
    return <div className="empty-state" data-testid={`${testId}-loading-first`}>Loading…</div>;
  }

  if (paged.status === 'error' && paged.items.length === 0) {
    return (
      <div className="empty-state" data-testid={`${testId}-error`}>
        <div className="es-title">The list could not be loaded.</div>
        <div>{paged.error?.message ?? ''}</div>
        <button type="button" className="btn" onClick={paged.retry} data-testid={`${testId}-retry`}>Retry</button>
      </div>
    );
  }

  if (paged.status === 'empty') {
    return (
      <div className="grid-wrap auto" data-testid={`${testId}-empty`}>
        <table className="grid">
          <thead><HeaderRow columns={columns} /></thead>
          <tbody>
            <tr className="empty-row"><td colSpan={columns.length}>{emptyMessage}</td></tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div data-testid={testId}>
      <VirtualizedRows
        items={paged.items}
        rowKey={rowKey}
        rowHeight={rowHeight}
        height={height}
        columnCount={columns.length}
        head={<HeaderRow columns={columns} />}
        onReachEnd={paged.loadMore}
        data-testid={`${testId}-viewport`}
        renderRow={item => (
          <tr
            className={onRowClick ? 'link-cell' : undefined}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
          >
            {columns.map(column => (
              <td key={column.key} className={column.numeric ? 'num' : undefined}>
                {column.render(item)}
              </td>
            ))}
          </tr>
        )}
        footer={
          <div className="hint" data-testid={`${testId}-footer`}>
            {paged.status === 'loadingMore' && <span data-testid={`${testId}-loading-more`}>Loading more…</span>}
            {paged.status === 'error' && paged.items.length > 0 && (
              <span data-testid={`${testId}-page-error`}>
                {paged.error?.message ?? 'The next page could not be loaded.'}{' '}
                <button type="button" className="btn" onClick={paged.retry}>Retry</button>
              </span>
            )}
            {paged.endOfResults && paged.items.length > 0 && (
              <span data-testid={`${testId}-end`}>
                End of results — {paged.items.length}
                {paged.totalCount !== undefined ? ` of ${paged.totalCount}` : ''} shown
              </span>
            )}
          </div>
        }
      />
    </div>
  );
}

function HeaderRow<T>({ columns }: { columns: readonly DataGridColumn<T>[] }) {
  return (
    <tr>
      {columns.map(column => (
        <th
          key={column.key}
          className={column.numeric ? 'num' : undefined}
          style={column.width ? { width: column.width } : undefined}
        >
          {column.header}
        </th>
      ))}
    </tr>
  );
}
