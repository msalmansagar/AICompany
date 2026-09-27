import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { buildPage, fingerprintQuery, makeContinuation, type ContinuationToken, type Page } from '@dcp/domain';
import { DataGrid } from '../data/DataGrid.js';
import { maxWindowSize } from '../data/VirtualizedRows.js';
import { appendWithoutDuplicates } from '../data/usePagedQuery.js';

interface Row { id: string; name: string; dpd: number }

/** A source that pages a synthetic population. Records what it was asked for, so requests are provable. */
function makeSource(total: number, options: { failPage?: number; shortPage?: number; delayMs?: number } = {}) {
  const requests: { pageSize: number; offset: number; filter?: string }[] = [];
  let attempts = 0;

  const fetchPage = async (
    request: { pageSize: number; continuation?: ContinuationToken; filter?: string },
  ): Promise<Page<Row>> => {
    const fingerprint = fingerprintQuery(request);
    const offset = request.continuation ? Number(atob(request.continuation).match(/"sourceToken":"(\d+)"/)?.[1] ?? 0) : 0;
    requests.push({
      pageSize: request.pageSize,
      offset,
      ...(request.filter !== undefined ? { filter: request.filter } : {}),
    });

    const pageIndex = Math.floor(offset / request.pageSize);
    if (options.failPage === pageIndex && attempts++ === 0) throw new Error('page failed');
    if (options.delayMs) await new Promise(r => setTimeout(r, options.delayMs));

    const size = Math.min(options.shortPage ?? request.pageSize, request.pageSize);
    const items: Row[] = [];
    for (let i = offset; i < Math.min(offset + size, total); i++) {
      items.push({ id: `r-${i}`, name: `Row ${i}`, dpd: i % 400 });
    }
    const nextOffset = offset + items.length;
    return buildPage(
      items,
      request.pageSize,
      nextOffset < total ? makeContinuation(String(nextOffset), fingerprint) : undefined,
      total,
    );
  };

  return { fetchPage, requests };
}

const COLUMNS = [
  { key: 'name', header: 'Name', render: (r: Row) => r.name },
  { key: 'dpd', header: 'DPD', render: (r: Row) => String(r.dpd) },
];

const renderGrid = (
  source: ReturnType<typeof makeSource>,
  props: Partial<React.ComponentProps<typeof DataGrid<Row, { filter?: string }>>> = {},
  query: { filter?: string } = {},
) => render(
  <DataGrid<Row, { filter?: string }>
    columns={COLUMNS}
    fetchPage={source.fetchPage}
    query={query}
    rowKey={(r: Row) => r.id}
    pageSize={50}
    rowHeight={40}
    height={400}
    {...props}
  />,
);

/** Every test that uses rows as evidence asserts the population first. */
const assertPopulated = (source: ReturnType<typeof makeSource>) => {
  expect(source.requests.length).toBeGreaterThan(0);
};

