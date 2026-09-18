import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Windowed rendering: the browser holds the rows it can show, and not the ones it cannot.
 *
 * Infinite scroll on its own is not enough. A list that fetches in bounded pages but appends every
 * row to the DOM still ends up with a hundred thousand `<tr>` elements, and the tab dies just as
 * surely — only later, which is worse. This renders a window of rows plus a small overscan, and
 * holds the rest open with spacer elements so the scrollbar stays honest.
 *
 * Rows are a fixed height on purpose. Variable-height virtualization needs measurement, and
 * measurement needs the row rendered, which is the thing being avoided. The approved grid rows are a
 * uniform height already, so the simple approach is also the correct one here.
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
  renderRow: (item: T, index: number) => ReactNode;
  /** Called when the viewport comes within `endThreshold` rows of the bottom. */
  onReachEnd?: () => void;
  endThreshold?: number;
  /** Rendered beneath the rows: the loading-more indicator, the end marker, a retry. */
  footer?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function VirtualizedRows<T>({
  items,
  rowKey,
  rowHeight,
  height,
  overscan = 6,
  renderRow,
  onReachEnd,
  endThreshold = 8,
  footer,
  className,
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

  return (
    <div
      ref={viewport}
      className={className}
      data-testid={testId}
      onScroll={handleScroll}
      style={{ height, overflowY: 'auto', position: 'relative' }}
    >
      {/* Spacers carry the scroll height of the rows that are not rendered. */}
      <div style={{ height: start * rowHeight }} aria-hidden="true" />
      <div data-testid="virtual-window" data-window-start={start} data-window-size={window.length}>
        {window.map((item, i) => (
          <div key={rowKey(item)} style={{ height: rowHeight }} data-row-index={start + i}>
            {renderRow(item, start + i)}
          </div>
        ))}
      </div>
      <div style={{ height: Math.max(0, (items.length - end) * rowHeight) }} aria-hidden="true" />
      {footer}
    </div>
  );
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
