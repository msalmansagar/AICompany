import { describe, expect, it } from 'vitest';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import {
  bucketFilter, bucketIsAvailable, countBucket, createWorkQueue, isRestructuringTypeCode,
  toWorkItem, type TypeIds,
} from '../data/operationalQueue.js';

/**
 * The operational queue.
 *
 * What is asserted is mostly the **request**, not the response: a queue is only trustworthy if the
 * narrowing happens on the platform, and the only way to prove that is to read the filter it sent.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const ME = 'user-me';
const LEGAL_TYPE = 'type-legal';
const CONCERN_TYPE = 'type-dispute';
const DECEASED_TYPE = 'type-deceased';
const RESTRUCT_TYPE = 'type-restruct';

const typeIds: TypeIds = {
  legal: [LEGAL_TYPE], concern: [CONCERN_TYPE],
  deceased: [DECEASED_TYPE], restructuring: [RESTRUCT_TYPE],
};

function adapterReturning(rows: Record<string, unknown>[], count?: number) {
  const requested: string[] = [];
  const transport = {
    get: async (path: string) => {
      requested.push(`TRANSPORT ${path}`);
      return { status: 200, body: count === undefined ? {} : { '@odata.count': count } };
    },
  };
  const xrm = {
    WebApi: {
      retrieveMultipleRecords: async (logicalName: string, query: string, maxPageSize?: number) => {
        requested.push(`${logicalName}${query}|maxPageSize=${maxPageSize}`);
        return { entities: rows };
      },
    },
  } as unknown as XrmLike;
  return {
    adapter: new XrmCrmAdapter(xrm, undefined, transport as never),
    requested,
  };
}

const activity = (overrides: Record<string, unknown> = {}) => ({
  activityid: 'act-1',
  subject: 'Follow-up call',
  statecode: 0,
  '_qdb_collectioncaseid_value': 'case-1',
  '_qdb_activitytypeid_value': LEGAL_TYPE,
  ...overrides,
});

// ── Every bucket is a filter sent to the platform ────────────────────────────

describe('a bucket is an OData clause, never a browser-side classification', () => {
  it('narrows my work to the signed-in user', () => {
    expect(bucketFilter('MyAssigned', { currentUserId: ME, typeIds }))
      .toContain(`_ownerid_value eq ${ME}`);
  });

  it('narrows unassigned work by a null owner', () => {
    expect(bucketFilter('AwaitingAssignment', { typeIds })).toContain('_ownerid_value eq null');
  });

  it('narrows escalated work by the platform’s own flag', () => {
    expect(bucketFilter('Escalated', { typeIds })).toContain('qdb_supervisorescalated eq true');
  });

  it('narrows complaints by the authoritative link, not a label', () => {
    const filter = bucketFilter('Complaints', { typeIds });

    expect(filter).toContain('_qdb_complaintcaseid_value ne null');
    expect(filter).not.toMatch(/subject|contains\(.*complaint/i);
  });

  it('narrows disputes to concern work with NO complaint behind it', () => {
    const filter = bucketFilter('Disputes', { typeIds });

    expect(filter).toContain('_qdb_complaintcaseid_value eq null');
    expect(filter).toContain(CONCERN_TYPE);
  });

  it('every available bucket restricts to open work', () => {
    const buckets = ['MyAssigned', 'AwaitingAssignment', 'Escalated', 'Legal', 'Disputes',
      'Complaints', 'DeceasedReview', 'RestructuringRecommendations'] as const;

    for (const bucket of buckets) {
      expect(bucketFilter(bucket, { currentUserId: ME, typeIds }), bucket)
        .toContain('statecode eq 0');
    }
  });
});

// ── Deadlines are not invented to fill a bucket ──────────────────────────────

describe('buckets that cannot be served honestly are not served', () => {
  it('offers no Overdue or Due Soon filter, because no deadline is stored', () => {
    // The TAT start policy is unconfigured (KI-101), so every deadline is undetermined. A filter
    // here would have to invent one.
    expect(bucketFilter('Overdue', { typeIds })).toBeNull();
    expect(bucketFilter('DueSoon', { typeIds })).toBeNull();
    expect(bucketIsAvailable('Overdue', { typeIds })).toBe(false);
  });

  it('offers no assignment-attention filter, because nothing on the record says so', () => {
    expect(bucketFilter('AssignmentRequiresAttention', { typeIds })).toBeNull();
  });

  it('cannot serve my work with no signed-in user rather than showing everyone’s', () => {
    expect(bucketFilter('MyAssigned', { typeIds })).toBeNull();
  });

  it('returns an empty page for a bucket it cannot serve, and asks the source nothing', async () => {
    const { adapter, requested } = adapterReturning([activity()]);

    const page = await createWorkQueue(adapter, typeIds)({ bucket: 'Overdue', pageSize: 50 });

    expect(page.items).toEqual([]);
    expect(requested, 'no request is issued at all').toHaveLength(0);
  });
});

// ── Downstream state costs one request, not fifty ────────────────────────────

describe('downstream state arrives in the same request', () => {
  it('expands the Legal and Complaint navigation properties', async () => {
    const { adapter, requested } = adapterReturning([activity()]);
    await createWorkQueue(adapter, typeIds)({ bucket: 'Legal', pageSize: 50 });

    const read = requested.find(r => r.startsWith('qdb_collectionactivity'));
    expect(read).toContain('$expand=');
    expect(read).toContain('qdb_legalrequestid_qdb_collectionactivity');
    expect(read).toContain('qdb_complaintcaseid_qdb_collectionactivity');
  });

  it('issues exactly one request for a whole page of rows', async () => {
    // Fifty rows that each carry a Litigation Request must not become fifty-one requests.
    const rows = Array.from({ length: 50 }, (_, index) => activity({
      activityid: `act-${index}`,
      qdb_legalrequestid_qdb_collectionactivity: { qdb_name: 'LEG-1', statuscode: 1 },
    }));
    const { adapter, requested } = adapterReturning(rows);

    const page = await createWorkQueue(adapter, typeIds)({ bucket: 'Legal', pageSize: 50 });

    expect(page.items).toHaveLength(50);
    expect(requested.filter(r => r.startsWith('qdb_'))).toHaveLength(1);
  });

  it('passes the downstream status through untouched', () => {
    const item = toWorkItem(activity({
      qdb_complaintcaseid_qdb_collectionactivity: {
        ticketnumber: 'CAS-1', [`statuscode${FORMATTED}`]: 'Pending for Quality Review',
      },
    }), typeIds);

    expect(item.domainState).toBe('Pending for Quality Review');
    expect(item.type, 'the link is authoritative for the work type').toBe('CustomerComplaint');
  });
});

// ── One record is one work item ──────────────────────────────────────────────

describe('a page never contains the same record twice', () => {
  it('collapses duplicates arriving in one page', async () => {
    const { adapter } = adapterReturning([
      activity({ activityid: 'act-1' }),
      activity({ activityid: 'act-1' }),
      activity({ activityid: 'act-2' }),
    ]);

    const page = await createWorkQueue(adapter, typeIds)({ bucket: 'Legal', pageSize: 50 });

    expect(page.items.map(item => item.id)).toEqual(['act-1', 'act-2']);
  });
});

// ── Search goes to the source ────────────────────────────────────────────────

describe('search is executed by the platform', () => {
  it('sends the search term as a filter clause', async () => {
    const { adapter, requested } = adapterReturning([activity()]);
    await createWorkQueue(adapter, typeIds)({ bucket: 'Legal', pageSize: 50, search: 'Ahmed' });

    expect(requested.find(r => r.startsWith('qdb_collectionactivity')))
      .toContain("contains(subject,'Ahmed')");
  });

  it('bounds the page, so a search can never return the book', async () => {
    const { adapter, requested } = adapterReturning([activity()]);
    await createWorkQueue(adapter, typeIds)({ bucket: 'Legal', pageSize: 25 });

    expect(requested.find(r => r.startsWith('qdb_collectionactivity')))
      .toContain('maxPageSize=25');
  });
});

// ── Counts ───────────────────────────────────────────────────────────────────

describe('a bucket count is asked for as a count', () => {
  it('returns a known count when the platform answers', async () => {
    const { adapter } = adapterReturning([], 17);

    expect(await countBucket(adapter, 'Complaints', { typeIds })).toEqual({ known: true, value: 17 });
  });

  it('returns unknown — never zero — when the platform does not answer', async () => {
    const { adapter } = adapterReturning([]);

    const count = await countBucket(adapter, 'Complaints', { typeIds });

    expect(count.known).toBe(false);
    expect(count).not.toEqual({ known: true, value: 0 });
  });

  it('reports a bucket it cannot serve as not requested', async () => {
    const { adapter } = adapterReturning([], 5);

    expect(await countBucket(adapter, 'Overdue', { typeIds }))
      .toEqual({ known: false, reason: 'NotRequested' });
  });

  it('never fetches rows to arrive at a count', async () => {
    const { adapter, requested } = adapterReturning([activity(), activity()], 2);
    await countBucket(adapter, 'Complaints', { typeIds });

    expect(requested.every(r => r.startsWith('TRANSPORT')), 'a count, not a read').toBe(true);
    expect(requested.find(r => r.startsWith('TRANSPORT'))).toContain('$count=true');
  });
});

// ── Restructuring stays Collection-side ──────────────────────────────────────

describe('restructuring is recognised by code and stays a recommendation', () => {
  it('accepts the configured code suffix', () => {
    expect(isRestructuringTypeCode('P6-RESTRUCTREC')).toBe(true);
    expect(isRestructuringTypeCode('DEMO-RESTRUCTREC')).toBe(true);
  });

  it('refuses another code and never parses a display name', () => {
    expect(isRestructuringTypeCode('P6-LEGALREC')).toBe(false);
    expect(isRestructuringTypeCode('Restructuring Recommendation')).toBe(false);
  });

  it('classifies a restructuring activity as a recommendation, not an amendment', () => {
    const item = toWorkItem(activity({ '_qdb_activitytypeid_value': RESTRUCT_TYPE }), typeIds);

    expect(item.type).toBe('RestructuringRecommendation');
  });

  it('never asks the source for a Facility Amendment', async () => {
    const { adapter, requested } = adapterReturning([activity()]);
    await createWorkQueue(adapter, typeIds)({
      bucket: 'RestructuringRecommendations', pageSize: 50 });

    expect(requested.join(' ')).not.toMatch(/qdb_loan_amendment|facility.?amendment/i);
  });
});