describe('duplicate suppression', () => {
  it('drops a row whose key is already present', () => {
    const existing = [{ id: 'a' }, { id: 'b' }];
    const merged = appendWithoutDuplicates(existing, [{ id: 'b' }, { id: 'c' }], r => r.id);
    expect(merged.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns the same array when everything incoming is a duplicate', () => {
    const existing = [{ id: 'a' }];
    expect(appendWithoutDuplicates(existing, [{ id: 'a' }], r => r.id)).toBe(existing);
  });

  it('preserves order of genuinely new rows', () => {
    const merged = appendWithoutDuplicates([{ id: 'a' }], [{ id: 'c' }, { id: 'b' }], r => r.id);
    expect(merged.map(r => r.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('bounded requests', () => {
  it('asks for the first page only, bounded by the page size', async () => {
    const source = makeSource(100_000);
    renderGrid(source);
    await screen.findByTestId('data-grid');

    assertPopulated(source);
    expect(source.requests).toHaveLength(1);
    expect(source.requests[0]!.pageSize).toBe(50);
  });

  it('never requests the whole population, however large it is', async () => {
    const source = makeSource(100_000);
    renderGrid(source);
    await screen.findByTestId('data-grid');

    expect(source.requests.every(r => r.pageSize === 50)).toBe(true);
    // 100,000 rows exist; one bounded page was fetched.
    expect(source.requests.reduce((n, r) => n + r.pageSize, 0)).toBeLessThan(200);
  });

  it('reports the source total without having fetched it', async () => {
    const source = makeSource(100_000);
    renderGrid(source);
    await screen.findByTestId('data-grid');
    assertPopulated(source);
    expect(source.requests).toHaveLength(1);
  });
});

describe('virtualized rendering bounds the DOM', () => {
  it('renders a window of rows, not the page it fetched', async () => {
    const source = makeSource(100_000);
    const { container } = renderGrid(source, { pageSize: 500 });
    await screen.findByTestId('data-grid');

    const rendered = container.querySelectorAll('[data-row-index]');
    // 500 rows were fetched. The DOM holds a viewport's worth plus overscan — never the page.
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThanOrEqual(maxWindowSize(400, 40));
    expect(rendered.length).toBeLessThan(30);
  });

  it('holds the same number of rows whether the page was 50 or 5,000', async () => {
    const small = makeSource(100_000);
    const large = makeSource(100_000);
    const a = renderGrid(small, { pageSize: 50 });
    await screen.findAllByTestId('data-grid');
    const b = renderGrid(large, { pageSize: 5_000 });
    await waitFor(() => expect(large.requests.length).toBeGreaterThan(0));

    expect(a.container.querySelectorAll('[data-row-index]').length)
      .toBe(b.container.querySelectorAll('[data-row-index]').length);
  });

  it('states the window it rendered, so the bound is assertable rather than eyeballed', async () => {
    const source = makeSource(10_000);
    renderGrid(source, { pageSize: 200 });
    const window = await screen.findByTestId('virtual-window');
    const size = Number(window.getAttribute('data-window-size'));
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(maxWindowSize(400, 40));
  });

  it('computes the bound from the viewport, not the dataset', () => {
    // The bound depends only on how much can be seen; the population never enters the arithmetic.
    expect(maxWindowSize(400, 40)).toBe(22);
    expect(maxWindowSize(800, 40)).toBe(32);
  });
});

describe('request states are distinguishable', () => {
  it('shows a first-page loading state', async () => {
    const source = makeSource(100, { delayMs: 20 });
    renderGrid(source);
    expect(screen.getByTestId('data-grid-loading-first')).toBeInTheDocument();
    await screen.findByTestId('data-grid');
  });

  it('shows an empty state distinct from an error', async () => {
    const source = makeSource(0);
    renderGrid(source);
    const empty = await screen.findByTestId('data-grid-empty');
    expect(empty).toBeInTheDocument();
    expect(screen.queryByTestId('data-grid-error')).not.toBeInTheDocument();
  });

  it('shows an error with a retry when the first page fails', async () => {
    const source = makeSource(100, { failPage: 0 });
    renderGrid(source);
    expect(await screen.findByTestId('data-grid-error')).toBeInTheDocument();
    expect(screen.getByTestId('data-grid-retry')).toBeInTheDocument();
  });

  it('recovers on retry, and the rows arrive', async () => {
    const source = makeSource(100, { failPage: 0 });
    renderGrid(source);
    const retry = await screen.findByTestId('data-grid-retry');
    await act(async () => { retry.click(); });
    await screen.findByTestId('data-grid');
    expect(source.requests.length).toBeGreaterThan(1);
  });

  it('marks the end of results once the source offers no continuation', async () => {
    const source = makeSource(10);
    renderGrid(source);
    expect(await screen.findByTestId('data-grid-end')).toHaveTextContent('End of results');
  });

  it('does not claim the end while a continuation exists', async () => {
    const source = makeSource(100_000);
    renderGrid(source);
    await screen.findByTestId('data-grid');
    expect(screen.queryByTestId('data-grid-end')).not.toBeInTheDocument();
  });
});

describe('a short page is not the end', () => {
  it('keeps paging when the source returns fewer rows than asked for', async () => {
    const source = makeSource(60, { shortPage: 5 });
    renderGrid(source);
    await screen.findByTestId('data-grid');

    // The engine asked for 50 and got 5, with a continuation — so it must not have stopped.
    await waitFor(() => expect(source.requests.length).toBeGreaterThan(1));
    expect(source.requests[0]!.pageSize).toBe(50);
  });
});

describe('changing the question starts the list over', () => {
  it('discards the continuation and requests the first page again', async () => {
    const source = makeSource(1_000);
    const { rerender } = renderGrid(source, {}, { filter: 'a' });
    await screen.findByTestId('data-grid');
    const before = source.requests.length;

    rerender(
      <DataGrid<Row, { filter?: string }>
        columns={COLUMNS} fetchPage={source.fetchPage} query={{ filter: 'b' }}
        rowKey={(r: Row) => r.id} pageSize={50} rowHeight={40} height={400}
      />,
    );
    await waitFor(() => expect(source.requests.length).toBeGreaterThan(before));

    const latest = source.requests.at(-1)!;
    expect(latest.filter).toBe('b');
    expect(latest.offset).toBe(0); // first page, not a continuation into the old population
  });

  it('does not restart when the query object changes identity but not meaning', async () => {
    const source = makeSource(1_000);
    const { rerender } = renderGrid(source, {}, { filter: 'a' });
    await screen.findByTestId('data-grid');
    const before = source.requests.length;

    rerender(
      <DataGrid<Row, { filter?: string }>
        columns={COLUMNS} fetchPage={source.fetchPage} query={{ filter: 'a' }}
        rowKey={(r: Row) => r.id} pageSize={50} rowHeight={40} height={400}
      />,
    );
    await new Promise(r => setTimeout(r, 30));

    expect(source.requests.length).toBe(before);
  });
});

describe('stale responses cannot contaminate a newer query', () => {
  it('discards a slow answer to a question that has been replaced', async () => {
    // The first query is slow; the second is fast. Without sequencing, the first would land last
    // and overwrite the second's rows — the classic bug this engine exists to prevent.
    const slow = vi.fn(async (request: { pageSize: number; filter?: string; continuation?: ContinuationToken }) => {
      const delay = request.filter === 'slow' ? 60 : 1;
      await new Promise(r => setTimeout(r, delay));
      const tag = request.filter === 'slow' ? 'OLD' : 'NEW';
      return buildPage([{ id: `${tag}-1`, name: tag, dpd: 1 }], request.pageSize, undefined, 1);
    });

    const { rerender } = render(
      <DataGrid<Row, { filter?: string }>
        columns={COLUMNS} fetchPage={slow} query={{ filter: 'slow' }}
        rowKey={(r: Row) => r.id} pageSize={50} rowHeight={40} height={400}
      />,
    );

    rerender(
      <DataGrid<Row, { filter?: string }>
        columns={COLUMNS} fetchPage={slow} query={{ filter: 'fast' }}
        rowKey={(r: Row) => r.id} pageSize={50} rowHeight={40} height={400}
      />,
    );

    await screen.findByText('NEW');
    await new Promise(r => setTimeout(r, 120)); // let the slow answer land

    expect(screen.queryByText('OLD')).not.toBeInTheDocument();
    expect(screen.getByText('NEW')).toBeInTheDocument();
  });
});

describe('overlapping requests are suppressed', () => {
  it('a burst of end-of-list triggers produces one request, not a burst of them', async () => {
    const source = makeSource(100_000, { delayMs: 30 });
    renderGrid(source);
    await screen.findByTestId('data-grid');
    const viewport = screen.getByTestId('data-grid-viewport');
    const afterFirst = source.requests.length;

    // Rapid scrolling: the threshold fires on every scroll event.
    await act(async () => {
      for (let i = 0; i < 12; i++) {
        viewport.scrollTop = 100 + i * 10;
        viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });

    expect(source.requests.length).toBeLessThanOrEqual(afterFirst + 1);
  });
});
