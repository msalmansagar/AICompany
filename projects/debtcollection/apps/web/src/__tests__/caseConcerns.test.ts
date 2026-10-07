import { describe, expect, it } from 'vitest';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import { isConcernTypeCode, loadCaseConcerns, type ComplaintConcernRow } from '../data/caseConcerns.js';
import type { ExternalRecordSummary, ReferenceSummariser } from '../data/externalReferenceService.js';

/**
 * Disputes and Complaints as the workspace reads them, through the external process reference.
 *
 * The assertions that matter are about separation and about routes not taken: a dispute never
 * becomes a complaint, a complaint is never rediscovered by customer or searched for in Case
 * Management, and a refused or unavailable read never reports absence.
 */

const CASE = 'case-1';
const COMPLAINT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CONCERN_TYPE = 'type-dispute';
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
        throw Object.assign(new Error('not expected'), { status: 404 });
      },
    },
  } as unknown as XrmLike;
  return { adapter: new XrmCrmAdapter(xrm), requested };
}

/** A summariser that answers from a fixed table and records what it was asked. */
function summariserReturning(answers: Record<string, Partial<ExternalRecordSummary>>) {
  const asked: string[][] = [];
  const summarise: ReferenceSummariser = async references => {
    asked.push(references.map(reference => reference.recordId));
    return new Map(references.map(reference => [reference.recordId, {
      process: reference.process, organization: reference.organization, recordId: reference.recordId,
      availability: 'found', openUrl: `https://bfd.example/main.aspx?etn=incident&id=${reference.recordId}`,
      ...answers[reference.recordId],
    } as ExternalRecordSummary]));
  };
  return { summarise, asked };
}

const activityType = (id: string, code: string) => ({
  qdb_collectionactivitytypeid: id, qdb_name: `${code} type`, qdb_code: code, qdb_isactive: true,
});

const activity = (overrides: Record<string, unknown> = {}) => ({
  activityid: 'act-1',
  subject: 'Customer says the March payment was made',
  createdon: '2026-09-21T00:00:00Z',
  statecode: 0,
  '_qdb_activitytypeid_value': CONCERN_TYPE,
  ...overrides,
});

/** A completed complaint hand-off, as the Integration Service leaves it. */
const complaintHandOff = (overrides: Record<string, unknown> = {}) => activity({
  statecode: 1,
  qdb_relatedrecordtype: 'incident', qdb_relatedrecordorganization: BFD,
  qdb_relatedrecordid: COMPLAINT_ID, qdb_relatedrecordnumber: 'BFD-25600-A1B2',
  ...overrides,
});

const types = [activityType(CONCERN_TYPE, 'P6-DISPUTE'), activityType(OTHER_TYPE, 'P6-CALL')];
const rowsWith = (...activities: Record<string, unknown>[]) => ({ qdb_collectionactivitytype: types, qdb_collectionactivity: activities });

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

describe('a dispute and a complaint never land in the same list', () => {
  it('reads a concern activity with no hand-off as a Collection Dispute', async () => {
    const { adapter } = adapterReturning(rowsWith(activity()));

    const concerns = await loadCaseConcerns(adapter, CASE);

    expect(concerns.disputes).toHaveLength(1);
    expect(concerns.complaints).toHaveLength(0);
  });

  it('reads a complaint hand-off as a formal Complaint with Case Management’s own status', async () => {
    const { adapter } = adapterReturning(rowsWith(complaintHandOff()));
    const { summarise } = summariserReturning({ [COMPLAINT_ID]: { recordNumber: 'BFD-25600-A1B2', statusReason: 'Pending for Quality Review' } });

    const concerns = await loadCaseConcerns(adapter, CASE, summarise);

    expect(concerns.disputes).toHaveLength(0);
    expect(concerns.complaints[0]!.heading).toContain('BFD-25600-A1B2');
    expect(concerns.complaints[0]!.status).toBe('Pending for Quality Review');
  });

  it('links a complaint to Case Management through the link the service built', async () => {
    const { adapter } = adapterReturning(rowsWith(complaintHandOff()));
    const { summarise } = summariserReturning({});

    const row = (await loadCaseConcerns(adapter, CASE, summarise)).complaints[0] as ComplaintConcernRow;

    expect(row.openUrl).toContain(COMPLAINT_ID);
  });

  it('reads no Case Management record for a dispute', async () => {
    const { adapter } = adapterReturning(rowsWith(activity()));
    const { summarise, asked } = summariserReturning({});

    await loadCaseConcerns(adapter, CASE, summarise);

    expect(asked).toHaveLength(0);
  });
});

