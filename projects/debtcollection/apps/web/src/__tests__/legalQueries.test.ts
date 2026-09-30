import { describe, expect, it } from 'vitest';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import { loadCaseLegalTraces } from '../data/caseLegalTraces.js';
import { isLegalRecommendationCode } from '../data/legalTraceRows.js';
import type { ExternalRecordSummary, ReferenceSummariser } from '../data/externalReferenceService.js';

/**
 * Reading Legal through the external process reference, and only through it.
 *
 * Legal lives in BFD CRM for HL and BFD customers alike, so a Collection Activity refers to a
 * Litigation Request by organisation, type, id and number, and its current state is the Legal
 * module's answer through the Integration Service. The assertions that matter are about what is
 * *not* asked — no search of Legal, no read from the browser — and about never collapsing a refused
 * or unavailable read into an absent record.
 */

const CASE = 'case-1';
const LEGAL_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LEGAL_TYPE = 'type-legal';
const OTHER_TYPE = 'type-call';
const BFD = 100000141;

function adapterReturning(rows: Record<string, Record<string, unknown>[]>) {
  const requested: string[] = [];
  const xrm = {
    WebApi: {
      retrieveMultipleRecords: async (logicalName: string, query: string) => {
        requested.push(decodeURIComponent(`${logicalName}${query}`));
        return { entities: rows[logicalName] ?? [] };
      },
      retrieveRecord: async (logicalName: string, id: string) => {
        requested.push(`GET ${logicalName}(${id})`);
        throw { errorCode: 2147746327, message: 'not expected' };
      },
    },
  } as unknown as XrmLike;
  return { adapter: new XrmCrmAdapter(xrm), requested };
}

function summariserAnswering(answer: Partial<ExternalRecordSummary>): ReferenceSummariser {
  return async references => new Map(references.map(reference => [reference.recordId, {
    process: reference.process, organization: reference.organization, recordId: reference.recordId,
    availability: 'found', openUrl: 'https://bfd.example/legal', ...answer,
  } as ExternalRecordSummary]));
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

/** A recommendation whose hand-off produced a Litigation Request in BFD CRM's Legal module. */
const handedOff = (overrides: Record<string, unknown> = {}) => recommendation({
  qdb_relatedrecordtype: 'qdb_qdblegal', qdb_relatedrecordorganization: BFD, qdb_relatedrecordid: LEGAL_ID, qdb_relatedrecordnumber: 'LEG-9',
  ...overrides,
});

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

describe('a case’s Legal picture is narrowed by the platform', () => {
  const types = [activityType(LEGAL_TYPE, 'P6-LEGALREC'), activityType(OTHER_TYPE, 'P6-CALL')];
  const rowsWith = (...activities: Record<string, unknown>[]) => ({ qdb_collectionactivitytype: types, qdb_collectionactivity: activities });

  it('asks the source for Legal hand-offs OR Legal-typed activities, not for the whole case', async () => {
    const { adapter, requested } = adapterReturning(rowsWith(recommendation()));
    await loadCaseLegalTraces(adapter, { caseId: CASE });

    const activityRead = requested.find(r => r.startsWith('qdb_collectionactivity?'));
    expect(activityRead).toContain('_qdb_collectioncaseid_value eq case-1');
    expect(activityRead).toContain("qdb_relatedrecordtype eq 'qdb_qdblegal'");
    expect(activityRead).toContain(`_qdb_activitytypeid_value eq ${LEGAL_TYPE}`);
    expect(activityRead, 'the non-Legal type is not asked for').not.toContain(OTHER_TYPE);
  });

  it('asks nothing of the Legal module when nothing was handed off', async () => {
    const { adapter, requested } = adapterReturning(rowsWith(recommendation()));
    let asked = 0;
    const summarise: ReferenceSummariser = async () => { asked++; return new Map(); };

    const { rows: traces } = await loadCaseLegalTraces(adapter, { caseId: CASE, summarise });

    expect(traces[0]!.trace.state).toBe('QualificationPending');
    expect(traces[0]!.trace.handoffAvailable, 'fail-closed').toBe(false);
    expect(asked, 'no reference, no read').toBe(0);
    expect(requested.filter(r => r.includes('qdb_qdblegal') && r.startsWith('GET')), 'nothing read from the browser').toHaveLength(0);
  });

  it('shows the Legal module’s own reference and status for a handed-off recommendation', async () => {
    const { adapter } = adapterReturning(rowsWith(handedOff()));

    const { rows: traces } = await loadCaseLegalTraces(adapter, { caseId: CASE, summarise: summariserAnswering({ recordNumber: 'LEG-9', statusReason: 'Closed' }) });

    expect(traces[0]!.trace.state).toBe('LitigationVisible');
    expect(traces[0]!.trace.litigation?.reference).toBe('LEG-9');
    expect(traces[0]!.trace.litigation?.status).toBe('Closed');
  });

  it('says the request exists when the officer may not read it', async () => {
    const { adapter } = adapterReturning(rowsWith(handedOff()));

    const { rows: traces } = await loadCaseLegalTraces(adapter, { caseId: CASE, summarise: summariserAnswering({ availability: 'forbidden' }) });

    expect(traces[0]!.trace.state).toBe('LitigationNotVisible');
    expect(traces[0]!.trace.label).toMatch(/raised/i);
    expect(traces[0]!.trace.label).not.toMatch(/no legal/i);
  });

  it('says the request exists when the Integration Service is not reachable', async () => {
    const { adapter } = adapterReturning(rowsWith(handedOff()));

    const { rows: traces } = await loadCaseLegalTraces(adapter, { caseId: CASE });

    expect(traces[0]!.trace.label).not.toMatch(/no legal/i);
  });

  it('includes a Legal hand-off even when its activity type is not a Legal type', async () => {
    const { adapter } = adapterReturning(rowsWith(handedOff({ '_qdb_activitytypeid_value': OTHER_TYPE })));

    const { rows } = await loadCaseLegalTraces(adapter, { caseId: CASE, summarise: summariserAnswering({ recordNumber: 'LEG-9' }) });

    expect(rows[0]!.trace.state).toBe('LitigationVisible');
  });

  it('falls back to the hand-off clause alone when no Legal type is configured', async () => {
    const { adapter, requested } = adapterReturning({ qdb_collectionactivitytype: [activityType(OTHER_TYPE, 'P6-CALL')], qdb_collectionactivity: [] });
    await loadCaseLegalTraces(adapter, { caseId: CASE });

    const activityRead = requested.find(r => r.startsWith('qdb_collectionactivity?'));
    expect(activityRead).toContain("qdb_relatedrecordtype eq 'qdb_qdblegal'");
    expect(activityRead, 'nothing is guessed about which type is Legal').not.toContain('LEGALREC');
  });
});
