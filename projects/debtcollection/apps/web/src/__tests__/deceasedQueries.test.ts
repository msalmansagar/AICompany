import { describe, expect, it } from 'vitest';
import { deceasedReviewId } from '@dcp/domain';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import {
  DECEASED_INDICATION_FILTER, isDeceasedTypeCode, loadDeceasedIndication, loadDeceasedReviewRow,
} from '../data/deceasedQueries.js';

/**
 * Reading the deceased indication.
 *
 * The two properties that matter: the 724 indications are filtered **by the platform** and never
 * in the browser, and the review is found by its derived id rather than by searching for one.
 */

const CASE = 'case-1';
const FACILITY = 'ARR-HL-00012';

function adapterReturning(options: {
  snapshots?: Record<string, unknown>[];
  review?: Record<string, unknown> | { status: number };
}) {
  const requested: string[] = [];
  const xrm = {
    WebApi: {
      retrieveMultipleRecords: async (logicalName: string, query: string, maxPageSize?: number) => {
        requested.push(`${logicalName}${query}|maxPageSize=${maxPageSize}`);
        return { entities: options.snapshots ?? [] };
      },
      retrieveRecord: async (logicalName: string, id: string, query: string) => {
        requested.push(`GET ${logicalName}(${id})${query}`);
        const answer = options.review;
        if (!answer) throw Object.assign(new Error('not found'), { status: 404 });
        if ('status' in answer && typeof answer.status === 'number') {
          throw Object.assign(new Error('refused'), { status: answer.status });
        }
        return answer;
      },
    },
  } as unknown as XrmLike;
  return { adapter: new XrmCrmAdapter(xrm), requested };
}

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  qdb_delinquencysnapshotid: 'snap-1',
  qdb_facilitynumber: FACILITY,
  qdb_snapshotdate: '2026-06-30T00:00:00Z',
  qdb_isdeceasedperqcb: true,
  ...overrides,
});

// ── The filter goes to the platform ──────────────────────────────────────────

describe('the 724 indications are never loaded into the browser', () => {
  it('expresses the indication as an OData clause', () => {
    expect(DECEASED_INDICATION_FILTER).toBe('qdb_isdeceasedperqcb eq true');
  });

  it('narrows the case read by the platform and takes one row', async () => {
    const { adapter, requested } = adapterReturning({ snapshots: [snapshot()] });
    await loadDeceasedIndication(adapter, CASE);

    const read = requested.find(r => r.startsWith('qdb_delinquencysnapshot'));
    expect(read).toContain('_qdb_collectioncaseid_value eq case-1');
    expect(read, 'newest first').toContain('$orderby=qdb_snapshotdate desc');
    // The adapter bounds a read with maxPageSize, which Dataverse takes as a Prefer header —
    // not with $top in the query string. The bound is real; the mechanism is just not $top.
    expect(read, 'one row, not the history').toContain('maxPageSize=1');
  });

  it('selects the indication column, so it is read rather than inferred', async () => {
    const { adapter, requested } = adapterReturning({ snapshots: [snapshot()] });
    await loadDeceasedIndication(adapter, CASE);

    expect(requested.find(r => r.startsWith('qdb_delinquencysnapshot')))
      .toContain('qdb_isdeceasedperqcb');
  });
});

// ── The indication is read, never assumed ────────────────────────────────────

