import { useEffect, type KeyboardEvent, type ReactNode } from 'react';
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
  /** The column that opens the record, drawn as a link. Absent means the first column. */
  isLink?: boolean;
}

/**
 * What a click on a row does. `lead`: the one link column opens the record and nothing else in the
 * row is drawn or behaves as a link (user instruction, 2026-09-27). `row`: the whole row is the
 * control — a Split list choosing what to preview, a selection being toggled — and no cell is a link.
 */
export type RowActivation = 'lead' | 'row';

export interface DataGridProps<T, Q extends object> {
  columns: readonly DataGridColumn<T>[];
  fetchPage: (request: Q & { pageSize: number; continuation?: ContinuationToken }) => Promise<Page<T>>;
  query: Q;
  rowKey: (item: T) => string;
  pageSize?: number;
  rowHeight?: number;
  height?: number;
  onRowClick?: (item: T) => void;
  activation?: RowActivation;
  /** The row a Split layout is previewing, marked as selected. */
  selectedKey?: string | undefined;
  /**
   * Called with the first row once the list has one and nothing is selected, so a Split layout
   * opens on a preview rather than a blank pane (user instruction, 2026-09-27). Never overrides a
   * selection the officer made.
   */
  onSelectFirst?: ((item: T) => void) | undefined;
  /** Shown when the query matched nothing. The approved empty states are per-screen wording. */
  emptyMessage?: string;
  enabled?: boolean;
  'data-testid'?: string;
}

/** `.selected` for the previewed row; `.link-row` when the whole row is the control. */
function rowClassName(isSelected: boolean, isWholeRowControl: boolean): string | undefined {
  if (isSelected) return isWholeRowControl ? 'link-row selected' : 'selected';
  return isWholeRowControl ? 'link-row' : undefined;
}

/** `.link-cell` only on the one column that opens the record; `.num` as the column asks. */
function cellClassName(isNumeric: boolean | undefined, isLink: boolean): string | undefined {
  if (isLink) return isNumeric ? 'num link-cell' : 'link-cell';
  return isNumeric ? 'num' : undefined;
}

function activateOnKey(activate: () => void) {
  return (event: KeyboardEvent<HTMLTableCellElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
  };
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
  activation = 'lead',
  selectedKey,
  onSelectFirst,
  emptyMessage = 'Nothing matches the current filters.',
  enabled = true,
  'data-testid': testId = 'data-grid',
}: DataGridProps<T, Q>) {
  const paged = usePagedQuery<T, Q>({ fetchPage, query, pageSize, rowKey, enabled });
  useSelectFirst(paged.items, selectedKey, onSelectFirst);
  const isWholeRowControl = activation === 'row' && onRowClick !== undefined;
  const linkKey = activation === 'lead' && onRowClick !== undefined ? (columns.find(column => column.isLink) ?? columns[0])?.key : undefined;

  if (paged.status === 'loadingFirst') {
    return <div className="empty-state" data-testid={`${testId}-loading-first`}>Loading…</div>;
  }

  if (paged.status === 'error' && paged.items.length === 0) {
    return (
      <div className="empty-state" data-testid={`${testId}-error`}>
        <div className="es-title">The list could not be loaded.</div>
        {/*
          The platform's own message is deliberately NOT shown. It reads "Could not find a property
          named 'qdb_collectionactivityid' on type Microsoft.Dynamics.CRM.qdb_collectionactivity" —
          correct in a console, meaningless and alarming to a Collection Officer, and a leak of
          entity names into officer-facing UI (KI-93). The detail stays in the browser console,
          where whoever is diagnosing it will look.
        */}
        <div>Try again. If it keeps happening, report it to your administrator.</div>
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
            className={rowClassName(selectedKey !== undefined && rowKey(item) === selectedKey, isWholeRowControl)}
            aria-selected={selectedKey === undefined ? undefined : rowKey(item) === selectedKey}
            onClick={isWholeRowControl ? () => onRowClick!(item) : undefined}
          >
            {columns.map(column => {
              const isLink = column.key === linkKey;
              return (
                <td
                  key={column.key}
                  className={cellClassName(column.numeric, isLink)}
                  tabIndex={isLink ? 0 : undefined}
                  data-link={isLink ? 'true' : undefined}
                  onClick={isLink ? () => onRowClick!(item) : undefined}
                  onKeyDown={isLink ? activateOnKey(() => onRowClick!(item)) : undefined}
                >
                  {column.render(item)}
                </td>
              );
            })}
          </tr>
        )}
        footer={
          <div className="hint" data-testid={`${testId}-footer`}>
            {paged.status === 'loadingMore' && <span data-testid={`${testId}-loading-more`}>Loading more…</span>}
            {paged.status === 'error' && paged.items.length > 0 && (
              <span data-testid={`${testId}-page-error`}>
                The next page could not be loaded.{' '}
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

/** Selects the first row when there is one and nothing is selected yet. */
export function useSelectFirst<T>(items: readonly T[], selectedKey: string | undefined, onSelectFirst: ((item: T) => void) | undefined): void {
  const first = items[0];
  const hasSelection = selectedKey !== undefined && selectedKey !== '';
  useEffect(() => {
    if (first !== undefined && !hasSelection && onSelectFirst) onSelectFirst(first);
  }, [first, hasSelection, onSelectFirst]);
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
