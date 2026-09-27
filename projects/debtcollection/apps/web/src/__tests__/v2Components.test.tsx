import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ARREAR_BUCKET_CODES, type Page } from '@dcp/domain';
import { bucketVisual } from '../data/bucketVisual.js';
import { BucketBar as V1BucketBar, BucketPill } from '../components/primitives.js';
import {
  BucketBadge, BucketDot, CommandButton, EmptyState, FilterChips, MetricTile, StatusBadge, Tabs,
} from '../v2/components/primitives.js';
import { V2DataGrid, type V2Column } from '../v2/components/V2DataGrid.js';

/**
 * The V2 building blocks and the V2 grid.
 *
 * The grid is tested through the real paging hook: it must show a skeleton, an error with retry, the
 * two different empties, rows that open from the keyboard — and never let a slow answer to an old
 * query overwrite the answer to the current one.
 */

afterEach(cleanup);

describe('bucketVisual', () => {
  it('ranks every MIS bucket by its position in the contract, so ten buckets get ten looks', () => {
    expect(ARREAR_BUCKET_CODES.map(code => bucketVisual(code).rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it.each([
    ['1-30', '1 to 30 days past due'], ['>2000', 'over 2000 days past due'],
  ])('describes %s for assistive technology as "%s"', (label, description) => {
    expect(bucketVisual(label).description).toBe(description);
  });

  it('draws a label the contract does not know as neutral, deciding nothing from it', () => {
    expect(bucketVisual('unknown').rank).toBe(0);
  });

  it('ranks V1\'s pill and bar by the same contract, so both workspaces draw one bucket one way', () => {
    render(<><BucketPill bucket="501-1000" /><V1BucketBar bucket="501-1000" /></>);

    const ranks = [document.querySelector('.pill.bucket')?.getAttribute('data-bucket'), document.querySelector('.bucket-bar')?.getAttribute('data-bucket')];
    expect(ranks).toEqual(['8', '8']);
  });

  it('gives the badge and the dot the same rank', () => {
    render(<><BucketBadge bucket="61-90" /><BucketDot bucket="61-90" /></>);

    const ranks = [screen.getByText('61-90').getAttribute('data-bucket'), document.querySelector('.v2-bucket-dot')?.getAttribute('data-bucket')];
    expect(ranks).toEqual(['3', '3']);
  });

  it('labels a missing bucket as unknown rather than guessing', () => {
    render(<BucketBadge />);

    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('StatusBadge', () => {
  it('carries its meaning in text and an icon, not colour alone', () => {
    render(<StatusBadge tone="danger" testId="s">Broken</StatusBadge>);

    const badge = screen.getByTestId('s');
    expect([badge.textContent, badge.querySelector('svg') !== null]).toEqual(['Broken', true]);
  });
});

describe('MetricTile', () => {
  it('opens its list when it has one', async () => {
    const onOpen = vi.fn();
    render(<MetricTile label="My work" value="6" onOpen={onOpen} testId="m" />);

    await userEvent.click(screen.getByTestId('m'));

    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe('CommandButton', () => {
  it('says why it cannot be used, and does nothing', async () => {
    const onClick = vi.fn();
    render(<CommandButton label="Log action" onClick={onClick} disabledReason="Open a case first" testId="c" />);

    await userEvent.click(screen.getByTestId('c'));

    expect([onClick.mock.calls.length, screen.getByTestId('c').getAttribute('title')]).toEqual([0, 'Open a case first']);
  });
});

describe('Tabs', () => {
  it('moves with the arrow keys', async () => {
    const onSelect = vi.fn();
    render(<Tabs label="Case" active="a" onSelect={onSelect} tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} />);

    screen.getByTestId('v2-tab-a').focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('exposes the tab pattern', () => {
    render(<Tabs label="Case" active="b" onSelect={() => {}} tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} />);

    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('B');
  });
});

describe('FilterChips', () => {
  it('marks the selected option as pressed', () => {
    render(<FilterChips label="Bucket" selected="x" onSelect={() => {}} options={[{ id: 'all', label: 'All' }, { id: 'x', label: 'X' }]} />);

    expect(screen.getByTestId('v2-chip-x').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('EmptyState', () => {
  it('is announced as a status', () => {
    render(<EmptyState title="Nothing here yet." />);

    expect(screen.getByRole('status').textContent).toContain('Nothing here yet.');
  });
});

// ── The grid ────────────────────────────────────────────────────────────────

interface Row { id: string; name: string }
const COLUMNS: readonly V2Column<Row>[] = [{ key: 'name', header: 'Name', render: r => r.name }];
const page = (items: Row[]): Page<Row> => ({ items, hasMore: false, appliedPageSize: 50 });

function grid(fetchPage: (request: { q: string }) => Promise<Page<Row>>, props: Partial<{ q: string; isFiltered: boolean; onRowOpen: (r: Row) => void }> = {}) {
  return (
    <V2DataGrid<Row, { q: string }>
      columns={COLUMNS}
      fetchPage={fetchPage}
      query={{ q: props.q ?? '' }}
      rowKey={r => r.id}
      isFiltered={props.isFiltered ?? false}
      {...(props.onRowOpen ? { onRowOpen: props.onRowOpen } : {})}
      rowLabel={r => `Open ${r.name}`}
      height={300}
    />
  );
}

describe('V2DataGrid', () => {
  it('shows a skeleton while the first page loads', () => {
    render(grid(() => new Promise(() => {})));

    expect(screen.getByTestId('v2-grid-loading')).toBeTruthy();
  });

  it('shows an error with a retry that reads again', async () => {
    const fetchPage = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(page([{ id: '1', name: 'Ali' }]));
    render(grid(fetchPage));

    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Ali')).toBeTruthy();
  });

  it('says nothing exists when nothing narrows the list', async () => {
    render(grid(async () => page([])));

    expect(await screen.findByTestId('v2-grid-empty')).toBeTruthy();
  });

  it('says nothing matches when a filter narrows the list', async () => {
    render(grid(async () => page([]), { isFiltered: true }));

    expect(await screen.findByTestId('v2-grid-empty-filtered')).toBeTruthy();
  });

  it('opens a row from the keyboard', async () => {
    const onRowOpen = vi.fn();
    render(grid(async () => page([{ id: '1', name: 'Ali' }]), { onRowOpen }));
    const row = await screen.findByRole('row', { name: 'Open Ali' });

    row.focus();
    await userEvent.keyboard('{Enter}');

    expect(onRowOpen).toHaveBeenCalledWith({ id: '1', name: 'Ali' });
  });

  it('never lets a slow answer to an old query replace the current one', async () => {
    let releaseOld: (value: Page<Row>) => void = () => {};
    const fetchPage = vi.fn((request: { q: string }) => (request.q === 'old'
      ? new Promise<Page<Row>>(resolve => { releaseOld = resolve; })
      : Promise.resolve(page([{ id: 'n', name: 'New result' }]))));
    const { rerender } = render(grid(fetchPage, { q: 'old' }));

    rerender(grid(fetchPage, { q: 'new' }));
    await screen.findByText('New result');
    await act(async () => { releaseOld(page([{ id: 'o', name: 'Old result' }])); });

    await waitFor(() => expect(screen.queryByText('Old result')).toBeNull());
    expect(screen.getByText('New result')).toBeTruthy();
  });
});
