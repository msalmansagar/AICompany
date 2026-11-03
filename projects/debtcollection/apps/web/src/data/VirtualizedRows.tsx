import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Windowed rendering: the browser holds the rows it can show, and not the ones it cannot.
 *
 * Infinite scroll on its own is not enough. A list that fetches in bounded pages but appends every
 * row to the DOM still ends up with a hundred thousand `<tr>` elements, and the tab dies just as
 * surely — only later, which is worse. This renders a window of rows plus a small overscan, and
 * holds the rest open with spacer rows so the scrollbar stays honest.
 *
 * It renders a **table**, because the approved grid is a table: `.grid-wrap` wrapping
 * `table.grid`, with a sticky header, as the ported stylesheet defines. Windowing a table means the
 * spacers are `<tr>` elements with a single `<td colspan>` rather than free-standing divs — a div
 * between rows would be re-parented out of the table by the HTML parser and the layout would
 * collapse.
 *
 * Rows are a fixed height on purpose. Variable-height virtualization needs measurement, and
 * measurement needs the row rendered, which is the thing being avoided. The approved grid rows are a
 * uniform 44px already, so the simple approach is also the correct one here.
 */

export interface VirtualizedRowsProps<T> {
  items: readonly T[];
  /** Stable business identity. Never an array index — a reordered list would reuse the wrong row. */
  rowKey: (item: T) => string;
  rowHeight: number;
  /** Height of the scrolling viewport in pixels. */
  height: number;
  /** Rows rendered above and below the visible window, so a fast scroll does not show blank space. */
  overscan?: number;
  /** Must return a `<tr>`. The engine supplies the key and the row-index attribute around it. */
  renderRow: (item: T, index: number) => ReactNode;
  /** The `<thead>` content — a single `<tr>` of `<th>`. Sticky, per the approved grid. */
  head: ReactNode;
  /** How many columns a spacer row must span. */
  columnCount: number;
  /** Called when the viewport comes within `endThreshold` rows of the bottom. */
  onReachEnd?: () => void;
  endThreshold?: number;
  /** Rendered beneath the table: the loading-more indicator, the end marker, a retry. */
  footer?: ReactNode;
  'data-testid'?: string;
}

export function VirtualizedRows<T>({
  items,
  rowKey,
  rowHeight,
  height,
  overscan = 6,
  renderRow,
  head,
  columnCount,
  onReachEnd,
  endThreshold = 8,
  footer,
  'data-testid': testId,
}: VirtualizedRowsProps<T>) {
  const viewport = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const visibleCount = Math.ceil(height / rowHeight);
  const firstVisible = Math.floor(scrollTop / rowHeight);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(items.length, firstVisible + visibleCount + overscan);
  const window = items.slice(start, end);

  /**
   * The end trigger is evaluated on scroll rather than by an observer on a sentinel element.
   *
   * A sentinel only fires when it is rendered, and in a virtualized list the last row usually is not.
   * Comparing positions works whether or not the bottom of the list exists in the DOM.
   */
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    setScrollTop(el.scrollTop);
    if (!onReachEnd) return;
    const rowsBelow = items.length - Math.ceil((el.scrollTop + el.clientHeight) / rowHeight);
    if (rowsBelow <= endThreshold) onReachEnd();
  }, [endThreshold, items.length, onReachEnd, rowHeight]);

  // A short first page may not fill the viewport, in which case the user cannot scroll and would
  // never reach the trigger. Ask for more until the list is taller than the window.
  useEffect(() => {
    if (!onReachEnd) return;
    if (items.length * rowHeight < height) onReachEnd();
  }, [items.length, rowHeight, height, onReachEnd]);

  const leading = start * rowHeight;
  const trailing = Math.max(0, (items.length - end) * rowHeight);

  return (
    <>
      <div
        ref={viewport}
        className="grid-wrap"
        data-testid={testId}
        onScroll={handleScroll}
        style={{ height }}
      >
        <table className="grid">
          <thead>{head}</thead>
          <tbody data-testid="virtual-window" data-window-start={start} data-window-size={window.length}>
            {/* Spacer rows carry the scroll height of the rows that are not rendered. */}
            {leading > 0 && (
              <tr aria-hidden="true" style={{ height: leading }}><td colSpan={columnCount} /></tr>
            )}
            {window.map((item, i) => (
              <RowSlot key={rowKey(item)} index={start + i}>
                {renderRow(item, start + i)}
              </RowSlot>
            ))}
            {trailing > 0 && (
              <tr aria-hidden="true" style={{ height: trailing }}><td colSpan={columnCount} /></tr>
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </>
  );
}

/**
 * Tags the caller's `<tr>` with its index without wrapping it.
 *
 * A wrapper element cannot go between `<tbody>` and `<tr>`, so the attribute is cloned onto the row
 * the caller returned. Tests count `[data-row-index]` to measure how much DOM the list holds.
 */
function RowSlot({ index, children }: { index: number; children: ReactNode }) {
  if (!children || typeof children !== 'object' || !('props' in children)) return <>{children}</>;
  const element = children as React.ReactElement<Record<string, unknown>>;
  return <element.type {...element.props} data-row-index={index} />;
}

/**
 * The MOST rows a viewport of this size will ever hold in the DOM.
 *
 * It is an upper bound rather than an exact count, and deliberately so: at the top of a list there is
 * no overscan above the window, so the rendered count is smaller there than in the middle. What
 * matters — and what a test should assert — is that the number never exceeds this, whatever the
 * dataset size. Asserting an exact figure would encode where the scrollbar happened to be.
 */
export function maxWindowSize(height: number, rowHeight: number, overscan = 6): number {
  return Math.ceil(height / rowHeight) + overscan * 2;
}
