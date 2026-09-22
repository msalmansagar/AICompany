import { describe, expect, it } from 'vitest';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import { isConcernTypeCode, loadCaseConcerns } from '../data/caseConcerns.js';
import { loadComplaintCase, toComplaintCaseSummary } from '../data/complaintQueries.js';

/**
 * Disputes and Complaints as the workspace reads them.
 *
 * The assertions that matter are about separation and about routes not taken: a dispute never
 * becomes a complaint, a complaint is never rediscovered by customer, and a refused read never
 * reports absence.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const CASE = 'case-1';
const COMPLAINT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CONCERN_TYPE = 'type-dispute';
const OTHER_TYPE = 'type-call';

function adapterReturning(options: {
  rows?: Record<string, Record<string, unknown>[]>;
  caseRead?: { status: number; record?: Record<string, unknown> };
  caseTypeOptions?: { Value: number; Label: { UserLocalizedLabel: { Label: string } } }[] | null;
}) {
  const requested: string[] = [];
  const optionSet = options.caseTypeOptions === undefined
    ? [
      { Value: 1, Label: { UserLocalizedLabel: { Label: 'Inquiry' } } },
      { Value: 2, Label: { UserLocalizedLabel: { Label: 'Complaint' } } },
      { Value: 3, Label: { UserLocalizedLabel: { Label: 'Suggestion' } } },
    ]
    : options.caseTypeOptions;

  const transport = {
    get: async (path: string) => {
      requested.push(`TRANSPORT ${path}`);
      if (path.includes('casetypecode')) {
        return optionSet === null
          ? { status: 403, body: undefined }
          : { status: 200, body: { OptionSet: { Options: optionSet } } };
      }
      return { status: 404, body: undefined };
    },
  };

  const xrm = {
    WebApi: {
      retrieveMultipleRecords: async (logicalName: string, query: string) => {
        requested.push(decodeURIComponent(`${logicalName}${query}`));
        return { entities: options.rows?.[logicalName] ?? [] };
      },
      retrieveRecord: async (logicalName: string, id: string, query: string) => {
        requested.push(decodeURIComponent(`GET ${logicalName}(${id})${query}`));
        const answer = options.caseRead ?? { status: 404 };
        if (answer.status >= 400) throw Object.assign(new Error('refused'), { status: answer.status });
        return answer.record ?? {};
      },
    },
  } as unknown as XrmLike;

  return {
    adapter: new XrmCrmAdapter(xrm, undefined, transport as never),
    requested,
  };
}

const activityType = (id: string, code: string) => ({
  qdb_collectionactivitytypeid: id, qdb_name: `${code} type`, qdb_code: code, qdb_isactive: true,
});

const activity = (overrides: Record<string, unknown> = {}) => ({
  activityid: 'act-1',
  subject: 'Customer says the March payment was made',
  createdon: '2026-09-21T00:00:00Z',
  '_qdb_activitytypeid_value': CONCERN_TYPE,
  ...overrides,
});

const baseRows = {
  qdb_collectionactivitytype: [
    activityType(CONCERN_TYPE, 'P6-DISPUTE'), activityType(OTHER_TYPE, 'P6-CALL'),
  ],
  qdb_collectionactivity: [activity()],
};

// ── The concern type is recognised by code ───────────────────────────────────

describe('the combined dispute/complaint type is recognised by its code', () => {
  it('accepts the configured code suffix whatever the prefix', () => {
    expect(isConcernTypeCode('P6-DISPUTE')).toBe(true);
    expect(isConcernTypeCode('DEMO-DISPUTE')).toBe(true);
  });

  it('refuses another type, and never parses a display name', () => {
    expect(isConcernTypeCode('P6-CALL')).toBe(false);
    expect(isConcernTypeCode('Complaint / Dispute')).toBe(false);
    expect(isConcernTypeCode(undefined)).toBe(false);
  });
});

// ── A dispute is not a complaint ─────────────────────────────────────────────

describe('a dispute and a complaint never land in the same list', () => {
  it('reads an unlinked concern activity as a Collection Dispute', async () => {
    const { adapter } = adapterReturning({ rows: baseRows });

    const concerns = await loadCaseConcerns(adapter, CASE);

    expect(concerns.disputes).toHaveLength(1);
    expect(concerns.complaints).toHaveLength(0);
    expect(concerns.disputes[0]!.concern).toBe('CollectionDispute');
  });

  it('reads a linked activity as a formal Complaint, and not as a dispute', async () => {
    const { adapter } = adapterReturning({
      rows: {
        ...baseRows,
        qdb_collectionactivity: [activity({ '_qdb_complaintcaseid_value': COMPLAINT_ID })],
      },
      caseRead: {
        status: 200,
        record: {
          ticketnumber: 'CAS-01007-K5L2N3',
          [`statuscode${FORMATTED}`]: 'Pending for Quality Review',
          [`casetypecode${FORMATTED}`]: 'Complaint',
        },
      },
    });

    const concerns = await loadCaseConcerns(adapter, CASE);

    expect(concerns.disputes).toHaveLength(0);
    expect(concerns.complaints).toHaveLength(1);
    expect(concerns.complaints[0]!.heading).toContain('CAS-01007-K5L2N3');
    expect(concerns.complaints[0]!.status).toBe('Pending for Quality Review');
  });

  it('recording a dispute reads no Case at all — nothing is created or fetched', async () => {
    const { adapter, requested } = adapterReturning({ rows: baseRows });
    await loadCaseConcerns(adapter, CASE);

    expect(requested.filter(r => r.startsWith('GET incident'))).toHaveLength(0);
  });
});

// ── A Complaint is never rediscovered ────────────────────────────────────────

describe('a Complaint is found only through its link', () => {
  it('reads it by id, with no filter and no customer search', async () => {
    const { adapter, requested } = adapterReturning({
      caseRead: { status: 200, record: { ticketnumber: 'CAS-1' } },
    });
    await loadComplaintCase(adapter, COMPLAINT_ID);

    const read = requested.find(r => r.startsWith('GET incident'));
    expect(read).toContain(COMPLAINT_ID);
    // A `$select` naming title and the customer is fine — those are columns being read back.
    // What must never appear is a query: a filter would mean searching for the Complaint.
    expect(read, 'no filter means no search').not.toContain('$filter');
    expect(requested.filter(r => r.startsWith('incident?')), 'no Case list is ever requested')
      .toHaveLength(0);
  });

  it('says the Complaint exists when the officer may not read it', async () => {
    // No DCP role holds prvReadIncident (KI-120), so this is the ordinary officer answer.
    const { adapter } = adapterReturning({
      rows: {
        ...baseRows,
        qdb_collectionactivity: [activity({ '_qdb_complaintcaseid_value': COMPLAINT_ID })],
      },
      caseRead: { status: 403 },
    });

    const concerns = await loadCaseConcerns(adapter, CASE);

    expect(concerns.complaints).toHaveLength(1);
    expect(concerns.complaints[0]!.heading).toBe('Complaint raised');
    expect(concerns.complaints[0]!.detail).toMatch(/do not have access/i);
    expect(concerns.disputes, 'and it does not fall back to being a dispute').toHaveLength(0);
  });

  it('keeps a withheld Complaint distinct from one that is missing', async () => {
    const withheld = adapterReturning({
      rows: { ...baseRows, qdb_collectionactivity: [activity({ '_qdb_complaintcaseid_value': COMPLAINT_ID })] },
      caseRead: { status: 403 },
    });
    const missing = adapterReturning({
      rows: { ...baseRows, qdb_collectionactivity: [activity({ '_qdb_complaintcaseid_value': COMPLAINT_ID })] },
      caseRead: { status: 404 },
    });

    const a = (await loadCaseConcerns(withheld.adapter, CASE)).complaints[0]!;
    const b = (await loadCaseConcerns(missing.adapter, CASE)).complaints[0]!;

    expect(a.detail).not.toBe(b.detail);
  });
});

// ── The case type comes from metadata ────────────────────────────────────────

describe('the Complaint case type is resolved from live metadata', () => {
  it('resolves the configured value', async () => {
    const { adapter } = adapterReturning({ rows: baseRows });

    expect((await loadCaseConcerns(adapter, CASE)).caseType).toEqual({ resolved: true, value: 2 });
  });

  it('refuses when metadata cannot be read, rather than assuming a value', async () => {
    const { adapter } = adapterReturning({ rows: baseRows, caseTypeOptions: null });

    const { caseType } = await loadCaseConcerns(adapter, CASE);

    expect(caseType.resolved).toBe(false);
  });

  it('refuses under the OLD option semantics, where 2 meant Problem', async () => {
    // KI-123: the set was redefined in place. A literal 2 would still "work" here and be wrong.
    const { adapter } = adapterReturning({
      rows: baseRows,
      caseTypeOptions: [
        { Value: 1, Label: { UserLocalizedLabel: { Label: 'Question' } } },
        { Value: 2, Label: { UserLocalizedLabel: { Label: 'Problem' } } },
      ],
    });

    expect((await loadCaseConcerns(adapter, CASE)).caseType.resolved).toBe(false);
  });

  it('takes the Case status and kind from the platform’s formatted values', () => {
    const summary = toComplaintCaseSummary({
      ticketnumber: 'CAS-1',
      statuscode: 751090002,
      [`statuscode${FORMATTED}`]: 'Pending for Quality Review',
      casetypecode: 2,
      [`casetypecode${FORMATTED}`]: 'Complaint',
    });

    expect(summary.status).toBe('Pending for Quality Review');
    expect(summary.category).toBe('Complaint');
  });

  it('leaves the status absent rather than showing a raw code', () => {
    expect(toComplaintCaseSummary({ ticketnumber: 'CAS-1', statuscode: 5 }).status)
      .toBeUndefined();
  });
});

// ── The read stays narrow ────────────────────────────────────────────────────

describe('the case read is narrowed by the platform', () => {
  it('asks for linked OR concern-typed activities, not the whole case', async () => {
    const { adapter, requested } = adapterReturning({ rows: baseRows });
    await loadCaseConcerns(adapter, CASE);

    const read = requested.find(r => r.startsWith('qdb_collectionactivity?'));
    expect(read).toContain('_qdb_collectioncaseid_value eq case-1');
    expect(read).toContain('_qdb_complaintcaseid_value ne null');
    expect(read).toContain(`_qdb_activitytypeid_value eq ${CONCERN_TYPE}`);
    expect(read, 'the unrelated type is not asked for').not.toContain(OTHER_TYPE);
  });

  it('includes a linked activity whose type is not the concern type', async () => {
    const { adapter } = adapterReturning({
      rows: {
        ...baseRows,
        qdb_collectionactivity: [activity({
          '_qdb_activitytypeid_value': OTHER_TYPE,
          '_qdb_complaintcaseid_value': COMPLAINT_ID,
        })],
      },
      caseRead: { status: 200, record: { ticketnumber: 'CAS-9' } },
    });

    expect((await loadCaseConcerns(adapter, CASE)).complaints).toHaveLength(1);
  });
});