describe('a Complaint is never rediscovered or copied', () => {
  it('asks the owning module about the referenced id only, once for the card', async () => {
    const { adapter, requested } = adapterReturning(rowsWith(complaintHandOff(), complaintHandOff({ activityid: 'act-2', qdb_relatedrecordid: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })));
    const { summarise, asked } = summariserReturning({});

    await loadCaseConcerns(adapter, CASE, summarise);

    expect(asked).toEqual([[COMPLAINT_ID, 'ffffffff-ffff-4fff-8fff-ffffffffffff']]);
    expect(requested.filter(r => r.startsWith('incident')), 'no Case is read or searched from the browser').toHaveLength(0);
  });

  it('says the Complaint exists when the officer may not read it', async () => {
    const { adapter } = adapterReturning(rowsWith(complaintHandOff()));
    const { summarise } = summariserReturning({ [COMPLAINT_ID]: { availability: 'forbidden' } });

    const concerns = await loadCaseConcerns(adapter, CASE, summarise);

    expect(concerns.complaints[0]!.heading).toBe('Complaint BFD-25600-A1B2');
    expect(concerns.complaints[0]!.detail).toMatch(/do not have access/i);
    expect(concerns.disputes, 'and it does not fall back to being a dispute').toHaveLength(0);
  });

  it('keeps a withheld Complaint distinct from one Case Management no longer holds', async () => {
    const { adapter } = adapterReturning(rowsWith(complaintHandOff()));

    const withheld = (await loadCaseConcerns(adapter, CASE, summariserReturning({ [COMPLAINT_ID]: { availability: 'forbidden' } }).summarise)).complaints[0]!;
    const missing = (await loadCaseConcerns(adapter, CASE, summariserReturning({ [COMPLAINT_ID]: { availability: 'notFound' } }).summarise)).complaints[0]!;

    expect(withheld.detail).not.toBe(missing.detail);
  });

  it('still shows the Complaint and its number when the Integration Service is not reachable', async () => {
    const { adapter } = adapterReturning(rowsWith(complaintHandOff()));

    const concerns = await loadCaseConcerns(adapter, CASE);

    expect(concerns.complaints[0]!.heading).toBe('Complaint BFD-25600-A1B2');
    expect(concerns.complaints[0]!.detail).toMatch(/shown in Case Management/);
  });
});

describe('a hand-off that has not produced a Case is never shown as one', () => {
  it('shows a request still being raised as being raised', async () => {
    const { adapter } = adapterReturning(rowsWith(activity({ qdb_relatedrecordtype: 'incident', qdb_relatedrecordorganization: BFD })));

    const row = (await loadCaseConcerns(adapter, CASE)).complaints[0]!;

    expect(row.heading).toBe('Complaint being raised');
  });

  it('shows a refused request as not created', async () => {
    const { adapter } = adapterReturning(rowsWith(activity({ statecode: 2, qdb_relatedrecordtype: 'incident', qdb_relatedrecordorganization: BFD })));

    const row = (await loadCaseConcerns(adapter, CASE)).complaints[0]!;

    expect(row.heading).toBe('Complaint not created');
  });
});

describe('the case read is narrowed by the platform', () => {
  it('asks for complaint hand-offs OR concern-typed activities, not the whole case', async () => {
    const { adapter, requested } = adapterReturning(rowsWith(activity()));
    await loadCaseConcerns(adapter, CASE);

    const read = requested.find(r => r.startsWith('qdb_collectionactivity?'));
    expect(read).toContain('_qdb_collectioncaseid_value eq case-1');
    expect(read).toContain("qdb_relatedrecordtype eq 'incident'");
    expect(read).toContain(`_qdb_activitytypeid_value eq ${CONCERN_TYPE}`);
    expect(read, 'the unrelated type is not asked for').not.toContain(OTHER_TYPE);
  });

  it('includes a complaint hand-off whose type is not the concern type', async () => {
    const { adapter } = adapterReturning(rowsWith(complaintHandOff({ '_qdb_activitytypeid_value': OTHER_TYPE })));

    expect((await loadCaseConcerns(adapter, CASE)).complaints).toHaveLength(1);
  });
});
