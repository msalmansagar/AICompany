import { afterAll, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { buildPage, fingerprintQuery, makeContinuation, type ContinuationToken, type Page } from '@dcp/domain';
import { DataGrid } from '../data/DataGrid.js';
import { maxWindowSize } from '../data/VirtualizedRows.js';

/**
 * Frontend behaviour at volume.
 *
 * The evidence that matters is **not** that a synthetic array of 100,000 objects can be created. It
 * is that the browser never asks for the population and never renders it. So every measurement here
 * is about what was *not* done: rows requested against rows available, DOM nodes against rows held,
 * requests against scroll events.
 *
 * Populations are generated lazily — a page is materialised on demand rather than the whole set — so
 * the test itself does not do the thing it is checking the application does not do.
 *
 * Nothing is written to the QDB sandbox. Real Dataverse paging has its own live coverage; this is
 * about the browser. Production-scale stress and soak certification remains Phase 11.
 */

interface Row { id: string; name: string; dpd: number }

const measurements: {
  population: number; pageSize: number; rowsRequested: number; requests: number;
  domRows: number; domBound: number; duplicates: number; heapMb: number;
}[] = [];

/** A source that materialises only the page asked for. The population is a number, not an array. */
function lazySource(total: number) {
  const requests: { pageSize: number; offset: number }[] = [];
  const fetchPage = async (
    request: { pageSize: number; continuation?: ContinuationToken; filter?: string },
  ): Promise<Page<Row>> => {
    const fingerprint = fingerprintQuery(request);
    const offset = request.continuation
      ? Number(atob(request.continuation).match(/"sourceToken":"(\d+)"/)?.[1] ?? 0)
      : 0;
    requests.push({ pageSize: request.pageSize, offset });

    const items: Row[] = [];
    for (let i = offset; i < Math.min(offset + request.pageSize, total); i++) {
      items.push({ id: `r-${i}`, name: `Row ${i}`, dpd: i % 400 });
    }
    const next = offset + items.length;
    return buildPage(items, request.pageSize, next < total ? makeContinuation(String(next), fingerprint) : undefined, total);
  };
  return { fetchPage, requests, total };
}

const COLUMNS = [
  { key: 'name', header: 'Name', render: (r: Row) => r.name },
  { key: 'dpd', header: 'DPD', render: (r: Row) => String(r.dpd) },
];

const VIEWPORT = 400;
const ROW_HEIGHT = 40;

async function measure(population: number, pageSize: number) {
  const source = lazySource(population);
  const heapBefore = process.memoryUsage().heapUsed;

  const { container, unmount } = render(
    <DataGrid<Row, { filter?: string }>
      columns={COLUMNS} fetchPage={source.fetchPage} query={{}}
      rowKey={(r: Row) => r.id} pageSize={pageSize} rowHeight={ROW_HEIGHT} height={VIEWPORT}
    />,
  );
  await screen.findByTestId('data-grid');

  const domRows = container.querySelectorAll('[data-row-index]').length;
  const ids = [...container.querySelectorAll('[data-row-index]')].map(n => n.textContent);
  const duplicates = ids.length - new Set(ids).size;
  const rowsRequested = source.requests.reduce((n, r) => n + r.pageSize, 0);
  const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;

  // The population must actually exist, or none of the numbers below mean anything.
  expect(source.requests.length).toBeGreaterThan(0);

  measurements.push({
    population, pageSize, rowsRequested, requests: source.requests.length,
    domRows, domBound: maxWindowSize(VIEWPORT, ROW_HEIGHT), duplicates, heapMb,
  });
  unmount();
  return { source, domRows, duplicates, rowsRequested };
}

describe('the browser does not fetch the population', () => {
  it('asks for 50 of 10,000', async () => {
    const { rowsRequested } = await measure(10_000, 50);
    expect(rowsRequested).toBeLessThanOrEqual(100);
  }, 60_000);

  it('asks for 50 of 50,000', async () => {
    const { rowsRequested } = await measure(50_000, 50);
    expect(rowsRequested).toBeLessThanOrEqual(100);
  }, 60_000);

  it('asks for 50 of 100,000', async () => {
    const { rowsRequested } = await measure(100_000, 50);
    expect(rowsRequested).toBeLessThanOrEqual(100);
  }, 60_000);

  it('requests the same amount whether the population is 10,000 or 100,000', () => {
    const small = measurements.find(m => m.population === 10_000 && m.pageSize === 50);
    const large = measurements.find(m => m.population === 100_000 && m.pageSize === 50);
    expect(small).toBeDefined();
    expect(large).toBeDefined();
    expect(large!.rowsRequested).toBe(small!.rowsRequested);
  });
});

describe('the browser does not render the rows it holds', () => {
  it('holds a bounded DOM at 100,000 with a large page size', async () => {
    const { domRows } = await measure(100_000, 1_000);
    expect(domRows).toBeGreaterThan(0);
    expect(domRows).toBeLessThanOrEqual(maxWindowSize(VIEWPORT, ROW_HEIGHT));
  }, 60_000);

  it('renders no duplicate row in the DOM', () => {
    expect(measurements.length, 'measurements must exist before they are evidence').toBeGreaterThan(0);
    for (const m of measurements) {
      expect(m.duplicates, `population ${m.population}`).toBe(0);
    }
  });

  it('keeps the DOM bound independent of both population and page size', () => {
    expect(measurements.length).toBeGreaterThan(0);
    for (const m of measurements) {
      expect(m.domRows, `population ${m.population}, page ${m.pageSize}`).toBeLessThanOrEqual(m.domBound);
    }
  });
});

describe('continuation-driven retrieval reaches every row exactly once', () => {
  it('walks 5,000 rows through continuations with no duplicate and no gap', async () => {
    const source = lazySource(5_000);
    const seen = new Set<string>();
    let duplicates = 0;
    let continuation: ContinuationToken | undefined;
    let pages = 0;

    do {
      const page = await source.fetchPage({ pageSize: 250, ...(continuation ? { continuation } : {}) });
      expect(page.items.length, 'a page must carry rows for the walk to prove anything').toBeGreaterThan(0);
      for (const row of page.items) {
        if (seen.has(row.id)) duplicates++;
        seen.add(row.id);
      }
      continuation = page.continuation;
      pages++;
    } while (continuation && pages < 100);

    expect(pages).toBe(20);
    expect(duplicates).toBe(0);
    expect(seen.size).toBe(5_000);
    // No gap: every index from 0 to 4,999 was seen exactly once.
    for (let i = 0; i < 5_000; i += 500) expect(seen.has(`r-${i}`)).toBe(true);
    expect(seen.has('r-4999')).toBe(true);
    expect(continuation).toBeUndefined(); // clean termination
  }, 120_000);
});

describe('rapid scrolling does not multiply requests', () => {
  it('thirty scroll events produce at most one additional page request', async () => {
    const source = lazySource(100_000);
    render(
      <DataGrid<Row, { filter?: string }>
        columns={COLUMNS} fetchPage={source.fetchPage} query={{}}
        rowKey={(r: Row) => r.id} pageSize={50} rowHeight={ROW_HEIGHT} height={VIEWPORT}
      />,
    );
    await screen.findByTestId('data-grid');
    const viewport = screen.getByTestId('data-grid-viewport');
    const before = source.requests.length;

    await act(async () => {
      for (let i = 0; i < 30; i++) {
        viewport.scrollTop = 200 + i * 40;
        viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });

    expect(source.requests.length).toBeLessThanOrEqual(before + 1);
  }, 60_000);
});

describe('changing the query at volume resets cleanly', () => {
  it('discards the continuation and re-requests the first page', async () => {
    const source = lazySource(100_000);
    const { rerender } = render(
      <DataGrid<Row, { filter?: string }>
        columns={COLUMNS} fetchPage={source.fetchPage} query={{ filter: 'a' }}
        rowKey={(r: Row) => r.id} pageSize={50} rowHeight={ROW_HEIGHT} height={VIEWPORT}
      />,
    );
    await screen.findByTestId('data-grid');

    rerender(
      <DataGrid<Row, { filter?: string }>
        columns={COLUMNS} fetchPage={source.fetchPage} query={{ filter: 'b' }}
        rowKey={(r: Row) => r.id} pageSize={50} rowHeight={ROW_HEIGHT} height={VIEWPORT}
      />,
    );
    await waitFor(() => expect(source.requests.length).toBeGreaterThan(1));

    expect(source.requests.at(-1)!.offset).toBe(0);
  }, 60_000);
});

/** Prints the measurements so they can be captured as Phase 5 gate evidence. */
afterAll(() => {
  if (measurements.length === 0) return;
  const line = (c: (string | number)[]) =>
    `  ${String(c[0]).padStart(9)} ${String(c[1]).padStart(9)} ${String(c[2]).padStart(9)} ${String(c[3]).padStart(8)} ${String(c[4]).padStart(8)} ${String(c[5]).padStart(9)} ${String(c[6]).padStart(10)}`;
  console.log('\n=== Phase 5 frontend volume evidence (synthetic, in memory, nothing written to the sandbox) ===');
  console.log(line(['population', 'pageSize', 'rowsReq', 'requests', 'domRows', 'domBound', 'duplicates']));
  for (const m of measurements) {
    console.log(line([m.population, m.pageSize, m.rowsRequested, m.requests, m.domRows, m.domBound, m.duplicates]));
  }
  const largest = measurements.reduce((a, b) => (a.population > b.population ? a : b));
  console.log(`\n  At ${largest.population.toLocaleString()} rows the browser requested ${largest.rowsRequested} ` +
    `and rendered ${largest.domRows} — ${(largest.rowsRequested / largest.population * 100).toFixed(3)}% fetched, ` +
    `${(largest.domRows / largest.population * 100).toFixed(4)}% rendered.`);
});
