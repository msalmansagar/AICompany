import { describe, expect, it } from 'vitest';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import { loadLitigation, toLitigationSummary } from '../data/legalQueries.js';
import { loadCaseLegalTraces } from '../data/caseLegalTraces.js';
import { isLegalRecommendationCode } from '../data/legalTraceRows.js';

/**
 * Reading Legal through the lookup, and only through the lookup.
 *
 * The assertions that matter are about what is *not* asked: no search of the Legal entity by
 * customer, name or date, and no collapsing of a refused read into an absent record.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const CASE = 'case-1';
const LEGAL_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const LEGAL_TYPE = 'type-legal';
const OTHER_TYPE = 'type-call';

/**
 * Records every request, and answers a single-record read with a scripted status.
 *
 * `retrieveRecord` rejects with a `status`, exactly as `Xrm.WebApi` does, so the 403/404
 * distinction is exercised rather than assumed.
 */
function adapterReturning(options: {
  rows?: Record<string, Record<string, unknown>[]>;
  legalRead?: { status: number; record?: Record<string, unknown> };
}) {
  const requested: string[] = [];
  const xrm = {
    WebApi: {
      retrieveMultipleRecords: async (logicalName: string, query: string) => {
        requested.push(`${logicalName}${query}`);
        return { entities: options.rows?.[logicalName] ?? [] };
      },
      retrieveRecord: async (logicalName: string, id: string, query: string) => {
        requested.push(`GET ${logicalName}(${id})${query}`);
        const answer = options.legalRead ?? { status: 404 };
        if (answer.status >= 400) throw Object.assign(new Error('refused'), { status: answer.status });
        return answer.record ?? {};
      },
    },
  } as unknown as XrmLike;
  return { adapter: new XrmCrmAdapter(xrm), requested };
}

const activityType = (id: string, code: string) => ({
  qdb_collectionactivitytypeid: id, qdb_name: `${code} type`, qdb_code: code, qdb_isactive: true,
});

const recommendation = (overrides: Record<string, unknown> = {}) => ({
  activityid: 'act-1',
  subject: 'Legal recommendation',
  createdon: '2026-09-01T00:00:00Z',
  '_qdb_activitytypeid_value': LEGAL_TYPE,
  ...overrides,
});

// ── The type is identified by code, not by name ──────────────────────────────

describe('a Legal Recommendation type is recognised by its code', () => {
  it('accepts the configured code suffix whatever the prefix', () => {
    expect(isLegalRecommendationCode('P6-LEGALREC')).toBe(true);
    expect(isLegalRecommendationCode('DEMO-LEGALREC')).toBe(true);
    expect(isLegalRecommendationCode('legalrec')).toBe(true);
  });

  it('refuses a type whose code is something else', () => {
    expect(isLegalRecommendationCode('P6-PTP')).toBe(false);
    expect(isLegalRecommendationCode('P6-RESTRUCTREC')).toBe(false);
    expect(isLegalRecommendationCode(undefined)).toBe(false);
  });
});

// ── A refused read is not an absent record ───────────────────────────────────

describe('the Litigation Request read reports why it failed', () => {
  it('returns the record when it can be read', async () => {
    const { adapter } = adapterReturning({
      legalRead: { status: 200, record: { qdb_name: 'LEG-1', [`statuscode${FORMATTED}`]: 'Closed' } },
    });

    const fetch = await loadLitigation(adapter, LEGAL_ID);

    expect(fetch.kind).toBe('found');
    expect(fetch.kind === 'found' && fetch.record.reference).toBe('LEG-1');
  });

  it('reports a refusal as forbidden, never as not found', async () => {
    // On this organisation no DCP role can read the Legal entity, so this is the ordinary case.
    const { adapter } = adapterReturning({ legalRead: { status: 403 } });

    expect((await loadLitigation(adapter, LEGAL_ID)).kind).toBe('forbidden');
  });

  it('reports a genuinely missing record as not found', async () => {
    const { adapter } = adapterReturning({ legalRead: { status: 404 } });

    expect((await loadLitigation(adapter, LEGAL_ID)).kind).toBe('notFound');
  });

  it('reports a server failure as unavailable rather than as either of those', async () => {
    const { adapter } = adapterReturning({ legalRead: { status: 503 } });

    expect((await loadLitigation(adapter, LEGAL_ID)).kind).toBe('unavailable');
  });

  it('reads the record by id, and issues no query against the Legal entity', async () => {
    const { adapter, requested } = adapterReturning({
      legalRead: { status: 200, record: { qdb_name: 'LEG-1' } },
    });
    await loadLitigation(adapter, LEGAL_ID);

    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain(`GET qdb_qdblegal(${LEGAL_ID})`);
    expect(requested[0], 'no filter means no search').not.toContain('$filter');
  });
});