describe('the indication reflects exactly what the snapshot says', () => {
  it('reports an indication with its source and as-of date', async () => {
    const { adapter } = adapterReturning({ snapshots: [snapshot()] });

    const indication = await loadDeceasedIndication(adapter, CASE);

    expect(indication.present).toBe(true);
    expect(indication.source).toBe('QcbViaMis');
    expect(indication.asOf).toBe('2026-06-30T00:00:00Z');
    expect(indication.facilityNumber).toBe(FACILITY);
  });

  it('reports no indication when the flag is false', async () => {
    const { adapter } = adapterReturning({
      snapshots: [snapshot({ qdb_isdeceasedperqcb: false })] });

    const indication = await loadDeceasedIndication(adapter, CASE);

    expect(indication.present).toBe(false);
    // Claiming a source for an absent indication would assert QCB said someone was alive.
    expect(indication.source).toBeUndefined();
  });

  it('treats a missing flag as no indication, never as unknown-so-probably-yes', async () => {
    const { adapter } = adapterReturning({
      snapshots: [snapshot({ qdb_isdeceasedperqcb: undefined })] });

    expect((await loadDeceasedIndication(adapter, CASE)).present).toBe(false);
  });

  it('reports no indication when the case has no snapshot at all', async () => {
    const { adapter } = adapterReturning({ snapshots: [] });

    expect((await loadDeceasedIndication(adapter, CASE)).present).toBe(false);
  });
});

// ── The review is found by identity ──────────────────────────────────────────

describe('the review is found by its derived id, not by searching', () => {
  it('reads the activity at the derived id', async () => {
    const { adapter, requested } = adapterReturning({ snapshots: [snapshot()] });
    await loadDeceasedReviewRow(adapter, CASE);

    const read = requested.find(r => r.startsWith('GET qdb_collectionactivity'));
    expect(read).toContain(deceasedReviewId(CASE, FACILITY));
    expect(read, 'no filter means no search').not.toContain('$filter');
  });

  it('looks for no review at all when there is no indication', async () => {
    const { adapter, requested } = adapterReturning({
      snapshots: [snapshot({ qdb_isdeceasedperqcb: false })] });

    const row = await loadDeceasedReviewRow(adapter, CASE);

    expect(row.state).toBe('NoIndication');
    expect(requested.filter(r => r.startsWith('GET qdb_collectionactivity'))).toHaveLength(0);
  });

  it('reports an indication with no review as awaiting review', async () => {
    const { adapter } = adapterReturning({ snapshots: [snapshot()] });

    const row = await loadDeceasedReviewRow(adapter, CASE);

    expect(row.state).toBe('AwaitingReview');
    expect(row.canStartReview).toBe(true);
    expect(row.indication).toMatch(/verification required/i);
  });

  it('reports an existing review as under review, and offers no second one', async () => {
    const { adapter } = adapterReturning({
      snapshots: [snapshot()],
      review: { activityid: 'act-1', subject: 'Checking with the branch', statuscode: 1 },
    });

    const row = await loadDeceasedReviewRow(adapter, CASE);

    expect(row.state).toBe('UnderReview');
    expect(row.canStartReview).toBe(false);
  });
});

// ── The activity type is matched by code ─────────────────────────────────────

describe('the review type is recognised by code, and the label is ignored', () => {
  it('accepts the configured code suffix', () => {
    expect(isDeceasedTypeCode('P6-DECEASED')).toBe(true);
    expect(isDeceasedTypeCode('DEMO-DECEASED')).toBe(true);
  });

  it('refuses another code, and never parses the display name', () => {
    expect(isDeceasedTypeCode('P6-LEGALREC')).toBe(false);
    // The configured label says "Deceased / Insurance". It is not the handle, and the word
    // "Insurance" in it is not evidence that an insurance process exists (KI-125).
    expect(isDeceasedTypeCode('Deceased / Insurance')).toBe(false);
    expect(isDeceasedTypeCode(undefined)).toBe(false);
  });
});

// ── No insurance leaks into the composed row ─────────────────────────────────

describe('nothing insurance-shaped reaches the screen', () => {
  it('renders no insurance or exemption vocabulary', async () => {
    const { adapter } = adapterReturning({
      snapshots: [snapshot()],
      review: { activityid: 'act-1', subject: 'Checking', statuscode: 1 },
    });

    const row = await loadDeceasedReviewRow(adapter, CASE);
    const rendered = [row.label, row.indication, row.source, row.reviewOutcome].join(' ');

    expect(rendered).not.toMatch(/insur|claim|policy|takaful|beneficiar|exempt|relief/i);
  });
});