describe('the Legal status is the platform’s own label', () => {
  it('takes the formatted value and maps nothing', () => {
    const summary = toLitigationSummary({
      qdb_name: 'LEG-1',
      statuscode: 751090003,
      [`statuscode${FORMATTED}`]: 'Pending with Legal (First Instance Court)',
    });

    expect(summary.status).toBe('Pending with Legal (First Instance Court)');
  });

  it('leaves the status absent rather than showing a raw code', () => {
    const summary = toLitigationSummary({ qdb_name: 'LEG-1', statuscode: 751090003 });

    expect(summary.status).toBeUndefined();
  });
});

// ── The case read ────────────────────────────────────────────────────────────

describe('a case’s Legal picture is narrowed by the platform', () => {
  const rows = {
    qdb_collectionactivitytype: [activityType(LEGAL_TYPE, 'P6-LEGALREC'), activityType(OTHER_TYPE, 'P6-CALL')],
    qdb_collectionactivity: [recommendation()],
  };

  it('asks the source for linked OR Legal-typed activities, not for the whole case', async () => {
    const { adapter, requested } = adapterReturning({ rows });
    await loadCaseLegalTraces(adapter, CASE);

    const activityRead = requested.find(r => r.startsWith('qdb_collectionactivity?'));
    expect(activityRead).toContain('_qdb_collectioncaseid_value eq case-1');
    expect(activityRead).toContain('_qdb_legalrequestid_value ne null');
    expect(activityRead).toContain(`_qdb_activitytypeid_value eq ${LEGAL_TYPE}`);
    expect(activityRead, 'the non-Legal type is not asked for').not.toContain(OTHER_TYPE);
  });

  it('reads no Legal record at all when nothing is linked', async () => {
    const { adapter, requested } = adapterReturning({ rows });
    const traces = await loadCaseLegalTraces(adapter, CASE);

    expect(traces[0]!.trace.state).toBe('RecommendationOnly');
    expect(requested.filter(r => r.includes('qdb_qdblegal')), 'no link, no lookup').toHaveLength(0);
  });

  it('reads the linked Litigation Request and shows it', async () => {
    const { adapter } = adapterReturning({
      rows: {
        ...rows,
        qdb_collectionactivity: [recommendation({ '_qdb_legalrequestid_value': LEGAL_ID })],
      },
      legalRead: { status: 200, record: { qdb_name: 'LEG-9', [`statuscode${FORMATTED}`]: 'Closed' } },
    });

    const traces = await loadCaseLegalTraces(adapter, CASE);

    expect(traces[0]!.trace.state).toBe('LitigationVisible');
    expect(traces[0]!.trace.litigation?.reference).toBe('LEG-9');
    expect(traces[0]!.trace.litigation?.status).toBe('Closed');
  });

  it('says the request exists when the officer may not read it', async () => {
    const { adapter } = adapterReturning({
      rows: {
        ...rows,
        qdb_collectionactivity: [recommendation({ '_qdb_legalrequestid_value': LEGAL_ID })],
      },
      legalRead: { status: 403 },
    });

    const traces = await loadCaseLegalTraces(adapter, CASE);

    expect(traces[0]!.trace.state).toBe('LitigationNotVisible');
    expect(traces[0]!.trace.label).toMatch(/raised/i);
    expect(traces[0]!.trace.label).not.toMatch(/no legal/i);
  });

  it('includes a linked activity even when its type is not a Legal type', async () => {
    // Traceability follows the link. A type that was later changed must not hide the litigation.
    const { adapter } = adapterReturning({
      rows: {
        ...rows,
        qdb_collectionactivity: [recommendation({
          '_qdb_activitytypeid_value': OTHER_TYPE, '_qdb_legalrequestid_value': LEGAL_ID,
        })],
      },
      legalRead: { status: 200, record: { qdb_name: 'LEG-9' } },
    });

    expect((await loadCaseLegalTraces(adapter, CASE))[0]!.trace.state).toBe('LitigationVisible');
  });

  it('falls back to the link clause alone when no Legal type is configured', async () => {
    const { adapter, requested } = adapterReturning({
      rows: { ...rows, qdb_collectionactivitytype: [activityType(OTHER_TYPE, 'P6-CALL')] },
    });
    await loadCaseLegalTraces(adapter, CASE);

    const activityRead = requested.find(r => r.startsWith('qdb_collectionactivity?'));
    expect(activityRead).toContain('_qdb_legalrequestid_value ne null');
    expect(activityRead, 'nothing is guessed about which type is Legal').not.toContain('LEGALREC');
  });
});
